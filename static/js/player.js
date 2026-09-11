// =========================================================================
// 🍿 LECTEUR VIDÉO NETFLIX PROFESSIONNEL (ULTRA-FLUIDE & MULTI-SERVEURS)
// =========================================================================
// Fonctionnalités intégrées :
// - Moteur Live HLS optimisé (buffer 60 Mo, anti-rollback PTS, zéro boucle d'erreur)
// - Moteur Séries & Films VOD (streaming HTTP Range 206 progressif, enchaînement auto)
// - Fallback Autoplay HTTPS automatique (passage muet transparent sans blocage)
// - Interface Netflix native : Scrubber rouge, buffer progressif, ripple animé, tooltip
// - Sélecteur audio VO / VF en temps réel
// - Sélecteur de 8 serveurs directs haute performance avec défilement horizontal
// - Sélecteur complet de saisons et épisodes + bouton "Épisode suivant"
// - Raccourcis clavier complets (Espace, Flèches, F, M, 1-8, Échap)
// - Masquage automatique des contrôles en inactivité (3.5s)
// =========================================================================

window.API_BASE = window.API_BASE || ((window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null' || window.location.origin.startsWith('file:'))
  ? 'http://74.50.66.196'
  : '');

class NetflixPlayer {
  constructor() {
    // 1. Éléments Principaux de l'Overlay
    this.overlay = document.getElementById('netflixPlayer');
    this.topBar = document.getElementById('playerTopBar');
    this.backBtn = document.getElementById('playerBackBtn');
    this.titleDisplay = document.getElementById('playerTitle');
    this.metaDisplay = document.getElementById('playerMeta');

    // 2. Sélecteur Audio VO / VF
    this.langSwitch = document.getElementById('playerLangSwitch');
    this.langVoBtn = document.getElementById('playerLangVo');
    this.langVfBtn = document.getElementById('playerLangVf');

    // 3. Sélecteur de Serveurs (1 à 8)
    this.serverWrapper = document.getElementById('playerServerWrapper');
    this.serverNavPrev = document.getElementById('serverNavPrev');
    this.serverNavNext = document.getElementById('serverNavNext');
    this.serverSelector = document.getElementById('playerServerSelector');

    // 4. Sélecteur de Saisons & Épisodes
    this.episodeBox = document.getElementById('playerEpisodeBox');
    this.seasonSelect = document.getElementById('playerSeasonSelect');
    this.episodeSelect = document.getElementById('playerEpisodeSelect');

    // 5. Média Vidéo & Iframe de secours
    this.mediaContainer = document.getElementById('playerMediaContainer');
    this.backdrop = document.getElementById('playerBackdrop');
    this.video = document.getElementById('mainVideo');
    this.iframe = document.getElementById('streamIframe');
    this.ripple = document.getElementById('centerPlayRipple');

    // 6. Loader & Étapes de Connexion
    this.loader = document.getElementById('playerLoader');
    this.loaderTitle = document.getElementById('loaderTitle');
    this.step1 = document.getElementById('step1');
    this.step2 = document.getElementById('step2');
    this.step3 = document.getElementById('step3');
    this.step4 = document.getElementById('step4');
    this.step1Label = document.getElementById('step1Label');
    this.step2Label = document.getElementById('step2Label');
    this.step3Label = document.getElementById('step3Label');
    this.step4Label = document.getElementById('step4Label');

    // 7. Contrôles Inférieurs Netflix
    this.bottomControls = document.getElementById('netflixBottomControls');
    this.scrubberContainer = document.getElementById('scrubberContainer');
    this.scrubberBuffered = document.getElementById('scrubberBuffered');
    this.scrubberPlayed = document.getElementById('scrubberPlayed');
    this.scrubberThumb = document.getElementById('scrubberThumb');
    this.scrubberTooltip = document.getElementById('scrubberTooltip');

    // 8. Boutons & Sliders
    this.ctrlPlayBtn = document.getElementById('ctrlPlayBtn');
    this.iconPlay = document.getElementById('iconPlay');
    this.iconPause = document.getElementById('iconPause');
    this.ctrlRewindBtn = document.getElementById('ctrlRewindBtn');
    this.ctrlForwardBtn = document.getElementById('ctrlForwardBtn');
    this.ctrlNextEpBtn = document.getElementById('ctrlNextEpBtn');

    this.volumeContainer = document.getElementById('volumeContainer');
    this.ctrlVolumeBtn = document.getElementById('ctrlVolumeBtn');
    this.iconVolHigh = document.getElementById('iconVolHigh');
    this.iconVolMuted = document.getElementById('iconVolMuted');
    this.ctrlVolumeSlider = document.getElementById('ctrlVolumeSlider');

    this.ctrlCurrentTime = document.getElementById('ctrlCurrentTime');
    this.ctrlTotalDuration = document.getElementById('ctrlTotalDuration');
    this.ctrlMediaTitle = document.getElementById('ctrlMediaTitle');

    this.ctrlSpeedBtn = document.getElementById('ctrlSpeedBtn');
    this.speedMenu = document.getElementById('speedMenu');

    this.qualityControlWrapper = document.getElementById('qualityControlWrapper');
    this.ctrlQualityBtn = document.getElementById('ctrlQualityBtn');
    this.qualityBadge = document.getElementById('qualityBadge');
    this.qualityCurrentText = document.getElementById('qualityCurrentText');
    this.qualityMenu = document.getElementById('qualityMenu');

    this.ctrlFullscreenBtn = document.getElementById('ctrlFullscreenBtn');
    this.iconEnterFs = document.getElementById('iconEnterFs');
    this.iconExitFs = document.getElementById('iconExitFs');

    // 9. Bannière de Statut & Résilience
    this.statusBanner = document.getElementById('playerStatusBanner');
    this.statusBannerText = document.getElementById('statusBannerText');
    this.statusSwitchBtn = document.getElementById('statusSwitchBtn');
    this.statusRetryBtn = document.getElementById('statusRetryBtn');

    // État Interne
    this.currentMovie = null;
    this.currentServer = 1;
    this.currentSeason = 1;
    this.currentEpisode = 1;
    this.currentEpisodeDuration = 0;
    this.currentLang = localStorage.getItem('netflix_lang') || 'vo';
    this.currentQuality = -1; // -1 = Auto ABR
    this.hls = null;
    this.savedPlaybackTime = 0;
    this.lastLiveMaxTime = 0;
    this.activeExtractionAbort = null;
    this.inactivityTimer = null;
    this.isScrubbing = false;

    // Initialisation
    this.initEvents();
    this.initScrubberEvents();
    this.initVolumeEvents();
    this.initSpeedEvents();
    this.initQualityEvents();
    this.initServerNavEvents();
    this.initEpisodeSelectEvents();
    this.initInactivityTimer();
  }

  // ================= 1. INITIALISATION DES ÉVÉNEMENTS =================
  initEvents() {
    // Bouton Retour Catalogue
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => this.close());
    }

    // Play / Pause
    if (this.ctrlPlayBtn) {
      this.ctrlPlayBtn.addEventListener('click', () => this.togglePlay());
    }

    // Saut ±10 secondes
    if (this.ctrlRewindBtn) {
      this.ctrlRewindBtn.addEventListener('click', () => this.seekRelative(-10));
    }
    if (this.ctrlForwardBtn) {
      this.ctrlForwardBtn.addEventListener('click', () => this.seekRelative(10));
    }

    // Épisode suivant
    if (this.ctrlNextEpBtn) {
      this.ctrlNextEpBtn.addEventListener('click', () => this.goToNextEpisode());
    }

    // Plein Écran
    if (this.ctrlFullscreenBtn) {
      this.ctrlFullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    // Clic & Double-clic sur la vidéo
    if (this.video) {
      this.video.addEventListener('click', (e) => {
        if (e.target.closest('.netflix-bottom-controls') || e.target.closest('.player-top-bar')) return;
        this.togglePlay();
      });

      this.video.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.toggleFullscreen();
      });

      this.video.addEventListener('play', () => this.updatePlayStateUI(true));
      this.video.addEventListener('pause', () => this.updatePlayStateUI(false));
      this.video.addEventListener('ended', () => {
        const isSeries = (this.currentMovie?.media_type === 'series' || this.currentMovie?.is_xtream_series);
        if (isSeries) {
          this.goToNextEpisode();
        }
      });
    }

    // Raccourcis Clavier
    document.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('active')) return;
      if (['input', 'select', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seekRelative(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seekRelative(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolumeRelative(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolumeRelative(-0.1);
          break;
        case 'm':
        case 'M':
          this.toggleMute();
          break;
        case 'f':
        case 'F':
          this.toggleFullscreen();
          break;
        case 'n':
        case 'N':
          this.goToNextEpisode();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            this.close();
          }
          break;
        default:
          if (e.key >= '1' && e.key <= '8') {
            this.switchServer(parseInt(e.key, 10));
          }
          break;
      }
    });

    // Bascule Audio VO / VF
    if (this.langVoBtn) {
      this.langVoBtn.addEventListener('click', () => this.setLanguage('vo'));
    }
    if (this.langVfBtn) {
      this.langVfBtn.addEventListener('click', () => this.setLanguage('vf'));
    }

    // Actions Bannière de Statut
    if (this.statusSwitchBtn) {
      this.statusSwitchBtn.addEventListener('click', () => {
        const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
        const maxSrv = isChannel ? 8 : 5;
        this.switchServer((this.currentServer % maxSrv) + 1);
      });
    }
    if (this.statusRetryBtn) {
      this.statusRetryBtn.addEventListener('click', () => this.loadStream());
    }
  }

  // ================= 2. SCRUBBER & TIMELINE PROGRESSIVE =================
  initScrubberEvents() {
    if (!this.scrubberContainer) return;

    const getEffectiveDuration = () => {
      let total = this.video.duration;
      if (!total || isNaN(total) || total === Infinity) {
        total = this.currentEpisodeDuration || 0;
      }
      return (total && isFinite(total) && total > 0) ? total : 0;
    };

    const onScrub = (e) => {
      const duration = getEffectiveDuration();
      if (!duration) return;
      const rect = this.scrubberContainer.getBoundingClientRect();
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left);
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.video.currentTime = pos * duration;
      this.updateScrubberProgress(pos * 100);
    };

    const updateTooltip = (e) => {
      if (!this.scrubberTooltip) return;
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) {
        this.scrubberTooltip.textContent = 'EN DIRECT 🔴';
        this.scrubberTooltip.classList.add('visible');
        return;
      }
      const duration = getEffectiveDuration();
      if (!duration || duration <= 0) {
        this.scrubberTooltip.classList.remove('visible');
        return;
      }
      const rect = this.scrubberContainer.getBoundingClientRect();
      if (!rect.width) return;
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left);
      const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pos = offsetX / rect.width;
      const targetTime = pos * duration;
      this.scrubberTooltip.textContent = this.formatTime(targetTime);

      // Clamping dynamique en pixels pour que le tooltip ne déborde jamais sur les bords gauche/droite
      const tooltipWidth = this.scrubberTooltip.offsetWidth || 56;
      const minLeft = tooltipWidth / 2 + 4;
      const maxLeft = rect.width - (tooltipWidth / 2 + 4);
      const clampedPixel = Math.max(minLeft, Math.min(maxLeft, offsetX));
      this.scrubberTooltip.style.left = `${clampedPixel}px`;
      this.scrubberTooltip.classList.add('visible');
    };

    // Survol souris
    this.scrubberContainer.addEventListener('mouseenter', (e) => updateTooltip(e));
    this.scrubberContainer.addEventListener('mousemove', (e) => updateTooltip(e));
    this.scrubberContainer.addEventListener('mouseleave', () => {
      if (!this.isScrubbing && this.scrubberTooltip) {
        this.scrubberTooltip.classList.remove('visible');
      }
    });

    // Clic & Glissement (Scrubbing)
    this.scrubberContainer.addEventListener('mousedown', (e) => {
      this.isScrubbing = true;
      this.scrubberContainer.classList.add('dragging');
      onScrub(e);
      updateTooltip(e);
      const onMouseMove = (ev) => {
        if (this.isScrubbing) {
          onScrub(ev);
          updateTooltip(ev);
        }
      };
      const onMouseUp = () => {
        this.isScrubbing = false;
        this.scrubberContainer.classList.remove('dragging');
        if (this.scrubberTooltip) this.scrubberTooltip.classList.remove('visible');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Progression temps réel allégée (optimisation 60fps : DOM throttlé à 4Hz max)
    let lastTimeUpdate = 0;
    this.video.addEventListener('timeupdate', () => {
      if (this.isScrubbing) return;
      const now = performance.now();
      if (now - lastTimeUpdate < 250) return;
      lastTimeUpdate = now;

      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) {
        this.ctrlCurrentTime.textContent = 'LIVE';
        this.ctrlTotalDuration.textContent = 'DIRECT';
        this.updateScrubberProgress(100);
        return;
      }

      const current = this.video.currentTime || 0;
      let total = this.video.duration;
      if (!total || isNaN(total) || total === Infinity) {
        total = this.currentEpisodeDuration || 0;
      }

      this.ctrlCurrentTime.textContent = this.formatTime(current);
      if (total > 0 && isFinite(total)) {
        this.ctrlTotalDuration.textContent = this.formatTime(total);
        const percent = (current / total) * 100;
        this.updateScrubberProgress(percent);
      }
      this.updateBufferedProgress();
    });

    // Buffer progressif (bande blanche) continu
    this.video.addEventListener('progress', () => this.updateBufferedProgress());
    this.video.addEventListener('loadedmetadata', () => {
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) {
        this.ctrlCurrentTime.textContent = 'LIVE';
        this.ctrlTotalDuration.textContent = 'DIRECT';
        this.updateScrubberProgress(100);
        return;
      }
      let total = this.video.duration;
      if (!total || isNaN(total) || total === Infinity) {
        total = this.currentEpisodeDuration || 0;
      }
      if (total > 0 && isFinite(total)) {
        this.ctrlTotalDuration.textContent = this.formatTime(total);
      }

      if (this.savedPlaybackTime > 0 && this.savedPlaybackTime < total) {
        this.video.currentTime = this.savedPlaybackTime;
        this.savedPlaybackTime = 0;
      }
      this.updateBufferedProgress();
    });
    this.video.addEventListener('canplay', () => this.updateBufferedProgress());
    this.video.addEventListener('playing', () => this.updateBufferedProgress());
    this.video.addEventListener('seeked', () => this.updateBufferedProgress());
  }

  updateBufferedProgress() {
    if (!this.scrubberBuffered) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel) {
      this.scrubberBuffered.style.width = '100%';
      return;
    }

    let total = this.video.duration;
    if (!total || isNaN(total) || total === Infinity) {
      total = this.currentEpisodeDuration || 0;
    }
    if (!total || total <= 0) return;

    const cur = this.video.currentTime || 0;
    let bufferedEnd = 0;

    if (this.video.buffered && this.video.buffered.length > 0) {
      for (let i = 0; i < this.video.buffered.length; i++) {
        const start = this.video.buffered.start(i);
        const end = this.video.buffered.end(i);
        if (start <= cur + 1.5 && cur <= end + 0.5) {
          bufferedEnd = Math.max(bufferedEnd, end);
        }
      }
      if (!bufferedEnd && this.video.buffered.length > 0) {
        bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
      }
    }

    const percent = Math.min(100, Math.max(0, (bufferedEnd / total) * 100));
    this.scrubberBuffered.style.width = `${percent}%`;
  }

  updateScrubberProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    if (this.scrubberPlayed) this.scrubberPlayed.style.width = `${clamped}%`;
    if (this.scrubberThumb) this.scrubberThumb.style.left = `${clamped}%`;
  }

  // ================= 3. VOLUME & AUDIO =================
  initVolumeEvents() {
    if (this.ctrlVolumeBtn) {
      this.ctrlVolumeBtn.addEventListener('click', () => this.toggleMute());
    }

    if (this.ctrlVolumeSlider) {
      this.ctrlVolumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.video.volume = val;
        this.video.muted = (val === 0);
        this.syncVolumeUI();
        localStorage.setItem('netflix_volume', val);
      });
    }

    const savedVol = localStorage.getItem('netflix_volume');
    if (savedVol !== null) {
      const v = parseFloat(savedVol);
      if (!isNaN(v) && v >= 0 && v <= 1) {
        this.video.volume = v;
        if (this.ctrlVolumeSlider) this.ctrlVolumeSlider.value = v;
      }
    }
    this.syncVolumeUI();
  }

  syncVolumeUI() {
    if (!this.ctrlVolumeSlider) return;
    const isMuted = this.video.muted || this.video.volume === 0;
    if (this.iconVolHigh) this.iconVolHigh.classList.toggle('hidden', isMuted);
    if (this.iconVolMuted) this.iconVolMuted.classList.toggle('hidden', !isMuted);

    const val = isMuted ? 0 : this.video.volume;
    this.ctrlVolumeSlider.value = val;
    this.ctrlVolumeSlider.style.background = `linear-gradient(to right, #e50914 ${val * 100}%, rgba(255,255,255,0.3) ${val * 100}%)`;
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    if (!this.video.muted && this.video.volume === 0) {
      this.video.volume = 0.5;
    }
    this.syncVolumeUI();
    this.triggerCenterRipple(this.video.muted ? '🔇' : '🔊');
  }

  setVolumeRelative(delta) {
    const cur = this.video.muted ? 0 : this.video.volume;
    const next = Math.max(0, Math.min(1, cur + delta));
    this.video.volume = next;
    this.video.muted = (next === 0);
    this.syncVolumeUI();
    this.triggerCenterRipple(`${Math.round(next * 100)}%`);
  }

  // ================= 4. VITESSE DE LECTURE =================
  initSpeedEvents() {
    if (!this.ctrlSpeedBtn || !this.speedMenu) return;

    this.ctrlSpeedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('hidden');
      if (this.qualityMenu) this.qualityMenu.classList.add('hidden');
    });

    this.speedMenu.querySelectorAll('.speed-item').forEach(item => {
      item.addEventListener('click', () => {
        const speed = parseFloat(item.dataset.speed);
        this.video.playbackRate = speed;
        this.ctrlSpeedBtn.textContent = (speed === 1) ? '1x' : `${speed}x`;
        this.speedMenu.querySelectorAll('.speed-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.speedMenu.classList.add('hidden');
        this.triggerCenterRipple(`${speed}x`);
      });
    });

    document.addEventListener('click', () => {
      if (this.speedMenu) this.speedMenu.classList.add('hidden');
    });
  }

  // ================= 5. SÉLECTEUR DE QUALITÉ HLS =================
  initQualityEvents() {
    if (!this.ctrlQualityBtn || !this.qualityMenu) return;

    this.ctrlQualityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.qualityMenu.classList.toggle('hidden');
      if (this.speedMenu) this.speedMenu.classList.add('hidden');
    });

    this.qualityMenu.querySelectorAll('.quality-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetQ = parseInt(item.dataset.quality, 10);
        this.currentQuality = targetQ;
        this.qualityMenu.querySelectorAll('.quality-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.applyQualityLevel();
        this.qualityMenu.classList.add('hidden');
      });
    });

    document.addEventListener('click', () => {
      if (this.qualityMenu) this.qualityMenu.classList.add('hidden');
    });
  }

  applyQualityLevel() {
    if (!this.hls || !this.hls.levels || this.hls.levels.length === 0) return;
    if (this.currentQuality === -1) {
      this.hls.currentLevel = -1; // Auto ABR
      if (this.qualityCurrentText) this.qualityCurrentText.textContent = 'Auto';
      return;
    }

    let bestIdx = -1;
    let minDiff = Infinity;
    this.hls.levels.forEach((lvl, idx) => {
      const h = lvl.height || 720;
      const diff = Math.abs(h - this.currentQuality);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = idx;
      }
    });

    if (bestIdx !== -1) {
      this.hls.currentLevel = bestIdx;
      const actualH = this.hls.levels[bestIdx].height || this.currentQuality;
      if (this.qualityCurrentText) this.qualityCurrentText.textContent = `${actualH}p`;
      if (this.qualityBadge) {
        this.qualityBadge.textContent = (actualH >= 1080) ? 'FHD' : ((actualH >= 720) ? 'HD' : `${actualH}p`);
      }
    }
  }

  updateQualityMenuOptions() {
    if (!this.hls || !this.hls.levels || !this.qualityMenu) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel && this.qualityBadge) {
      this.qualityBadge.textContent = 'FHD';
    }
  }

  // ================= 6. NAVIGATION SERVEURS 1-8 =================
  initServerNavEvents() {
    if (!this.serverSelector) return;

    if (this.serverNavPrev) {
      this.serverNavPrev.addEventListener('click', () => {
        this.serverSelector.scrollBy({ left: -220, behavior: 'smooth' });
      });
    }

    if (this.serverNavNext) {
      this.serverNavNext.addEventListener('click', () => {
        this.serverSelector.scrollBy({ left: 220, behavior: 'smooth' });
      });
    }

    this.serverSelector.addEventListener('scroll', () => this.updateServerNavState());
  }

  updateServerNavState() {
    if (!this.serverSelector) return;
    const sl = this.serverSelector.scrollLeft;
    const sw = this.serverSelector.scrollWidth;
    const cw = this.serverSelector.clientWidth;

    const canScrollLeft = sl > 6;
    const canScrollRight = (sw - sl - cw) > 6;

    if (this.serverNavPrev) {
      this.serverNavPrev.classList.toggle('is-disabled', !canScrollLeft);
      this.serverNavPrev.disabled = !canScrollLeft;
    }
    if (this.serverNavNext) {
      this.serverNavNext.classList.toggle('is-disabled', !canScrollRight);
      this.serverNavNext.disabled = !canScrollRight;
    }
  }

  updateServerPills() {
    if (!this.serverSelector) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);

    let serverList = [];
    if (isChannel) {
      serverList = [
        { num: 1, label: '💎 S1: Xtream VIP (1080p)', title: 'Serveur 1 : Direct Xtream VIP 1080p (Recommandé)', badge: '💎 Xtream VIP', isVip: true },
        { num: 2, label: '⭐ S2: Dark VIP 1080p', title: 'Serveur 2 : Flux VIP Ultra HD 1080p/60fps', badge: '⭐ Dark VIP', isVip: true },
        { num: 3, label: '⚡ S3: Direct 1080p (DLHD)', title: 'Serveur 3 : Direct HLS DLHD FHD', badge: '1080p Natif' },
        { num: 4, label: '🎬 S4: Direct 1080p (Apex)', title: 'Serveur 4 : Direct HLS Apex Streams FHD', badge: '1080p Natif' },
        { num: 5, label: '📡 S5: Direct 1080p (Alpha)', title: 'Serveur 5 : Direct HLS Alpha FHD', badge: '1080p Natif' },
        { num: 6, label: '🌐 S6: Direct 1080p (Cricsfree)', title: 'Serveur 6 : Direct HLS Cricsfree FHD', badge: '1080p Natif' },
        { num: 7, label: '🚀 S7: Direct 1080p (WideIPTV)', title: 'Serveur 7 : Direct HLS WideIPTV Bluetier CDN', badge: '1080p Natif' },
        { num: 8, label: '🛡️ S8: Direct 1080p (Secours)', title: 'Serveur 8 : Miroir de Secours FHD', badge: 'Secours' }
      ];
    } else {
      const isVf = (this.currentLang === 'vf');
      serverList = [
        { num: 1, label: isVf ? 'Serveur 1 (Direct HLS • VF)' : 'Serveur 1 (Direct HLS • VO)', title: 'Serveur 1 : Direct HLS' },
        { num: 2, label: 'Serveur 2 (Direct HD)', title: 'Serveur 2 : Direct HD' },
        { num: 3, label: 'Serveur 3 (Direct 720p)', title: 'Serveur 3 : Direct 720p' },
        { num: 4, label: 'Serveur 4 (Miroir CDN)', title: 'Serveur 4 : Miroir CDN' },
        { num: 5, label: 'Serveur 5 (Secours)', title: 'Serveur 5 : Miroir de Secours' }
      ];
    }

    this.serverSelector.innerHTML = '';
    serverList.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = (s.num === this.currentServer);
      btn.className = `server-pill${active ? ' active' : ''}${s.isVip ? ' vip-pill' : ''}`;
      btn.dataset.server = String(s.num);
      btn.title = s.title;
      if (active) {
        const dot = document.createElement('span');
        dot.className = 'pill-dot';
        dot.textContent = '● ';
        btn.appendChild(dot);
      }
      btn.appendChild(document.createTextNode(s.label + ' '));
      if (s.badge) {
        const badge = document.createElement('span');
        badge.className = 'pill-badge' + (s.isVip ? ' vip' : '');
        badge.textContent = s.badge;
        btn.appendChild(badge);
      }
      btn.addEventListener('click', () => this.switchServer(s.num));
      this.serverSelector.appendChild(btn);
    });

    setTimeout(() => {
      const activePill = this.serverSelector.querySelector('.server-pill.active');
      if (activePill) {
        activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      this.updateServerNavState();
    }, 50);
  }

  switchServer(serverNum, preserveTime = true) {
    const num = parseInt(serverNum, 10) || 1;
    if (preserveTime && this.video && this.video.currentTime > 0) {
      this.savedPlaybackTime = this.video.currentTime;
    } else if (!preserveTime) {
      this.savedPlaybackTime = 0;
      if (this.video) {
        try { this.video.currentTime = 0; } catch (e) {}
      }
    }

    this.currentServer = num;
    this.hideStatusBanner();
    this.updateServerPills();
    this.updateMetaDisplay();
    this.loadStream();
  }

  // ================= 7. NAVIGATION SAISONS & ÉPISODES =================
  initEpisodeSelectEvents() {
    if (this.seasonSelect) {
      this.seasonSelect.addEventListener('change', () => {
        this.currentSeason = parseInt(this.seasonSelect.value, 10);
        this.populateEpisodes();
        this.currentEpisode = parseInt(this.episodeSelect.value, 10) || 1;
        this.savedPlaybackTime = 0;
        this.updateMetaDisplay();
        this.loadStream();
      });
    }

    if (this.episodeSelect) {
      this.episodeSelect.addEventListener('change', () => {
        this.currentEpisode = parseInt(this.episodeSelect.value, 10);
        this.savedPlaybackTime = 0;
        this.updateMetaDisplay();
        this.loadStream();
      });
    }
  }

  // ================= INACTIVITÉ SOURIS : MASQUAGE AUTOMATIQUE =================
  initInactivityTimer() {
    const IDLE_DELAY = 4000; // 4 secondes d'inactivité

    const showControls = () => {
      if (!this.overlay) return;
      this.overlay.classList.remove('user-idle');
    };

    const hideControls = () => {
      if (!this.overlay) return;
      // Ne pas cacher si on est en train de scrubber ou si la vidéo est en pause
      if (this.isScrubbing) return;
      if (this.video && this.video.paused && !this.video.ended) return;
      this.overlay.classList.add('user-idle');
    };

    const resetTimer = () => {
      showControls();
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(hideControls, IDLE_DELAY);
    };

    // Écouter les mouvements souris sur le player overlay
    if (this.overlay) {
      this.overlay.addEventListener('mousemove', resetTimer);
      this.overlay.addEventListener('mousedown', resetTimer);
      this.overlay.addEventListener('touchstart', resetTimer, { passive: true });
      this.overlay.addEventListener('touchmove', resetTimer, { passive: true });

      // Quand la souris quitte le player, cacher les contrôles immédiatement
      this.overlay.addEventListener('mouseleave', () => {
        clearTimeout(this.inactivityTimer);
        hideControls();
      });

      // Quand la souris entre dans le player, montrer les contrôles
      this.overlay.addEventListener('mouseenter', resetTimer);
    }

    // Les raccourcis clavier doivent aussi réinitialiser le timer
    document.addEventListener('keydown', (e) => {
      if (!this.overlay || !this.overlay.classList.contains('active')) return;
      resetTimer();
    });
  }

  populateSeasons() {
    if (!this.seasonSelect) return;
    this.seasonSelect.innerHTML = '';
    const allSeasons = this.currentMovie?.seasons || [];
    // Priorité absolue aux saisons contenant de vrais épisodes
    const validSeasons = allSeasons.filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
    const seasonsToRender = validSeasons.length > 0 ? validSeasons : allSeasons;

    if (seasonsToRender.length > 0) {
      seasonsToRender.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.season_number;
        opt.textContent = s.name || s.title || `Saison ${s.season_number}`;
        this.seasonSelect.appendChild(opt);
      });

      // S'assurer que this.currentSeason est bien dans la liste des options
      const hasMatch = seasonsToRender.some(s => parseInt(s.season_number, 10) === this.currentSeason);
      if (!hasMatch) {
        this.currentSeason = parseInt(seasonsToRender[0].season_number, 10);
      }
    } else {
      const totalSeasons = Math.min(8, parseInt(this.currentMovie?.duration, 10) || 3);
      for (let s = 1; s <= totalSeasons; s++) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Saison ${s}`;
        this.seasonSelect.appendChild(opt);
      }
    }
    this.seasonSelect.value = String(this.currentSeason);
  }

  populateEpisodes() {
    if (!this.episodeSelect) return;
    this.episodeSelect.innerHTML = '';
    const allSeasons = this.currentMovie?.seasons || [];
    let seasonObj = allSeasons.find(s => parseInt(s.season_number, 10) === this.currentSeason);
    if (!seasonObj || !seasonObj.episodes || seasonObj.episodes.length === 0) {
      seasonObj = allSeasons.find(s => Array.isArray(s.episodes) && s.episodes.length > 0) || allSeasons[0];
      if (seasonObj) {
        this.currentSeason = parseInt(seasonObj.season_number, 10);
        if (this.seasonSelect) this.seasonSelect.value = String(this.currentSeason);
      }
    }

    if (seasonObj && seasonObj.episodes && seasonObj.episodes.length > 0) {
      seasonObj.episodes.forEach(ep => {
        const opt = document.createElement('option');
        opt.value = ep.episode_number;
        opt.textContent = `Épisode ${ep.episode_number} : ${ep.title}`;
        this.episodeSelect.appendChild(opt);
      });
      const hasMatch = seasonObj.episodes.some(e => parseInt(e.episode_number, 10) === this.currentEpisode);
      if (!hasMatch) {
        this.currentEpisode = parseInt(seasonObj.episodes[0].episode_number, 10);
      }
    } else {
      const count = seasonObj ? (seasonObj.episode_count || 10) : 10;
      for (let e = 1; e <= count; e++) {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = `Épisode ${e}`;
        this.episodeSelect.appendChild(opt);
      }
    }
    this.episodeSelect.value = String(this.currentEpisode);
  }

  goToNextEpisode() {
    if (!this.currentMovie) return;
    const allSeasons = (this.currentMovie.seasons || []).filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
    const seasonsList = allSeasons.length > 0 ? allSeasons : (this.currentMovie.seasons || []);
    if (seasonsList.length > 0) {
      const sObj = seasonsList.find(s => parseInt(s.season_number, 10) === this.currentSeason) || seasonsList[0];
      if (sObj && Array.isArray(sObj.episodes) && sObj.episodes.length > 0) {
        const curEpIdx = sObj.episodes.findIndex(e => parseInt(e.episode_number, 10) === this.currentEpisode);
        if (curEpIdx !== -1 && curEpIdx < sObj.episodes.length - 1) {
          this.currentEpisode = parseInt(sObj.episodes[curEpIdx + 1].episode_number, 10);
          if (this.episodeSelect) this.episodeSelect.value = String(this.currentEpisode);
          this.savedPlaybackTime = 0;
          this.updateMetaDisplay();
          this.loadStream();
          return;
        } else {
          const curSeasonIdx = seasonsList.findIndex(s => parseInt(s.season_number, 10) === this.currentSeason);
          if (curSeasonIdx !== -1 && curSeasonIdx < seasonsList.length - 1) {
            const nextSeason = seasonsList[curSeasonIdx + 1];
            this.currentSeason = parseInt(nextSeason.season_number, 10);
            if (this.seasonSelect) this.seasonSelect.value = String(this.currentSeason);
            this.populateEpisodes();
            this.currentEpisode = parseInt(this.episodeSelect.value, 10) || 1;
            this.savedPlaybackTime = 0;
            this.updateMetaDisplay();
            this.loadStream();
            return;
          }
        }
      }
    }
  }

  // ================= 8. GESTION DE L'INACTIVITÉ =================
  initInactivityTimer() {
    const showAndReset = () => {
      this.showControls();
      clearTimeout(this.inactivityTimer);
      if (!this.video.paused) {
        this.inactivityTimer = setTimeout(() => this.hideControls(), 3500);
      }
    };

    if (this.overlay) {
      this.overlay.addEventListener('mousemove', showAndReset);
      this.overlay.addEventListener('touchstart', showAndReset, { passive: true });
    }
  }

  showControls() {
    if (this.overlay) this.overlay.classList.remove('user-idle');
    // Redémarrer le timer d'inactivité
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => this.hideControls(), 4000);
  }

  hideControls() {
    if (this.video && this.video.paused && !this.video.ended) return;
    if (this.isScrubbing) return;
    if (this.overlay) this.overlay.classList.add('user-idle');
  }

  // ================= 9. OUVERTURE & FERMETURE DU LECTEUR =================
  async open(movie, initialServer = 1, season = null, episode = null) {
    window.isVideoPlaying = true;
    if (window.netflixApp && typeof window.netflixApp.pauseBackgroundTasks === 'function') {
      window.netflixApp.pauseBackgroundTasks();
    }
    if (window.app && typeof window.app.pauseBackgroundTasks === 'function') {
      window.app.pauseBackgroundTasks();
    }

    this.currentMovie = movie;
    this.currentEpisodeDuration = 0;

    if (this.video) {
      try {
        this.video.pause();
        this.video.currentTime = 0;
      } catch (e) {}
    }
    this.savedPlaybackTime = 0;

    this.overlay.classList.add('active');
    this.showControls();

    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');

    if (this.titleDisplay) this.titleDisplay.textContent = movie.title || 'Lecture';
    if (this.ctrlMediaTitle) this.ctrlMediaTitle.textContent = movie.title || 'Lecture';

    const isXtreamSeries = (movie.is_xtream_series || movie.id === '68628' || movie.tmdb_id === '68628' || String(movie.id).startsWith('xtream_series_') || !!movie.series_id);
    const isSeries = (movie.media_type === 'series' || isXtreamSeries || (Array.isArray(movie.seasons) && movie.seasons.length > 0));

    // 1. Pré-chargement immédiat et bloquant des saisons Xtream si absentes (évite le démarrage à vide)
    if (isSeries && (!movie.seasons || movie.seasons.length === 0) && isXtreamSeries) {
      const sId = movie.series_id || ((movie.id === '68628' || movie.tmdb_id === '68628') ? '6715' : String(movie.id).replace('xtream_series_', ''));
      this.showLoader(`⚡ Chargement des épisodes officiels (${movie.title})...`);
      this.resetSteps();
      this.setStep(1, 'active', `1. Récupération des saisons et épisodes Xtream VIP (${movie.title})...`);
      try {
        const baseUrl = window.API_BASE || '';
        const r = await fetch(`${baseUrl}/api/xtream/series-info?series_id=${sId}`);
        const fresh = await r.json();
        if (fresh?.seasons?.length > 0) {
          movie.seasons = fresh.seasons;
          this.currentMovie.seasons = fresh.seasons;
          if (window.app?.telerealiteSeriesCache) {
            window.app.telerealiteSeriesCache.set(parseInt(sId, 10), fresh);
          }
        }
      } catch (e) {
        console.warn('[Player] Erreur chargement saisons Xtream:', e);
      }
    }

    // 2. Détermination de la saison et de l'épisode avec vérification d'épisodes réels
    const showKey = 'netflix_ep_' + (movie.id || movie.tmdb_id || movie.series_id);
    let requestedSeason = season;
    let requestedEpisode = episode;
    if (requestedSeason == null && requestedEpisode == null) {
      try {
        const saved = JSON.parse(localStorage.getItem(showKey));
        if (saved?.season && saved?.episode) {
          requestedSeason = saved.season;
          requestedEpisode = saved.episode;
        }
      } catch (e) {}
    }

    if (isSeries) {
      const allSeasons = movie.seasons || [];
      const validSeasons = allSeasons.filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
      const targetSeasons = validSeasons.length > 0 ? validSeasons : allSeasons;

      if (targetSeasons.length > 0) {
        let sObj = targetSeasons.find(s => parseInt(s.season_number, 10) === parseInt(requestedSeason, 10));
        if (!sObj) {
          // Si la saison demandée (ex: 1) n'a aucun épisode réel (ex: La Villa, Les Apprentis Aventuriers, etc.),
          // on sélectionne AUTOMATIQUEMENT la première saison qui a du contenu (ex: Saison 10) !
          sObj = targetSeasons[0];
        }
        this.currentSeason = parseInt(sObj.season_number, 10);

        let epObj = (sObj.episodes && sObj.episodes.find(e => parseInt(e.episode_number, 10) === parseInt(requestedEpisode, 10))) || (sObj.episodes && sObj.episodes[0]);
        this.currentEpisode = epObj ? parseInt(epObj.episode_number, 10) : (parseInt(requestedEpisode, 10) || 1);
      } else {
        this.currentSeason = parseInt(requestedSeason, 10) || 1;
        this.currentEpisode = parseInt(requestedEpisode, 10) || 1;
      }

      try {
        localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
      } catch (e) {}

      if (this.episodeBox) this.episodeBox.classList.remove('hidden');
      this.populateSeasons();
      this.populateEpisodes();
      if (this.ctrlNextEpBtn) this.ctrlNextEpBtn.classList.remove('hidden');
    } else {
      this.currentSeason = 1;
      this.currentEpisode = 1;
      if (this.episodeBox) this.episodeBox.classList.add('hidden');
      if (this.ctrlNextEpBtn) this.ctrlNextEpBtn.classList.add('hidden');
    }

    // Configuration de l'affiche cinématographique d'attente (Zéro écran noir)
    let posterImg = movie.backdrop_url || movie.poster_url || '';
    if (movie.seasons && movie.seasons.length > 0) {
      const sObj = movie.seasons.find(s => parseInt(s.season_number, 10) === this.currentSeason) || movie.seasons[0];
      const epObj = sObj?.episodes?.find(e => parseInt(e.episode_number, 10) === this.currentEpisode) || sObj?.episodes?.[0];
      if (epObj?.still_url) posterImg = epObj.still_url;
    }
    if (this.backdrop) {
      this.backdrop.style.backgroundImage = posterImg ? `url('${posterImg}')` : 'none';
      this.backdrop.style.display = 'block';
      this.backdrop.classList.remove('fade-out');
    }
    if (this.video) {
      if (posterImg) this.video.poster = posterImg;
      else this.video.removeAttribute('poster');
    }

    const isLive = (movie.media_type === 'channel' || movie.is_live);
    if (this.langSwitch) {
      this.langSwitch.style.display = isLive ? 'none' : 'flex';
    }

    const isSingleXtreamLive = (movie.media_type === 'channel' || movie.is_live) && movie.is_xtream;
    const hasMultipleServers = !isSingleXtreamLive;
    if (this.serverWrapper) {
      this.serverWrapper.style.display = hasMultipleServers ? 'flex' : 'none';
    }

    this.setLanguage(this.currentLang, false);
    this.switchServer(initialServer, false);
  }

  // Nettoyage complet et étanche de la session de streaming en cours
  cleanupActivePlayback() {
    if (this.streamAbortController) {
      try { this.streamAbortController.abort(); } catch (e) {}
      this.streamAbortController = null;
    }
    if (this._antiLoopHandler) {
      try { this.video.removeEventListener('timeupdate', this._antiLoopHandler); } catch (e) {}
      this._antiLoopHandler = null;
    }
    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch (e) {}
      this.hls = null;
    }
    if (this.video) {
      try {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
      } catch (e) {}
    }
  }

  close() {
    if (this.activeExtractionAbort) {
      this.activeExtractionAbort.abort();
      this.activeExtractionAbort = null;
    }

    this.cleanupActivePlayback();

    if (this.backdrop) {
      this.backdrop.classList.remove('fade-out');
      this.backdrop.style.display = 'none';
      this.backdrop.style.backgroundImage = 'none';
    }

    if (this.iframe) {
      this.iframe.src = 'about:blank';
      this.iframe.classList.add('hidden');
    }

    this.hideLoader();
    this.hideStatusBanner();
    this.overlay.classList.remove('active', 'user-idle');
    clearTimeout(this.inactivityTimer);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    window.isVideoPlaying = false;
    if (window.netflixApp && typeof window.netflixApp.resumeBackgroundTasks === 'function') {
      window.netflixApp.resumeBackgroundTasks();
    }
    if (window.app && typeof window.app.resumeBackgroundTasks === 'function') {
      window.app.resumeBackgroundTasks();
    }
  }

  // ================= 10. MOTEURS DE STREAMING (LIVE & VOD) =================
  async loadStream() {
    if (this.activeExtractionAbort) {
      this.activeExtractionAbort.abort();
      this.activeExtractionAbort = null;
    }

    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch (e) {}
      this.hls = null;
    }

    try {
      this.video.pause();
    } catch (e) {}

    // A. Chemin Rapide : Chaîne Xtream Live TV
    if (this.currentMovie && this.currentMovie.stream_url && (this.currentMovie.is_xtream || this.currentMovie.stream_url.includes('/api/stream/xtream'))) {
      const baseUrl = window.API_BASE || '';
      let streamUrl = this.currentMovie.stream_url;
      if (streamUrl.startsWith('/')) streamUrl = baseUrl + streamUrl;

      this.showLoader(`⚡ Connexion au flux direct ${this.currentMovie.title} (💎 Xtream VIP)...`);
      this.resetSteps();
      this.setStep(1, 'done', `1. Chaîne Xtream validée (${this.currentMovie.title})`);
      this.setStep(2, 'done', `2. Flux direct obtenu (💎 Xtream VIP 1080p)`);
      this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
      this.setStep(4, 'active', `4. Injection dans le lecteur Netflix...`);
      this.playDirectHls(streamUrl);
      return;
    }

    // B. Chemin Rapide : Séries Xtream VOD (Télé-Réalité & La Villa)
    if (this.currentMovie && (this.currentMovie.is_xtream_series || this.currentMovie.id === '68628' || String(this.currentMovie.id).startsWith('xtream_series_') || this.currentMovie.series_id)) {
      const allSeasons = this.currentMovie.seasons || [];
      let sObj = allSeasons.find(s => parseInt(s.season_number, 10) === this.currentSeason && Array.isArray(s.episodes) && s.episodes.length > 0);
      if (!sObj) {
        sObj = allSeasons.find(s => Array.isArray(s.episodes) && s.episodes.length > 0) || allSeasons[0];
        if (sObj) {
          this.currentSeason = parseInt(sObj.season_number, 10);
          if (this.seasonSelect) this.seasonSelect.value = String(this.currentSeason);
        }
      }
      const epObj = sObj?.episodes?.find(e => parseInt(e.episode_number, 10) === this.currentEpisode) || sObj?.episodes?.[0];
      if (epObj) {
        this.currentEpisode = parseInt(epObj.episode_number, 10);
        if (this.episodeSelect) this.episodeSelect.value = String(this.currentEpisode);
      }
      const epStreamUrl = epObj ? (epObj.video_url || epObj.stream_url || epObj.sources?.vf) : null;

      // Détection de compatibilité du codec vidéo pour le navigateur web
      const epCodec = (epObj?.video_codec || epObj?.info?.video?.codec_name || epObj?.video?.codec_name || '').toLowerCase();
      const isHevc = (epCodec === 'hevc' || epCodec === 'h265');
      const browserCanPlayHevc = (this.video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') === 'probably' ||
                                  this.video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') === 'probably');

      if (epObj && epStreamUrl && (!isHevc || browserCanPlayHevc)) {
        this.currentSeason = parseInt(sObj.season_number, 10);
        this.currentEpisode = parseInt(epObj.episode_number, 10);
        this.currentEpisodeDuration = this.parseDurationToSeconds(epObj.duration || epObj.info?.duration || this.currentMovie.duration);
        if (this.currentEpisodeDuration > 0 && this.ctrlTotalDuration) {
          this.ctrlTotalDuration.textContent = this.formatTime(this.currentEpisodeDuration);
        }

        const baseUrl = window.API_BASE || '';
        let targetStreamUrl = epStreamUrl;
        if (targetStreamUrl.startsWith('/')) targetStreamUrl = baseUrl + targetStreamUrl;

        this.showLoader(`⚡ Connexion au flux direct ${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode} (💎 Xtream 1080p)...`);
        this.resetSteps();
        this.setStep(1, 'done', `1. Épisode validé (${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode})`);
        this.setStep(2, 'done', `2. Flux direct obtenu (💎 Xtream VIP 1080p FHD)`);
        this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
        this.setStep(4, 'active', `4. Injection dans le lecteur Netflix...`);
        this.playDirectVideo(targetStreamUrl);
        return;
      }

      if (!epObj || !epStreamUrl) {
        this.showStatusBanner(`Épisode S${this.currentSeason}:E${this.currentEpisode} indisponible sur le serveur Xtream.`);
        return;
      }

      if (isHevc && !browserCanPlayHevc) {
        console.log(`[Player] Flux direct HEVC détecté (${epCodec}) sans support natif navigateur. Redirection automatique vers /api/extract avec flux HLS compatible...`);
      }
    }

    // C. Chemin Standard : Extraction API (/api/extract)
    let id = this.currentMovie.tmdb_id || this.currentMovie.id;
    if (this.currentMovie.is_xtream_series || this.currentMovie.series_id || (this.currentMovie.id && String(this.currentMovie.id).startsWith('xtream_series_'))) {
      id = this.currentMovie.id || `xtream_series_${this.currentMovie.series_id}`;
    }
    const isChannel = (this.currentMovie.media_type === 'channel' || this.currentMovie.is_live);
    const isMovie = (this.currentMovie.media_type === 'movie');
    const mediaType = isChannel ? 'channel' : (isMovie ? 'movie' : 'series');
    const s = this.currentSeason;
    const e = this.currentEpisode;

    const langLabel = isChannel ? 'DIRECT 🔴' : ((this.currentLang === 'vf') ? 'VF 🇫🇷' : 'VO 🇬🇧');
    this.showLoader(isChannel ? `⚡ Connexion au direct ${this.currentMovie.title}...` : `⚡ Extraction Serveur ${this.currentServer} (${langLabel})...`);
    this.resetSteps();
    this.setStep(1, 'active', `1. Résolution de la source (${this.currentMovie.title})...`);

    const abortController = new AbortController();
    this.activeExtractionAbort = abortController;

    try {
      const baseUrl = window.API_BASE || '';
      const seriesIdParam = this.currentMovie.series_id ? `&series_id=${encodeURIComponent(this.currentMovie.series_id)}` : '';
      const titleParam = this.currentMovie.title ? `&title=${encodeURIComponent(this.currentMovie.title)}` : '';
      const url = `${baseUrl}/api/extract?id=${encodeURIComponent(id)}&type=${mediaType}&season=${s}&episode=${e}&server=${this.currentServer}&lang=${this.currentLang}&fallback=1${seriesIdParam}${titleParam}`;
      const res = await fetch(url, { signal: abortController.signal });
      const data = await res.json();

      if (!data.success && data.needsSeriesInfo && data.series_id) {
        const siRes = await fetch(`${baseUrl}/api/xtream/series-info?series_id=${data.series_id}`, { signal: abortController.signal });
        const siData = await siRes.json();
        if (siData?.seasons?.length > 0) {
          this.currentMovie.seasons = siData.seasons;
          this.loadStream();
          return;
        }
      }

      if (!data.success) {
        throw new Error(data.message || 'Flux temporairement indisponible');
      }

      this.setStep(1, 'done', `1. Source validée (${this.currentMovie.title})`);
      this.setStep(2, 'done', `2. Flux direct obtenu (${data.quality || '1080p FHD'})`);
      this.setStep(3, 'done', `3. Déchiffrement direct validé`);
      this.setStep(4, 'active', `4. Injection dans le lecteur Netflix...`);

      let targetStreamUrl = data.stream_url || data.embed_url;
      if (targetStreamUrl && targetStreamUrl.startsWith('/')) {
        targetStreamUrl = baseUrl + targetStreamUrl;
      }

      if (isChannel || data.player_type === 'direct_hls' || (targetStreamUrl && targetStreamUrl.includes('.m3u8'))) {
        this.playDirectHls(targetStreamUrl);
      } else if (data.player_type === 'direct_video' || targetStreamUrl.includes('/api/stream/xtream-series')) {
        this.playDirectVideo(targetStreamUrl);
      } else if (data.player_type === 'iframe' || data.is_embed) {
        this.playEmbedIframe(data.embed_url || targetStreamUrl);
      } else {
        this.playDirectHls(targetStreamUrl);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn(`[Serveur ${this.currentServer}] Erreur extraction :`, err.message);

      const isXtreamSeries = (this.currentMovie && (this.currentMovie.is_xtream_series || this.currentMovie.id === '68628' || String(this.currentMovie.id).startsWith('xtream_series_')));
      if (isXtreamSeries) {
        this.showStatusBanner(`Épisode S${this.currentSeason}:E${this.currentEpisode} indisponible sur le serveur Xtream (${err.message})`);
        return;
      }

      this.showStatusBanner(`Serveur ${this.currentServer} indisponible (${err.message}). Basculement automatique...`);
      setTimeout(() => {
        const maxSrv = isChannel ? 8 : 5;
        this.switchServer((this.currentServer % maxSrv) + 1);
      }, 1500);
    }
  }

  // ================= 11. MOTEUR LIVE HLS & VOD (Hls.js) =================
  playDirectHls(streamUrl) {
    const baseUrl = window.API_BASE || '';
    if (streamUrl && streamUrl.startsWith('/')) streamUrl = baseUrl + streamUrl;

    this.cleanupActivePlayback();
    this.streamAbortController = new AbortController();
    const { signal } = this.streamAbortController;

    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');
    if (this.bottomControls) this.bottomControls.classList.remove('iframe-mode');

    let hasReadied = false;
    const onReady = () => {
      if (hasReadied) return;
      if (this.video.readyState < 2 && this.video.currentTime <= 0) return;
      hasReadied = true;
      this.setStep(4, 'done', `4. Flux connecté • Lecture fluide 1080p`);
      this.hideLoader();
      if (this.backdrop) {
        this.backdrop.classList.add('fade-out');
        setTimeout(() => {
          if (this.backdrop) this.backdrop.style.display = 'none';
        }, 200);
      }
    };

    this.video.addEventListener('loadeddata', () => onReady(), { signal });
    this.video.addEventListener('canplay', () => onReady(), { signal });
    this.video.addEventListener('playing', () => onReady(), { signal });
    this.video.addEventListener('timeupdate', () => {
      if (this.video.currentTime > 0) onReady();
    }, { signal });

    // Sécurité absolue : masquer le loader après 3.5s max
    setTimeout(() => {
      if (!hasReadied) {
        hasReadied = true;
        this.hideLoader();
        if (this.backdrop) {
          this.backdrop.classList.add('fade-out');
          setTimeout(() => {
            if (this.backdrop) this.backdrop.style.display = 'none';
          }, 200);
        }
      }
    }, 3500);

    const isChannel = !!(this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);

    // Protection Anti-Rollback / Anti-Boucle Xtream UNIQUEMENT pour Live TV (JAMAIS sur VOD)
    if (isChannel) {
      this.lastLiveMaxTime = 0;
      this._antiLoopHandler = () => {
        if (!this.video.paused && !this.video.seeking) {
          const cur = this.video.currentTime;
          if (this.lastLiveMaxTime > 6 && cur < (this.lastLiveMaxTime - 2.0)) {
            console.warn(`[Anti-Loop Xtream] Recalage direct : ${cur.toFixed(1)}s -> ${this.lastLiveMaxTime.toFixed(1)}s`);
            this.video.currentTime = this.lastLiveMaxTime + 0.2;
            return;
          }
          if (cur > this.lastLiveMaxTime) {
            this.lastLiveMaxTime = cur;
          }
        }
      };
      this.video.addEventListener('timeupdate', this._antiLoopHandler, { signal });
    }

    if (window.Hls && Hls.isSupported()) {
      // Configuration étanche et séparée : Live TV vs VOD
      const hlsConfig = isChannel ? {
        // === MODE LIVE TV (Chaînes Xtream Live & Serveurs 1-8) ===
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        liveDurationInfinity: true,
        startLevel: -1,
        capLevelToPlayerSize: false,
        initialLiveManifestSize: 1,
        startFragPrefetch: true,
        progressive: false,
        backBufferLength: 20,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 50 * 1024 * 1024,
        maxBufferHole: 0.9,
        highBufferWatchdogPeriod: 1,
        lowBufferWatchdogPeriod: 0.5,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 5,
        maxFragLookUpTolerance: 0.35,
        fragLoadingTimeOut: 15000,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        abrEwmaDefaultEstimate: 5000000
      } : {
        // === MODE VOD (Séries & Films : FrenchStream, Vidzy, Fsvid, Xtream VOD) ===
        enableWorker: true,
        lowLatencyMode: false,
        liveDurationInfinity: false,
        startLevel: -1,
        capLevelToPlayerSize: false,
        startFragPrefetch: true,
        progressive: false,
        backBufferLength: 90,           // Garde 90s d'historique (évite les flushes intempestifs et permet le retour arrière instantané)
        maxBufferLength: 120,           // Précharge 2 minutes d'avance (tampon généreux et stable)
        maxMaxBufferLength: 240,        // Jusqu'à 4 minutes d'avance max
        maxBufferSize: 120 * 1024 * 1024, // 120 Mo de RAM alloués pour flux 1080p FHD
        maxBufferHole: 1.0,             // Enjambe automatiquement et instantanément les micro-décalages PTS entre segments de 10s
        highBufferWatchdogPeriod: 0.8,  // Réagit en 800ms max (au lieu de 3s) si un micro-blocage survient
        lowBufferWatchdogPeriod: 0.5,
        nudgeOffset: 0.2,               // Décale de 200ms pour franchir le trou sans saccade
        nudgeMaxRetry: 5,
        maxFragLookUpTolerance: 0.35,
        fragLoadingTimeOut: 15000,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        abrEwmaDefaultEstimate: 6000000 // Estimation initiale 6 Mbps pour 1080p fluide sans sauts ABR au démarrage
      };

      const hls = new Hls(hlsConfig);
      this.hls = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(this.video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.setStep(3, 'done', `3. Playlist & fragments HLS initialisés`);
        this.setStep(4, 'active', `4. Démarrage fluide du flux vidéo...`);
        if (hls.levels && hls.levels.length > 0) {
          this.updateQualityMenuOptions();
          if (this.currentQuality === -1) {
            hls.currentLevel = -1;
          } else {
            this.applyQualityLevel();
          }
        }

        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('[Player] Autoplay avec son restreint par le navigateur, démarrage en muet :', err.message);
            this.video.muted = true;
            this.syncVolumeUI();
            this.video.play().catch(() => {});
          });
        }
      });

      this._mediaErrorCount = 0;
      this._networkErrorCount = 0;
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        this._mediaErrorCount = 0;
        this._networkErrorCount = 0;
        onReady();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        if (hls.levels && hls.levels[data.level]) {
          const lvl = hls.levels[data.level];
          const h = lvl.height || 720;
          if (this.qualityBadge) {
            this.qualityBadge.textContent = (h >= 1080) ? 'FHD' : ((h >= 720) ? 'HD' : `${h}p`);
          }
          if (this.currentQuality === -1 && this.qualityCurrentText) {
            this.qualityCurrentText.textContent = `${h}p`;
          }
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        // Détection immédiate d'incompatibilité audio matérielle (ex: EC-3 Dolby dans M2TS non supporté par le décodeur du navigateur)
        if (data.reason && (data.reason.includes('EC-3') || data.reason.includes('Unsupported audio'))) {
          console.warn('[HLS] Incompatibilité audio directe (EC-3). Basculement immédiat vers le serveur optimisé...');
          const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
          if (isChannel && this.currentServer < 8) {
            const nextSrv = (this.currentServer % 8) + 1;
            this.showStatusBanner(`Flux direct en cours d'optimisation (Basculement Serveur ${nextSrv})...`);
            setTimeout(() => {
              this.hideStatusBanner();
              this.switchServer(nextSrv, true);
            }, 100);
            return;
          }
        }

        if (!data.fatal) {
          // Gestion proactive des micro-trous de buffer à la jonction des segments de 10s (VOD UNIQUEMENT)
          const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
          if (!isChannel && (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE)) {
            const cur = this.video.currentTime;
            if (this.video.buffered && this.video.buffered.length > 0) {
              for (let i = 0; i < this.video.buffered.length; i++) {
                const bStart = this.video.buffered.start(i);
                if (bStart > cur && (bStart - cur) <= 1.0) {
                  console.log(`[HLS Gap Recovery] Franchissement instantané du micro-trou (${cur.toFixed(2)}s -> ${(bStart + 0.05).toFixed(2)}s)`);
                  this.video.currentTime = bStart + 0.05;
                  this.video.play().catch(() => {});
                  return;
                }
              }
            }
          }
          return;
        }

        console.warn('[HLS Fatal Error]', data.type, data.details);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            this._networkErrorCount = (this._networkErrorCount || 0) + 1;
            if (this._networkErrorCount >= 2 || data.details === 'manifestLoadError' || data.details === 'manifestLoadTimeOut') {
              this._networkErrorCount = 0;
              const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
              if (isChannel && (this.currentServer < 8)) {
                const nextSrv = (this.currentServer % 8) + 1;
                this.showStatusBanner(`Flux principal indisponible (Basculement automatique Serveur ${nextSrv})...`);
                setTimeout(() => {
                  this.hideStatusBanner();
                  this.switchServer(nextSrv, true);
                }, 600);
                return;
              }
            }
            console.log('[HLS] Récupération réseau automatique...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            this._mediaErrorCount = (this._mediaErrorCount || 0) + 1;
            if (this._mediaErrorCount >= 2 || data.details === 'mediaSourceRequiresReset') {
              console.warn('[HLS] Codec incompatible ou erreur média persistante. Basculement automatique...');
              this._mediaErrorCount = 0;
              const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
              if (isChannel) {
                const nextSrv = (this.currentServer % 8) + 1;
                this.showStatusBanner(`Flux direct en cours d'optimisation (Basculement Serveur ${nextSrv})...`);
                setTimeout(() => {
                  this.hideStatusBanner();
                  this.switchServer(nextSrv, true);
                }, 800);
                return;
              }
            }
            console.log('[HLS] Récupération média automatique...');
            hls.recoverMediaError();
            break;
          default:
            try {
              hls.recoverMediaError();
            } catch (e) {}
            break;
        }
      });
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = streamUrl;
      this.video.onloadedmetadata = () => {
        onReady();
        this.video.play().catch(() => {
          this.video.muted = true;
          this.syncVolumeUI();
          this.video.play().catch(() => {});
        });
      };
    } else {
      this.showStatusBanner("Votre navigateur ne supporte pas la lecture HLS directe.");
    }
  }

  // ================= 12. MOTEUR SÉRIES VOD (Range 206) =================
  playDirectVideo(videoUrl) {
    const baseUrl = window.API_BASE || '';
    if (videoUrl && videoUrl.startsWith('/')) videoUrl = baseUrl + videoUrl;

    this.cleanupActivePlayback();
    this.streamAbortController = new AbortController();
    const { signal } = this.streamAbortController;

    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');
    if (this.bottomControls) this.bottomControls.classList.remove('iframe-mode');

    let hasReadied = false;
    const onReady = () => {
      if (hasReadied) return;
      if (this.video.readyState < 2 && this.video.currentTime <= 0) return;
      hasReadied = true;
      this.setStep(4, 'done', `4. Épisode connecté • Lecture active 1080p FHD`);
      this.hideLoader();
      if (this.backdrop) {
        this.backdrop.classList.add('fade-out');
        setTimeout(() => {
          if (this.backdrop) this.backdrop.style.display = 'none';
        }, 200);
      }
    };

    this.video.addEventListener('loadeddata', () => onReady(), { signal });
    this.video.addEventListener('canplay', () => onReady(), { signal });
    this.video.addEventListener('playing', () => onReady(), { signal });
    this.video.addEventListener('timeupdate', () => {
      if (this.video.currentTime > 0) onReady();
    }, { signal });

    // Sécurité absolue : masquer le loader après 3.5s quoi qu'il arrive
    setTimeout(() => {
      if (!hasReadied) {
        hasReadied = true;
        this.hideLoader();
        if (this.backdrop) {
          this.backdrop.classList.add('fade-out');
          setTimeout(() => {
            if (this.backdrop) this.backdrop.style.display = 'none';
          }, 200);
        }
      }
    }, 3500);

    this.video.addEventListener('error', () => {
      onReady();
      const err = this.video.error;
      console.warn('[Direct Video Error]:', err?.message || err?.code);

      // Récupération automatique si le format n'est pas supporté (ex: HEVC/MKV dans Chrome)
      if (this.currentMovie && (err?.code === 4 || !this.video.readyState)) {
        this.showStatusBanner("Format vidéo non supporté par ce navigateur (HEVC). Basculement automatique vers le flux HLS compatible...");
        setTimeout(() => {
          this.switchServer(2, true);
        }, 700);
      }
    }, { signal, once: true });

    let hasStartedPlay = false;
    const triggerSafePlay = () => {
      if (hasStartedPlay) return;
      hasStartedPlay = true;
      const playPromise = this.video.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[Direct Video Autoplay Warn]: Autoplay restreint, passage en muet :', err.message);
          this.video.muted = true;
          this.syncVolumeUI();
          this.video.play().catch(() => {});
        });
      }
    };

    this.video.addEventListener('canplay', () => triggerSafePlay(), { signal, once: true });
    this.video.addEventListener('loadeddata', () => triggerSafePlay(), { signal, once: true });
    // Sécurité : ne jamais attendre plus de 1.2s
    setTimeout(() => triggerSafePlay(), 1200);

    this.video.preload = 'auto';
    this.video.src = videoUrl;
    this.video.load();
  }

  // ================= 13. MOTEUR IFRAME DE SECOURS =================
  playEmbedIframe(embedUrl) {
    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch (e) {}
      this.hls = null;
    }
    this.video.pause();
    this.video.src = '';
    this.video.classList.add('hidden');
    this.iframe.classList.remove('hidden');
    this.iframe.src = embedUrl;

    if (this.bottomControls) this.bottomControls.classList.add('iframe-mode');
    this.setStep(4, 'done', `4. Lecteur officiel connecté • Lecture active`);
    setTimeout(() => this.hideLoader(), 400);
  }

  // ================= 14. UTILITAIRES D'AFFICHAGE & LOADER =================
  togglePlay() {
    if (this.video && this.video.error) {
      console.warn('[Player] Clic Play/Pause sur vidéo en erreur, relance automatique du flux...');
      this.loadStream();
      return;
    }
    if (this.video.paused) {
      this.video.play().catch(() => {
        this.video.muted = true;
        this.syncVolumeUI();
        this.video.play().catch(() => {});
      });
      this.triggerCenterRipple('▶');
    } else {
      this.video.pause();
      this.triggerCenterRipple('⏸');
    }
  }

  updatePlayStateUI(isPlaying) {
    if (this.iconPlay) this.iconPlay.classList.toggle('hidden', isPlaying);
    if (this.iconPause) this.iconPause.classList.toggle('hidden', !isPlaying);
  }

  seekRelative(seconds) {
    let total = this.video.duration;
    if (!total || isNaN(total) || total === Infinity) {
      total = this.currentEpisodeDuration || 0;
    }
    if (!total || !isFinite(total)) return;
    const newTime = Math.max(0, Math.min(total, this.video.currentTime + seconds));
    this.video.currentTime = newTime;
    this.triggerCenterRipple(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (this.overlay.requestFullscreen) {
        this.overlay.requestFullscreen().catch(() => {});
      }
      if (this.iconEnterFs) this.iconEnterFs.classList.add('hidden');
      if (this.iconExitFs) this.iconExitFs.classList.remove('hidden');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      if (this.iconEnterFs) this.iconEnterFs.classList.remove('hidden');
      if (this.iconExitFs) this.iconExitFs.classList.add('hidden');
    }
  }

  triggerCenterRipple(text) {
    if (!this.ripple) return;
    this.ripple.textContent = text;
    this.ripple.classList.remove('animate');
    void this.ripple.offsetWidth;
    this.ripple.classList.add('animate');
  }

  showLoader(titleText = null) {
    if (this.loader) {
      if (titleText && this.loaderTitle) this.loaderTitle.textContent = titleText;
      this.loader.classList.remove('hidden');
    }
  }

  hideLoader() {
    if (this.loader) this.loader.classList.add('hidden');
  }

  setStep(stepNum, status, labelText = null) {
    const stepEl = this[`step${stepNum}`];
    const labelEl = this[`step${stepNum}Label`];
    if (!stepEl) return;
    stepEl.className = 'step-item ' + status;
    if (labelText && labelEl) {
      labelEl.textContent = labelText;
    }
  }

  resetSteps() {
    this.setStep(1, 'pending', '1. Résolution de la source et des métadonnées');
    this.setStep(2, 'pending', '2. Récupération des flux chiffrés multi-serveurs');
    this.setStep(3, 'pending', '3. Déchiffrement direct & Proxy local anti-pub');
    this.setStep(4, 'pending', '4. Initialisation du flux dans le lecteur Netflix');
  }

  showStatusBanner(text) {
    if (this.statusBanner && this.statusBannerText) {
      this.statusBannerText.textContent = text;
      this.statusBanner.classList.remove('hidden');
    }
  }

  hideStatusBanner() {
    if (this.statusBanner) this.statusBanner.classList.add('hidden');
  }

  setLanguage(lang, reloadStream = true) {
    if (lang !== 'vo' && lang !== 'vf') lang = 'vo';
    this.currentLang = lang;
    try {
      localStorage.setItem('netflix_lang', lang);
    } catch (e) {}

    document.querySelectorAll('.lang-switch-capsule').forEach(capsule => {
      capsule.setAttribute('data-active-lang', lang);
      const voBtn = capsule.querySelector('[data-lang="vo"]');
      const vfBtn = capsule.querySelector('[data-lang="vf"]');
      if (voBtn) voBtn.classList.toggle('active', lang === 'vo');
      if (vfBtn) vfBtn.classList.toggle('active', lang === 'vf');
    });

    this.updateServerPills();
    this.updateMetaDisplay();

    if (this.overlay.classList.contains('active') && reloadStream) {
      if (this.video && this.video.currentTime > 0) {
        this.savedPlaybackTime = this.video.currentTime;
      }
      this.loadStream();
    }
  }

  updateMetaDisplay() {
    if (!this.currentMovie) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel) {
      const serverNames = {
        1: 'Serveur 1 (💎 Direct Xtream VIP 1080p)',
        2: 'Serveur 2 (⭐ Dark VIP Ultra HD 1080p/60fps)',
        3: 'Serveur 3 (⚡ Direct HLS DLHD Cluster 2 1080p)',
        4: 'Serveur 4 (🎬 Direct HLS Apex Streams 1080p)',
        5: 'Serveur 5 (📡 Direct HLS DLHD Alpha 1080p)',
        6: 'Serveur 6 (🌐 Direct HLS Cricsfree 1080p)',
        7: 'Serveur 7 (🚀 Direct HLS WideIPTV Bluetier 1080p)',
        8: 'Serveur 8 (🛡️ Direct HLS Secours 1080p)'
      };
      const sName = serverNames[this.currentServer] || `Serveur ${this.currentServer}`;
      const chNum = this.currentMovie.channel_number ? `Canal ${this.currentMovie.channel_number} • ` : '';
      this.metaDisplay.innerHTML = `<span style="color: #e50914; font-weight: 800;"><span class="live-pulse">●</span> EN DIRECT</span> • ${chNum}1080p FHD • ${sName} • Anti-Pubs Actif 🛡️`;
      this.ctrlMediaTitle.textContent = `${this.currentMovie.title} (🔴 DIRECT)`;
      if (this.ctrlTotalDuration) this.ctrlTotalDuration.textContent = 'DIRECT';
      return;
    }

    const isSeries = (this.currentMovie.media_type === 'series' || this.currentMovie.is_xtream_series);
    const year = this.currentMovie.release_year || '2025';
    const dur = this.currentMovie.duration || '45 min';
    const langBadge = (this.currentLang === 'vf') ? 'VF 🇫🇷' : 'VO 🇬🇧';
    const sName = `Serveur ${this.currentServer}`;

    if (isSeries) {
      this.metaDisplay.textContent = `Saison ${this.currentSeason} • Épisode ${this.currentEpisode} • ${langBadge} • ${sName} • Anti-Pubs Actif 🛡️`;
      this.ctrlMediaTitle.textContent = `${this.currentMovie.title} (S${this.currentSeason}:E${this.currentEpisode})`;
    } else {
      this.metaDisplay.textContent = `${year} • ${dur} • ${langBadge} • ${sName} • Anti-Pubs Actif 🛡️`;
      this.ctrlMediaTitle.textContent = this.currentMovie.title;
    }
  }

  parseDurationToSeconds(dur) {
    if (!dur) return 0;
    if (typeof dur === 'number') return (isFinite(dur) && dur > 0) ? dur : 0;
    const str = String(dur).trim();
    if (/^\d+$/.test(str)) {
      const n = parseInt(str, 10);
      return (n > 0 && n < 86400) ? n : 0;
    }
    if (str.includes(':')) {
      const parts = str.split(':').map(p => parseInt(p, 10) || 0);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    let totalSec = 0;
    const hMatch = str.match(/(\d+)\s*h/i);
    const mMatch = str.match(/(\d+)\s*m/i);
    const sMatch = str.match(/(\d+)\s*s/i);
    if (hMatch) totalSec += parseInt(hMatch[1], 10) * 3600;
    if (mMatch) totalSec += parseInt(mMatch[1], 10) * 60;
    if (sMatch) totalSec += parseInt(sMatch[1], 10);
    return totalSec;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '00:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }
}

// Initialisation globale
window.NetflixPlayer = NetflixPlayer;
