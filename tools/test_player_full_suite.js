// =========================================================================
// 🧪 SUITE DE TESTS COMPLÈTE DU LECTEUR NETFLIX & DU PIPELINE DE STREAMING
// =========================================================================
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`   ✅ PASS : ${testName}`);
    testsPassed++;
  } else {
    console.error(`   ❌ FAIL : ${testName} ${details ? '(' + details + ')' : ''}`);
    testsFailed++;
  }
}

async function runSuite() {
  console.log('\n=======================================================');
  console.log('  🎬 SUITE DE TESTS : LECTEUR NETFLIX & PROXY STREAMING');
  console.log('=======================================================');

  // --- TEST 1 : Vérification de la syntaxe de player.js ---
  console.log('\n▶ [1/5] Vérification de la syntaxe et de la structure de player.js...');
  const playerFile = path.join(ROOT_DIR, 'static', 'js', 'player.js');
  assert(fs.existsSync(playerFile), 'Fichier player.js existant');
  const playerContent = fs.readFileSync(playerFile, 'utf8');

  assert(playerContent.includes('class NetflixPlayer'), 'Définition de la classe NetflixPlayer');
  assert(playerContent.includes('playDirectHls('), 'Méthode playDirectHls présente');
  assert(playerContent.includes('playDirectVideo('), 'Méthode playDirectVideo présente');
  assert(playerContent.includes('playEmbedIframe('), 'Méthode playEmbedIframe présente');
  assert(playerContent.includes('_antiLoopHandler'), 'Protection anti-rollback PTS active');
  assert(playerContent.includes('120 * 1024 * 1024') || playerContent.includes('60 * 1024 * 1024'), 'Buffer HLS haute performance (60 Mo ou 120 Mo) configuré');
  assert(playerContent.includes('video.muted = true'), 'Fallback Autoplay muet configuré pour HTTPS');
  assert(playerContent.includes('parseDurationToSeconds'), 'Calculateur de durée présent');

  // --- TEST 2 : Correspondance DOM entre index.html et player.js ---
  console.log('\n▶ [2/5] Vérification de l\'intégrité des sélecteurs DOM (index.html <-> player.js)...');
  const htmlFile = path.join(ROOT_DIR, 'static', 'index.html');
  assert(fs.existsSync(htmlFile), 'Fichier static/index.html existant');
  const htmlContent = fs.readFileSync(htmlFile, 'utf8');

  const requiredIds = [
    'netflixPlayer', 'playerTopBar', 'playerBackBtn', 'playerTitle', 'playerMeta',
    'playerEpisodeBox', 'playerSeasonSelect', 'playerEpisodeSelect',
    'playerMediaContainer', 'mainVideo', 'streamIframe', 'centerPlayRipple',
    'playerLoader', 'loaderTitle', 'step1', 'step2', 'step3', 'step4',
    'netflixBottomControls', 'scrubberContainer', 'scrubberBuffered', 'scrubberPlayed', 'scrubberThumb', 'scrubberTooltip',
    'ctrlPlayBtn', 'iconPlay', 'iconPause', 'ctrlRewindBtn', 'ctrlForwardBtn', 'ctrlNextEpBtn',
    'ctrlVolumeBtn', 'iconVolHigh', 'iconVolMuted', 'ctrlVolumeSlider',
    'ctrlCurrentTime', 'ctrlTotalDuration', 'ctrlMediaTitle',
    'ctrlSpeedBtn', 'speedMenu', 'qualityBadge', 'qualityCurrentText', 'ctrlQualityBtn', 'qualityMenu',
    'ctrlFullscreenBtn', 'iconEnterFs', 'iconExitFs',
    'playerStatusBanner', 'statusBannerText', 'statusSwitchBtn', 'statusRetryBtn',
    'playerCommentsDrawer', 'playerCommentsCloseBtn', 'playerDrawerCommentsList', 'playerCommentInput', 'playerCommentSubmitBtn', 'playerReportBugBtn'
  ];

  let missingIds = 0;
  for (const id of requiredIds) {
    const presentInHtml = htmlContent.includes(`id="${id}"`);
    if (!presentInHtml) {
      console.error(`      ⚠️ ID manquant dans index.html : #${id}`);
      missingIds++;
    }
  }
  assert(missingIds === 0, `Tous les éléments requis (${requiredIds.length}/${requiredIds.length}) sont présents dans index.html`);

  // --- AUTH : Obtention d'un jeton de session actif ---
  console.log('\n▶ Authentification préalable auprès de ZIFLIX (admin / 1965)...');
  const token = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ username: 'admin', password: '1965' });
    const req = http.request('http://127.0.0.1:8080/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(b);
          resolve(j.token);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
  console.log(`   Session active : ${token ? token.substring(0, 10) + '...' : 'Échec'}`);

  // --- TEST 3 : Test du serveur local & Stream Live TV HLS ---
  console.log('\n▶ [3/5] Test réel du streaming Live TV Xtream (M3U8 & Segments TS)...');
  const liveResult = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:8080/api/stream/xtream?stream_id=13847&auth_token=${token}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          body: data
        });
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });

  assert(liveResult.statusCode === 200, 'Endpoint Live TV /api/stream/xtream renvoie HTTP 200');
  assert(liveResult.body && liveResult.body.includes('#EXTM3U'), 'Manifest HLS valide généré (#EXTM3U)');
  assert(liveResult.body && liveResult.body.includes('/api/stream/xtream-chunk?url='), 'Segments .ts réécrits vers le proxy local');

  // Tester un segment .ts réel
  const chunkMatch = liveResult.body ? liveResult.body.match(/\/api\/stream\/xtream-chunk\?url=([^\r\n]+)/) : null;
  if (chunkMatch) {
    let chunkRelPath = chunkMatch[0];
    if (!chunkRelPath.includes('auth_token=')) {
      chunkRelPath += `&auth_token=${token}`;
    }
    const chunkResult = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:8080${chunkRelPath}`, (res) => {
        let bytes = 0;
        res.on('data', c => bytes += c.length);
        res.on('end', () => resolve({ statusCode: res.statusCode, bytes, contentType: res.headers['content-type'] }));
      }).on('error', (e) => resolve({ error: e.message }));
    });

    assert(chunkResult.statusCode === 200, 'Proxy de segment /api/stream/xtream-chunk renvoie HTTP 200');
    assert(chunkResult.bytes > 100000, `Segment vidéo TS reçu avec succès (${Math.round(chunkResult.bytes / 1024)} Ko)`, `Taille : ${chunkResult.bytes}`);
  }

  // --- TEST 4 : Test réel du streaming Séries VOD (Range 206) ---
  console.log('\n▶ [4/5] Test réel du streaming Séries VOD Xtream (HTTP Range 206)...');
  const vodResult = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:8080/api/stream/xtream-series?episode_id=385622&ext=mkv&auth_token=${token}`, {
      headers: { 'Range': 'bytes=0-1024' }
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentRange: res.headers['content-range'],
          bytes: buf.length
        });
      });
    }).on('error', (e) => resolve({ error: e.message }));
  });

  assert(vodResult.statusCode === 206, 'Endpoint Séries VOD renvoie HTTP 206 (Partial Content)');
  assert(vodResult.contentRange && vodResult.contentRange.startsWith('bytes 0-1024/'), 'En-tête Content-Range valide pour le scrubber');
  assert(vodResult.bytes === 1025, `Taille exacte du fragment Range reçue (1025 octets)`);

  // --- TEST 5 : Intégrité du catalogue et de l'accès aux métadonnées ---
  console.log('\n▶ [5/5] Test de résolution des métadonnées de séries (/api/xtream/series-info)...');
  const seriesInfoResult = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:8080/api/xtream/series-info?series_id=6715&auth_token=${token}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve({ error: e.message });
        }
      });
    }).on('error', (e) => resolve({ error: e.message }));
  });

  assert(seriesInfoResult.success === true, 'Résolution des séries Xtream fonctionnelle');
  assert(seriesInfoResult.seasons && seriesInfoResult.seasons.length > 0, `Saisons chargées (${seriesInfoResult.seasons?.length} saisons)`);
  assert(seriesInfoResult.seasons?.[0]?.episodes?.length > 0, `Épisodes chargés pour la Saison 1 (${seriesInfoResult.seasons?.[0]?.episodes?.length} épisodes)`);

  // --- BILAN FINAL ---
  console.log('\n=======================================================');
  console.log(`  📊 RÉSULTATS : ${testsPassed} réussis, ${testsFailed} échoués`);
  if (testsFailed === 0) {
    console.log('  🎉 VALIDATION RÉUSSIE À 100% : Le lecteur et les flux sont stables !');
  } else {
    console.error('  ⚠️ DES ANOMALIES ONT ÉTÉ DÉTECTÉES');
  }
  console.log('=======================================================\n');

  process.exit(testsFailed === 0 ? 0 : 1);
}

runSuite().catch(e => {
  console.error('Erreur critique dans la suite de tests :', e);
  process.exit(1);
});
