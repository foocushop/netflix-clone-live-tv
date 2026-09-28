const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== STARTING DEPLOYMENT OF EPISODE SWITCH & SPEED OPTIMIZATIONS ===');

// 1. BACKUPS
const backupDir = '/var/www/netflix-clone/backups/patch_' + Date.now();
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync('/var/www/netflix-clone/static/js/player.js', path.join(backupDir, 'player.js'));
fs.copyFileSync('/var/www/netflix-clone/lib/vidmoly.js', path.join(backupDir, 'vidmoly.js'));
fs.copyFileSync('/var/www/netflix-clone/server.js', path.join(backupDir, 'server.js'));
fs.copyFileSync('/var/www/netflix-clone/static/index.html', path.join(backupDir, 'index.html'));
console.log('✅ Backups saved in:', backupDir);

// 2. PATCH static/js/player.js
let playerCode = fs.readFileSync('/var/www/netflix-clone/static/js/player.js', 'utf8');

// A. Remplacer cleanupActivePlayback : supprimer this.video.load()
playerCode = playerCode.replace(
  /if \(this\.video\) \{\s*try \{\s*this\.video\.pause\(\);\s*this\.video\.removeAttribute\('src'\);\s*this\.video\.load\(\);\s*\} catch \(e\) \{\}\s*\}\s*\}\s*\n\s*close\(\)/,
  "if (this.video) {\n      try {\n        this.video.pause();\n        this.video.removeAttribute('src');\n        if (this.video.srcObject) this.video.srcObject = null;\n      } catch (e) {}\n    }\n  }\n\n  close()"
);
console.log('✅ cleanupActivePlayback patched');

