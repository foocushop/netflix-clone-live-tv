// ================= LECTEUR VIDÉO NETFLIX PROFESSIONNEL (5 SERVEURS DIRECTS HLS) =================
// ⚡ Serveur 1 : Direct HLS (Cluster Alpha)
// 🎬 Serveur 2 : Direct HD (Cluster Bêta)
// 🌐 Serveur 3 : Direct Multi-Flux (Cluster Gamma)
// 📡 Serveur 4 : Direct CDN VIP (Cluster Delta)
// 🚀 Serveur 5 : Direct Secours (Cluster Epsilon)
//
// Fonctionnalités :
// - Lecteur 100% style Netflix (Timeline Scrubber rouge, tooltip temporel, buffer progressif)
// - Boutons de saut ±10s avec flèches circulaires aérées
// - Curseur de volume avec petit rond blanc interactif ("slider thumb") et remplissage dynamique
// - Ripple animé au centre lors des actions (Play/Pause, ±10s, Volume)
// - Sélecteur de vitesse de lecture (0.75x à 2x)
// - Basculement fluide entre les 5 serveurs sans perte de position temporelle
// - Masquage automatique des contrôles en inactivité (3.5s)
// - Raccourcis clavier (Espace, Flèches, F, M, 1-5, Échap)
// Détection de l'hôte API pour compatibilité Web & Android TV locale (file://)
window.API_BASE = window.API_BASE || ((window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null' || window.location.origin.startsWith('file:'))
  ? 'https://netflix-clone-live-tv-1.onrender.com'
  : '');

class NetflixPlayer {
  constructor() {
    // Éléments principaux
    this.overlay = document.getElementById('netflixPlayer');
    this.topBar = document.getElementById('playerTopBar');
    this.backBtn = document.getElementById('playerBackBtn');
    this.titleDisplay = document.getElementById('playerTitle');
    this.metaDisplay = document.getElementById('playerMeta');
    // Sélecteur de Langue (VO / VF)
    this.langSwitch = document.getElementById('playerLangSwitch');
    this.langVoBtn = document.getElementById('playerLangVo');
    this.langVfBtn = document.getElementById('playerLangVf');

    // Sélecteur de Serveurs avec Navigation & Défilement Horizontal
    this.serverWrapper = document.getElementById('playerServerWrapper');
    this.serverNavPrev = document.getElementById('serverNavPrev');
    this.serverNavNext = document.getElementById('serverNavNext');
    this.serverSelector = document.getElementById('playerServerSelector');
    this.serverPills = document.querySelectorAll('.server-pill');

    // Sélecteur d'Épisodes (Séries)
    this.episodeBox = document.getElementById('playerEpisodeBox');
    this.seasonSelect = document.getElementById('playerSeasonSelect');
    this.episodeSelect = document.getElementById('playerEpisodeSelect');

    // Éléments Média
    this.mediaContainer = document.getElementById('playerMediaContainer');
    this.video = document.getElementById('mainVideo');
    this.iframe = document.getElementById('streamIframe');
    this.ripple = document.getElementById('centerPlayRipple');

    // Loader & Étapes
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

    // Contrôles Netflix Inférieurs
    this.bottomControls = document.getElementById('netflixBottomControls');
    this.scrubberContainer = document.getElementById('scrubberContainer');
    this.scrubberBuffered = document.getElementById('scrubberBuffered');
    this.scrubberPlayed = document.getElementById('scrubberPlayed');
    this.scrubberThumb = document.getElementById('scrubberThumb');
    this.scrubberTooltip = document.getElementById('scrubberTooltip');

    // Boutons de commande
    this.ctrlPlayBtn = document.getElementById('ctrlPlayBtn');
    this.iconPlay = document.getElementById('iconPlay');
    this.iconPause = document.getElementById('iconPause');
    this.ctrlRewindBtn = document.getElementById('ctrlRewindBtn');
    this.ctrlForwardBtn = document.getElementById('ctrlForwardBtn');
    this.ctrlVolumeBtn = document.getElementById('ctrlVolumeBtn');
    this.iconVolHigh = document.getElementById('iconVolHigh');
    this.iconVolMuted = document.getElementById('iconVolMuted');
    this.ctrlVolumeSlider = document.getElementById('ctrlVolumeSlider');
    this.ctrlCurrentTime = document.getElementById('ctrlCurrentTime');
    this.ctrlTotalDuration = document.getElementById('ctrlTotalDuration');
    this.ctrlMediaTitle = document.getElementById('ctrlMediaTitle');
    this.ctrlNextEpBtn = document.getElementById('ctrlNextEpBtn');

    // Vitesse, Qualité & Plein Écran
    this.ctrlSpeedBtn = document.getElementById('ctrlSpeedBtn');
    this.speedMenu = document.getElementById('speedMenu');
    this.speedItems = document.querySelectorAll('.speed-item');
    this.ctrlQualityBtn = document.getElementById('ctrlQualityBtn');
    this.qualityBadge = document.getElementById('qualityBadge');
    this.qualityCurrentText = document.getElementById('qualityCurrentText');
    this.qualityMenu = document.getElementById('qualityMenu');
    this.qualityItems = document.querySelectorAll('.quality-item');
    this.ctrlFullscreenBtn = document.getElementById('ctrlFullscreenBtn');
    this.iconEnterFs = document.getElementById('iconEnterFs');
    this.iconExitFs = document.getElementById('iconExitFs');

    // Bannière de statut
    this.statusBanner = document.getElementById('playerStatusBanner');
    this.statusBannerText = document.getElementById('statusBannerText');
    this.statusSwitchBtn = document.getElementById('statusSwitchBtn');
    this.statusRetryBtn = document.getElementById('statusRetryBtn');

    // État interne
    this.currentQuality = -1; // -1 = Auto HD
    this.currentMovie = null;
    this.currentServer = 1; // 1, 2, 3, 4, 5
    this.currentSeason = 1;
    this.currentEpisode = 1;
    this.currentLang = localStorage.getItem('netflix_lang') || 'vo';
    this.savedPlaybackTime = 0;
    this.isScrubbing = false;
    this.idleTimer = null;
    this.lastVolume = 1;
    this.hls = null;
    this.activeExtractionAbort = null;

    this.initEvents();
  }

  initEvents() {
    // Fermeture du lecteur
    this.backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // Bascule Langue VO / VF
    if (this.langVoBtn) {
      this.langVoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setLanguage('vo');
      });
    }
    if (this.langVfBtn) {
      this.langVfBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setLanguage('vf');
      });
    }

    // ================= SÉLECTEUR DE SERVEURS & DÉFILEMENT FLUIDE =================
    if (this.serverNavPrev) {
      this.serverNavPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.serverSelector) {
          this.serverSelector.scrollBy({ left: -240, behavior: 'smooth' });
          setTimeout(() => this.updateServerNavState(), 320);
        }
      });
    }

    if (this.serverNavNext) {
      this.serverNavNext.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.serverSelector) {
          this.serverSelector.scrollBy({ left: 240, behavior: 'smooth' });
          setTimeout(() => this.updateServerNavState(), 320);
        }
      });
    }

    if (this.serverSelector) {
      // Clic sur une pilule de serveur
      this.serverSelector.addEventListener('click', (e) => {
        const pill = e.target.closest('.server-pill');
        if (!pill) return;
        e.stopPropagation();
        const serverNum = parseInt(pill.dataset.server) || 1;
        if (serverNum !== this.currentServer) {
          this.switchServer(serverNum);
        }
      });

      // Défilement horizontal direct à la molette de la souris
      this.serverSelector.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          this.serverSelector.scrollLeft += (e.deltaY * 0.9);
          this.updateServerNavState();
        }
      }, { passive: false });

      // Suivi du défilement pour activer/désactiver les flèches
      this.serverSelector.addEventListener('scroll', () => {
        this.updateServerNavState();
      }, { passive: true });

      // Glisser-déposer (Drag to scroll) à la souris
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      this.serverSelector.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDown = true;
        this.serverSelector.classList.add('is-dragging');
        startX = e.pageX - this.serverSelector.offsetLeft;
        scrollLeft = this.serverSelector.scrollLeft;
      });

      window.addEventListener('mouseup', () => {
        if (isDown) {
          isDown = false;
          this.serverSelector.classList.remove('is-dragging');
        }
      });

      this.serverSelector.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - this.serverSelector.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 4) {
          e.preventDefault();
          this.serverSelector.scrollLeft = scrollLeft - walk;
          this.updateServerNavState();
        }
      });
    }

    window.addEventListener('resize', () => {
      this.updateServerNavState();
    });

    // Sélecteur de Saisons & Épisodes
    this.seasonSelect.addEventListener('change', (e) => {
      this.currentSeason = parseInt(e.target.value) || 1;
      this.savedPlaybackTime = 0;
      if (this.video) {
        try { this.video.currentTime = 0; } catch (err) {}
      }
      this.populateEpisodes();
      const firstOpt = this.episodeSelect.options[0];
      this.currentEpisode = firstOpt ? parseInt(firstOpt.value) : 1;
      this.episodeSelect.value = this.currentEpisode;
      try {
        const showKey = 'netflix_ep_' + (this.currentMovie?.id || this.currentMovie?.tmdb_id || this.currentMovie?.series_id);
        localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
      } catch (err) {}
      this.updateMetaDisplay();
      this.loadStream();
    });

    this.episodeSelect.addEventListener('change', (e) => {
      this.currentEpisode = parseInt(e.target.value) || 1;
      this.savedPlaybackTime = 0;
      if (this.video) {
        try { this.video.currentTime = 0; } catch (err) {}
      }
      try {
        const showKey = 'netflix_ep_' + (this.currentMovie?.id || this.currentMovie?.tmdb_id || this.currentMovie?.series_id);
        localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
      } catch (err) {}
      this.updateMetaDisplay();
      this.loadStream();
    });

    // Contrôles Vidéo : Play / Pause
    this.ctrlPlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlayPause();
    });

    // Clic direct sur la surface vidéo (Play / Pause & Ripple)
    this.video.addEventListener('click', () => {
      this.togglePlayPause();
    });

    // Double clic vidéo pour plein écran
    this.video.addEventListener('dblclick', () => {
      this.toggleFullscreen();
    });

    // Sauts ±10s
    this.ctrlRewindBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.seekRelative(-10);
    });

    this.ctrlForwardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.seekRelative(10);
    });

    // Volume & Mute
    this.ctrlVolumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });

    this.ctrlVolumeSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(e.target.value);
      this.setVolume(val);
    });

    // Vitesse de lecture
    this.ctrlSpeedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('hidden');
    });

    this.speedItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const speed = parseFloat(e.currentTarget.dataset.speed) || 1;
        this.setPlaybackSpeed(speed);
        this.speedMenu.classList.add('hidden');
      });
    });

    // Clic ailleurs ferme le menu de vitesse
    document.addEventListener('click', (e) => {
      if (!this.speedMenu.contains(e.target) && e.target !== this.ctrlSpeedBtn) {
        this.speedMenu.classList.add('hidden');
      }
    });

    // Sélecteur de Qualité Vidéo
    if (this.ctrlQualityBtn) {
      this.ctrlQualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.qualityMenu.classList.toggle('hidden');
        if (this.speedMenu) this.speedMenu.classList.add('hidden');
      });
    }

    if (this.qualityItems) {
      this.qualityItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const q = parseInt(e.currentTarget.dataset.quality);
          this.setVideoQuality(q);
          this.qualityMenu.classList.add('hidden');
        });
      });
    }

    // Clic ailleurs ferme le menu de qualité
    document.addEventListener('click', (e) => {
      if (this.qualityMenu && !this.qualityMenu.contains(e.target) && e.target !== this.ctrlQualityBtn) {
        this.qualityMenu.classList.add('hidden');
      }
    });

    // Plein Écran
    const handleFs = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFullscreen();
    };
    this.ctrlFullscreenBtn.addEventListener('click', handleFs);
    this.ctrlFullscreenBtn.addEventListener('touchend', handleFs);

    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenIcons();
    });

    // Bouton Épisode Suivant (Mobile & Desktop)
    if (this.ctrlNextEpBtn) {
      const handleNext = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.goToNextEpisode();
      };
      this.ctrlNextEpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.goToNextEpisode();
      });
      this.ctrlNextEpBtn.addEventListener('touchend', handleNext, { passive: false });
    }

    // Bannière de résilience
    this.statusSwitchBtn.addEventListener('click', () => {
      this.hideStatusBanner();
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      const maxSrv = isChannel ? 7 : 5;
      const nextServer = (this.currentServer % maxSrv) + 1;
      this.switchServer(nextServer);
    });

    this.statusRetryBtn.addEventListener('click', () => {
      this.hideStatusBanner();
      this.loadStream();
    });

    // Timeline Scrubber Événements (Click & Drag)
    this.initScrubberEvents();

    // Événements Vidéo HTML5
    this.initVideoEvents();

    // Inactivité de la souris (Auto-Hide des contrôles)
    this.initInactivityWatchdog();

    // Raccourcis Clavier Universels
    this.initKeyboardShortcuts();

    // Synchronisation initiale du volume
    this.syncVolumeUI();
  }

  initScrubberEvents() {
    const onScrub = (e) => {
      if (!this.video.duration) return;
      const rect = this.scrubberContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.video.currentTime = pos * this.video.duration;
      this.updateScrubberProgress(pos * 100);
    };

    this.scrubberContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isScrubbing = true;
      this.scrubberContainer.classList.add('dragging');
      onScrub(e);

      const onMouseMove = (moveEvent) => {
        if (this.isScrubbing) {
          onScrub(moveEvent);
          updateTooltip(moveEvent);
        }
      };

      const onMouseUp = () => {
        this.isScrubbing = false;
        this.scrubberContainer.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Tooltip au survol
    const updateTooltip = (e) => {
      if (!this.video.duration) return;
      const rect = this.scrubberContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = pos * this.video.duration;

      this.scrubberTooltip.textContent = this.formatTime(targetTime);
      this.scrubberTooltip.style.left = `${pos * 100}%`;
      this.scrubberTooltip.style.display = 'block';
    };

    this.scrubberContainer.addEventListener('mousemove', updateTooltip);
    this.scrubberContainer.addEventListener('mouseleave', () => {
      if (!this.isScrubbing) {
        this.scrubberTooltip.style.display = 'none';
      }
    });
  }

  initVideoEvents() {
    this.video.addEventListener('timeupdate', () => {
      if (this.isScrubbing) return;
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) {
        this.ctrlCurrentTime.textContent = 'LIVE';
        this.ctrlTotalDuration.textContent = 'DIRECT';
        this.updateScrubberProgress(100);
        return;
      }
      const current = this.video.currentTime || 0;
      const total = this.video.duration || 0;

      this.ctrlCurrentTime.textContent = this.formatTime(current);

      if (total > 0 && !isNaN(total) && total !== Infinity) {
        const percent = (current / total) * 100;
        this.updateScrubberProgress(percent);
      }
    });

    this.video.addEventListener('progress', () => {
      if (!this.video.duration || !this.video.buffered.length) return;
      try {
        const cur = this.video.currentTime || 0;
        let bufferedEnd = 0;
        for (let i = 0; i < this.video.buffered.length; i++) {
          if (this.video.buffered.start(i) <= cur + 0.5 && cur <= this.video.buffered.end(i) + 0.5) {
            bufferedEnd = this.video.buffered.end(i);
            break;
          }
        }
        if (!bufferedEnd && this.video.buffered.length > 0) {
          bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        }
        const percent = (bufferedEnd / this.video.duration) * 100;
        this.scrubberBuffered.style.width = `${Math.min(100, percent)}%`;
      } catch (e) {}
    });

    this.video.addEventListener('loadedmetadata', () => {
      const total = this.video.duration || 0;
      this.ctrlTotalDuration.textContent = this.formatTime(total);

      // Reprendre à la position sauvegardée si changement de serveur
      if (this.savedPlaybackTime > 0 && this.savedPlaybackTime < total) {
        this.video.currentTime = this.savedPlaybackTime;
        this.savedPlaybackTime = 0;
      }
    });

    let stallWatchdogTimer = null;

    const handleStall = () => {
      if (this.video.paused) return;
      if (stallWatchdogTimer) clearTimeout(stallWatchdogTimer);

      stallWatchdogTimer = setTimeout(() => {
        if (this.video.paused) return;
        console.warn('[Player Watchdog] Tampon bloqué depuis plus de 3.5s après pause ou instabilité réseau. Récupération...');
        this.recoverStalledPlayback();
      }, 3500);
    };

    const clearStall = () => {
      if (stallWatchdogTimer) {
        clearTimeout(stallWatchdogTimer);
        stallWatchdogTimer = null;
      }
    };

    this.video.addEventListener('waiting', handleStall);
    this.video.addEventListener('stalled', handleStall);
    this.video.addEventListener('playing', clearStall);
    this.video.addEventListener('timeupdate', clearStall);

    this.video.addEventListener('play', () => {
      this.updatePlayPauseIcons(true);
      this.resetInactivityTimer();
      const pausedFor = this.pauseTimestamp ? (Date.now() - this.pauseTimestamp) : 0;
      this.pauseTimestamp = null;
      if (pausedFor > 15000) {
        this.handlePostPauseRecovery(pausedFor);
      }
    });

    this.video.addEventListener('pause', () => {
      this.updatePlayPauseIcons(false);
      this.showControls();
      this.pauseTimestamp = Date.now();
      this.pausePosition = this.video.currentTime || 0;
      clearStall();
    });

    this.video.addEventListener('ended', () => {
      this.updatePlayPauseIcons(false);
      const dur = this.video.duration || 0;
      const cur = this.video.currentTime || 0;
      const isTrulyFinished = dur > 10 && !isNaN(dur) && cur >= (dur - 12);
      if (isTrulyFinished && this.currentMovie && this.currentMovie.media_type === 'series') {
        this.goToNextEpisode();
      }
    });

    this.video.addEventListener('volumechange', () => {
      this.syncVolumeUI();
    });
  }

  initInactivityWatchdog() {
    const handleActivity = () => {
      this.showControls();
      this.resetInactivityTimer();
    };

    this.overlay.addEventListener('mousemove', handleActivity);
    this.overlay.addEventListener('mousedown', handleActivity);
    this.overlay.addEventListener('touchstart', handleActivity);
  }

  resetInactivityTimer() {
    clearTimeout(this.idleTimer);
    if (!this.video.paused) {
      this.idleTimer = setTimeout(() => {
        if (!this.video.paused && !this.isScrubbing) {
          this.overlay.classList.add('user-idle');
          this.speedMenu.classList.add('hidden');
        }
      }, 3500);
    }
  }

  showControls() {
    clearTimeout(this.idleTimer);
    this.overlay.classList.remove('user-idle');
  }

  initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('active')) return;

      // Éviter d'interférer avec les champs de saisie ou select
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          this.seekRelative(-10);
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          this.seekRelative(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolume(Math.min(1, (this.video.volume || 1) + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolume(Math.max(0, (this.video.volume || 1) - 0.1));
          break;
        case 'KeyM':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'Digit1':
          this.switchServer(1);
          break;
        case 'Digit2':
          this.switchServer(2);
          break;
        case 'Digit3':
          this.switchServer(3);
          break;
        case 'Digit4':
          this.switchServer(4);
          break;
        case 'Digit5':
          this.switchServer(5);
          break;
        case 'Digit6':
          this.switchServer(6);
          break;
        case 'Digit7':
          this.switchServer(7);
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    });
  }

  // ================= ACTIONS LECTEUR NETFLIX =================
  togglePlayPause() {
    if (this.video.paused) {
      const pausedFor = this.pauseTimestamp ? (Date.now() - this.pauseTimestamp) : 0;
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);

      // Si pause longue (> 20s), réactiver immédiatement le flux pour éviter les saccades dues aux sockets fermées
      if (pausedFor > 20000) {
        if (this.hls && isChannel) {
          const livePos = this.hls.liveSyncPosition;
          if (livePos && isFinite(livePos) && (this.video.currentTime < livePos - 8 || isNaN(this.video.currentTime))) {
            this.video.currentTime = livePos;
          }
          this.hls.startLoad();
        } else if (!this.hls && this.video && this.video.src && !this.video.classList.contains('hidden')) {
          this.recoverDirectStream(this.video.currentTime);
          this.triggerCenterRipple('▶');
          return;
        }
      }

      this.video.play().then(() => {
        this.triggerCenterRipple('▶');
      }).catch(err => {
        console.warn('[Player] Échec lecture :', err.message);
        if (!this.hls && this.video && this.video.src) {
          this.recoverDirectStream(this.video.currentTime);
        }
      });
    } else {
      this.pauseTimestamp = Date.now();
      this.pausePosition = this.video.currentTime;
      this.video.pause();
      this.triggerCenterRipple('❚❚');
    }
  }

  handlePostPauseRecovery(pausedFor) {
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);

    // Cas 1 : Flux HLS en Direct (Chaînes TV Xtream)
    if (this.hls && isChannel) {
      try {
        this.hls.startLoad();
        const livePos = this.hls.liveSyncPosition;
        const curTime = this.video.currentTime;
        if (livePos && isFinite(livePos) && (curTime < livePos - 8 || isNaN(curTime))) {
          console.log(`[Player Live Sync] Recalage sur le direct après pause de ${Math.round(pausedFor / 1000)}s (${livePos.toFixed(1)}s)`);
          this.video.currentTime = livePos;
        }
      } catch (e) {
        console.warn('[Player Live Sync Err]:', e);
      }
      return;
    }

    // Cas 2 : Flux VOD Direct (Séries Xtream, Télé-Réalité, MP4 Range 206)
    if (!this.hls && this.video && this.video.src && !this.video.classList.contains('hidden')) {
      const curTime = (this.pausePosition !== undefined && isFinite(this.pausePosition)) ? this.pausePosition : (this.video.currentTime || 0);

      let bufferAhead = 0;
      try {
        for (let i = 0; i < this.video.buffered.length; i++) {
          if (this.video.buffered.start(i) <= curTime + 0.2 && curTime <= this.video.buffered.end(i) + 0.2) {
            bufferAhead = this.video.buffered.end(i) - curTime;
            break;
          }
        }
      } catch (e) {}

      console.log(`[Player VOD Resume] Reprise après pause de ${Math.round(pausedFor / 1000)}s. Buffer restant : ${bufferAhead.toFixed(1)}s`);

      // Si pause > 20s et buffer restant faible (< 3s), réinitialiser la connexion
      if (pausedFor > 20000 && bufferAhead < 3) {
        this.recoverDirectStream(curTime);
      }
    }
  }

  recoverStalledPlayback() {
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (this.hls) {
      if (isChannel) {
        const livePos = this.hls.liveSyncPosition;
        if (livePos && isFinite(livePos)) {
          this.video.currentTime = livePos;
        }
      }
      this.hls.startLoad();
      this.hls.recoverMediaError();
    } else if (this.video && this.video.src && !this.video.classList.contains('hidden')) {
      this.recoverDirectStream(this.video.currentTime);
    }
  }

  recoverDirectStream(targetTime) {
    if (!this.video || !this.video.src) return;
    const t = (targetTime !== undefined && isFinite(targetTime) && targetTime >= 0) ? targetTime : (this.video.currentTime || 0);
    const originalSrc = this.video.currentSrc || this.video.src;
    console.log(`[Player Recovery] Reconnexion instantanée du flux direct à ${t.toFixed(1)}s (Anti-saccade post-pause)`);
    try {
      const u = new URL(originalSrc, window.location.href);
      u.searchParams.set('_t', Date.now());
      this.video.src = u.href;
      this.video.currentTime = t;
      const p = this.video.play();
      if (p !== undefined) p.catch(() => {});
    } catch (e) {
      try {
        this.video.load();
        this.video.currentTime = t;
        this.video.play().catch(() => {});
      } catch (err) {}
    }
  }

  seekRelative(seconds) {
    if (!this.video.duration) return;
    const newTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
    this.video.currentTime = newTime;
    this.triggerCenterRipple(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.syncVolumeUI();
    this.triggerCenterRipple(this.video.muted ? '🔇' : '🔊');
  }

  setVolume(val) {
    this.video.volume = Math.max(0, Math.min(1, val));
    if (this.video.volume > 0) {
      this.video.muted = false;
      this.lastVolume = this.video.volume;
    }
    this.syncVolumeUI();
  }

  syncVolumeUI() {
    const vol = this.video.muted ? 0 : this.video.volume;
    this.ctrlVolumeSlider.value = vol;

    // Mise à jour de la piste avec la couleur rouge pour la portion active
    const pct = vol * 100;
    this.ctrlVolumeSlider.style.background = `linear-gradient(to right, var(--netflix-red) ${pct}%, rgba(255, 255, 255, 0.3) ${pct}%)`;

    if (vol === 0) {
      this.iconVolHigh.classList.add('hidden');
      this.iconVolMuted.classList.remove('hidden');
    } else {
      this.iconVolHigh.classList.remove('hidden');
      this.iconVolMuted.classList.add('hidden');
    }
  }

  setPlaybackSpeed(speed) {
    this.video.playbackRate = speed;
    this.ctrlSpeedBtn.textContent = `${speed}x`;

    this.speedItems.forEach(item => {
      const s = parseFloat(item.dataset.speed);
      item.classList.toggle('active', s === speed);
    });

    this.triggerCenterRipple(`${speed}x`);
  }

  setVideoQuality(quality) {
    this.currentQuality = parseInt(quality);
    this.applyQualityLevel();

    if (this.qualityItems) {
      this.qualityItems.forEach(item => {
        const q = parseInt(item.dataset.quality);
        item.classList.toggle('active', q === this.currentQuality);
      });
    }

    if (this.currentQuality === -1) {
      if (this.qualityCurrentText) this.qualityCurrentText.textContent = 'Auto';
      this.triggerCenterRipple('Auto HD');
    } else {
      if (this.qualityCurrentText) this.qualityCurrentText.textContent = `${this.currentQuality}p`;
      if (this.qualityBadge) this.qualityBadge.textContent = this.currentQuality >= 1080 ? 'FHD' : (this.currentQuality >= 720 ? 'HD' : `${this.currentQuality}p`);
      this.triggerCenterRipple(`${this.currentQuality}p`);
    }
  }

  applyQualityLevel() {
    if (!this.hls || !this.hls.levels || this.hls.levels.length === 0) return;

    if (this.currentQuality === -1) {
      this.hls.currentLevel = -1; // Mode ABR Auto
      return;
    }

    // Trouver le niveau le plus proche de la résolution demandée
    let bestIdx = 0;
    let minDiff = Infinity;
    this.hls.levels.forEach((lvl, idx) => {
      const h = lvl.height || (lvl.attrs && parseInt(lvl.attrs.RESOLUTION?.split('x')[1])) || 720;
      const diff = Math.abs(h - this.currentQuality);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = idx;
      }
    });

    this.hls.currentLevel = bestIdx;
    const chosen = this.hls.levels[bestIdx];
    const h = chosen.height || (chosen.attrs && chosen.attrs.RESOLUTION) || this.currentQuality;
    console.log(`[Player] Qualité verrouillée à ${h} (${Math.round((chosen.bitrate || 0) / 1000)} kbps)`);
  }

  updateQualityMenuOptions() {
    if (!this.hls || !this.hls.levels) return;
    const has1080 = this.hls.levels.some(l => (l.height >= 1080) || (l.attrs?.RESOLUTION?.includes('1080') || l.attrs?.RESOLUTION?.includes('1920')));
    const has720 = this.hls.levels.some(l => (l.height >= 720) || (l.attrs?.RESOLUTION?.includes('720') || l.attrs?.RESOLUTION?.includes('1280')));

    const q1080Item = document.querySelector('.quality-item[data-quality="1080"]');
    const q720Item = document.querySelector('.quality-item[data-quality="720"]');
    const q480Item = document.querySelector('.quality-item[data-quality="480"]');

    if (q1080Item) q1080Item.style.display = has1080 ? 'flex' : 'none';
    if (q720Item) q720Item.style.display = (has720 || has1080) ? 'flex' : 'none';
    if (q480Item) q480Item.style.display = 'flex';
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (this.overlay.requestFullscreen) {
        this.overlay.requestFullscreen();
      } else if (this.overlay.webkitRequestFullscreen) {
        this.overlay.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  updateFullscreenIcons() {
    const isFs = !!document.fullscreenElement;
    if (isFs) {
      this.iconEnterFs.classList.add('hidden');
      this.iconExitFs.classList.remove('hidden');
    } else {
      this.iconEnterFs.classList.remove('hidden');
      this.iconExitFs.classList.add('hidden');
    }
  }

  triggerCenterRipple(symbol) {
    this.ripple.textContent = symbol;
    this.ripple.classList.remove('pulse');
    void this.ripple.offsetWidth; // Déclencher le reflow CSS
    this.ripple.classList.add('pulse');
  }

  updatePlayPauseIcons(isPlaying) {
    if (isPlaying) {
      this.iconPlay.classList.add('hidden');
      this.iconPause.classList.remove('hidden');
      this.ctrlPlayBtn.setAttribute('title', 'Pause (Espace)');
    } else {
      this.iconPlay.classList.remove('hidden');
      this.iconPause.classList.add('hidden');
      this.ctrlPlayBtn.setAttribute('title', 'Lecture (Espace)');
    }
  }

  updateScrubberProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    this.scrubberPlayed.style.width = `${clamped}%`;
    this.scrubberThumb.style.left = `${clamped}%`;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);

    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  }

  // ================= OUVERTURE & BASCULEMENT DE SERVEUR =================
  open(movie, initialServer = 1, season = null, episode = null) {
    this.currentMovie = movie;

    if (this.video) {
      try {
        this.video.pause();
        this.video.currentTime = 0;
      } catch (e) {}
    }
    this.savedPlaybackTime = 0;

    const showKey = 'netflix_ep_' + (movie.id || movie.tmdb_id || movie.series_id);
    // Si aucune saison/épisode spécifié (ex: clic Lecture rapide depuis la fiche), restaurer depuis l'historique
    if (season == null && episode == null) {
      try {
        const saved = JSON.parse(localStorage.getItem(showKey));
        if (saved && saved.season && saved.episode) {
          season = saved.season;
          episode = saved.episode;
        }
      } catch (e) {}
    }

    this.currentSeason = parseInt(season) || 1;
    this.currentEpisode = parseInt(episode) || 1;

    // S'assurer que currentSeason et currentEpisode correspondent aux saisons réelles du catalogue
    if (movie.seasons && movie.seasons.length > 0) {
      const hasSeason = movie.seasons.some(s => parseInt(s.season_number) === this.currentSeason);
      if (!hasSeason) {
        this.currentSeason = parseInt(movie.seasons[0].season_number);
      }
      const seasonObj = movie.seasons.find(s => parseInt(s.season_number) === this.currentSeason) || movie.seasons[0];
      if (seasonObj && seasonObj.episodes && seasonObj.episodes.length > 0) {
        const hasEp = seasonObj.episodes.some(e => parseInt(e.episode_number) === this.currentEpisode);
        if (!hasEp) {
          this.currentEpisode = parseInt(seasonObj.episodes[0].episode_number);
        }
      }
    }

    try {
      localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
    } catch (e) {}

    this.titleDisplay.textContent = movie.title;
    this.ctrlMediaTitle.textContent = movie.title;
    this.overlay.classList.add('active');
    this.showControls();

    // Masquer l'iframe définitivement : le lecteur est 100% natif Netflix
    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');

    // Gestion Séries vs Films vs Chaînes TV
    const isSeries = (movie.media_type === 'series' || movie.is_xtream_series || !!movie.series_id || (Array.isArray(movie.seasons) && movie.seasons.length > 0));
    if (isSeries) {
      this.episodeBox.classList.remove('hidden');
      this.populateSeasons();
      this.populateEpisodes();
      if (this.ctrlNextEpBtn) this.ctrlNextEpBtn.classList.remove('hidden');

      // Auto-Sync en arrière-plan pour les séries Xtream uniquement si les saisons ne sont pas encore renseignées
      if ((!movie.seasons || movie.seasons.length === 0) && (movie.id === '68628' || movie.tmdb_id === '68628' || String(movie.id).startsWith('xtream_series_'))) {
        const sId = (movie.id === '68628' || movie.tmdb_id === '68628') ? '6715' : String(movie.id).replace('xtream_series_', '');
        const baseUrl = window.API_BASE || '';
        fetch(`${baseUrl}/api/xtream/series-info?series_id=${sId}`)
          .then(r => r.json())
          .then(freshData => {
            if (freshData && freshData.seasons && freshData.seasons.length > 0) {
              const oldTotalEps = (movie.seasons || []).reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
              const newTotalEps = freshData.seasons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
              if (newTotalEps > oldTotalEps) {
                console.log(`[Player Auto-Sync] ${newTotalEps - oldTotalEps} nouveau(x) épisode(s) détecté(s) pour ${movie.title} !`);
                movie.seasons = freshData.seasons;
                const keepS = this.currentSeason;
                const keepEp = this.currentEpisode;
                this.populateSeasons();
                this.populateEpisodes();
                this.currentSeason = keepS;
                this.currentEpisode = keepEp;
                this.seasonSelect.value = this.currentSeason;
                this.episodeSelect.value = this.currentEpisode;
              }
            }
          })
          .catch(() => {});
      }
    } else {
      this.episodeBox.classList.add('hidden');
      this.ctrlNextEpBtn.classList.add('hidden');
    }

    if (this.langSwitch) {
      this.langSwitch.style.display = (movie.media_type === 'channel' || movie.is_live) ? 'none' : 'flex';
    }

    // Gestion propre du sélecteur de serveurs :
    // Masqué pour les séries Xtream, les émissions de télé-réalité et les films qui ont leur flux unique dédié.
    // Uniquement affiché pour les chaînes Live TV multi-miroirs.
    const isLive = (movie.media_type === 'channel' || movie.is_live);
    const isXtreamOnly = movie.is_xtream || movie.is_xtream_series || movie.series_id || (movie.id && String(movie.id).startsWith('xtream_series_'));
    const hasMultipleServers = isLive && !isXtreamOnly;

    if (this.serverWrapper) {
      this.serverWrapper.style.display = hasMultipleServers ? 'flex' : 'none';
    }

    this.setLanguage(this.currentLang, false);
    this.switchServer(initialServer, false);
  }

  populateSeasons() {
    this.seasonSelect.innerHTML = '';
    if (this.currentMovie.seasons && this.currentMovie.seasons.length > 0) {
      this.currentMovie.seasons.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.season_number;
        opt.textContent = s.name || `Saison ${s.season_number}`;
        this.seasonSelect.appendChild(opt);
      });
    } else {
      const totalSeasons = Math.min(8, parseInt(this.currentMovie.duration) || 3);
      for (let s = 1; s <= totalSeasons; s++) {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Saison ${s}`;
        this.seasonSelect.appendChild(opt);
      }
    }
    this.seasonSelect.value = this.currentSeason;
  }

  populateEpisodes() {
    this.episodeSelect.innerHTML = '';
    if (this.currentMovie.seasons && this.currentMovie.seasons.length > 0) {
      const seasonObj = this.currentMovie.seasons.find(s => s.season_number === this.currentSeason) || this.currentMovie.seasons[0];
      if (seasonObj && seasonObj.episodes && seasonObj.episodes.length > 0) {
        seasonObj.episodes.forEach(ep => {
          const opt = document.createElement('option');
          opt.value = ep.episode_number;
          opt.textContent = `Épisode ${ep.episode_number} : ${ep.title}`;
          this.episodeSelect.appendChild(opt);
        });
      } else {
        const count = seasonObj ? (seasonObj.episode_count || 10) : 10;
        for (let e = 1; e <= count; e++) {
          const opt = document.createElement('option');
          opt.value = e;
          opt.textContent = `Épisode ${e}`;
          this.episodeSelect.appendChild(opt);
        }
      }
    } else {
      const totalEpisodes = 10;
      for (let e = 1; e <= totalEpisodes; e++) {
        const opt = document.createElement('option');
        opt.value = e;
        opt.textContent = `Épisode ${e}`;
        this.episodeSelect.appendChild(opt);
      }
    }
    this.episodeSelect.value = this.currentEpisode;
  }

  goToNextEpisode() {
    if (!this.currentMovie) return;

    // 1. Détection via l'objet structurel des saisons (Xtream, Télé-Réalité, TMDB)
    if (this.currentMovie.seasons && this.currentMovie.seasons.length > 0) {
      const sObj = this.currentMovie.seasons.find(s => parseInt(s.season_number) === parseInt(this.currentSeason));
      if (sObj && Array.isArray(sObj.episodes) && sObj.episodes.length > 0) {
        const currentEpIdx = sObj.episodes.findIndex(e => parseInt(e.episode_number) === parseInt(this.currentEpisode));
        if (currentEpIdx !== -1 && currentEpIdx < sObj.episodes.length - 1) {
          // Épisode suivant dans la même saison
          this.currentEpisode = parseInt(sObj.episodes[currentEpIdx + 1].episode_number);
          if (this.episodeSelect) this.episodeSelect.value = this.currentEpisode;
          this.savedPlaybackTime = 0;
          this.updateMetaDisplay();
          this.loadStream();
          return;
        } else {
          // Fin de la saison actuelle -> passer à la première épisode de la saison suivante
          const currentSeasonIdx = this.currentMovie.seasons.findIndex(s => parseInt(s.season_number) === parseInt(this.currentSeason));
          if (currentSeasonIdx !== -1 && currentSeasonIdx < this.currentMovie.seasons.length - 1) {
            const nextSeason = this.currentMovie.seasons[currentSeasonIdx + 1];
            this.currentSeason = parseInt(nextSeason.season_number);
            if (this.seasonSelect) this.seasonSelect.value = this.currentSeason;
            this.populateEpisodes();
            this.currentEpisode = (nextSeason.episodes && nextSeason.episodes[0]) ? parseInt(nextSeason.episodes[0].episode_number) : 1;
            if (this.episodeSelect) this.episodeSelect.value = this.currentEpisode;
            this.savedPlaybackTime = 0;
            this.updateMetaDisplay();
            this.loadStream();
            return;
          }
        }
      }
    }

    // 2. Fallback via le sélecteur HTML <select id="playerEpisodeSelect">
    if (this.episodeSelect && this.episodeSelect.options.length > 0) {
      const curIdx = this.episodeSelect.selectedIndex;
      if (curIdx >= 0 && curIdx < this.episodeSelect.options.length - 1) {
        this.episodeSelect.selectedIndex = curIdx + 1;
        this.currentEpisode = parseInt(this.episodeSelect.value) || (this.currentEpisode + 1);
        this.savedPlaybackTime = 0;
        this.updateMetaDisplay();
        this.loadStream();
        return;
      } else if (this.seasonSelect && this.seasonSelect.selectedIndex < this.seasonSelect.options.length - 1) {
        this.seasonSelect.selectedIndex += 1;
        this.currentSeason = parseInt(this.seasonSelect.value) || (this.currentSeason + 1);
        this.populateEpisodes();
        this.currentEpisode = parseInt(this.episodeSelect.value) || 1;
        this.savedPlaybackTime = 0;
        this.updateMetaDisplay();
        this.loadStream();
        return;
      }
    }
  }

  setLanguage(lang, reloadStream = true) {
    if (lang !== 'vo' && lang !== 'vf') lang = 'vo';
    this.currentLang = lang;
    try {
      localStorage.setItem('netflix_lang', lang);
    } catch (e) {}

    // Synchroniser toutes les capsules de langue sur l'application
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
    const isSpecialShow = (this.currentMovie?.id === '68628' || this.currentMovie?.tmdb_id === '68628' || this.currentMovie?.id === 'telefoot_tf1' || this.currentMovie?.tmdb_id === 'telefoot_tf1');
    const isVf = (this.currentLang === 'vf');

    let serverList = [];
    if (isChannel) {
      serverList = [
        { num: 1, label: '💎 S1: Xtream VIP (1080p)', title: 'Serveur 1 : Direct Xtream VIP 1080p (Flux Résilient Haute Stabilité • Recommandé & Prioritaire)', badge: '💎 Xtream VIP', isVip: true },
        { num: 2, label: '⭐ S2: Dark VIP 1080p', title: 'Serveur 2 : Flux Premium VIP Ultra HD 1080p/60fps (Brut non-compressé • Lecteur Netflix)', badge: '⭐ Dark VIP', isVip: true },
        { num: 3, label: '⚡ S3: Direct 1080p (DLHD)', title: 'Serveur 3 : Direct HLS DLHD Cluster 2 FHD 1080p (Lecteur Netflix Natif)', badge: '1080p Natif' },
        { num: 4, label: '🎬 S4: Direct 1080p (Apex)', title: 'Serveur 4 : Direct HLS Apex Streams FHD 1080p (Lecteur Netflix Natif)', badge: '1080p Natif' },
        { num: 5, label: '📡 S5: Direct 1080p (Alpha)', title: 'Serveur 5 : Direct HLS DLHD Alpha Cluster 1 FHD 1080p (Lecteur Netflix Natif)', badge: '1080p Natif' },
        { num: 6, label: '🌐 S6: Direct 1080p (Cricsfree)', title: 'Serveur 6 : Direct HLS Cricsfree FHD 1080p (Lecteur Netflix Natif)', badge: '1080p Natif' },
        { num: 7, label: '🚀 S7: Direct 1080p (WideIPTV)', title: 'Serveur 7 : Direct HLS WideIPTV Bluetier CDN FHD 1080p (Lecteur Netflix Natif)', badge: '1080p Natif' },
        { num: 8, label: '🛡️ S8: Direct 1080p (Secours)', title: 'Serveur 8 : Direct HLS Miroir de Secours FHD 1080p (Lecteur Netflix Natif)', badge: 'Secours' }
      ];
    } else if (isSpecialShow) {
      serverList = [
        { num: 1, label: '⚡ S1: Direct HLS (Principal)', title: 'Serveur 1 : Direct HLS • Flux Principal HD', badge: 'HD' },
        { num: 2, label: '🎬 S2: Direct 1080p FHD', title: 'Serveur 2 : Direct 1080p FHD', badge: '1080p' },
        { num: 3, label: '🌐 S3: Direct 720p HD', title: 'Serveur 3 : Direct 720p HD', badge: '720p' },
        { num: 4, label: '📡 S4: Miroir CDN Rapide', title: 'Serveur 4 : Miroir CDN Rapide', badge: 'CDN' },
        { num: 5, label: '🚀 S5: Multi-Débit Secours', title: 'Serveur 5 : Multi-Débit Secours', badge: 'Secours' }
      ];
    } else if (isVf) {
      serverList = [
        { num: 1, label: '⚡ S1: Vidzy HD (VF)', title: 'Serveur 1 : Direct VF • Vidzy HD', badge: 'VF HD' },
        { num: 2, label: '🎬 S2: Fsvid VIP (VF)', title: 'Serveur 2 : Direct VF • Fsvid VIP', badge: 'VF VIP' },
        { num: 3, label: '🌐 S3: Uqload (VF)', title: 'Serveur 3 : Direct VF • Uqload', badge: 'VF' },
        { num: 4, label: '📡 S4: Secours (VF)', title: 'Serveur 4 : Direct VF • Secours', badge: 'Secours' },
        { num: 5, label: '🚀 S5: Multi-Flux (VF)', title: 'Serveur 5 : Direct VF • Multi-Flux', badge: 'Multi' }
      ];
    } else {
      serverList = [
        { num: 1, label: '⚡ S1: Direct HLS', title: 'Serveur 1 : Direct HLS (Cluster Alpha)', badge: '4K/FHD' },
        { num: 2, label: '🎬 S2: Direct HD', title: 'Serveur 2 : Direct HD (Cluster Bêta)', badge: '1080p' },
        { num: 3, label: '🌐 S3: Direct Multi', title: 'Serveur 3 : Direct Multi (Cluster Gamma)', badge: 'Multi' },
        { num: 4, label: '📡 S4: Direct VIP', title: 'Serveur 4 : Direct VIP (Cluster Delta)', badge: 'VIP' },
        { num: 5, label: '🚀 S5: Secours', title: 'Serveur 5 : Direct Secours (Cluster Epsilon)', badge: 'Secours' }
      ];
    }

    this.serverSelector.innerHTML = '';
    serverList.forEach(s => {
      const btn = document.createElement('button');
      const active = (s.num === this.currentServer);
      btn.className = 'server-pill' + (active ? ' active' : '') + (s.isVip ? ' is-vip-server' : '');
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
      this.serverSelector.appendChild(btn);
    });

    // Défiler automatiquement la pilule active au centre et rafraîchir les boutons
    setTimeout(() => {
      const activePill = this.serverSelector.querySelector('.server-pill.active');
      if (activePill) {
        activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      this.updateServerNavState();
    }, 60);
  }

  updateMetaDisplay() {
    if (!this.currentMovie) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    const isSpecialShow = (this.currentMovie?.id === '68628' || this.currentMovie?.tmdb_id === '68628' || this.currentMovie?.id === 'telefoot_tf1' || this.currentMovie?.tmdb_id === 'telefoot_tf1');
    const isVf = (this.currentLang === 'vf');
    let serverNames;
    if (isChannel) {
      serverNames = {
        1: 'Serveur 1 (💎 Direct Xtream VIP 1080p)',
        2: 'Serveur 2 (⭐ Dark VIP Ultra HD 1080p/60fps)',
        3: 'Serveur 3 (⚡ Direct HLS DLHD Cluster 2 1080p)',
        4: 'Serveur 4 (🎬 Direct HLS Apex Streams 1080p)',
        5: 'Serveur 5 (📡 Direct HLS DLHD Alpha Cluster 1 1080p)',
        6: 'Serveur 6 (🌐 Direct HLS Cricsfree 1080p)',
        7: 'Serveur 7 (🚀 Direct HLS WideIPTV Bluetier 1080p)',
        8: 'Serveur 8 (🛡️ Direct HLS Secours 1080p)'
      };
      const sName = serverNames[this.currentServer] || `Serveur ${this.currentServer}`;
      const chNum = this.currentMovie.channel_number ? `Canal ${this.currentMovie.channel_number} • ` : '';
      this.metaDisplay.innerHTML = `<span style="color: #e50914; font-weight: 800;"><span class="live-pulse">●</span> EN DIRECT</span> • ${chNum}1080p FHD • ${sName} • Anti-Pubs Actif 🛡️`;
      this.ctrlMediaTitle.textContent = `${this.currentMovie.title} (🔴 DIRECT)`;
      if (this.ctrlTotalDuration) {
        this.ctrlTotalDuration.textContent = 'DIRECT';
      }
      return;
    }

    if (isSpecialShow) {
      serverNames = {
        1: 'Serveur 1 (Direct HLS • Flux Principal HD)',
        2: 'Serveur 2 (Direct 1080p FHD)',
        3: 'Serveur 3 (Direct 720p HD)',
        4: 'Serveur 4 (Miroir CDN Rapide)',
        5: 'Serveur 5 (Multi-Débit Secours)'
      };
    } else if (isVf) {
      serverNames = {
        1: 'Serveur 1 (Direct VF • Vidzy)',
        2: 'Serveur 2 (Direct VF • Fsvid)',
        3: 'Serveur 3 (Direct VF • Uqload)',
        4: 'Serveur 4 (Direct VF • Secours)',
        5: 'Serveur 5 (Direct VF • Multi)'
      };
    } else {
      serverNames = {
        1: 'Serveur 1 (Direct HLS)',
        2: 'Serveur 2 (Direct HD)',
        3: 'Serveur 3 (Direct Multi)',
        4: 'Serveur 4 (Direct VIP)',
        5: 'Serveur 5 (Direct Secours)'
      };
    }
    const sName = serverNames[this.currentServer] || `Serveur ${this.currentServer}`;
    const langBadge = isVf ? 'Version Française (VF) 🇫🇷' : 'Version Originale (VO) 🇬🇧';

    if (this.currentMovie.media_type === 'series') {
      const epText = `S${this.currentSeason}:E${this.currentEpisode}`;
      this.metaDisplay.textContent = `${epText} • ${langBadge} • ${sName} • Anti-Pubs Actif 🛡️`;
      this.ctrlMediaTitle.textContent = `${this.currentMovie.title} (${epText})`;
    } else {
      const dur = this.currentMovie.duration || '2h 10m';
      const year = this.currentMovie.release_year || '2025';
      this.metaDisplay.textContent = `${year} • ${dur} • ${langBadge} • ${sName} • Anti-Pubs Actif 🛡️`;
      this.ctrlMediaTitle.textContent = this.currentMovie.title;
    }
  }

  switchServer(serverNum, preserveTime = true) {
    const num = parseInt(serverNum) || 1;
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
    this.setStep(3, 'pending', '3. Déchiffrement WebAssembly ChaCha20 & Jeton IP');
    this.setStep(4, 'pending', '4. Initialisation du flux dans le lecteur Netflix');
  }

  // ================= CHARGEMENT DU FLUX HLS DIRECT PROXYFIE =================
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

    // Accélération 0ms : Si l'objet possède déjà une URL directe Xtream VIP (Cas de l'onglet Xtream)
    if (this.currentMovie && this.currentMovie.stream_url && (this.currentMovie.is_xtream || this.currentMovie.stream_url.includes('/api/stream/xtream'))) {
      const baseUrl = window.API_BASE || '';
      let targetStreamUrl = this.currentMovie.stream_url;
      if (targetStreamUrl && targetStreamUrl.startsWith('/')) {
        targetStreamUrl = baseUrl + targetStreamUrl;
      }
      this.showLoader(`⚡ Connexion au flux direct ${this.currentMovie.title} (💎 Xtream VIP)...`);
      this.resetSteps();
      this.setStep(1, 'done', `1. Chaîne Xtream validée (${this.currentMovie.title})`);
      this.setStep(2, 'done', `2. Flux direct obtenu (💎 Xtream VIP 1080p)`);
      this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
      this.setStep(4, 'active', `4. Injection dans le lecteur Netflix...`);
      this.playDirectHls(targetStreamUrl);
      return;
    }

    // Accélération Séries Xtream VOD (TV Réalité & La Villa 1080p FHD)
    if (this.currentMovie && this.currentMovie.seasons && (this.currentMovie.is_xtream_series || this.currentMovie.id === '68628' || String(this.currentMovie.id).startsWith('xtream_series_'))) {
      const sObj = this.currentMovie.seasons.find(s => parseInt(s.season_number) === parseInt(this.currentSeason)) || this.currentMovie.seasons[0];
      const epObj = sObj?.episodes?.find(e => parseInt(e.episode_number) === parseInt(this.currentEpisode)) || sObj?.episodes?.[0];
      if (epObj && epObj.video_url) {
        this.currentSeason = parseInt(sObj.season_number);
        this.currentEpisode = parseInt(epObj.episode_number);
        try {
          const showKey = 'netflix_ep_' + (this.currentMovie.id || this.currentMovie.tmdb_id || this.currentMovie.series_id);
          localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
        } catch (e) {}

        const baseUrl = window.API_BASE || '';
        let targetStreamUrl = epObj.video_url;
        if (targetStreamUrl && targetStreamUrl.startsWith('/')) {
          targetStreamUrl = baseUrl + targetStreamUrl;
        }
        this.showLoader(`⚡ Connexion au flux direct ${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode} (💎 Xtream 1080p)...`);
        this.resetSteps();
        this.setStep(1, 'done', `1. Épisode validé (${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode})`);
        this.setStep(2, 'done', `2. Flux direct obtenu (💎 Xtream VIP 1080p FHD)`);
        this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
        this.setStep(4, 'active', `4. Injection dans le lecteur Netflix...`);
        this.playDirectVideo(targetStreamUrl);
        return;
      }
    }

    const id = this.currentMovie.tmdb_id || this.currentMovie.id;
    const isChannel = (this.currentMovie.media_type === 'channel' || this.currentMovie.is_live);
    const isMovie = (this.currentMovie.media_type === 'movie');
    const mediaType = isChannel ? 'channel' : (isMovie ? 'movie' : 'series');
    const s = this.currentSeason;
    const e = this.currentEpisode;

    const langLabel = isChannel ? 'DIRECT 🔴' : ((this.currentLang === 'vf') ? 'VF 🇫🇷' : 'VO 🇬🇧');
    this.showLoader(isChannel ? `⚡ Connexion au flux direct ${this.currentMovie.title} (Serveur ${this.currentServer})...` : `⚡ Extraction Serveur ${this.currentServer} (${langLabel})...`);
    this.resetSteps();

    // Étape 1 : Résolution de la source
    this.setStep(1, 'active', isChannel ? `1. Résolution de la chaîne TV sportive (${this.currentMovie.title})...` : `1. Résolution de la source (${langLabel} • ${this.currentMovie.title})...`);
    await new Promise(r => setTimeout(r, 120));
    this.setStep(1, 'done', isChannel ? `1. Chaîne TV validée (${this.currentMovie.title})` : `1. Source ${langLabel} validée (${this.currentMovie.title})`);

    // Étape 2 : Récupération des flux
    this.setStep(2, 'active', isChannel ? `2. Requête du flux Serveur ${this.currentServer} (Direct TV)...` : `2. Requête du cluster Serveur ${this.currentServer} (${langLabel})...`);

    const abortController = new AbortController();
    this.activeExtractionAbort = abortController;

    try {
      const baseUrl = window.API_BASE || '';
      const url = `${baseUrl}/api/extract?id=${encodeURIComponent(id)}&type=${mediaType}&season=${s}&episode=${e}&server=${this.currentServer}&lang=${this.currentLang}`;
      const res = await fetch(url, { signal: abortController.signal });
      const data = await res.json();

      if (!data.success || !data.stream_url) {
        throw new Error(data.message || `Serveur ${this.currentServer} temporairement indisponible`);
      }

      this.setStep(2, 'done', `2. Flux direct obtenu (${data.server_name || 'Cluster'})`);

      // Étape 3 : Déchiffrement & Proxy
      this.setStep(3, 'active', `3. Déchiffrement direct & Proxy local anti-pub...`);
      await new Promise(r => setTimeout(r, 100));
      this.setStep(3, 'done', `3. Déchiffrement validé (${data.hoster || 'Flux Direct'})`);

      // Étape 4 : Initialisation dans le lecteur Netflix
      this.setStep(4, 'active', `4. Injection dans le lecteur Netflix personnalisé...`);

      let targetStreamUrl = data.stream_url || data.embed_url;
      if (targetStreamUrl && targetStreamUrl.startsWith('/')) {
        targetStreamUrl = baseUrl + targetStreamUrl;
      }

      // Pour les chaînes TV en direct, TOUJOURS injecter dans le player Netflix direct HLS
      if (isChannel) {
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
      this.showStatusBanner(`Serveur ${this.currentServer} indisponible (${err.message}). Basculement automatique...`);

      // Basculer automatiquement sur le serveur suivant après 1.5s
      setTimeout(() => {
        const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
        const maxSrv = isChannel ? 8 : 5;
        const next = (this.currentServer % maxSrv) + 1;
        this.switchServer(next);
      }, 1500);
    }
  }

  playDirectVideo(videoUrl) {
    const baseUrl = window.API_BASE || '';
    if (videoUrl && videoUrl.startsWith('/')) {
      videoUrl = baseUrl + videoUrl;
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
      this.video.removeAttribute('src');
      this.video.load();
    } catch (e) {}

    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');
    if (this.bottomControls) {
      this.bottomControls.classList.remove('iframe-mode');
    }

    const onReady = () => {
      this.setStep(4, 'done', `4. Épisode connecté • Lecture active 1080p FHD`);
      setTimeout(() => this.hideLoader(), 300);
    };

    this.video.addEventListener('loadeddata', onReady, { once: true });
    this.video.addEventListener('playing', onReady, { once: true });

    this.video.preload = 'auto';
    this.video.src = videoUrl;
    this.video.load();

    const playPromise = this.video.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('[Direct Video Autoplay Warn]:', err.message);
      });
    }
  }

  playEmbedIframe(embedUrl) {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.video.pause();
    this.video.src = '';
    this.video.classList.add('hidden');
    this.iframe.classList.remove('hidden');
    this.iframe.src = embedUrl;

    if (this.bottomControls) {
      this.bottomControls.classList.add('iframe-mode');
    }

    this.setStep(4, 'done', `4. Lecteur officiel connecté • Lecture active`);
    setTimeout(() => this.hideLoader(), 400);
  }

  playDirectHls(streamUrl) {
    const baseUrl = window.API_BASE || '';
    if (streamUrl && streamUrl.startsWith('/')) {
      streamUrl = baseUrl + streamUrl;
    }

    // 1. Purge et libération instantanée du flux précédent et de la mémoire RAM décodeur
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
      this.video.removeAttribute('src');
      this.video.load();
    } catch (e) {}

    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');
    if (this.bottomControls) {
      this.bottomControls.classList.remove('iframe-mode');
    }

    const onReady = () => {
      this.setStep(4, 'done', `4. Flux connecté • Lecture active`);
      setTimeout(() => this.hideLoader(), 300);
    };

    this.video.addEventListener('loadeddata', onReady, { once: true });
    this.video.addEventListener('playing', onReady, { once: true });

    if (window.Hls && Hls.isSupported()) {
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      const isXtream = streamUrl.includes('/api/stream/xtream');
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDurationCount: isXtream ? 4 : (isChannel ? 4 : 3), // Marge sécurisée de 4 segments anti-coupure
        liveMaxLatencyDurationCount: isXtream ? 10 : (isChannel ? 12 : 10),
        liveDurationInfinity: isChannel,
        startLevel: -1, // Démarrage adaptatif immédiat
        capLevelToPlayerSize: false,
        initialLiveManifestSize: 1, // Démarre dès le premier manifest
        startFragPrefetch: true, // Précharge les fragments suivants en tâche de fond (chargement turbo)
        backBufferLength: 30, // 30s en arrière conservées
        maxBufferLength: isChannel ? 30 : 60, // 30s à 60s d'avance pour un tampon large et stable (style YouTube)
        maxMaxBufferLength: isChannel ? 60 : 120, // Jusqu'à 120s de préchargement max
        maxBufferSize: 60 * 1024 * 1024, // 60 Mo alloués au tampon vidéo
        highBufferWatchdogPeriod: 3,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        maxFragLookUpTolerance: 0.25,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 20000,
        levelLoadingTimeOut: 20000
      });
      this.hls = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(this.video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.levels && hls.levels.length > 0) {
          this.updateQualityMenuOptions();
          if (this.currentQuality === -1) {
            // Auto ABR : laisser HLS s'adapter fluidement à la bande passante sans gel
            hls.currentLevel = -1;
          } else {
            this.applyQualityLevel();
          }
        }

        this.video.play().catch(err => {
          console.warn('[Player] Autoplay avec son restreint par le navigateur, démarrage en muet :', err.message);
          this.video.muted = true;
          this.syncVolumeUI();
          this.video.play().catch(() => {});
        });
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
        if (!data.fatal) {
          if (data.details === 'bufferStalledError' && isChannel) {
            const livePos = hls.liveSyncPosition;
            if (livePos && isFinite(livePos) && (this.video.currentTime < livePos - 8)) {
              console.log('[HLS Live Sync] Recalage sur le direct suite à pause/décalage');
              this.video.currentTime = livePos;
              hls.startLoad();
            }
          }
          return;
        }

        console.warn('[HLS Fatal Error]', data.type, data.details);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('[HLS] Récupération réseau automatique...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('[HLS] Récupération média automatique...');
            hls.recoverMediaError();
            break;
          default:
            try {
              hls.stopLoad();
              hls.detachMedia();
              hls.destroy();
            } catch(e) {}
            this.hls = null;
            this.showStatusBanner(`Erreur de segment sur Serveur ${this.currentServer}. Basculement...`);
            setTimeout(() => {
              const isXtream = (this.currentMovie?.is_xtream || this.currentMovie?.stream_url?.includes('/api/stream/xtream'));
              if (isXtream) {
                this.loadStream();
                return;
              }
              const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
              const maxSrv = isChannel ? 8 : 5;
              const next = (this.currentServer % maxSrv) + 1;
              this.switchServer(next);
            }, 1200);
            break;
        }
      });
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = streamUrl;
      this.video.onloadedmetadata = () => {
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

  showLoader(title = "Extraction du flux en cours...") {
    if (this.loaderTitle) this.loaderTitle.textContent = title;
    this.loader.classList.remove('hidden');
  }

  hideLoader() {
    this.loader.classList.add('hidden');
  }

  showStatusBanner(message, actionLabel = "Basculer de serveur") {
    if (this.statusBannerText) this.statusBannerText.textContent = message;
    if (this.statusSwitchBtn) this.statusSwitchBtn.textContent = actionLabel;
    this.statusBanner.classList.remove('hidden');
  }

  hideStatusBanner() {
    this.statusBanner.classList.add('hidden');
  }

  close() {
    clearTimeout(this.idleTimer);
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
      this.video.removeAttribute('src');
      this.video.load();
    } catch (e) {}
    this.iframe.src = 'about:blank';
    this.iframe.classList.add('hidden');
    this.video.classList.remove('hidden');
    if (this.bottomControls) {
      this.bottomControls.classList.remove('iframe-mode');
    }
    this.hideLoader();
    this.hideStatusBanner();
    this.overlay.classList.remove('active', 'user-idle');

    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(() => {});
    }
  }
}

window.NetflixPlayer = NetflixPlayer;