// B. Remplacer resetPlayerState : video.load() uniquement si isClosing === true
playerCode = playerCode.replace(
  /resetPlayerState\(\) \{[\s\S]*?if \(this\.video\) \{\s*try \{\s*this\.video\.pause\(\);\s*this\.video\.removeAttribute\('src'\);\s*this\.video\.load\(\);\s*\} catch \(e\) \{\}/,
  "resetPlayerState(isClosing = false) {\n    console.log('[Player] Teardown & reset du lecteur (isClosing=' + isClosing + ')');\n\n    // 1. Stopper les requêtes d\\'extraction en cours\n    if (this.activeExtractionAbort) {\n      try { this.activeExtractionAbort.abort(); } catch (e) {}\n      this.activeExtractionAbort = null;\n    }\n    if (this.streamAbortController) {\n      try { this.streamAbortController.abort(); } catch (e) {}\n      this.streamAbortController = null;\n    }\n\n    // 2. Nettoyage de la session active\n    this.cleanupActivePlayback();\n\n    // 3. Vidage physique sans video.load() bloquant\n    if (this.video) {\n      try {\n        this.video.pause();\n        this.video.removeAttribute('src');\n        if (this.video.srcObject) this.video.srcObject = null;\n        if (isClosing) {\n          this.video.load();\n        }\n      } catch (e) {}\n    }"
);
console.log('✅ resetPlayerState patched');

// C. Mettre à jour close() pour appeler resetPlayerState(true)
playerCode = playerCode.replace(
  /close\(\) \{\s*this\.savePlaybackProgress\(true\);\s*this\.stopWatchTimer\(\);\s*this\.resetPlayerState\(\);/,
  "close() {\n    this.savePlaybackProgress(true);\n    this.stopWatchTimer();\n    this.resetPlayerState(true);"
);
console.log('✅ close() patched');

// D. Remplacer la navigation (initEpisodeSelectEvents et goToNextEpisode) avec selectEpisode
const navRegex = /\/\/ ================= 7\. NAVIGATION SAISONS & ÉPISODES =================[\s\S]*?populateSeasons\(\) \{/;
const newNavSection = `// ================= 7. NAVIGATION SAISONS & ÉPISODES =================
  async selectEpisode(season, episode) {
    if (!this.currentMovie) return;
    this.savePlaybackProgress(true);

    const sNum = parseInt(season, 10) || 1;
    const epNum = parseInt(episode, 10) || 1;

    console.log('[Player] Changement d\\'épisode fluide vers S' + sNum + ':E' + epNum);

    // Réinitialisation propre sans détruire la balise vidéo (isClosing=false)
    this.resetPlayerState(false);
    this.currentSeason = sNum;
    this.currentEpisode = epNum;
    this._isLoadingStream = true;

    // Mise à jour immédiate de l'affiche d'attente (Zéro écran noir ni image figée)
    let posterImg = this.currentMovie.backdrop_url || this.currentMovie.poster_url || '';
    if (this.currentMovie.seasons && this.currentMovie.seasons.length > 0) {
      const sObj = this.currentMovie.seasons.find(s => parseInt(s.season_number, 10) === this.currentSeason) || this.currentMovie.seasons[0];
      const epObj = sObj?.episodes?.find(e => parseInt(e.episode_number, 10) === this.currentEpisode) || sObj?.episodes?.[0];
      if (epObj?.still_url) posterImg = epObj.still_url;
    }
    if (posterImg && posterImg.startsWith('http://')) {
      const baseUrl = window.API_BASE || '';
      posterImg = baseUrl + '/api/proxy-image?url=' + encodeURIComponent(posterImg);
    }
    if (this.backdrop) {
      this.backdrop.style.backgroundImage = posterImg ? "url('" + posterImg + "')" : 'none';
      this.backdrop.style.display = 'block';
      this.backdrop.classList.remove('fade-out');
    }
    if (this.video) {
      if (posterImg) this.video.poster = posterImg;
      else this.video.removeAttribute('poster');
    }

    // Récupérer la progression sauvegardée pour cet épisode
    this.savedPlaybackTime = 0;
    this.savedResumeTime = 0;
    try {
      const epKey = this.currentMovie.id + '_s' + this.currentSeason + '_e' + this.currentEpisode;
      const epMap = JSON.parse(localStorage.getItem('ziflix_episodes_progress')) || {};
      const epProg = epMap[epKey];
      if (epProg && epProg.currentTime > 10 && (epProg.progressPct || 0) < 95) {
        this.savedResumeTime = epProg.currentTime;
      }
    } catch (e) {}

    // Mémoriser comme dernier épisode regardé pour cette série
    try {
      const showKey = 'netflix_ep_' + (this.currentMovie.id || this.currentMovie.tmdb_id || this.currentMovie.series_id);
      localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
    } catch (e) {}

    if (this.seasonSelect) this.seasonSelect.value = String(this.currentSeason);
    if (this.episodeSelect) this.episodeSelect.value = String(this.currentEpisode);

    this.updateMetaDisplay();
    this.showLoader('⚡ Chargement Épisode ' + this.currentEpisode + '...');
    this.loadStream();
  }

  initEpisodeSelectEvents() {
    if (this.seasonSelect) {
      this.seasonSelect.addEventListener('change', () => {
        const newSeason = parseInt(this.seasonSelect.value, 10);
        if (newSeason === this.currentSeason) return;
        this.currentSeason = newSeason;
        this.populateEpisodes();
        const newEp = parseInt(this.episodeSelect ? this.episodeSelect.value : 1, 10) || 1;
        this.selectEpisode(newSeason, newEp);
      });
    }

    if (this.episodeSelect) {
      this.episodeSelect.addEventListener('change', () => {
        const newEp = parseInt(this.episodeSelect.value, 10);
        if (newEp === this.currentEpisode) return;
        this.selectEpisode(this.currentSeason, newEp);
      });
    }
  }

  populateSeasons() {`;

playerCode = playerCode.replace(navRegex, newNavSection);

// E. Mettre à jour goToNextEpisode
const nextRegex = /goToNextEpisode\(\) \{[\s\S]*?\n  \}\n\n  \/\/ ================= 8\. GESTION/;
const newGoToNext = `goToNextEpisode() {
    if (!this.currentMovie) return;
    const allSeasons = (this.currentMovie.seasons || []).filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
    const seasonsList = allSeasons.length > 0 ? allSeasons : (this.currentMovie.seasons || []);
    if (seasonsList.length > 0) {
      const sObj = seasonsList.find(s => parseInt(s.season_number, 10) === this.currentSeason) || seasonsList[0];
      if (sObj && Array.isArray(sObj.episodes) && sObj.episodes.length > 0) {
        const curEpIdx = sObj.episodes.findIndex(e => parseInt(e.episode_number, 10) === this.currentEpisode);
        if (curEpIdx !== -1 && curEpIdx < sObj.episodes.length - 1) {
          const nextEp = parseInt(sObj.episodes[curEpIdx + 1].episode_number, 10);
          this.selectEpisode(this.currentSeason, nextEp);
          return;
        } else {
          const curSeasonIdx = seasonsList.findIndex(s => parseInt(s.season_number, 10) === this.currentSeason);
          if (curSeasonIdx !== -1 && curSeasonIdx < seasonsList.length - 1) {
            const nextSeason = seasonsList[curSeasonIdx + 1];
            const nextSNum = parseInt(nextSeason.season_number, 10);
            this.currentSeason = nextSNum;
            if (this.seasonSelect) this.seasonSelect.value = String(this.currentSeason);
            this.populateEpisodes();
            const nextEp = parseInt(this.episodeSelect ? this.episodeSelect.value : 1, 10) || 1;
            this.selectEpisode(nextSNum, nextEp);
            return;
          }
        }
      }
    }
  }

  // ================= 8. GESTION`;

playerCode = playerCode.replace(nextRegex, newGoToNext);
fs.writeFileSync('/var/www/netflix-clone/static/js/player.js', playerCode, 'utf8');
console.log('✅ player.js updated');

// 3. PATCH lib/vidmoly.js
let vidmolyCode = fs.readFileSync('/var/www/netflix-clone/lib/vidmoly.js', 'utf8');

const vidmolyFuncRegex = /\/\/ 6\. Récupérateur & Réécriveur de Playlist HLS \(\.m3u8\) Vidmoly[\s\S]*?return result;\s*\}/;
const newVidmolyFunc = `// 6. Récupérateur & Réécriveur de Playlist HLS (.m3u8) Vidmoly (Optimisé avec Cache Disque Persistant)
async function getVidmolyHlsPlaylist(fileCode) {
  if (!fileCode) throw new Error('Code de fichier Vidmoly manquant');

  // 1. Vérification Cache Mémoire (3h)
  const cached = resolvedPlaylistsCache.get(fileCode);
  if (cached && (Date.now() - cached.timestamp < 3 * 60 * 60 * 1000)) {
    return cached.data;
  }

  // 2. Vérification Cache Disque Persistant (/tmp/vidmoly_hls_cache/)
  const diskCacheDir = path.join('/tmp', 'vidmoly_hls_cache');
  const diskCacheFile = path.join(diskCacheDir, fileCode + '.json');
  try {
    if (!fs.existsSync(diskCacheDir)) fs.mkdirSync(diskCacheDir, { recursive: true });
    if (fs.existsSync(diskCacheFile)) {
      const diskData = JSON.parse(fs.readFileSync(diskCacheFile, 'utf8'));
      if (diskData && diskData.data && (Date.now() - (diskData.timestamp || 0) < 3 * 60 * 60 * 1000)) {
        resolvedPlaylistsCache.set(fileCode, { timestamp: diskData.timestamp, data: diskData.data });
        return diskData.data;
      }
    }
  } catch (diskErr) {}

  // 3. Résolution du flux distant
  const resolved = await resolveVidmolyStream(fileCode);
  if (!resolved || resolved.status !== 'ready' || !resolved.streamUrl) {
    return resolved;
  }

  const masterUrl = resolved.streamUrl;
  const masterRes = await fetchHttpWarp(masterUrl);
  if (masterRes.statusCode !== 200 || !masterRes.text) {
    throw new Error('Vidmoly master m3u8 HTTP ' + masterRes.statusCode);
  }

  const subLine = masterRes.text.split('\\n').map(l => l.trim()).find(l => l.startsWith('http'));
  let playlistToRewrite = masterRes.text;

  if (subLine) {
    const subRes = await fetchHttpWarp(subLine);
    if (subRes.statusCode === 200 && subRes.text) {
      playlistToRewrite = subRes.text;
    }
  }

  // Réécriture directe et ultra-rapide des URLs vers le proxy segment local (Zéro requête de probe bloquante)
  const rewrittenPlaylist = playlistToRewrite.split('\\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('http')) {
      return '/api/stream/vidmoly-segment?url=' + encodeURIComponent(trimmed) + '&file_code=' + encodeURIComponent(fileCode);
    }
    return line;
  }).join('\\n');

  const result = {
    status: 'ready',
    playlist: rewrittenPlaylist,
    isHls: true
  };

  resolvedPlaylistsCache.set(fileCode, { timestamp: Date.now(), data: result });
  try {
    fs.writeFileSync(diskCacheFile, JSON.stringify({ timestamp: Date.now(), data: result }), 'utf8');
  } catch (e) {}

  return result;
}`;

vidmolyCode = vidmolyCode.replace(vidmolyFuncRegex, newVidmolyFunc);
fs.writeFileSync('/var/www/netflix-clone/lib/vidmoly.js', vidmolyCode, 'utf8');
console.log('✅ lib/vidmoly.js updated');

// 4. PATCH server.js
let serverCode = fs.readFileSync('/var/www/netflix-clone/server.js', 'utf8');
serverCode = serverCode.replace(
  /'-probesize', '1048576',\s*'-analyzeduration', '1000000',/,
  "'-probesize', '300000',\n          '-analyzeduration', '400000',\n          '-fpsprobesize', '0',"
);

serverCode = serverCode.replace(
  "if (s.size > 25000 || (session && session.isDone) || isFullCompletePlaylist) return true;",
  "if (s.size > 12000 || (session && session.isDone) || isFullCompletePlaylist) return true;"
);
fs.writeFileSync('/var/www/netflix-clone/server.js', serverCode, 'utf8');
console.log('✅ server.js updated');

// 5. BUMP CACHE IN index.html
let indexHtml = fs.readFileSync('/var/www/netflix-clone/static/index.html', 'utf8');
const newVersion = Date.now().toString();
indexHtml = indexHtml.replace(/js\/player\.js\?v=\d+/, 'js/player.js?v=' + newVersion);
fs.writeFileSync('/var/www/netflix-clone/static/index.html', indexHtml, 'utf8');
console.log('✅ index.html cache bumped to ' + newVersion);

// 6. SYNTAX CHECKS
execSync('node -c /var/www/netflix-clone/static/js/player.js');
console.log('✅ player.js syntax OK');
execSync('node -c /var/www/netflix-clone/lib/vidmoly.js');
console.log('✅ lib/vidmoly.js syntax OK');
execSync('node -c /var/www/netflix-clone/server.js');
console.log('✅ server.js syntax OK');

// 7. RESTART PM2
execSync('pm2 restart netflix-clone --update-env');
console.log('✅ PM2 netflix-clone restarted!');
console.log('=== ALL DONE SUCCESSFULLY ===');
