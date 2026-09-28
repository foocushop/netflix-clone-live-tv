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
  ? 'https://ziablo.xyz'
  : '');

class NetflixPlayer {
  
  setPlayerQualityMode() {}
  updateQualityMenuOptions() {}
  applyQualityLevel() {}

  getEffectiveDuration() {
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel) return 0;
    const targetDuration = (this.currentEpisodeDuration > 0 ? this.currentEpisodeDuration : (this.currentMovieDuration > 0 ? this.currentMovieDuration : 0));
    let videoDur = this.video?.duration;
    if (!videoDur || !isFinite(videoDur) || isNaN(videoDur) || videoDur <= 0 || videoDur === Infinity) {
      videoDur = 0;
    }
    if (targetDuration > 0) {
      if (videoDur < targetDuration * 0.95) {
        return targetDuration;
      }
      return Math.max(targetDuration, videoDur);
    }
    return videoDur;
  }

  // ================= MÉTHODES DE GESTION UX & ÉPISODE SUIVANT =================
  dismissNextEpisodeCard() {
    this._nextEpDismissed = true;
    if (this._nextEpTimer) {
      clearInterval(this._nextEpTimer);
      this._nextEpTimer = null;
    }
    if (this.nextEpisodeCard) {
      this.nextEpisodeCard.classList.remove('active');
      this.nextEpisodeCard.classList.add('hidden');
    }
  }

  checkNextEpisodeCountdown(current, total) {
    if (!this.nextEpisodeCard || this._nextEpDismissed) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel) return;
    if (!total || total <= 0 || !isFinite(total)) return;

    const remaining = total - current;
    if (remaining > 0 && remaining <= 45 && !this.nextEpisodeCard.classList.contains('active')) {
      const isSeries = (this.currentMovie?.media_type === 'series' || this.currentMovie?.is_xtream_series);
      if (isSeries) {
        this.nextEpisodeCard.classList.remove('hidden');
        this.nextEpisodeCard.classList.add('active');
        if (this.nextEpCountdown) this.nextEpCountdown.textContent = Math.ceil(remaining) + 's';
      }
    } else if (remaining > 45 && this.nextEpisodeCard.classList.contains('active')) {
      this.nextEpisodeCard.classList.remove('active');
      this.nextEpisodeCard.classList.add('hidden');
    }
  }

  showDoubleTapRipple(side) {
    const el = side === 'left' ? this.doubleTapLeft : this.doubleTapRight;
    if (!el) return;
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
    setTimeout(() => { if (el) el.classList.remove('active'); }, 600);
  }

  updatePlayerFavoriteUI() {
    if (!this.playerFavBtn) return;
    const isFav = (window.netflixApp && typeof window.netflixApp.isFavorite === 'function')
      ? window.netflixApp.isFavorite(this.currentMovie)
      : false;
    this.playerFavBtn.classList.toggle('active', isFav);
  }

  async togglePictureInPicture() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video && document.pictureInPictureEnabled && typeof this.video.requestPictureInPicture === 'function') {
        await this.video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('[ZIFLIX] PiP non supporté ou refusé:', e);
    }
  }


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
    this.centerPlayBtn = document.getElementById('centerPlayBtn');
    this.centerIconPlay = document.getElementById('centerIconPlay');
    this.centerIconPause = document.getElementById('centerIconPause');
    this.ctrlRewindBtn = document.getElementById('ctrlRewindBtn');
    this.ctrlForwardBtn = document.getElementById('ctrlForwardBtn');
    this.ctrlNextEpBtn = document.getElementById('ctrlNextEpBtn');

    this.volumeContainer = document.getElementById('volumeContainer');
    this.ctrlVolumeBtn = document.getElementById('ctrlVolumeBtn');
    this.iconVolHigh = document.getElementById('iconVolHigh');
    this.iconVolMuted = document.getElementById('iconVolMuted');
    this.ctrlVolumeSlider = document.getElementById('ctrlVolumeSlider');
    this.unmuteBadge = document.getElementById('playerUnmuteBadge');
    this._autoplayMuted = false;
    this._isUserMuted = false;

    this.ctrlCurrentTime = document.getElementById('ctrlCurrentTime');
    this.ctrlTotalDuration = document.getElementById('ctrlTotalDuration');
    this.ctrlMediaTitle = document.getElementById('ctrlMediaTitle');

    this.ctrlSpeedBtn = document.getElementById('ctrlSpeedBtn');
    this.ctrlSubtitlesBtn = document.getElementById('ctrlSubtitlesBtn');
    this.speedMenu = document.getElementById('speedMenu');




        this.skipIntroBtn = document.getElementById('skipIntroBtn');
    if (this.skipIntroBtn) {
      const handleSkip = (e) => {
        if (e) {
          e.stopPropagation();
          if (e.cancelable) e.preventDefault();
        }
        this.skipIntro();
      };
      this.skipIntroBtn.addEventListener('click', handleSkip);
      this.skipIntroBtn.addEventListener('touchend', handleSkip);
    }
    this.ctrlFullscreenBtn = document.getElementById('ctrlFullscreenBtn');
    this.iconEnterFs = document.getElementById('iconEnterFs');
    this.iconExitFs = document.getElementById('iconExitFs');

    // 9. Bannière de Statut & Résilience
    this.statusBanner = document.getElementById('playerStatusBanner');
    this.statusBannerText = document.getElementById('statusBannerText');
    this.statusSwitchBtn = document.getElementById('statusSwitchBtn');
    this.statusRetryBtn = document.getElementById('statusRetryBtn');

    // 10. Tiroir des Commentaires en direct ZIFLIX
    this.commentsToggleBtn = document.getElementById('playerCommentsToggleBtn');
    this.commentsDrawer = document.getElementById('playerCommentsDrawer');
    this.commentsCloseBtn = document.getElementById('playerCommentsCloseBtn');
    this.commentsList = document.getElementById('playerDrawerCommentsList');
    this.commentInput = document.getElementById('playerCommentInput');
    this.commentSubmitBtn = document.getElementById('playerCommentSubmitBtn');
    this.playerReportBugBtn = document.getElementById('playerReportBugBtn');

    // 11. Composants UX Avancés (PiP, AirPlay, Favori, Double-tap, Épisode suivant)
    this.ctrlPipBtn = document.getElementById('ctrlPipBtn');
    this.ctrlAirPlayBtn = document.getElementById('ctrlAirPlayBtn');
    this.playerFavBtn = document.getElementById('playerFavBtn');
    this.doubleTapLeft = document.getElementById('doubleTapLeft');
    this.doubleTapRight = document.getElementById('doubleTapRight');
    this.nextEpisodeCard = document.getElementById('nextEpisodeCard');
    this.btnNextEpNow = document.getElementById('btnNextEpNow');
    this.btnNextEpDismiss = document.getElementById('btnNextEpDismiss');
    this.nextEpCountdown = document.getElementById('nextEpCountdown');
    this.nextEpCardTitle = document.getElementById('nextEpCardTitle');
    this.nextEpCardSub = document.getElementById('nextEpCardSub');
    this.nextEpCardImg = document.getElementById('nextEpCardImg');
    this._nextEpDismissed = false;
    this._nextEpTimer = null;
    this._nextEpCountdownSec = 10;

    // État Interne
    this.currentMovie = null;
    this.currentServer = 1;
    this.currentSeason = 1;
    this.currentEpisode = 1;
    this.currentEpisodeDuration = 0;
    this.currentMovieDuration = 0;
    this.currentLang = 'vf';
    this.currentQuality = -1; // -1 = Auto ABR
    this.hls = null;
    this.savedPlaybackTime = 0;
    this.lastLiveMaxTime = 0;
    this.activeExtractionAbort = null;
    this.inactivityTimer = null;
    this.isScrubbing = false;
    this._isRemuxedMp4 = false;
    this._currentDirectVideoUrl = '';
    this._hlsStreamOffset = 0;
    this._isUserPaused = false;
    this._isQualitySwitching = false;

    // Initialisation
    this.initEvents();
    this.initCommentsEvents();
    this.initScrubberEvents();
    this.initVolumeEvents();
    this.initSpeedEvents();
    this.initSubtitlesEvents();
    this.initServerNavEvents();
    this.initEpisodeSelectEvents();
    this.initInactivityTimer();

    // 7. Watch Timer Monetag & Continuer la lecture
    this.timerWarningBadge = document.getElementById('timerWarningBadge');
    this.timerBadgeTime = document.getElementById('timerBadgeTime');
    this.timerBadgeRechargeBtn = document.getElementById('timerBadgeRechargeBtn');
    this.timerExpiredModal = document.getElementById('timerExpiredModal');
    this.playerWatchTimer = document.getElementById('playerWatchTimer');
    this.playerWatchTimerVal = document.getElementById('playerWatchTimerVal');
    this.playerWatchTimerBtn = document.getElementById('playerWatchTimerBtn');
    this.timerModalRechargeBtn = document.getElementById('timerModalRechargeBtn');

    // Roulement des liens publicitaires (Monetag + Adsterra)
    this.DIRECT_LINKS = [
      'https://omg10.com/4/11820445',
      'https://www.profitableratecpmnetwork.com/kwnxcx7a2s?key=d43d0890cc6512eb65c08a022e42f264'
    ];
    this.MONETAG_LINK = this.DIRECT_LINKS[0];
    this.INITIAL_CREDIT = 1200; // 20 minutes offertes
    this.BONUS_CREDIT = 1200;   // +20 minutes de recharge
    this.MAX_CREDIT = 3600;     // Plafond strict 60 minutes (3600s)
    this.COOLDOWN_SECONDS = 5;  // 5 secondes de délai non atomique
    this.isRechargePending = false;
    this.rechargeCooldownInterval = null;
    this.WARNING_THRESHOLD = 300; // 5 minutes
    this.watchTimerInterval = null;
    this.lastProgressSave = 0;
    this.savedResumeTime = 0;

    this.initWatchTimer();
    this.initResponsiveLayout();
    try { localStorage.removeItem("netflix_audio_delay"); } catch (e) {}
  }

  // Horloge unifiée : retourne directement le currentTime réel de la vidéo (synchronisé avec les PTS HLS)
  getCurrentPlaybackTime() {
    if (!this.video) return 0;
    return this.video.currentTime || 0;
  }

  // ================= 1. INITIALISATION DES ÉVÉNEMENTS =================
  initEvents() {
    // Bouton Retour Catalogue
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => this.close());
    }

    // Play / Pause (Bouton barre inférieure & Bouton tactile central Netflix)
    if (this.ctrlPlayBtn) {
      this.ctrlPlayBtn.addEventListener('click', () => this.togglePlay());
    }
    if (this.centerPlayBtn) {
      let lastCenterToggle = 0;
      const handleCenterToggle = (e) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        const now = Date.now();
        if (now - lastCenterToggle < 350) return;
        lastCenterToggle = now;
        this.togglePlay();
        this.showControls();
      };
      this.centerPlayBtn.addEventListener('click', handleCenterToggle);
      this.centerPlayBtn.addEventListener('touchend', handleCenterToggle, { passive: false });
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

    // Plein Écran (Support tactile & anti-rebond mobile)
    if (this.ctrlFullscreenBtn) {
      let lastFsClick = 0;
      const handleFsBtn = (e) => {
        if (e) {
          e.stopPropagation();
          if (e.cancelable) e.preventDefault();
        }
        const now = Date.now();
        if (now - lastFsClick < 350) return;
        lastFsClick = now;
        this.toggleFullscreen();
      };
      this.ctrlFullscreenBtn.addEventListener('click', handleFsBtn);
      this.ctrlFullscreenBtn.addEventListener('touchend', handleFsBtn, { passive: false });
    }

    // Picture-in-Picture (PiP)
    if (this.ctrlPipBtn) {
      if (!('pictureInPictureEnabled' in document) && !(this.video && this.video.webkitSupportsPresentationMode)) {
        this.ctrlPipBtn.classList.add('hidden');
      } else {
        this.ctrlPipBtn.addEventListener('click', () => this.togglePictureInPicture());
      }
    }
    if (this.video) {
      this.video.addEventListener('enterpictureinpicture', () => {
        if (this.ctrlPipBtn) this.ctrlPipBtn.classList.add('active');
      });
      this.video.addEventListener('leavepictureinpicture', () => {
        if (this.ctrlPipBtn) this.ctrlPipBtn.classList.remove('active');
      });
    }

    // AirPlay (Safari / iOS / Mac)
    if (this.video && window.WebKitPlaybackTargetAvailabilityEvent) {
      this.video.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
        if (this.ctrlAirPlayBtn) {
          if (e.availability === 'available') {
            this.ctrlAirPlayBtn.classList.remove('hidden');
          } else {
            this.ctrlAirPlayBtn.classList.add('hidden');
          }
        }
      });
    }
    if (this.ctrlAirPlayBtn) {
      this.ctrlAirPlayBtn.addEventListener('click', () => {
        if (this.video && typeof this.video.webkitShowPlaybackTargetPicker === 'function') {
          this.video.webkitShowPlaybackTargetPicker();
        }
      });
    }

    // Bouton Favoris dans le lecteur ZIFLIX
    if (this.playerFavBtn) {
      this.playerFavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.netflixApp && this.currentMovie) {
          window.netflixApp.toggleMyList(this.currentMovie);
          this.updatePlayerFavoriteUI();
        }
      });
    }

    // Épisode suivant (Overlay Flottant Netflix)
    if (this.btnNextEpNow) {
      this.btnNextEpNow.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismissNextEpisodeCard();
        this.goToNextEpisode();
      });
    }
    if (this.btnNextEpDismiss) {
      this.btnNextEpDismiss.addEventListener('click', (e) => {
        e.stopPropagation();
        this._nextEpDismissed = true;
        this.dismissNextEpisodeCard();
      });
    }

    const syncFullscreenUI = () => {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        this.video?.webkitDisplayingFullscreen
      );
      if (this.iconEnterFs) this.iconEnterFs.classList.toggle('hidden', isFs);
      if (this.iconExitFs) this.iconExitFs.classList.toggle('hidden', !isFs);

      if (!isFs) {
        try {
          if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
          }
        } catch (e) {}
      }

      setTimeout(() => {
        if (typeof this.adaptResponsiveLayout === 'function') {
          this.adaptResponsiveLayout();
        }
      }, 150);
    };

    document.addEventListener('fullscreenchange', syncFullscreenUI);
    document.addEventListener('webkitfullscreenchange', syncFullscreenUI);
    document.addEventListener('mozfullscreenchange', syncFullscreenUI);
    document.addEventListener('MSFullscreenChange', syncFullscreenUI);

    if (!this._globalUnmuteListenerBound) {
      this._globalUnmuteListenerBound = true;
      const onUserActive = () => {
        if ((this._autoplayMuted || (this.video && this.video.muted)) && this.video && !this.video.paused && !this._isUserMuted) {
          this.unmutePlayer(true);
        }
      };
      ['click', 'pointerdown', 'touchstart', 'keydown', 'mousemove'].forEach(evt => {
        window.addEventListener(evt, onUserActive, { capture: true, passive: true });
      });
    }


    // Clic & Tap unifié sur le lecteur avec support Double-Tap Mobile ±10s
    if (this.mediaContainer) {
      let lastTapTime = 0;
      let lastTapX = 0;
      let singleTapTimer = null;

      const handleMediaInteraction = (e) => {
        if (e.target.closest('.netflix-bottom-controls') || 
            e.target.closest('.player-top-bar') ||
            e.target.closest('.center-play-btn') ||
            e.target.closest('.netflix-skip-intro-btn') ||
            e.target.closest('.comments-drawer') ||
            e.target.closest('.player-status-banner') ||
            e.target.closest('.timer-expired-modal') ||
            e.target.closest('.player-loader') ||
            e.target.closest('.quality-menu') ||
            e.target.closest('.speed-menu') ||
            e.target.closest('.server-selector-container') ||
            e.target.closest('.next-ep-countdown-card')) {
          return;
        }

        if (this._autoplayMuted || (this.video && this.video.muted && !this._isUserMuted)) {
          this.unmutePlayer();
        }

        const clientX = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || 0;
        const rect = this.mediaContainer.getBoundingClientRect();
        const relX = clientX - rect.left;
        const ratio = (rect.width > 0) ? (relX / rect.width) : 0.5;
        const now = Date.now();

        // Détection de Double-Tap (< 320ms et même zone)
        if (now - lastTapTime < 320 && Math.abs(clientX - lastTapX) < 90) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
          lastTapTime = 0;

          const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
          if (ratio < 0.4) {
            // Zone Gauche : Recul 10s avec onde animée
            if (!isChannel) {
              this.seekRelative(-10);
              this.showDoubleTapRipple('left');
            }
            return;
          } else if (ratio > 0.6) {
            // Zone Droite : Avance 10s avec onde animée
            if (!isChannel) {
              this.seekRelative(10);
              this.showDoubleTapRipple('right');
            }
            return;
          } else {
            // Zone Centrale : Lecture / Pause
            this.togglePlay();
            return;
          }
        }

        lastTapTime = now;
        lastTapX = clientX;

        // Simple Tap
        if (this.isTouchDevice()) {
          this.showControls();
          return;
        }

        singleTapTimer = setTimeout(() => {
          this.togglePlay();
        }, 220);
      };

      this.mediaContainer.addEventListener('click', handleMediaInteraction);
      this.mediaContainer.addEventListener('touchstart', () => {
        if (this._autoplayMuted || (this.video && this.video.muted && !this._isUserMuted)) {
          this.unmutePlayer();
        }
      }, { passive: true });
    }

    // Double-clic sur la vidéo pour le plein écran
    if (this.video) {
      this.video.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.toggleFullscreen();
      });

      this.video.addEventListener('playing', () => {
        if ((this._autoplayMuted || this.video.muted) && !this._isUserMuted) {
          this.unmutePlayer(true);
          setTimeout(() => {
            if (this.video && this.video.paused && this._autoplayMuted) {
              this.video.muted = true;
              this.showUnmuteNotice();
              this.video.play().catch(() => {});
            }
          }, 80);
        }
      });

      this.video.addEventListener('play', () => {
        if (!this.isVipOrAdmin() && this.getWatchCredit() <= 0) {
          try { this.video.pause(); } catch (e) {}
          if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
          if (this.timerExpiredModal) this.timerExpiredModal.classList.remove('hidden');
          return;
        }
        this.updatePlayStateUI(true);
      });
      this.video.addEventListener('pause', () => this.updatePlayStateUI(false));
      this.video.addEventListener('ended', () => {
        const isSeries = (this.currentMovie?.media_type === 'series' || this.currentMovie?.is_xtream_series);
        const curTime = this.getCurrentPlaybackTime();
        const expectedDur = typeof this.getEffectiveDuration === 'function' ? this.getEffectiveDuration() : (this.currentMovieDuration || 0);

        // Détection de coupure inattendue du flux amont (ex: coupure à 59m d'un film de 2h10)
        if (expectedDur > 120 && curTime > 30 && (expectedDur - curTime > 60)) {
          console.warn(`[Player Premature End] Coupure inattendue du flux à ${curTime.toFixed(0)}s sur ${expectedDur.toFixed(0)}s attendues. Relance et reprise automatique...`);
          this.showBuffering(true, 'Rétablissement du flux vidéo...');
          this.savedResumeTime = curTime;
          setTimeout(() => {
            this.loadStream();
          }, 800);
          return;
        }

        if (isSeries) {
          const dur = this.currentEpisodeDuration || 0;
          if (dur > 60 && this.video.currentTime < dur - 30) {
            console.warn('[Player] Vidéo arrêtée avant la fin réelle de épisode (currentTime:', this.video.currentTime, 'durée attendue:', dur, ')');
            return;
          }
          this.goToNextEpisode();
        }
      });

      // Synchronisation plein écran natif iOS Safari
      this.video.addEventListener('webkitbeginfullscreen', () => {
        if (this.iconEnterFs) this.iconEnterFs.classList.add('hidden');
        if (this.iconExitFs) this.iconExitFs.classList.remove('hidden');
      });
      this.video.addEventListener('webkitendfullscreen', () => {
        if (this.iconEnterFs) this.iconEnterFs.classList.remove('hidden');
        if (this.iconExitFs) this.iconExitFs.classList.add('hidden');
      });

      // Détection intelligente du buffering & des lags amont
      let bufferTimeout = null;
      let slowStreamTimeout = null;

      const clearBufferState = () => {
        this.showBuffering(false);
        if (bufferTimeout) { clearTimeout(bufferTimeout); bufferTimeout = null; }
        if (slowStreamTimeout) { clearTimeout(slowStreamTimeout); slowStreamTimeout = null; }
        this.hideStatusBanner();
      };

      this.video.addEventListener('stalled', () => {
        // IMPORTANT: Sur mobile, 'stalled' se déclenche couramment dès que le buffer est plein ou le socket au repos.
        // Si la vidéo est déjà en cours de lecture active, NE PAS afficher le loader de buffer !
        if (this.video && !this.video.paused && this.video.readyState >= 3 && !this.video.seeking) {
          return;
        }
        if (!this._isUserPaused) {
          this.showBuffering(true, 'Mise en mémoire tampon...');
        }
      });
      this.video.addEventListener('waiting', () => {
        if (this.video && !this.video.paused && this.video.readyState >= 3 && !this.video.seeking) {
          return;
        }
        if (!this._isUserPaused) {
          this.showBuffering(true, 'Mise en mémoire tampon...');
        }
        if (bufferTimeout) clearTimeout(bufferTimeout);
        if (slowStreamTimeout) clearTimeout(slowStreamTimeout);

        slowStreamTimeout = setTimeout(() => {
          if (!this._isUserPaused && (this.video?.readyState < 3 || this.video?.paused)) {
            const curT = this.getCurrentPlaybackTime();
            console.warn('[Player Watchdog] Flux en mémoire tampon depuis >35s, reprise automatique à ' + curT.toFixed(0) + 's...');
            this.showStatusBanner('Rétablissement automatique du flux...');
            this.savedResumeTime = curT;
            this.loadStream();
          }
        }, 35000);
      });

      this.video.addEventListener('seeking', () => {
        if (slowStreamTimeout) clearTimeout(slowStreamTimeout);
        if (!this._isUserPaused) {
          this.showBuffering(true, 'Chargement...');
        }
      });

      this.video.addEventListener('playing', () => {
        this._isUserPaused = false;
        clearBufferState();
      });
      this.video.addEventListener('canplay', () => {
        if (this.video && this.video.currentTime > 0) {
          clearBufferState();
        }
      });
      this.video.addEventListener('progress', () => {
        if (this.video && !this.video.paused && this.video.readyState >= 3 && !this.video.seeking) {
          if (this.loader && (this.loader.classList.contains('buffering-mode') || !this.loader.classList.contains('hidden'))) {
            clearBufferState();
          }
        }
      });
      this.video.addEventListener('seeked', clearBufferState);
      this.video.addEventListener('pause', () => {
        if (bufferTimeout) clearTimeout(bufferTimeout);
        if (slowStreamTimeout) clearTimeout(slowStreamTimeout);
        if (this._isUserPaused) {
          this.showBuffering(false);
        }
      });
    }

    // Raccourcis Clavier
    document.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('active')) return;
      if (e.target.matches?.('input, select, textarea') || ['input', 'select', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;

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

        case 'p':
        case 'P':
          this.togglePictureInPicture();
          break;
        case 'f':
        case 'F':
          this.toggleFullscreen();
          break;
        case 'n':
        case 'N':
          this.goToNextEpisode();
          break;
        case 'i':
        case 'I':
          this.skipIntro();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            this.close();
          }
          break;
        default:
          break;
      }
    });

    // Actions Bannière de Statut
    if (this.statusRetryBtn) {
      this.statusRetryBtn.addEventListener('click', () => this.loadStream());
    }
    if (this.statusSwitchBtn) {
      this.statusSwitchBtn.addEventListener('click', () => {
        this.hideStatusBanner();
        this.triggerCenterRipple('Reconnexion...');
        this.loadStream();
      });
    }

    // Bouton de signalement de bug sur le lecteur
    if (this.playerReportBugBtn) {
      this.playerReportBugBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.video && !this.video.paused) {
          this.video.pause();
        }
        if (window.openBugReportModal) {
          window.openBugReportModal({
            media_title: this.currentMovie?.title || 'Programme en cours',
            media_id: this.currentMovie?.id || '',
            season: this.currentSeason || 1,
            episode: this.currentEpisode || 1,
            episode_id: this.currentEpisodeId || null
          });
        }
      });
    }
  }

  getAuthHeaders(extra = {}) {
    const token = localStorage.getItem('ziflix_auth_token');
    const headers = { ...extra };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }
    return headers;
  }

  // ================= COMMENTAIRES EN DIRECT DANS LE LECTEUR =================
  initCommentsEvents() {
    if (this.commentsToggleBtn && this.commentsDrawer) {
      this.commentsToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.commentsDrawer.classList.toggle('hidden');
        if (!this.commentsDrawer.classList.contains('hidden')) {
          this.loadLiveComments();
        }
      });
    }

    if (this.commentsCloseBtn && this.commentsDrawer) {
      this.commentsCloseBtn.addEventListener('click', () => {
        this.commentsDrawer.classList.add('hidden');
      });
    }

    if (this.commentSubmitBtn) {
      this.commentSubmitBtn.addEventListener('click', () => this.submitLiveComment());
    }

    if (this.commentInput) {
      this.commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitLiveComment();
        }
      });
    }
  }

  async loadLiveComments() {
    if (!this.currentMovie || !this.commentsList) return;
    const mediaId = this.currentMovie.id || this.currentMovie.series_id || 'stream';
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/comments?mediaId=${encodeURIComponent(mediaId)}`, {
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.comments)) {
        if (json.comments.length === 0) {
          this.commentsList.innerHTML = '<div style="color: #888; font-size: 0.75rem; text-align: center; padding: 12px;">Aucun avis pour le moment. Soyez le premier !</div>';
          return;
        }
        this.commentsList.innerHTML = '';
        const isAdmin = (window.netflixApp && window.netflixApp.currentUser && window.netflixApp.currentUser.role === 'admin') ||
                        (localStorage.getItem('ziflix_admin_token') === '1965');

        json.comments.forEach(c => {
          const div = document.createElement('div');
          div.className = 'player-drawer-item';
          div.innerHTML = `
            <div class="player-drawer-meta" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
              <span class="player-drawer-author" style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                ${c.username} ${(c.is_vip || c.role === "admin" || c.role === "premium") ? '<span class="vip-badge-tag">👑 VIP</span>' : ""}
                ${isAdmin && c.ip ? `<span style="color: #888; font-size: 0.65rem; font-weight: normal; font-family: monospace; background: rgba(255,255,255,0.06); padding: 1px 4px; border-radius: 3px;">IP: ${c.ip}</span>` : ''}
              </span>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 0.72rem; color: #888;">${new Date(c.createdAt || c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                ${isAdmin ? `
                  <button type="button" class="player-comment-ban-btn" data-id="${c.id}" data-user-id="${c.userId || c.user_id}" data-username="${c.username}" title="Bannir l'utilisateur et son IP" style="background: rgba(229, 9, 20, 0.25); color: #ff5252; border: 1px solid rgba(229, 9, 20, 0.45); border-radius: 4px; padding: 2px 6px; font-size: 0.65rem; font-weight: 700; cursor: pointer;">Bannir</button>
                  <button type="button" class="player-comment-del-btn" data-id="${c.id}" title="Supprimer le commentaire" style="background: none; border: none; font-size: 0.75rem; cursor: pointer; color: #aaa;">🗑️</button>
                ` : ''}
              </div>
            </div>
            <div class="player-drawer-text">${c.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          `;
          if (isAdmin) {
            div.querySelector('.player-comment-del-btn')?.addEventListener('click', async () => {
              if (confirm('Supprimer ce commentaire ?')) {
                await this.deleteComment(c.id);
                this.loadLiveComments();
              }
            });
            div.querySelector('.player-comment-ban-btn')?.addEventListener('click', async () => {
              if (confirm(`Bannir définitivement "${c.username}" et son adresse IP ?`)) {
                await this.banUserFromComment(c.id, c.userId || c.user_id, c.username);
                this.loadLiveComments();
              }
            });
          }
          this.commentsList.appendChild(div);
        });
        this.commentsList.scrollTop = this.commentsList.scrollHeight;
      }
    } catch (e) {}
  }

  async deleteComment(commentId) {
    try {
      const baseUrl = window.API_BASE || '';
      const headers = this.getAuthHeaders();
      const adminPin = localStorage.getItem('ziflix_admin_token');
      if (adminPin) headers['x-admin-password'] = '1965';
      await fetch(`${baseUrl}/api/comments?id=${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers
      });
    } catch(e) {}
  }

  async banUserFromComment(commentId, userId, username) {
    try {
      const baseUrl = window.API_BASE || '';
      const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });
      const adminPin = localStorage.getItem('ziflix_admin_token');
      if (adminPin) headers['x-admin-password'] = '1965';

      const res = await fetch(`${baseUrl}/api/admin/comments/ban-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ commentId, userId })
      });
      const json = await res.json();
      if (json.success) {
        if (typeof this.showStatusBanner === 'function') {
          this.showStatusBanner(`${username} et son IP ont été bannis`);
          setTimeout(() => this.hideStatusBanner(), 3500);
        }
      }
    } catch(e) {}
  }

  async submitLiveComment() {
    if (!this.currentMovie || !this.commentInput) return;
    const text = this.commentInput.value.trim();
    if (!text) return;

    const token = localStorage.getItem('ziflix_auth_token');
    if (!token) {
      this.showStatusBanner('Veuillez vous connecter à ZIFLIX pour commenter.');
      setTimeout(() => this.hideStatusBanner(), 3500);
      return;
    }

    const mediaId = this.currentMovie.id || this.currentMovie.series_id || 'stream';
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/comments`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ mediaId, text })
      });
      const json = await res.json();
      if (json.success) {
        this.commentInput.value = '';
        this.loadLiveComments();
      }
    } catch (e) {}
  }

  // ================= 2. SCRUBBER & TIMELINE PROGRESSIVE =================
  initScrubberEvents() {
    if (!this.scrubberContainer) return;

    const getEffectiveDuration = () => {
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) return 0;
      const targetDuration = (this.currentEpisodeDuration > 0 ? this.currentEpisodeDuration : (this.currentMovieDuration > 0 ? this.currentMovieDuration : 0));
      let videoDur = this.video?.duration;
      if (!videoDur || !isFinite(videoDur) || isNaN(videoDur) || videoDur <= 0 || videoDur === Infinity) {
        videoDur = 0;
      }
      if (targetDuration > 0) {
        if (videoDur < targetDuration * 0.95) {
          return targetDuration;
        }
        return Math.max(targetDuration, videoDur);
      }
      return videoDur;
    };
    this.getEffectiveDuration = getEffectiveDuration;

    this.applySeek = (targetTime) => {
      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) return;
      if (!this.video || !isFinite(targetTime) || targetTime < 0) return;

      this.savedResumeTime = 0;
      this.showBuffering(true, 'Chargement...');

      if (this._currentHlsUrl && (this._currentHlsUrl.includes('/api/stream/xtream-series-hls') || this._currentHlsUrl.includes('/api/stream/xtream-movie-hls'))) {
        let minSeekable = 0;
        let maxSeekable = 0;
        if (this.video.seekable && this.video.seekable.length > 0) {
          minSeekable = this.video.seekable.start(0);
          maxSeekable = this.video.seekable.end(this.video.seekable.length - 1);
        }

        // Si le point demandé est déjà dans la plage seekable du flux HLS en cours
        if (maxSeekable > 0 && targetTime >= minSeekable && targetTime <= maxSeekable) {
          this.video.currentTime = targetTime;
          if (this.video.paused) {
            this.video.play().catch(() => {});
          }
          return;
        }

        // Si la durée totale est connue et que le flux est complet
        if (this.video.duration && isFinite(this.video.duration) && targetTime <= this.video.duration && maxSeekable >= this.video.duration - 10) {
          this.video.currentTime = targetTime;
          if (this.video.paused) {
            this.video.play().catch(() => {});
          }
          return;
        }

        // Sinon, relancer le flux HLS serveur à la seconde demandée
        const cleanUrl = this._currentHlsUrl.replace(/[?&]start=\d+/g, '');
        const sep = cleanUrl.includes('?') ? '&' : '?';
        this.playDirectHls(`${cleanUrl}${sep}start=${Math.floor(targetTime)}`, { startPosition: targetTime });
        return;
      }

      this.video.currentTime = targetTime;
      if (this.video.paused) {
        this.video.play().catch(() => {});
      }
    };
    const applySeek = this.applySeek;

    const onScrub = (e, commit = true) => {
      const duration = getEffectiveDuration();
      if (!duration) return;
      const rect = this.scrubberContainer.getBoundingClientRect();
      const clientX = e.clientX !== undefined
        ? e.clientX
        : (e.touches && e.touches[0] ? e.touches[0].clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : rect.left));
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = pos * duration;
      this._pendingScrubTime = targetTime;
      if (this.ctrlCurrentTime) this.ctrlCurrentTime.textContent = this.formatTime(targetTime);
      this.updateScrubberProgress(pos * 100);
      if (commit) {
        applySeek(targetTime);
      }
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
      const clientX = e.clientX !== undefined
        ? e.clientX
        : (e.touches && e.touches[0] ? e.touches[0].clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : rect.left));
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

    // Clic & Glissement Souris (Desktop)
    this.scrubberContainer.addEventListener('mousedown', (e) => {
      this.isScrubbing = true;
      this.scrubberContainer.classList.add('dragging');
      onScrub(e, false);
      updateTooltip(e);
      const onMouseMove = (ev) => {
        if (this.isScrubbing) {
          onScrub(ev, false);
          updateTooltip(ev);
        }
      };
      const onMouseUp = () => {
        this.isScrubbing = false;
        this.scrubberContainer.classList.remove('dragging');
        if (this.scrubberTooltip) this.scrubberTooltip.classList.remove('visible');
        if (this._pendingScrubTime !== undefined && this._pendingScrubTime !== null) {
          applySeek(this._pendingScrubTime);
          this._pendingScrubTime = null;
        }
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Touch & Glissement Doigt Tactile (Mobile iPhone, iPad, Android)
    this.scrubberContainer.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault();
      this.isScrubbing = true;
      this.scrubberContainer.classList.add('dragging');
      onScrub(e, false);
      updateTooltip(e);
      const onTouchMove = (ev) => {
        if (this.isScrubbing) {
          if (ev.cancelable) ev.preventDefault();
          onScrub(ev, false);
          updateTooltip(ev);
        }
      };
      const onTouchEnd = () => {
        this.isScrubbing = false;
        this.scrubberContainer.classList.remove('dragging');
        if (this.scrubberTooltip) this.scrubberTooltip.classList.remove('visible');
        if (this._pendingScrubTime !== undefined && this._pendingScrubTime !== null) {
          applySeek(this._pendingScrubTime);
          this._pendingScrubTime = null;
        }
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
      };
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    }, { passive: false });

    // Progression temps réel allégée (optimisation 60fps : DOM throttlé à 4Hz max)
    let lastTimeUpdate = 0;
    this.video.addEventListener('timeupdate', () => {
      // Auto-guérison immédiate du loader : si la vidéo avance et joue, effacer tout spinner résiduel
      if (this.video && !this.video.paused && this.video.readyState >= 3 && !this.video.seeking) {
        if (this.loader && (this.loader.classList.contains('buffering-mode') || !this.loader.classList.contains('hidden'))) {
          this.showBuffering(false);
        }
      }

      if (this.isScrubbing) return;
      const now = performance.now();
      if (now - lastTimeUpdate < 250) return;
      lastTimeUpdate = now;
      this.savePlaybackProgress();

      const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
      if (isChannel) {
        this.ctrlCurrentTime.textContent = 'LIVE';
        this.ctrlTotalDuration.textContent = 'DIRECT';
        this.updateScrubberProgress(100);
        return;
      }

      const current = this.getCurrentPlaybackTime();
      this.checkSkipIntro(current);
      let total = getEffectiveDuration();

      this.ctrlCurrentTime.textContent = this.formatTime(current);
      if (total > 0 && isFinite(total)) {
        this.ctrlTotalDuration.textContent = this.formatTime(total);
        const percent = (current / total) * 100;
        this.updateScrubberProgress(percent);
        this.checkNextEpisodeCountdown(current, total);
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
      let total = getEffectiveDuration();
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

    let total = typeof this.getEffectiveDuration === 'function' ? this.getEffectiveDuration() : (this.video?.duration || 0);
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
      this.ctrlVolumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMute();
      });
    }

    if (this.unmuteBadge) {
      this.unmuteBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.unmutePlayer();
      });
    }

    if (this.ctrlVolumeSlider) {
      this.ctrlVolumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.video.volume = val;
        this.video.muted = (val === 0);
        if (this.video.muted) {
          this._isUserMuted = true;
        } else {
          this._isUserMuted = false;
          this.hideUnmuteNotice();
        }
        this.syncVolumeUI();
        if (val > 0.05) {
          localStorage.setItem('netflix_volume', String(val));
        }
      });
    }

    const savedVol = localStorage.getItem('netflix_volume');
    if (savedVol !== null) {
      const v = parseFloat(savedVol);
      if (!isNaN(v) && v > 0.05 && v <= 1) {
        this.video.volume = v;
        if (this.ctrlVolumeSlider) this.ctrlVolumeSlider.value = v;
      } else {
        this.video.volume = 1;
        localStorage.setItem('netflix_volume', '1');
        if (this.ctrlVolumeSlider) this.ctrlVolumeSlider.value = 1;
      }
    } else {
      this.video.volume = 1;
      if (this.ctrlVolumeSlider) this.ctrlVolumeSlider.value = 1;
    }
    this.video.muted = false;
    this._isUserMuted = false;
    this._autoplayMuted = false;
    this.syncVolumeUI();
  }

  showUnmuteNotice() {
    if (!this.unmuteBadge) this.unmuteBadge = document.getElementById('playerUnmuteBadge');
    if (this.unmuteBadge) {
      this.unmuteBadge.classList.remove('hidden');
    }
  }

  hideUnmuteNotice() {
    if (!this.unmuteBadge) this.unmuteBadge = document.getElementById('playerUnmuteBadge');
    if (this.unmuteBadge) {
      this.unmuteBadge.classList.add('hidden');
    }
  }

  unmutePlayer(silent = false) {
    if (!this.video) return;
    this._autoplayMuted = false;
    this._isUserMuted = false;
    this.video.muted = false;
    const savedVol = localStorage.getItem('netflix_volume');
    const v = (savedVol !== null) ? parseFloat(savedVol) : 1;
    this.video.volume = (!isNaN(v) && v > 0.05) ? v : 1;
    this.syncVolumeUI();
    this.hideUnmuteNotice();
    if (!silent) {
      this.triggerCenterRipple('🔊');
    }
  }

  syncVolumeUI() {
    const isMuted = this.video ? (this.video.muted || this.video.volume === 0) : false;
    if (this.iconVolHigh) this.iconVolHigh.classList.toggle('hidden', isMuted);
    if (this.iconVolMuted) this.iconVolMuted.classList.toggle('hidden', !isMuted);

    if (this.ctrlVolumeSlider) {
      const val = isMuted ? 0 : (this.video ? this.video.volume : 1);
      this.ctrlVolumeSlider.value = val;
      this.ctrlVolumeSlider.style.background = `linear-gradient(to right, #e50914 ${val * 100}%, rgba(255,255,255,0.3) ${val * 100}%)`;
    }
  }

  toggleMute() {
    if (!this.video) return;
    this._autoplayMuted = false;
    this.video.muted = !this.video.muted;
    if (this.video.muted) {
      this._isUserMuted = true;
    } else {
      this._isUserMuted = false;
      const cur = this.video.volume;
      if (cur < 0.1) {
        this.video.volume = 1;
        localStorage.setItem('netflix_volume', '1');
      }
      this.hideUnmuteNotice();
    }
    this.syncVolumeUI();
    this.triggerCenterRipple(this.video.muted ? '🔇' : '🔊');
  }

  setVolumeRelative(delta) {
    if (!this.video) return;
    this._autoplayMuted = false;
    const cur = this.video.muted ? 0 : this.video.volume;
    const next = Math.max(0, Math.min(1, cur + delta));
    this.video.volume = next;
    this.video.muted = (next === 0);
    if (this.video.muted) {
      this._isUserMuted = true;
    } else {
      this._isUserMuted = false;
      this.hideUnmuteNotice();
    }
    if (next > 0.05) {
      localStorage.setItem('netflix_volume', String(next));
    }
    this.syncVolumeUI();
    this.triggerCenterRipple(`${Math.round(next * 100)}%`);
  }

  // ================= 4. VITESSE DE LECTURE =================
    // ================= CONTRÔLE DES SOUS-TITRES (CC) =================
  initSubtitlesEvents() {
    if (!this.ctrlSubtitlesBtn) return;
    this.ctrlSubtitlesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSubtitles();
    });
  }

  toggleSubtitles() {
    // 1. Gestion via moteur Hls.js
    if (this.hls && this.hls.subtitleTracks && this.hls.subtitleTracks.length > 0) {
      if (this.hls.subtitleTrack === -1) {
        this.hls.subtitleTrack = 0;
        if (this.ctrlSubtitlesBtn) this.ctrlSubtitlesBtn.classList.add('active');
        this.showToast('Sous-titres Français activés');
      } else {
        this.hls.subtitleTrack = -1;
        if (this.ctrlSubtitlesBtn) this.ctrlSubtitlesBtn.classList.remove('active');
        this.showToast('Sous-titres désactivés');
      }
      return;
    }

    // 2. Gestion via textTracks HTML5 natif
    if (this.video && this.video.textTracks && this.video.textTracks.length > 0) {
      let anyShowing = false;
      for (let i = 0; i < this.video.textTracks.length; i++) {
        if (this.video.textTracks[i].mode === 'showing') {
          anyShowing = true;
          break;
        }
      }
      const nextMode = anyShowing ? 'disabled' : 'showing';
      for (let i = 0; i < this.video.textTracks.length; i++) {
        this.video.textTracks[i].mode = nextMode;
      }
      if (this.ctrlSubtitlesBtn) {
        if (nextMode === 'showing') {
          this.ctrlSubtitlesBtn.classList.add('active');
          this.showToast('Sous-titres Français activés');
        } else {
          this.ctrlSubtitlesBtn.classList.remove('active');
          this.showToast('Sous-titres désactivés');
        }
      }
      return;
    }

    this.showToast('Aucun sous-titre disponible pour ce film');
  }

initSpeedEvents() {
    if (!this.ctrlSpeedBtn || !this.speedMenu) return;

    this.ctrlSpeedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('hidden');
       
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
    this.serverSelector.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'server-pill active vip-pill';
    btn.innerHTML = '<span class="pill-dot">● </span>Serveur ZIFLIX (Direct FHD)';
    this.serverSelector.appendChild(btn);
  }

  switchServer(serverNum = 1, preserveTime = true) {
    this.currentServer = 1;
    this.hideStatusBanner();
    this.updateServerPills();
    this.updateMetaDisplay();
    this.loadStream();
  }

  // ================= 7. NAVIGATION SAISONS & ÉPISODES =================
  async selectEpisode(season, episode) {
    if (!this.currentMovie) return;
    this.savePlaybackProgress(true);

    const sNum = parseInt(season, 10) || 1;
    const epNum = parseInt(episode, 10) || 1;

    console.log("[Player] Changement d'épisode fluide vers S" + sNum + ":E" + epNum);

    // 1. Réinitialisation propre sans détruire la balise vidéo
    this.resetPlayerState();
    this.currentSeason = sNum;
    this.currentEpisode = epNum;
    this._isLoadingStream = true;

    // 2. Mise à jour immédiate de l'affiche d'attente (Zéro écran noir ni image figée)
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

    // 3. Récupérer la progression sauvegardée pour cet épisode
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

    // 4. Mémoriser comme dernier épisode regardé pour cette série
    try {
      const showKey = 'netflix_ep_' + (this.currentMovie.id || this.currentMovie.tmdb_id || this.currentMovie.series_id);
      localStorage.setItem(showKey, JSON.stringify({ season: this.currentSeason, episode: this.currentEpisode }));
    } catch (e) {}

    if (this.seasonSelect) this.seasonSelect.value = String(this.currentSeason);
    if (this.episodeSelect) this.episodeSelect.value = String(this.currentEpisode);

    this.updateMetaDisplay();
    this.showLoader('Chargement Épisode ' + this.currentEpisode + '...');
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
        opt.textContent = `S${s.season_number}`;
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
        opt.textContent = `S${s}`;
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
        opt.textContent = `Épisode ${ep.episode_number}`;
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

  // ================= 8. GESTION DE L'INACTIVITÉ & DÉTECTION MOBILE =================
  isTouchDevice() {
    const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth <= 820;
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isFine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

    // Sur ordinateur ou laptop (écran > 820px ou souris/trackpad sans UA mobile) : toujours considéré comme PC / Laptop
    if (window.innerWidth > 820 && !isMobileUA) {
      return false;
    }

    // Appareil mobile uniquement si UA mobile ou (écran étroit ET pointeur tactile sans souris)
    return isMobileUA || (isSmallScreen && isCoarse && !isFine);
  }

  initInactivityTimer() {
    const showAndReset = () => {
      this.showControls();
    };

    if (this.overlay) {
      this.overlay.addEventListener('mousemove', showAndReset);
      this.overlay.addEventListener('touchstart', showAndReset, { passive: true });
      this.overlay.addEventListener('touchmove', showAndReset, { passive: true });
    }

    document.addEventListener('keydown', (e) => {
      if (!this.overlay || !this.overlay.classList.contains('active')) return;
      showAndReset();
    });
  }

  showControls() {
    if (!this.overlay) return;
    const wasIdle = this.overlay.classList.contains('user-idle');
    if (wasIdle) {
      this._controlsWokeUpAt = Date.now();
    }
    this.overlay.classList.remove('user-idle');
    clearTimeout(this.inactivityTimer);
    if (this.video && !this.video.paused) {
      const delay = (typeof this.isTouchDevice === 'function' && this.isTouchDevice()) ? 4000 : 3500;
      this.inactivityTimer = setTimeout(() => this.hideControls(), delay);
    }
  }

  hideControls() {
    if (!this.overlay) return;
    if (this.video && this.video.paused && !this.video.ended) return;
    if (this.isScrubbing) return;
    this.overlay.classList.add('user-idle');
  }


  initResponsiveLayout() {
    const adapt = () => this.adaptResponsiveLayout();
    adapt();
    window.addEventListener('resize', adapt);
    window.addEventListener('orientationchange', () => setTimeout(adapt, 150));
  }

  adaptResponsiveLayout() {
    const isMobile = window.innerWidth <= 900;
    const topBar = this.topBar || document.getElementById('playerTopBar');
    const bottomControls = document.getElementById('netflixBottomControls');
    const scrubberContainer = document.getElementById('scrubberContainer');
    const controlsLeft = document.querySelector('.controls-left');
    const controlsCenter = document.querySelector('.controls-center');
    const controlsRight = document.querySelector('.controls-right');
    const backBtn = this.backBtn || document.getElementById('playerBackBtn');
    const timer = this.playerWatchTimer || document.getElementById('playerWatchTimer');
    const rewindBtn = this.ctrlRewindBtn || document.getElementById('ctrlRewindBtn');
    const playBtn = this.ctrlPlayBtn || document.getElementById('ctrlPlayBtn');
    const forwardBtn = this.ctrlForwardBtn || document.getElementById('ctrlForwardBtn');
    const volumeContainer = this.volumeContainer || document.getElementById('volumeContainer');
    const timeReadout = document.querySelector('.time-readout');
    const commentsBtn = this.commentsToggleBtn || document.getElementById('playerCommentsToggleBtn');
    const episodeBox = this.episodeBox || document.getElementById('playerEpisodeBox');
    const fullscreenBtn = this.ctrlFullscreenBtn || document.getElementById('ctrlFullscreenBtn');

    if (!controlsLeft || !controlsCenter || !controlsRight) return;

    // Toujours s'assurer que ctrlNextEpBtn et ctrlFullscreenBtn sont bien ancrés dans controlsRight
    if (this.ctrlNextEpBtn && controlsRight && this.ctrlNextEpBtn.parentElement !== controlsRight) {
      controlsRight.appendChild(this.ctrlNextEpBtn);
    }
    if (fullscreenBtn && controlsRight && fullscreenBtn.parentElement !== controlsRight) {
      controlsRight.appendChild(fullscreenBtn);
    }

    if (isMobile) {
      // 1. Déplacer le timer pub ("le truc de la pub") dans la barre supérieure, DIRECTEMENT après le bouton retour
      if (timer && topBar && backBtn) {
        if (backBtn.nextSibling !== timer) {
          topBar.insertBefore(timer, backBtn.nextSibling);
        }
      }

      // 2. Déplacer timeReadout au-dessus du scrubberContainer pour ne jamais chevaucher le -10s
      if (timeReadout && bottomControls && scrubberContainer && timeReadout.parentElement !== bottomControls) {
        bottomControls.insertBefore(timeReadout, scrubberContainer);
      }

      // 3. Centrer le trio de lecture [ ↺ 10s ] [ ▶ / ❚❚ ] [ 10s ↻ ] dans controls-center
      if (rewindBtn && controlsCenter) {
        controlsCenter.appendChild(rewindBtn);
      }
      if (playBtn && controlsCenter) {
        controlsCenter.appendChild(playBtn);
      }
      if (forwardBtn && controlsCenter) {
        controlsCenter.appendChild(forwardBtn);
      }
    } else {
      // Mode Bureau (Desktop) : Restauration stricte de l'agencement d'origine
      if (playBtn && controlsLeft) {
        if (volumeContainer) controlsLeft.insertBefore(playBtn, volumeContainer);
        else controlsLeft.appendChild(playBtn);
      }
      if (rewindBtn && controlsLeft) {
        if (volumeContainer) controlsLeft.insertBefore(rewindBtn, volumeContainer);
        else controlsLeft.appendChild(rewindBtn);
      }
      if (forwardBtn && controlsLeft) {
        if (volumeContainer) controlsLeft.insertBefore(forwardBtn, volumeContainer);
        else controlsLeft.appendChild(forwardBtn);
      }
      if (timeReadout && controlsLeft && timeReadout.parentElement !== controlsLeft) {
        controlsLeft.appendChild(timeReadout);
      }

      if (timer && controlsCenter && timer.parentElement !== controlsCenter) {
        controlsCenter.appendChild(timer);
      }
    }
  }

  // ================= 9. OUVERTURE & FERMETURE DU LECTEUR =================
  async open(movie, initialServer = 1, season = null, episode = null) {
    this.resetPlayerState();
    this.loadIntroConfigs();
    this._currentIntroConfig = null;
    this._introAutoSkipped = false;
    window.isVideoPlaying = true;
    this.adaptResponsiveLayout();
    if (window.netflixApp && typeof window.netflixApp.pauseBackgroundTasks === 'function') {
      window.netflixApp.pauseBackgroundTasks();
    }
    if (window.app && typeof window.app.pauseBackgroundTasks === 'function') {
      window.app.pauseBackgroundTasks();
    }

    this.currentMovie = movie;
    this.currentEpisodeDuration = 0;

    if (this.video) {
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('webkit-playsinline', '');
      this._autoplayMuted = false;
      this._isUserMuted = false;
      this.video.muted = false;
      const savedVol = localStorage.getItem('netflix_volume');
      const v = (savedVol !== null) ? parseFloat(savedVol) : 1;
      this.video.volume = (!isNaN(v) && v > 0.05) ? v : 1;
      this.syncVolumeUI();
      this.hideUnmuteNotice();

      // DÉVERROUILLAGE GESTE AUDIO IMMÉDIAT
      try {
        const prime = this.video.play();
        if (prime !== undefined) {
          prime.catch(() => {});
        }
      } catch (e) {}
    }
    this.savedPlaybackTime = 0;

    this.overlay.classList.add('active');
    document.documentElement.classList.add('player-open');
    document.body.classList.add('player-open');
    this.showControls();

    const welcomeToast = document.getElementById('welcomeTimerModal');
    if (welcomeToast) welcomeToast.classList.add('hidden');

    this.iframe.classList.add('hidden');
    this.iframe.src = 'about:blank';
    this.video.classList.remove('hidden');

    if (this.titleDisplay) this.titleDisplay.textContent = movie.title || 'Lecture';
    if (this.ctrlMediaTitle) this.ctrlMediaTitle.textContent = movie.title || 'Lecture';
    this.currentMovieDuration = 0;
    if (movie.duration_secs) {
      this.currentMovieDuration = parseInt(movie.duration_secs, 10);
    } else if (movie.duration) {
      this.currentMovieDuration = this.parseDurationToSeconds(movie.duration);
    }
    const initialMovieDur = this.currentMovieDuration;
    if (initialMovieDur > 0 && this.ctrlTotalDuration) {
      this.ctrlTotalDuration.textContent = this.formatTime(initialMovieDur);
    }

    const isChannel = !!(movie.media_type === 'channel' || movie.is_live);
    const isXtreamSeries = !isChannel && (movie.is_xtream_series || movie.id === '68628' || movie.tmdb_id === '68628' || String(movie.id).startsWith('xtream_series_') || !!movie.series_id);
    const isSeries = !isChannel && (movie.media_type === 'series' || isXtreamSeries || (Array.isArray(movie.seasons) && movie.seasons.length > 0));

    if (isChannel) {
      if (this.episodeBox) {
        this.episodeBox.classList.add('hidden');
        this.episodeBox.style.display = 'none';
      }
      if (this.ctrlNextEpBtn) {
        this.ctrlNextEpBtn.classList.add('hidden');
        this.ctrlNextEpBtn.style.display = 'none';
      }
    }

    // 1. Pré-chargement immédiat et bloquant des saisons si absentes (évite le démarrage à vide)
    if (isSeries && (!movie.seasons || movie.seasons.length === 0)) {
      if (isXtreamSeries) {
        const sId = movie.series_id || ((movie.id === '68628' || movie.tmdb_id === '68628') ? '6715' : String(movie.id).replace('xtream_series_', ''));
        this.showLoader(`Chargement des épisodes officiels (${movie.title})...`);
        this.resetSteps();
        this.setStep(1, 'active', `1. Récupération des saisons et épisodes Xtream VIP (${movie.title})...`);
        try {
          const baseUrl = window.API_BASE || '';
          const r = await fetch(`${baseUrl}/api/xtream/series-info?series_id=${sId}`, {
            headers: this.getAuthHeaders(),
            credentials: 'include'
          });
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
      } else {
        // Série catalogue locale
        try {
          const baseUrl = window.API_BASE || '';
          const r = await fetch(`${baseUrl}/api/movies/${encodeURIComponent(movie.id)}`, {
            headers: this.getAuthHeaders(),
            credentials: 'include'
          });
          const json = await r.json();
          if (json?.data?.seasons?.length > 0) {
            movie.seasons = json.data.seasons;
            this.currentMovie.seasons = json.data.seasons;
          }
        } catch (e) {
          console.warn('[Player] Erreur chargement saisons locale:', e);
        }
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

        let epObj = (sObj.episodes && sObj.episodes.find(e => parseInt(e.episode_number || e.episode_num, 10) === parseInt(requestedEpisode, 10))) || (sObj.episodes && sObj.episodes[0]);
        this.currentEpisode = epObj ? parseInt(epObj.episode_number || epObj.episode_num, 10) : (parseInt(requestedEpisode, 10) || 1);
        if (epObj) {
          const epDur = this.parseDurationToSeconds(epObj.duration_secs || epObj.info?.duration_secs || epObj.duration || epObj.info?.duration || this.currentMovie.duration);
          if (epDur > 0) {
            this.currentEpisodeDuration = epDur;
          }
        }
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
      if (this.currentEpisodeDuration > 0 && this.ctrlTotalDuration) {
        this.ctrlTotalDuration.textContent = this.formatTime(this.currentEpisodeDuration);
      }
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
    if (posterImg && posterImg.startsWith('http://')) {
      const baseUrl = window.API_BASE || '';
      posterImg = `${baseUrl}/api/proxy-image?url=${encodeURIComponent(posterImg)}`;
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

    if (this.langSwitch) {
      this.langSwitch.style.display = 'none';
    }

    if (this.serverWrapper) {
      this.serverWrapper.style.display = 'none';
    }

    this.currentLang = 'vf';
    // Reprise de lecture intelligente & ??tanche par episode
    this.savedResumeTime = 0;
    try {
      const isSeries = (movie.media_type === 'series' || movie.is_xtream_series || !!movie.seasons || String(movie.id).startsWith('xtream_series_'));
      const list = JSON.parse(localStorage.getItem('ziflix_continue_watching')) || [];
      const saved = list.find(item => String(item.id) === String(movie.id));

      if (isSeries) {
        if (!season && !episode) {
          // Lancement g??n??ral de la s??rie (sans episode sp??cifi??) : reprendre l'episode m??moris??
          if (saved && saved.currentTime > 10 && (saved.progressPct || 0) < 95) {
            this.savedResumeTime = saved.currentTime;
            if (saved.season) season = saved.season;
            if (saved.episode) episode = saved.episode;
          }
        } else {
          // episode explicitement demand?? (clic modal, liste d'episodes, etc.)
          const targetS = season ? parseInt(season, 10) : 1;
          const targetE = episode ? parseInt(episode, 10) : 1;
          const epKey = `${movie.id}_s${targetS}_e${targetE}`;

          // 1. V??rifier si cet episode pr??cis a une progression sauvegard??e
          const epMap = JSON.parse(localStorage.getItem('ziflix_episodes_progress')) || {};
          const epProg = epMap[epKey];
          if (epProg && epProg.currentTime > 10 && (epProg.progressPct || 0) < 95) {
            this.savedResumeTime = epProg.currentTime;
          } else if (saved && parseInt(saved.season, 10) === targetS && parseInt(saved.episode, 10) === targetE && saved.currentTime > 10 && (saved.progressPct || 0) < 95) {
            this.savedResumeTime = saved.currentTime;
          } else {
            // episode diff??rent non entam?? : d??marrage ?? 0:00 absolu garanti
            this.savedResumeTime = 0;
          }
        }
      } else {
        // Film : reprise directe
        if (saved && saved.currentTime > 10 && (saved.progressPct || 0) < 95) {
          this.savedResumeTime = saved.currentTime;
        }
      }
    } catch (e) {}

    // Démarrage du Watch Timer Monetag
    this.startWatchTimer();

    // Verrouillage strict si le crédit est épuisé (0 min)
    if (!this.isVipOrAdmin() && this.getWatchCredit() <= 0) {
      this.currentServer = 1;
      this.updateMetaDisplay();
      this.stopWatchTimer();
    this.dismissNextEpisodeCard();
      if (this.video) {
        try { this.video.pause(); } catch (e) {}
      }
      this.hideLoader();
      if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
      if (this.timerExpiredModal) this.timerExpiredModal.classList.remove('hidden');
      this.showToast('⏱ Votre temps gratuit est écoulé. Rechargez +20m pour regarder.');
      return;
    }

    this.currentServer = 1;
    this.updateMetaDisplay();
    this._isLoadingStream = true;
    this.loadStream();
  }


  // Réinitialisation et destruction étanche du lecteur (Teardown complet)
  resetPlayerState() {
    console.log('[Player] Teardown & reset complet du lecteur');

    // 1. Stopper les requêtes d'extraction en cours
    if (this.activeExtractionAbort) {
      try { this.activeExtractionAbort.abort(); } catch (e) {}
      this.activeExtractionAbort = null;
    }
    if (this.streamAbortController) {
      try { this.streamAbortController.abort(); } catch (e) {}
      this.streamAbortController = null;
    }

    // 2. Nettoyage de la session active (beacon /api/stream/stop, Hls.destroy, etc.)
    this.cleanupActivePlayback();

    // 3. Vidage physique et décharge totale de la balise vidéo (SANS video.load() bloquant les transitions)
    if (this.video) {
      try {
        this.video.pause();
        this.video.removeAttribute('src');
        if (this.video.srcObject) this.video.srcObject = null;
      } catch (e) {}
    }

    // 4. Nettoyage de l'iframe de secours
    if (this.iframe) {
      this.iframe.src = 'about:blank';
      this.iframe.classList.add('hidden');
    }

    // 5. Remise à zéro visuelle immédiate des contrôles
    if (this.scrubberPlayed) this.scrubberPlayed.style.width = '0%';
    if (this.scrubberBuffered) this.scrubberBuffered.style.width = '0%';
    if (this.scrubberThumb) this.scrubberThumb.style.left = '0%';
    if (this.ctrlCurrentTime) this.ctrlCurrentTime.textContent = '00:00';
    if (this.ctrlTotalDuration) this.ctrlTotalDuration.textContent = '00:00';
    if (this.iconPlay) this.iconPlay.classList.remove('hidden');
    if (this.iconPause) this.iconPause.classList.add('hidden');
    if (this.centerIconPlay) this.centerIconPlay.classList.remove('hidden');
    if (this.centerIconPause) this.centerIconPause.classList.add('hidden');

    // 6. Masquer et réinitialiser le bouton Skip Intro
    this.hideSkipIntroButton();
    this._introAutoSkipped = false;

    // 7. Réinitialiser les états et compteurs de lecture
    this.currentEpisodeDuration = 0;
    this.savedPlaybackTime = 0;
    this.savedResumeTime = 0;
    this._isLoadingStream = false;
    this._autoplayMuted = false;
    this._hasStartedPlaying = false;
  }

  // =============== GESTION DU SAUT D'INTRO (SKIP INTRO) ===============

  async loadIntroConfigs() {
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/intro-configs`);
      const data = await res.json();
      if (data.success && Array.isArray(data.configs)) {
        this._introConfigs = data.configs;
      }
    } catch(e) {
      console.warn('[Player] Impossible de charger les configurations d\'intro:', e);
    }
  }

  getActiveIntroConfig() {
    if (!this.currentMovie || !Array.isArray(this._introConfigs)) return null;
    const movieId = String(this.currentMovie.id || '').trim();
    const seriesId = String(this.currentMovie.series_id || '').trim();
    const tmdbId = String(this.currentMovie.tmdb_id || '').trim();
    const title = (this.currentMovie.title || '').toLowerCase().trim();
    const curSeason = parseInt(this.currentSeason, 10) || 1;

    return this._introConfigs.find(c => {
      // 1. Correspondance du média (ID, series_id, tmdb_id ou nom)
      const cMediaId = String(c.media_id || '').trim();
      const cTitle = (c.media_title || '').toLowerCase().trim();
      const matchMedia = (cMediaId && (cMediaId === movieId || cMediaId === seriesId || cMediaId === tmdbId || movieId.endsWith('_' + cMediaId))) ||
                         (cTitle && title && (cTitle === title || title.includes(cTitle) || cTitle.includes(title)));
      if (!matchMedia) return false;

      // 2. Correspondance de la saison
      if (!c.season_number || c.season_number === 'all' || c.season_number === 0) return true;
      return parseInt(c.season_number, 10) === curSeason;
    }) || null;
  }

  checkSkipIntro(currentTime) {
    if (!this._currentIntroConfig) {
      this._currentIntroConfig = this.getActiveIntroConfig();
    }
    const config = this._currentIntroConfig;
    if (!config || !config.intro_end || config.intro_end <= 0) {
      this.hideSkipIntroButton();
      return;
    }

    const start = config.intro_start || 0;
    const end = config.intro_end;

    if (currentTime >= start && currentTime < end) {
      if (config.auto_skip && !this._introAutoSkipped) {
        this._introAutoSkipped = true;
        if (typeof this.applySeek === 'function') {
          this.applySeek(end);
        } else if (this.video) {
          this.video.currentTime = end;
        }
        this._isUserPaused = false;
        if (this.video) {
          try { this.video.play().catch(() => {}); } catch(e) {}
        }
        this.hideSkipIntroButton();
        this.showToast('⏩ Intro passée automatiquement');
        return;
      }
      this.showSkipIntroButton();
    } else {
      this.hideSkipIntroButton();
    }
  }

  showSkipIntroButton() {
    if (this.skipIntroBtn && this.skipIntroBtn.classList.contains('hidden')) {
      this.skipIntroBtn.classList.remove('hidden');
    }
  }

  hideSkipIntroButton() {
    if (this.skipIntroBtn && !this.skipIntroBtn.classList.contains('hidden')) {
      this.skipIntroBtn.classList.add('hidden');
    }
  }

  skipIntro() {
    if (!this._currentIntroConfig) {
      this._currentIntroConfig = this.getActiveIntroConfig();
    }
    if (this._currentIntroConfig && this._currentIntroConfig.intro_end && this.video) {
      const target = this._currentIntroConfig.intro_end;
      if (typeof this.applySeek === 'function') {
        this.applySeek(target);
      } else if (this.video) {
        this.video.currentTime = target;
      }
      this._isUserPaused = false;
      if (this.video) {
        try { this.video.play().catch(() => {}); } catch(e) {}
      }
      this.hideSkipIntroButton();
      this.showToast('⏩ Intro passée');
    }
  }

  // Nettoyage complet et étanche de la session de streaming en cours
  cleanupActivePlayback() {
    try {
      const epId = this.currentEpisode?.id || this.currentMovie?.id;
      const mType = this.currentEpisode ? 'series' : (this.currentMovie?.media_type || (this.currentMovie?.is_live ? 'live' : 'movie'));
      if (epId && navigator.sendBeacon) {
        navigator.sendBeacon('/api/stream/stop?type=' + encodeURIComponent(mType) + '&media_id=' + encodeURIComponent(epId));
      }
    } catch(e) {}
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
        if (this.video.srcObject) this.video.srcObject = null;
      } catch (e) {}
    }
  }

  close() {
    this.savePlaybackProgress(true);
    this.stopWatchTimer();
    this.dismissNextEpisodeCard();
    this.resetPlayerState();
    if (this.video) {
      try {
        this.video.load();
      } catch (e) {}
    }

    if (this.backdrop) {
      this.backdrop.classList.remove('fade-out');
      this.backdrop.style.display = 'none';
      this.backdrop.style.backgroundImage = 'none';
    }

    if (this.iframe) {
      this.iframe.src = 'about:blank';
      this.iframe.classList.add('hidden');
    }

    this.hideUnmuteNotice();
    this._autoplayMuted = false;
    this._isLoadingStream = false;
    this.hideLoader();
    this.hideStatusBanner();
    if (this.commentsDrawer) {
      this.commentsDrawer.classList.add('hidden');
    }
    this.overlay.classList.remove('active', 'user-idle');
    document.documentElement.classList.remove('player-open');
    document.body.classList.remove('player-open');
    try {
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    } catch (e) {}
    clearTimeout(this.inactivityTimer);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen().catch(() => {});
    } else if (this.video && typeof this.video.webkitExitFullscreen === 'function') {
      try { this.video.webkitExitFullscreen(); } catch (e) {}
    }

    window.isVideoPlaying = false;
    if (window.netflixApp && typeof window.netflixApp.resumeBackgroundTasks === 'function') {
      window.netflixApp.resumeBackgroundTasks();
    }
    if (window.app && typeof window.app.resumeBackgroundTasks === 'function') {
      window.app.resumeBackgroundTasks();
    }
    if (window.netflixApp && typeof window.netflixApp.checkWelcomeTimerModal === 'function') {
      window.netflixApp.checkWelcomeTimerModal();
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

    // Verrouillage strict si crédit épuisé (0s)
    if (!this.isVipOrAdmin() && this.getWatchCredit() <= 0) {
      this.hideLoader();
      if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
      if (this.timerExpiredModal) this.timerExpiredModal.classList.remove('hidden');
      this.showToast('⏱ Votre temps gratuit est écoulé. Rechargez +20m pour regarder.');
      return;
    }

    // A. Chemin Rapide : Chaîne Xtream Live TV
    if (this.currentMovie && this.currentMovie.stream_url && (this.currentMovie.is_xtream || this.currentMovie.stream_url.includes('/api/stream/xtream'))) {
      const baseUrl = window.API_BASE || '';
      let streamUrl = this.currentMovie.stream_url;
      if (streamUrl.startsWith('/')) streamUrl = baseUrl + streamUrl;

      this.showLoader(`Connexion au flux direct ${this.currentMovie.title} (Xtream VIP)...`);
      this.resetSteps();
      this.setStep(1, 'done', `1. Chaîne Xtream validée (${this.currentMovie.title})`);
      this.setStep(2, 'done', `2. Flux direct obtenu (Xtream VIP 1080p)`);
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

      // Détection Mobile (Android & iOS) / Safari : Moteur HLS natif
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || isApple || (navigator.platform === 'MacIntel' && !/Chrome|CriOS/i.test(navigator.userAgent));
      const canPlayMkv = (this.video.canPlayType('video/x-matroska') !== '' || this.video.canPlayType('video/mkv') !== '');
      const needsHls = (isMobile || !canPlayMkv || isSafari || isApple);

      if (epObj && epStreamUrl && (!isHevc || browserCanPlayHevc)) {
        this.currentSeason = parseInt(sObj.season_number, 10);
        this.currentEpisode = parseInt(epObj.episode_number, 10);
        this.currentEpisodeDuration = this.parseDurationToSeconds(epObj.duration_secs || epObj.info?.duration_secs || epObj.duration || epObj.info?.duration || this.currentMovie.duration);
        if (this.currentEpisodeDuration > 0 && this.ctrlTotalDuration) {
          this.ctrlTotalDuration.textContent = this.formatTime(this.currentEpisodeDuration);
        }

        const baseUrl = window.API_BASE || '';
        let targetStreamUrl = epStreamUrl;
        if (targetStreamUrl.startsWith('/')) targetStreamUrl = baseUrl + targetStreamUrl;

        // Séries Xtream : Moteur HLS multi-qualités universel (PC & mobile) avec PRIORITÉ VIDMOLY CLOUD
        if (targetStreamUrl.includes('/api/stream/xtream-series')) {
          const epId = epObj.id || epObj.episode_id || (targetStreamUrl.match(/episode_id=([^&]+)/)?.[1]);
          if (epId) {
            const startParam = (this.savedResumeTime > 10) ? `?start=${Math.floor(this.savedResumeTime)}` : '';
            const hlsUrl = `${baseUrl}/api/stream/xtream-series-hls/${epId}/master.m3u8${startParam}`;

            // Priorité Vidmoly Cloud : Injection directe HLS dans le lecteur Netflix ZIFLIX (0 pub, 0 iframe)
            const vCode = epObj.vidmoly_file_code || (window.vidmolyMap && epId && window.vidmolyMap[epId]);
            if (vCode) {
              this.showLoader(`Connexion Vidmoly Cloud ${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode}...`);
              this.resetSteps();
              this.setStep(1, 'done', `1. Épisode validé (${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode})`);
              this.setStep(2, 'done', `2. Source Vidmoly Cloud sélectionnée (720p HD)`);
              this.setStep(3, 'done', `3. Déportation CDN Cloud (0% CPU VPS)`);
              this.setStep(4, 'active', `4. Injection dans le lecteur ZIFLIX...`);

              const vidmolyStartParam = (this.savedResumeTime > 10) ? `&start=${Math.floor(this.savedResumeTime)}` : '';
              const vidmolyStreamUrl = `${baseUrl}/api/stream/vidmoly/${vCode}/playlist.m3u8?episode_id=${encodeURIComponent(epId)}${vidmolyStartParam}`;
              this.playDirectHls(vidmolyStreamUrl, { isVidmoly: true, fallbackEpisodeId: epId, startPosition: this.savedResumeTime });
              return;
            }

            this.showLoader(`Connexion au flux direct HLS ${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode}...`);
            this.resetSteps();
            this.setStep(1, 'done', `1. Épisode validé (${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode})`);
            this.setStep(2, 'done', `2. Flux direct obtenu (1080p FHD • ZIFLIX HLS Ultra-Fluide)`);
            this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
            this.setStep(4, 'active', `4. Injection dans le lecteur ZIFLIX...`);
            this.playDirectHls(hlsUrl, { startPosition: this.savedResumeTime });
            return;
          }
        }

        this.showLoader(`Connexion au flux direct ${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode}...`);
        this.resetSteps();
        this.setStep(1, 'done', `1. Épisode validé (${this.currentMovie.title} S${this.currentSeason}:E${this.currentEpisode})`);
        this.setStep(2, 'done', `2. Flux direct obtenu (1080p FHD)`);
        this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
        this.setStep(4, 'active', `4. Injection dans le lecteur ZIFLIX...`);
        this.playDirectVideo(targetStreamUrl);
        return;
      }

      if (!epObj || !epStreamUrl) {
        this.showStatusBanner(`Épisode S${this.currentSeason}:E${this.currentEpisode} indisponible sur le serveur.`);
        return;
      }

      if (isHevc && !browserCanPlayHevc) {
        console.log(`[Player] Flux direct HEVC détecté (${epCodec}) sans support natif navigateur. Redirection automatique vers /api/extract avec flux HLS compatible...`);
      }
    }

    
        const isChannel = (this.currentMovie.media_type === 'channel' || this.currentMovie.is_live);
    const isMovie = (this.currentMovie.media_type === 'movie');
    const mediaType = isChannel ? 'channel' : (isMovie ? 'movie' : 'series');
    const s = this.currentSeason;
    const e = this.currentEpisode;

    // B2. Chemin Ultra-Rapide : Films Xtream VOD (Démarrage immédiat sans requête /api/extract)
    const movieStreamId = this.currentMovie.stream_id ||
                          (this.currentMovie.video_url && this.currentMovie.video_url.match(/stream_id=([^&]+)/)?.[1]) ||
                          (String(this.currentMovie.id || '').startsWith('xtream_vod_') ? String(this.currentMovie.id).replace('xtream_vod_', '') : null);
    const isXtreamMovie = !!movieStreamId || this.currentMovie.is_xtream_movie || (this.currentMovie.video_url && this.currentMovie.video_url.includes('xtream-movie'));

    if (isMovie && isXtreamMovie && movieStreamId) {
      const ext = this.currentMovie.container_extension || (this.currentMovie.video_url && this.currentMovie.video_url.match(/ext=([^&]+)/)?.[1]) || 'mkv';
      const baseUrl = window.API_BASE || '';
      const startParam = (this.savedResumeTime > 10) ? `?start=${Math.floor(this.savedResumeTime)}&ext=${ext}` : `?ext=${ext}`;
      const hlsMovieUrl = `${baseUrl}/api/stream/xtream-movie-hls/${movieStreamId}/master.m3u8${startParam}`;

      this.showLoader(`Connexion au film ${this.currentMovie.title} (1080p FHD)...`);
      this.resetSteps();
      this.setStep(1, 'done', `1. Film validé (${this.currentMovie.title})`);
      this.setStep(2, 'done', `2. Flux direct obtenu (1080p FHD • ZIFLIX HLS Ultra-Fluide)`);
      this.setStep(3, 'done', `3. Déchiffrement direct & Proxy local anti-pub`);
      this.setStep(4, 'active', `4. Injection dans le lecteur ZIFLIX...`);
      this.playDirectHls(hlsMovieUrl, { startPosition: this.savedResumeTime });
      return;
    }

    // C. Chemin Standard : Extraction API (/api/extract)
    let id = this.currentMovie.tmdb_id || this.currentMovie.id;
    if (this.currentMovie.is_xtream_series || this.currentMovie.series_id || (this.currentMovie.id && String(this.currentMovie.id).startsWith('xtream_series_'))) {
      id = this.currentMovie.id || `xtream_series_${this.currentMovie.series_id}`;
    }

    this.showLoader(isChannel ? `Connexion au direct ${this.currentMovie.title}...` : `Connexion au flux direct...`);
    this.resetSteps();
    this.setStep(1, 'active', `1. Résolution de la source (${this.currentMovie.title})...`);

    const abortController = new AbortController();
    this.activeExtractionAbort = abortController;

    try {
      const baseUrl = window.API_BASE || '';
      const seriesIdParam = this.currentMovie.series_id ? `&series_id=${encodeURIComponent(this.currentMovie.series_id)}` : '';
      const titleParam = this.currentMovie.title ? `&title=${encodeURIComponent(this.currentMovie.title)}` : '';
      const url = `${baseUrl}/api/extract?id=${encodeURIComponent(id)}&type=${mediaType}&season=${s}&episode=${e}&server=1&lang=vf&fallback=1${seriesIdParam}${titleParam}`;
      const res = await fetch(url, {
        signal: abortController.signal,
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });
      const data = await res.json();

      if (!data.success && data.needsSeriesInfo && data.series_id) {
        const siRes = await fetch(`${baseUrl}/api/xtream/series-info?series_id=${data.series_id}`, {
          signal: abortController.signal,
          headers: this.getAuthHeaders(),
          credentials: 'include'
        });
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

      if (data.duration_secs) {
        this.currentMovieDuration = parseInt(data.duration_secs, 10);
      } else if (data.duration) {
        const d = this.parseDurationToSeconds(data.duration);
        if (d > 0) this.currentMovieDuration = d;
      }
      this.setStep(1, 'done', `1. Source validée (${this.currentMovie.title})`);
      this.setStep(2, 'done', `2. Flux direct obtenu (${data.quality || '1080p FHD'})`);
      this.setStep(3, 'done', `3. Déchiffrement direct validé`);
      this.setStep(4, 'active', `4. Injection dans le lecteur ZIFLIX...`);

      if (data.vidmoly_file_code) {
        this.setStep(2, 'active', `2. Connexion Vidmoly Cloud (720p HD)...`);
        const vidmolyStreamUrl = `${baseUrl}/api/stream/vidmoly/${data.vidmoly_file_code}/playlist.m3u8?episode_id=${encodeURIComponent(data.id || data.episode_id || '')}`;
        this.setStep(2, 'done', `2. Flux Vidmoly Cloud obtenu (720p HD)`);
        this.setStep(3, 'done', `3. Déportation CDN Cloud (0% CPU VPS)`);
        this.setStep(4, 'active', `4. Injection dans le lecteur ZIFLIX...`);
        this.playDirectHls(vidmolyStreamUrl, { isVidmoly: true, fallbackEpisodeId: (data.id || data.episode_id) });
        return;
      }

      let targetStreamUrl = data.stream_url || data.embed_url;
      if (targetStreamUrl && targetStreamUrl.startsWith('/')) {
        targetStreamUrl = baseUrl + targetStreamUrl;
      }

      if (isChannel || data.player_type === 'direct_hls' || (targetStreamUrl && targetStreamUrl.includes('.m3u8'))) {
        this.playDirectHls(targetStreamUrl);
      } else if (targetStreamUrl.includes('/api/stream/xtream-series')) {
        const epMatch = targetStreamUrl.match(/episode_id=([^&]+)/);
        if (epMatch) {
          const startParam = (this.savedResumeTime > 10) ? `?start=${Math.floor(this.savedResumeTime)}` : '';
          this.playDirectHls(`${baseUrl}/api/stream/xtream-series-hls/${epMatch[1]}/master.m3u8${startParam}`, { startPosition: this.savedResumeTime });
        } else {
          this.playDirectVideo(targetStreamUrl);
        }
      } else if (data.player_type === 'direct_video') {
        this.playDirectVideo(targetStreamUrl);
      } else if (data.player_type === 'iframe' || data.is_embed) {
        this.playEmbedIframe(data.embed_url || targetStreamUrl);
      } else {
        this.playDirectHls(targetStreamUrl);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('[ZIFLIX Player] Erreur extraction :', err.message);

      const isXtreamSeries = (this.currentMovie && (this.currentMovie.is_xtream_series || this.currentMovie.id === '68628' || String(this.currentMovie.id).startsWith('xtream_series_')));
      if (isXtreamSeries) {
        this.showStatusBanner(`Épisode S${this.currentSeason}:E${this.currentEpisode} indisponible (${err.message}). Cliquez sur Réessayer.`);
        return;
      }

      this.showStatusBanner(`Flux temporairement indisponible (${err.message || 'Erreur'}). Cliquez sur Réessayer.`);
    }
  }

  // ================= 11. MOTEUR LIVE HLS & VOD (Hls.js) =================
    async extractVidmolyDirectStream(fileCode) {
    if (!fileCode) return null;
    try {
      console.log(`[ZIFLIX Player] Tentative d'extraction Vidmoly Cloud pour ${fileCode}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`https://vidmoly.org/embed-${fileCode}.html`, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      let html = await res.text();

      if (html.includes('eval(function(p,a,c,k,e,d)')) {
        const regex = /\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\),\s*(\d+),\s*(\{.*\}|\{\}\))/;
        const m = html.match(regex);
        if (m) {
          let [ , p, a, c, k ] = m;
          a = parseInt(a, 10);
          c = parseInt(c, 10);
          k = k.split('|');
          const e = (x) => (x < a ? '' : e(Math.floor(x / a))) + ((x = x % a) > 35 ? String.fromCharCode(x + 29) : x.toString(36));
          while (c--) {
            if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
          }
          html = p;
        }
      }

      const match = html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
                 || html.match(/file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
                 || html.match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/i);
      if (match && match[1]) {
        console.log('[ZIFLIX Player] Flux Vidmoly Cloud extrait avec succès:', match[1]);
        return match[1];
      }
    } catch (err) {
      console.warn('[ZIFLIX Player] Erreur extraction Vidmoly client:', err.message);
    }
    return null;
  }

playDirectHls(streamUrl, options = {}) {
    if (!this._globalUnmuteListenerBound) {
      this._globalUnmuteListenerBound = true;
      const onUserInteraction = () => {
        if (this._autoplayMuted && this.video && !this.video.paused) {
          this.unmutePlayer();
        }
      };
      window.addEventListener('click', onUserInteraction, { capture: true, passive: true });
      window.addEventListener('touchstart', onUserInteraction, { capture: true, passive: true });
      window.addEventListener('keydown', onUserInteraction, { capture: true, passive: true });
    }
    const isVidmoly = !!(streamUrl && (streamUrl.includes('vmnow') || streamUrl.includes('vidmoly') || options.isVidmoly));
    // quality removed
    const baseUrl = window.API_BASE || '';
    if (streamUrl && streamUrl.startsWith('/')) streamUrl = baseUrl + streamUrl;

    const authToken = localStorage.getItem('ziflix_auth_token');
    if (authToken && streamUrl && (streamUrl.includes('/api/stream/') || streamUrl.startsWith(baseUrl)) && !streamUrl.includes('auth_token=')) {
      const sep = streamUrl.includes('?') ? '&' : '?';
      streamUrl = `${streamUrl}${sep}auth_token=${encodeURIComponent(authToken)}`;
    }
    if (streamUrl && streamUrl.includes('/api/stream/xtream-series-hls/') && streamUrl.includes('master.m3u8') && !streamUrl.includes('/1080/') && !streamUrl.includes('/720/') && !streamUrl.includes('/480/')) {
      streamUrl = streamUrl.replace('playlist.m3u8', 'master.m3u8');
    }
    this._currentHlsUrl = streamUrl;
    if (!streamUrl.includes('transcode_audio=1')) {
      this._audioTranscodeRecovery = false;
    }
    if (!streamUrl.includes('transcode_video=1')) {
      this._videoTranscodeRecovery = false;
    }
    const startMatch = streamUrl.match(/[?&]start=(\d+)/);
    const startSec = (options.startPosition !== undefined && options.startPosition > 0) ? options.startPosition : (startMatch ? parseInt(startMatch[1], 10) : (this.savedResumeTime > 0 ? this.savedResumeTime : 0));
    this._hlsStreamOffset = isVidmoly ? 0 : startSec;

    if (startSec > 300 && streamUrl.includes('/api/stream/xtream-movie-hls/') && !streamUrl.includes('start=')) {
      const sep = streamUrl.includes('?') ? '&' : '?';
      streamUrl = `${streamUrl}${sep}start=${Math.floor(startSec)}`;
      this._currentHlsUrl = streamUrl;
    }

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
      hasReadied = true;
      this._isLoadingStream = false;
      this.setStep(4, 'done', `4. Flux connecté • Lecture fluide 1080p`);
      this.hideLoader();
      this.hideStatusBanner();
      if (this.backdrop) {
        this.backdrop.classList.add('fade-out');
        setTimeout(() => {
          if (this.backdrop) {
            this.backdrop.style.display = 'none';
            this.backdrop.classList.remove('fade-out');
          }
        }, 200);
      }
    };

    this.video.addEventListener('playing', () => onReady(), { signal });
    this.video.addEventListener('timeupdate', () => {
      if (this.video.currentTime > 0) onReady();
    }, { signal });

    // Sécurité : masquer le loader et poster uniquement après 15s si lecture active ou timeout
    const readySafetyTimer = setTimeout(() => {
      if (!hasReadied && this.video && (this.video.currentTime > 0 || this.video.readyState >= 3)) {
        onReady();
      }
    }, 15000);
    signal.addEventListener('abort', () => clearTimeout(readySafetyTimer));

    // Avertissement doux si le chargement dépasse 12s, sans jamais masquer prématurément le poster d'attente
    const slowLoadTimer = setTimeout(() => {
      if (!hasReadied) {
        this.showStatusBanner("Le flux met un peu de temps à démarrer. Patientez ou cliquez sur Réessayer.");
      }
    }, 12000);
    signal.addEventListener('abort', () => clearTimeout(slowLoadTimer));

    const isChannel = !!(this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);

    // Protection Anti-Rollback / Anti-Boucle Xtream pour Live TV (Tolérance sécurisée)
    if (isChannel) {
      this.lastLiveMaxTime = 0;
      this._antiLoopStallCount = 0;
      this._antiLoopHandler = () => {
        if (!this.video.paused && !this.video.seeking) {
          const cur = this.video.currentTime;
          if (cur > this.lastLiveMaxTime) {
            this.lastLiveMaxTime = cur;
          }
        }
      };
      this.video.addEventListener('timeupdate', this._antiLoopHandler, { signal });
    }

    if (window.Hls && Hls.isSupported()) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // Configuration étanche et séparée : Live TV vs VOD avec réglages optimisés PC vs Mobile
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
        backBufferLength: isMobile ? 15 : 30,           // 15s mobile / 30s PC
        maxBufferLength: isMobile ? 25 : 40,            // 25s mobile / 40s PC (tampon solide)
        maxMaxBufferLength: isMobile ? 50 : 80,         // 50s mobile / 80s PC
        maxBufferSize: (isMobile ? 40 : 80) * 1024 * 1024,
        maxBufferHole: 1.0,
        highBufferWatchdogPeriod: 0.8,
        lowBufferWatchdogPeriod: 0.4,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 6,
        maxFragLookUpTolerance: 0.35,
        fragLoadingTimeOut: 12000,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 5,
        fragLoadingRetryDelay: 400,
        fragLoadingMaxRetryTimeout: 8000,
        manifestLoadingMaxRetryTimeout: 6000,
        abrEwmaFastLive: 2.0,
        abrEwmaSlowLive: 7.0,
        abrEwmaDefaultEstimate: isMobile ? 2500000 : 6000000 // 6 Mbps sur PC pour qualité maximale
      } : {
        // === MODE VOD (Séries & Films : FrenchStream, Vidzy, Fsvid, Xtream VOD) ===
        enableWorker: true,
        lowLatencyMode: false,
        liveDurationInfinity: false,
        startPosition: (startSec > 0 ? startSec : 0),
        startLevel: -1,
        capLevelToPlayerSize: false,
        startFragPrefetch: true,
        progressive: false,
        backBufferLength: isMobile ? 20 : 60,           // 20s mobile / 60s PC (retour arrière instantané)
        maxBufferLength: isMobile ? 35 : 90,            // 35s mobile / 90s PC (coussin profond anti-coupure)
        maxMaxBufferLength: isMobile ? 70 : 180,        // 70s mobile / 180s (3 min) PC
        maxBufferSize: (isMobile ? 50 : 128) * 1024 * 1024, // 50 Mo mobile / 128 Mo PC
        maxBufferHole: 1.5,                             // Enjambe les micro-décalages
        highBufferWatchdogPeriod: 0.8,                  // Réagit en 800ms
        lowBufferWatchdogPeriod: 0.4,
        nudgeOffset: 0.3,                               // Franchit les trous sans freeze
        nudgeMaxRetry: 10,
        maxFragLookUpTolerance: 0.5,
        fragLoadingTimeOut: 15000,
        manifestLoadingTimeOut: 12000,
        levelLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 5,
        fragLoadingRetryDelay: 400,
        fragLoadingMaxRetryTimeout: 8000,
        manifestLoadingMaxRetryTimeout: 6000,
        abrEwmaFastVoD: 2.0,
        abrEwmaSlowVoD: 6.0,
        abrEwmaDefaultEstimate: isMobile ? 2500000 : 8000000 // 8 Mbps sur PC pour 1080p FHD net dès la 1ère seconde
      };

      hlsConfig.xhrSetup = (xhr, url) => {
        const isInternal = !url.startsWith('http') || url.includes('ziablo.xyz') || url.includes('127.0.0.1');
        if (isInternal) {
          xhr.withCredentials = true;
          if (authToken) {
            try {
              xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
              xhr.setRequestHeader('x-auth-token', authToken);
            } catch (e) {}
          }
        } else {
          xhr.withCredentials = false;
        }
        if (url && (url.includes('.m3u8') || url.includes('/playlist') || url.includes('/master'))) {
          xhr.addEventListener('load', () => {
            try {
              const totalDurHeader = xhr.getResponseHeader('X-Total-Duration') || xhr.getResponseHeader('x-total-duration');
              if (totalDurHeader) {
                const d = parseInt(totalDurHeader, 10);
                if (d > 0) {
                  const isChan = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
                  if (!isChan) {
                    if (isSeries && this.currentEpisodeDuration <= 0) {
                      this.currentEpisodeDuration = d;
                    } else if (!isSeries && this.currentMovieDuration <= 0) {
                      this.currentMovieDuration = d;
                    }
                    const eff = this.getEffectiveDuration();
                    if (eff > 0 && this.ctrlTotalDuration) {
                      this.ctrlTotalDuration.textContent = this.formatTime(eff);
                    }
                  }
                }
              }
            } catch (e) {}
          });
        }
      };

      const hls = new Hls(hlsConfig);
      this.hls = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(this.video);

      if (startSec > 0) {
        hlsConfig.startPosition = startSec;
      }

      const updateSubtitlesUI = () => {
        if (!this.ctrlSubtitlesBtn) return;
        const tracks = hls.subtitleTracks || [];
        if (tracks.length > 0) {
          this.ctrlSubtitlesBtn.classList.remove('hidden');
          const isVostfr = (this.currentMovie?.lang === 'vostfr' || (this.currentMovie?.title || '').toLowerCase().includes('vostfr'));
          if (isVostfr && hls.subtitleTrack === -1) {
            hls.subtitleTrack = 0;
            this.ctrlSubtitlesBtn.classList.add('active');
          }
        } else {
          this.ctrlSubtitlesBtn.classList.add('hidden');
        }
      };

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, updateSubtitlesUI);
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (e, data) => {
        if (this.ctrlSubtitlesBtn) {
          if (data && data.id >= 0) this.ctrlSubtitlesBtn.classList.add('active');
          else this.ctrlSubtitlesBtn.classList.remove('active');
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        updateSubtitlesUI();
        this.setStep(3, 'done', `3. Playlist & fragments HLS initialisés`);
        this.setStep(4, 'active', `4. Démarrage fluide du flux vidéo...`);
        
        const isTargetedStream = streamUrl.includes('/720/') || streamUrl.includes('/480/') || streamUrl.includes('/1080/');
        if (!this._isQualitySwitching && !isTargetedStream && hls.levels && hls.levels.length > 0) {
          // quality removed
          if (this.currentQuality === -1) {
            hls.currentLevel = -1;
          } else {
            // quality removed
          }
        }

        let hasStartedPlay = false;
        const startVideoPlayback = () => {
          if (hasStartedPlay) return;
          hasStartedPlay = true;

          const targetStart = (startSec > 0) ? startSec : 0;
          if (!isChannel && targetStart > 0 && Math.abs((this.video.currentTime || 0) - targetStart) > 2) {
            this.video.currentTime = targetStart;
          }
          this.savedResumeTime = 0;

          if (options.keepPlayback !== false && !this._isUserPaused) {
            const playPromise = this.video.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                this._autoplayMuted = false;
                this.hideUnmuteNotice();
              }).catch(err => {
                console.warn('[Player] Autoplay avec son restreint par le navigateur, démarrage en muet :', err.message);
                this._autoplayMuted = true;
                this.video.muted = true;
                this.syncVolumeUI();
                this.showUnmuteNotice();
                this.video.play().catch(() => {});
              });
            }
          }
        };

        // Démarrer dès que les premières métadonnées ou le premier fragment sont en cours d'analyse
        hls.once(Hls.Events.FRAG_PARSING_METADATA, () => {
          startVideoPlayback();
        });
        hls.once(Hls.Events.FRAG_BUFFERED, () => {
          startVideoPlayback();
        });

        // Démarrage rapide pour amorcer immédiatement le décodeur
        setTimeout(startVideoPlayback, 300);
      });

      this._mediaErrorCount = 0;
      this._networkErrorCount = 0;
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        this._mediaErrorCount = 0;
        this._networkErrorCount = 0;
        if (this.video && this.video.currentTime > 0) {
          onReady();
        }
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
        // Détection code HTTP 429 Limite de visionnage (2 écrans simultanés max par IP)
        const httpStatus = data.response ? data.response.code : (data.context?.xhr ? data.context.xhr.status : 0);
        if (httpStatus === 429) {
          console.warn('[HLS 429] Limite de 2 visionnages simultanés atteinte pour cette IP.');
          this.showStatusBanner("Limite de 2 écrans simultanés atteinte sur votre réseau.");
          try { this.video.pause(); } catch(e) {}
          if (this.hls) { try { this.hls.stopLoad(); } catch(e) {} }
          return;
        }
        // Détection d'incompatibilité audio matérielle (ex: EC-3 Dolby / code non supporté)
        const isAudioIncompatibility = (
          (data.reason && (data.reason.includes('EC-3') || data.reason.includes('Unsupported audio') || data.reason.toLowerCase().includes('audio'))) ||
          (data.details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR && (data.parent === 'audio' || data.sourceBufferName === 'audio' || (data.mimeType && (data.mimeType.includes('ec-3') || data.mimeType.includes('audio')))))
        );
        if (isAudioIncompatibility) {
          console.warn('[HLS] Incompatibilité audio détectée (EC-3).');
          if (!this._audioTranscodeRecovery && this._currentHlsUrl && !this._currentHlsUrl.includes('transcode_audio=1')) {
            this._audioTranscodeRecovery = true;
            this.showStatusBanner("Optimisation audio en cours...");
            const sep = this._currentHlsUrl.includes('?') ? '&' : '?';
            const recoveredUrl = `${this._currentHlsUrl}${sep}transcode_audio=1`;
            console.log('[HLS Audio Recovery] Bascule automatique vers transcodage AAC serveur :', recoveredUrl);
            setTimeout(() => {
              this.playDirectHls(recoveredUrl);
            }, 300);
            return;
          }
        }

        // Détection d'incompatibilité vidéo matérielle (ex: HEVC/H.265, Dolby Vision, AVI/MPEG-4 ASP)
        const isVideoIncompatibility = (
          (data.details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR && (data.parent === 'video' || data.sourceBufferName === 'video')) ||
          (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR && (!data.reason || !data.reason.includes('audio')))
        );
        if (isVideoIncompatibility) {
          console.warn('[HLS] Incompatibilité vidéo détectée (HEVC/DV/Codec).');
          if (!this._videoTranscodeRecovery && this._currentHlsUrl && !this._currentHlsUrl.includes('transcode_video=1')) {
            this._videoTranscodeRecovery = true;
            this.showStatusBanner("Optimisation de compatibilité vidéo (H.264)...");
            const sep = this._currentHlsUrl.includes('?') ? '&' : '?';
            const curTime = (this.video && this.video.currentTime > 0) ? this.video.currentTime : 0;
            const recoveredUrl = `${this._currentHlsUrl}${sep}transcode_video=1`;
            console.log('[HLS Video Recovery] Bascule automatique vers transcodage H.264 serveur :', recoveredUrl);
            setTimeout(() => {
              this.playDirectHls(recoveredUrl, { startPosition: curTime });
            }, 300);
            return;
          }
        }

        if (!data.fatal) {
          // Gestion proactive des micro-trous de buffer à la jonction des segments de 10s (VOD UNIQUEMENT)
          const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
          if (!isChannel && (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE)) {
            this.showBuffering(true, 'Mise en mémoire tampon...');
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
            if (options.isVidmoly && options.fallbackEpisodeId && !this._hasFallenBackToXtream) {
              this._hasFallenBackToXtream = true;
              console.log(`[Player Auto-Fallback] Vidmoly indisponible (${data.details}), bascule immédiate vers Xtream HLS direct (Ep ${options.fallbackEpisodeId})...`);
              const fallbackUrl = `${baseUrl}/api/stream/xtream-series-hls/${options.fallbackEpisodeId}/master.m3u8`;
              return this.playDirectHls(fallbackUrl, { startPosition: startSec });
            }
            this._networkErrorCount = (this._networkErrorCount || 0) + 1;
            if (this._networkErrorCount >= 4 || data.details === 'manifestLoadError' || data.details === 'manifestLoadTimeOut') {
              this._networkErrorCount = 0;
              this.showStatusBanner("Erreur de connexion au flux. Cliquez sur Réessayer.");
              return;
            }
            console.log('[HLS] Récupération réseau automatique...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            this._mediaErrorCount = (this._mediaErrorCount || 0) + 1;
            console.warn('[HLS Media Error #' + this._mediaErrorCount + ']:', data.details);
            if (this._mediaErrorCount === 1) {
              hls.recoverMediaError();
            } else if (this._mediaErrorCount === 2) {
              if (!this._videoTranscodeRecovery && this._currentHlsUrl && !this._currentHlsUrl.includes('transcode_video=1')) {
                this._videoTranscodeRecovery = true;
                this.showStatusBanner("Optimisation de compatibilité vidéo (H.264)...");
                const sep = this._currentHlsUrl.includes('?') ? '&' : '?';
                const curTime = (this.video && this.video.currentTime > 0) ? this.video.currentTime : 0;
                const recoveredUrl = `${this._currentHlsUrl}${sep}transcode_video=1`;
                console.log('[HLS Video Recovery via Media Error] Bascule transcodage H.264 :', recoveredUrl);
                setTimeout(() => {
                  this.playDirectHls(recoveredUrl, { startPosition: curTime });
                }, 300);
                return;
              }
              try { hls.swapAudioCodec(); } catch (e) {}
              hls.recoverMediaError();
            } else if (this._mediaErrorCount <= 4) {
              // Sur direct (Live TV), laisser HLS.js récupérer sans forcer de seek artificiel
              if (!isChannel && this.video && !this.video.paused) {
                this.video.currentTime += 0.3;
              }
              hls.recoverMediaError();
            } else {
              this._mediaErrorCount = 0;
              this.showStatusBanner("Erreur de décodage média. Cliquez sur Réessayer.");
            }
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
      let startTriggered = false;
      const startPlay = () => {
        if (startTriggered) return;
        startTriggered = true;
        onReady();
        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            this._autoplayMuted = false;
            this.hideUnmuteNotice();
          }).catch(err => {
            console.warn('[Player] Autoplay avec son restreint sur Safari, tentative démarrage muet :', err.message);
            this._autoplayMuted = true;
            this.video.muted = true;
            this.syncVolumeUI();
            this.showUnmuteNotice();
            const secondPromise = this.video.play();
            if (secondPromise !== undefined) {
              secondPromise.catch(err2 => {
                console.warn('[Player] Lecture bloquée par Safari, attente interaction utilisateur :', err2.message);
                this.showStatusBanner("Lecture prête — Touchez l'écran pour démarrer la vidéo");
                this.updatePlayStateUI(false);
              });
            }
          });
        }
      };
      this.video.addEventListener('loadedmetadata', startPlay, { signal, once: true });
      this.video.addEventListener('canplay', startPlay, { signal, once: true });
      this.video.addEventListener('loadeddata', startPlay, { signal, once: true });
      if (this.video.readyState >= 1) {
        startPlay();
      }
    } else {
      this.showStatusBanner("Votre navigateur ne supporte pas la lecture HLS directe.");
    }
  }

  // ================= 12. MOTEUR SÉRIES VOD (Range 206) =================
  playDirectVideo(videoUrl) {
    const isVidmoly = !!(videoUrl && (videoUrl.includes('vmnow') || videoUrl.includes('vidmoly')));
    // quality removed
    const baseUrl = window.API_BASE || '';
    if (videoUrl && videoUrl.startsWith('/')) videoUrl = baseUrl + videoUrl;

    const authToken = localStorage.getItem('ziflix_auth_token');
    if (authToken && videoUrl && !videoUrl.includes('auth_token=')) {
      const sep = videoUrl.includes('?') ? '&' : '?';
      videoUrl = `${videoUrl}${sep}auth_token=${encodeURIComponent(authToken)}`;
    }

    // Détection Mobile (Android & iOS) & appareils sans support MKV natif
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || isApple || (navigator.platform === 'MacIntel' && !/Chrome|CriOS/i.test(navigator.userAgent));
    const canPlayMkv = (this.video.canPlayType('video/x-matroska') !== '' || this.video.canPlayType('video/mkv') !== '');

    // Séries Xtream : Basculement universel direct et transparent avec priorité Vidmoly Cloud
    if (videoUrl.includes('/api/stream/xtream-series')) {
      const epMatch = videoUrl.match(/episode_id=([^&]+)/);
      if (epMatch && epMatch[1]) {
        const epId = epMatch[1];
        const vCode = (this.currentEpisodeObj && this.currentEpisodeObj.vidmoly_file_code) || (window.vidmolyMap && window.vidmolyMap[epId]);
        const startParam = (this.savedResumeTime > 10) ? `&start=${Math.floor(this.savedResumeTime)}` : '';
        if (vCode) {
          const vidmolyStreamUrl = `${baseUrl}/api/stream/vidmoly/${vCode}/playlist.m3u8?episode_id=${encodeURIComponent(epId)}${startParam}`;
          return this.playDirectHls(vidmolyStreamUrl, { isVidmoly: true, fallbackEpisodeId: epId, startPosition: this.savedResumeTime });
        }
        const hlsStartParam = (this.savedResumeTime > 10) ? `?start=${Math.floor(this.savedResumeTime)}` : '';
        const hlsUrl = `${baseUrl}/api/stream/xtream-series-hls/${epId}/master.m3u8${hlsStartParam}`;
        return this.playDirectHls(hlsUrl, { startPosition: this.savedResumeTime });
      }
    }

    this._isRemuxedMp4 = false;
    this._currentDirectVideoUrl = videoUrl;

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
      hasReadied = true;
      this._isLoadingStream = false;
      this.setStep(4, 'done', `4. Épisode connecté • Lecture active 1080p FHD`);
      this.hideLoader();
      this.hideStatusBanner();
      if (this.backdrop) {
        this.backdrop.classList.add('fade-out');
        setTimeout(() => {
          if (this.backdrop) {
            this.backdrop.style.display = 'none';
            this.backdrop.classList.remove('fade-out');
          }
        }, 200);
      }
    };

    this.video.addEventListener('playing', () => onReady(), { signal });
    this.video.addEventListener('timeupdate', () => {
      if (this.video.currentTime > 0) onReady();
    }, { signal });

    // Sécurité : masquer le loader après démarrage effectif ou après 15s
    const directSafetyTimer = setTimeout(() => {
      if (!hasReadied && this.video && (this.video.currentTime > 0 || this.video.readyState >= 3)) {
        onReady();
      }
    }, 15000);
    signal.addEventListener('abort', () => clearTimeout(directSafetyTimer));

    this.video.addEventListener('error', () => {
      onReady();
      const err = this.video.error;
      console.warn('[Direct Video Error]:', err?.message || err?.code);

      // Notification intelligente et non trompeuse
      if (this.currentMovie) {
        fetch(videoUrl, { method: 'GET', headers: Object.assign({}, this.getAuthHeaders(), { 'Range': 'bytes=0-10' }) }).then(res => {
          if (res.status >= 500) {
            this.showStatusBanner("Le serveur de diffusion est momentanément indisponible (Erreur " + res.status + "). Veuillez patienter un instant.");
          } else if (res.status === 404) {
            this.showStatusBanner("Cet épisode n'est plus disponible sur le serveur source.");
          } else {
            this.showStatusBanner("Erreur de lecture du flux. Cliquez sur Réessayer.");
          }
        }).catch(() => {
          this.showStatusBanner("Erreur de connexion au flux vidéo. Veuillez réessayer.");
        });
      }
    }, { signal, once: true });

    let hasStartedPlay = false;
    const triggerSafePlay = () => {
      if (hasStartedPlay) return;
      hasStartedPlay = true;
      if (this.savedResumeTime > 0 && !isChannel) {
        try {
          this.video.currentTime = this.savedResumeTime;
        } catch (e) {}
        this.savedResumeTime = 0;
      }
      const playPromise = this.video.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this._autoplayMuted = false;
          this.hideUnmuteNotice();
        }).catch(err => {
          console.warn('[Direct Video Autoplay Warn]: Autoplay restreint, passage en muet :', err.message);
          this._autoplayMuted = true;
          this.video.muted = true;
          this.syncVolumeUI();
          this.showUnmuteNotice();
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
    // quality removed
    if (typeof embedUrl === 'string') {
      embedUrl = embedUrl.replace(/vidmoly\.(me|biz|net|to)/g, 'vidmoly.org').replace(/embed-embed-/g, 'embed-');
    }
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

    if (embedUrl.includes('vidmoly')) {
      this.iframe.removeAttribute('sandbox');
    } else {
      this.iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-presentation allow-popups');
    }

    this.iframe.src = embedUrl;

    if (this.bottomControls) this.bottomControls.classList.add('iframe-mode');
    this.setStep(4, 'done', `4. Lecteur officiel connecté • Lecture active`);
    setTimeout(() => this.hideLoader(), 400);
  }

  // ================= 14. UTILITAIRES D'AFFICHAGE & LOADER =================
  togglePlay() {
    if (!this.isVipOrAdmin() && this.getWatchCredit() <= 0) {
      if (this.video) {
        try { this.video.pause(); } catch (e) {}
      }
      if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
      if (this.timerExpiredModal) this.timerExpiredModal.classList.remove('hidden');
      this.showToast('⏱ Votre temps gratuit est écoulé. Rechargez +20m pour regarder.');
      return;
    }
    const curPlaybackTime = this.getCurrentPlaybackTime();
    const effTotalDur = typeof this.getEffectiveDuration === 'function' ? this.getEffectiveDuration() : (this.currentMovieDuration || 0);
    const isPrematureStop = (effTotalDur > 120 && curPlaybackTime > 30 && (effTotalDur - curPlaybackTime > 60));

    if (this.video && (this.video.error || (this.video.ended && isPrematureStop))) {
      console.warn('[Player] Clic Play/Pause sur vidéo arrêtée prématurément, relance automatique du flux...');
      this.savedResumeTime = curPlaybackTime;
      this.loadStream();
      return;
    }
    if (this.video.paused) {
      this._isUserPaused = false;
      this.video.play().then(() => {
        if (!this._isUserMuted) {
          this.unmutePlayer();
        }
      }).catch(() => {
        this._autoplayMuted = true;
        this.video.muted = true;
        this.syncVolumeUI();
        this.showUnmuteNotice();
        this.video.play().catch(() => {});
      });
      this.triggerCenterRipple('▶');
    } else {
      this._isUserPaused = true;
      this.video.pause();
      this.triggerCenterRipple('⏸');
    }
  }

  updatePlayStateUI(isPlaying) {
    if (!this.centerPlayBtn) this.centerPlayBtn = document.getElementById('centerPlayBtn');
    if (!this.centerIconPause) this.centerIconPause = document.getElementById('centerIconPause');
    if (!this.centerIconPlay) this.centerIconPlay = document.getElementById('centerIconPlay');

    if (this.iconPlay) this.iconPlay.classList.toggle('hidden', isPlaying);
    if (this.iconPause) this.iconPause.classList.toggle('hidden', !isPlaying);

    // Bouton tactile central Netflix mobile : 
    // Affiche les 2 barres (pause ❚❚) pendant la lecture, et le triangle (play ▶) en pause
    if (this.centerIconPause) this.centerIconPause.classList.toggle('hidden', !isPlaying);
    if (this.centerIconPlay) this.centerIconPlay.classList.toggle('hidden', isPlaying);

    if (this.overlay) {
      this.overlay.classList.toggle('is-paused', !isPlaying);
    }

    if (!isPlaying) {
      if (!this._isLoadingStream) {
        this.hideLoader();
      }
      this.showControls();
    }
  }

  seekRelative(seconds) {
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel) return;
    let total = typeof this.getEffectiveDuration === 'function' ? this.getEffectiveDuration() : (this.video?.duration || 0);
    if (!total || !isFinite(total)) return;
    const cur = this.getCurrentPlaybackTime();
    const newTime = Math.max(0, Math.min(total - 1, cur + seconds));
    if (typeof this.applySeek === 'function') {
      this.applySeek(newTime);
    } else if (this.video) {
      this.video.currentTime = newTime;
      if (this.video.paused) {
        this.video.play().catch(() => {});
      }
    }
    this.triggerCenterRipple(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
  }

  async toggleFullscreen() {
    const isFs = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      this.video?.webkitDisplayingFullscreen
    );

    if (!isFs) {
      const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
      if (isIPhone && this.video && typeof this.video.webkitEnterFullscreen === 'function') {
        // iPhone : Lecteur natif iOS parfait
        this.video.webkitEnterFullscreen();
      } else {
        // Android & Desktop : Plein écran HTML5 avec masquage de la barre de navigation
        try {
          if (this.overlay && this.overlay.requestFullscreen) {
            await this.overlay.requestFullscreen({ navigationUI: 'hide' });
          } else if (this.overlay && this.overlay.webkitRequestFullscreen) {
            this.overlay.webkitRequestFullscreen();
          } else if (this.video && typeof this.video.webkitEnterFullscreen === 'function') {
            this.video.webkitEnterFullscreen();
          }
        } catch (err) {
          if (this.video && typeof this.video.webkitEnterFullscreen === 'function') {
            try { this.video.webkitEnterFullscreen(); } catch (e) {}
          }
        }

        // Sur mobile Android : orientation paysage immersive
        try {
          if (screen.orientation && typeof screen.orientation.lock === 'function') {
            screen.orientation.lock('landscape').catch(() => {});
          }
        } catch (e) {}
      }

      if (this.iconEnterFs) this.iconEnterFs.classList.add('hidden');
      if (this.iconExitFs) this.iconExitFs.classList.remove('hidden');
    } else {
      try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
          screen.orientation.unlock();
        }
      } catch (e) {}

      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      } else if (this.video && typeof this.video.webkitExitFullscreen === 'function') {
        this.video.webkitExitFullscreen();
      }

      if (this.iconEnterFs) this.iconEnterFs.classList.remove('hidden');
      if (this.iconExitFs) this.iconExitFs.classList.add('hidden');
    }

    setTimeout(() => {
      if (typeof this.adaptResponsiveLayout === 'function') {
        this.adaptResponsiveLayout();
      }
    }, 150);
  }

  triggerCenterRipple(text) {
    if (!this.ripple) return;
    this.ripple.textContent = text;
    this.ripple.classList.remove('animate');
    void this.ripple.offsetWidth;
    this.ripple.classList.add('animate');
  }

  showLoader(titleText = null) {
    if (this._bufferTimer) {
      clearTimeout(this._bufferTimer);
      this._bufferTimer = null;
    }
    if (this._hideLoaderTimeout) {
      clearTimeout(this._hideLoaderTimeout);
      this._hideLoaderTimeout = null;
    }
    if (this.loader) {
      if (this.loaderTitle) {
        let cleanText = titleText || 'Connexion au flux...';
        cleanText = cleanText.replace(/^[⚡🔍🔓🎬💎🍿]\s*/, '');
        this.loaderTitle.textContent = cleanText;
      }
      this.loader.classList.remove('hidden', 'fade-out', 'buffering-mode');
    }
  }

  hideLoader() {
    if (this._bufferTimer) {
      clearTimeout(this._bufferTimer);
      this._bufferTimer = null;
    }
    if (this._hideLoaderTimeout) {
      clearTimeout(this._hideLoaderTimeout);
      this._hideLoaderTimeout = null;
    }
    if (this.loader) {
      this.loader.classList.add('fade-out');
      this._hideLoaderTimeout = setTimeout(() => {
        if (this.loader) {
          this.loader.classList.add('hidden');
          this.loader.classList.remove('fade-out', 'buffering-mode');
        }
      }, 200);
    }
  }

  
  showQualitySwitchLoading(text = 'Chargement de la qualité...') {
    this._isQualitySwitching = true;
    if (this._bufferTimer) {
      clearTimeout(this._bufferTimer);
      this._bufferTimer = null;
    }
    if (this._hideLoaderTimeout) {
      clearTimeout(this._hideLoaderTimeout);
      this._hideLoaderTimeout = null;
    }
    if (!this.overlay || !this.overlay.classList.contains('active')) return;
    if (this.loader) {
      if (this.loaderTitle) this.loaderTitle.textContent = text;
      this.loader.classList.remove('hidden', 'fade-out');
      this.loader.classList.add('buffering-mode');
    }
  }

  showBuffering(show, text = 'Mise en mémoire tampon...') {
    if (this._bufferTimer) {
      clearTimeout(this._bufferTimer);
      this._bufferTimer = null;
    }
    if (!this.overlay || !this.overlay.classList.contains('active')) return;
    if (show) {
      if (this._isUserPaused) return;
      // Ne jamais afficher si la vidéo est déjà en lecture fluide active
      if (this.video && !this.video.paused && this.video.readyState >= 3 && !this.video.seeking) {
        return;
      }
      this._bufferTimer = setTimeout(() => {
        if (this.loader && !this._isUserPaused) {
          // Double-check après délai : la vidéo s'est-elle remise à jouer entre-temps ?
          if (this.video && !this.video.paused && this.video.readyState >= 3 && !this.video.seeking) {
            return;
          }
          if (this.loaderTitle) this.loaderTitle.textContent = text;
          this.loader.classList.remove('hidden', 'fade-out');
          this.loader.classList.add('buffering-mode');
        }
      }, 250);
    } else {
      if (!this._isQualitySwitching) {
        this.hideLoader();
      }
    }
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

  setLanguage(lang = 'vf', reloadStream = true) {
    this.currentLang = 'vf';
    try {
      localStorage.setItem('netflix_lang', 'vf');
    } catch (e) {}

    this.updateServerPills();
    this.updateMetaDisplay();
  }

  updateMetaDisplay() {
    if (!this.currentMovie) return;
    const isChannel = (this.currentMovie?.media_type === 'channel' || this.currentMovie?.is_live);
    if (isChannel) {
      const chNum = this.currentMovie.channel_number ? `Canal ${this.currentMovie.channel_number} • ` : '';
      this.metaDisplay.innerHTML = `<span style="color: #e50914; font-weight: 800;"><span class="live-pulse">●</span> EN DIRECT</span> • ${chNum}1080p FHD • Serveur ZIFLIX • Anti-Pubs Actif `;
      this.ctrlMediaTitle.textContent = `${this.currentMovie.title} (DIRECT)`;
      if (this.ctrlTotalDuration) this.ctrlTotalDuration.textContent = 'DIRECT';
      return;
    }

    const isSeries = (this.currentMovie.media_type === 'series' || this.currentMovie.is_xtream_series);
    const year = this.currentMovie.release_year || '2025';
    const dur = this.currentMovie.duration || '45 min';

    if (isSeries) {
      this.metaDisplay.textContent = `Saison ${this.currentSeason} • Épisode ${this.currentEpisode} • 1080p FHD • Serveur ZIFLIX • Anti-Pubs Actif `;
      this.ctrlMediaTitle.textContent = `${this.currentMovie.title} (S${this.currentSeason}:E${this.currentEpisode})`;
    } else {
      this.metaDisplay.textContent = `${year} • ${dur} • 1080p FHD • Serveur ZIFLIX • Anti-Pubs Actif `;
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

  // ================= ⏳ WATCH TIMER MONETAG & GESTION CONTINUE =================
  initWatchTimer() {
    if (!this.playerWatchTimerBtn) this.playerWatchTimerBtn = document.getElementById('playerWatchTimerBtn');
    if (!this.timerModalRechargeBtn) this.timerModalRechargeBtn = document.getElementById('timerModalRechargeBtn');
    if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');

    const navBtn = document.getElementById("navWatchTimerBtn");
    if (navBtn && !navBtn._hasDirectPlayerListener) {
      navBtn._hasDirectPlayerListener = true;
      navBtn.addEventListener("click", (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        this.rechargeWatchCredit(false);
      });
      navBtn.addEventListener("pointerdown", (e) => {
        if (e) e.stopPropagation();
      });
    }

    if (this.playerWatchTimerBtn) {
      this.playerWatchTimerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.rechargeWatchCredit(false);
      });
    }

    if (this.timerModalRechargeBtn) {
      this.timerModalRechargeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.rechargeWatchCredit(true);
      });
    }

    const modalCloseBtn = document.getElementById('timerModalCloseBtn');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    const modalBackCatalogBtn = document.getElementById('timerModalBackCatalogBtn');
    if (modalBackCatalogBtn) {
      modalBackCatalogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }
  }

  isAdmin() {
    try {
      if (window.netflixApp && typeof window.netflixApp.isAdmin === 'function' && window.netflixApp.isAdmin()) return true;
      if (window.app && typeof window.app.isAdmin === 'function' && window.app.isAdmin()) return true;
      const raw = localStorage.getItem('ziflix_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.role === 'admin' || u.is_admin || u.isAdmin)) return true;
      }
      if (localStorage.getItem('ziflix_admin_token')) return true;
      if (localStorage.getItem('ziflix_is_admin') === 'true') return true;
      if (new URLSearchParams(window.location.search).get('admin') === '1') return true;
    } catch (e) {}
    return false;
  }

  isVipOrAdmin() {
    if (this.isAdmin()) return true;
    try {
      if (window.netflixApp && typeof window.netflixApp.isVipOrAdmin === 'function' && window.netflixApp.isVipOrAdmin()) return true;
      const raw = localStorage.getItem('ziflix_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.role === 'vip' || u.role === 'admin' || u.is_vip || u.is_premium)) return true;
      }
      if (localStorage.getItem('ziflix_is_vip') === 'true') return true;
    } catch (e) {}
    return false;
  }

  getWatchCredit() {
    if (this.isVipOrAdmin()) return 999999;
    try {
      const expStr = localStorage.getItem('ziflix_watch_expires_at');
      const now = Date.now();
      if (!expStr) {
        // Migration d'un crédit legacy éventuel
        const legacy = parseInt(localStorage.getItem('ziflix_watch_credit') || '0', 10);
        if (legacy > 0 && !localStorage.getItem('ziflix_watch_migrated')) {
          localStorage.setItem('ziflix_watch_migrated', 'true');
          const newExp = now + legacy * 1000;
          localStorage.setItem('ziflix_watch_expires_at', String(newExp));
          return Math.min(this.MAX_CREDIT, legacy);
        }
        // Si première visite et offre non encore acceptée
        const currentUserId = (window.netflixApp && window.netflixApp.currentUser) ? window.netflixApp.currentUser.id : localStorage.getItem('ziflix_current_user_id');
        const userAccepted = currentUserId ? localStorage.getItem('ziflix_welcome_accepted_' + currentUserId) : null;
        const accepted = userAccepted === 'true' || (userAccepted === null && localStorage.getItem('ziflix_welcome_accepted') === 'true');
        if (!accepted) return this.INITIAL_CREDIT;
        return 0;
      }
      const exp = parseInt(expStr, 10);
      if (isNaN(exp) || exp <= now) return 0;
      return Math.min(this.MAX_CREDIT, Math.floor((exp - now) / 1000));
    } catch (e) {
      return 0;
    }
  }

  setWatchCredit(val) {
    try {
      const now = Date.now();
      const s = Math.max(0, Math.min(this.MAX_CREDIT, Math.round(val)));
      const exp = now + s * 1000;
      localStorage.setItem('ziflix_watch_expires_at', String(exp));
      localStorage.setItem('ziflix_watch_credit', String(s));
    } catch (e) {}
  }

  addWatchCredit(seconds) {
    try {
      const now = Date.now();
      const currentExp = parseInt(localStorage.getItem('ziflix_watch_expires_at') || '0', 10);
      const baseTime = (!isNaN(currentExp) && currentExp > now) ? currentExp : now;
      const newExp = Math.min(now + this.MAX_CREDIT * 1000, baseTime + seconds * 1000);
      localStorage.setItem('ziflix_watch_expires_at', String(newExp));
      const remainingSec = Math.max(0, Math.floor((newExp - now) / 1000));
      localStorage.setItem('ziflix_watch_credit', String(remainingSec));
      return remainingSec;
    } catch (e) {
      return 0;
    }
  }

  getNextDirectLink() {
    try {
      const links = (this.DIRECT_LINKS && this.DIRECT_LINKS.length > 0) ? this.DIRECT_LINKS : [
        'https://omg10.com/4/11820445',
        'https://www.profitableratecpmnetwork.com/kwnxcx7a2s?key=d43d0890cc6512eb65c08a022e42f264'
      ];
      let idx = parseInt(localStorage.getItem('ziflix_ad_rotation_idx') || '0', 10);
      if (isNaN(idx) || idx < 0 || idx >= links.length) idx = 0;
      const targetUrl = links[idx];
      // Roulement automatique 50/50 vers le lien suivant pour la prochaine recharge
      localStorage.setItem('ziflix_ad_rotation_idx', String((idx + 1) % links.length));
      return targetUrl;
    } catch (e) {
      return (this.DIRECT_LINKS && this.DIRECT_LINKS[0]) || 'https://omg10.com/4/11820445';
    }
  }

  rechargeWatchCredit(fromModal = false) {
    if (typeof sendClientDebug === "function") {
      try { sendClientDebug("PLAYER_RECHARGE_CREDIT_CALLED", { fromModal: fromModal, isVip: this.isVipOrAdmin(), credit: this.getWatchCredit() }); } catch(e) {}
    }

    if (this.isRechargePending) {
      this.showToast('⏳ Validation en cours... Veuillez patienter quelques secondes.');
      return;
    }

    const current = Math.max(0, this.getWatchCredit());
    if (current >= this.MAX_CREDIT) {
      this.showToast('⚠️ Limite de 60 minutes déjà atteinte. Bon visionnage !');
      this.updateTimerDisplays(current);
      return;
    }

    this.isRechargePending = true;

    // 1. Créditer IMMÉDIATEMENT sur le client (+20 min)
    // Primordial sur mobile où l'ouverture de l'onglet pub suspend les timers JS en tâche de fond.
    const newCredit = this.addWatchCredit(this.BONUS_CREDIT);
    this.updateTimerDisplays(newCredit);

    if (this.playerWatchTimer && !this.isVipOrAdmin()) {
      this.playerWatchTimer.style.display = 'inline-flex';
      this.playerWatchTimer.classList.remove('timer-low');
    }

    if (fromModal) {
      if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
      if (this.timerExpiredModal) {
        this.timerExpiredModal.classList.add('hidden');
      }
      this.showToast('+20 minutes offertes débloquées ! Bon visionnage.');
      if (this.currentMovie && (!this.video.src || this.video.src === 'about:blank' || this.video.ended)) {
        this.loadStream();
      } else {
        try {
          this.video.play().catch(() => {});
        } catch (e) {}
      }
    } else {
      this.showToast(this.isVipOrAdmin() ? "+20 minutes ajoutées avec succès (Test Mode Admin/VIP) !" : "+20 minutes offertes ajoutées ! (" + Math.round(newCredit / 60) + " min au total)");
    }

    // Fermer également la modale d'accueil 0 minute si ouverte
    const zeroModal = document.getElementById('zeroCreditHomeModal');
    if (zeroModal) zeroModal.classList.add('hidden');

    // Synchroniser également avec l'accueil
    if (window.netflixApp && typeof window.netflixApp.updateHomeTimerDisplay === 'function') {
      window.netflixApp.updateHomeTimerDisplay(newCredit);
    }

    // 2. Ouvrir le lien publicitaire en roulement direct (Monetag / Adsterra)
    const targetUrl = this.getNextDirectLink();
    try {
      if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
        window.Telegram.WebApp.openLink(targetUrl);
      } else {
        const win = window.open(targetUrl, '_blank');
        if (!win) {
          const a = document.createElement('a');
          a.href = targetUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      }
    } catch (e) {
      console.warn('[Ads] Erreur ouverture lien:', e.message);
    }

    // 3. Décompte d'attente / cooldown anti-spam de 5 secondes avec feedback visuel
    let remaining = this.COOLDOWN_SECONDS;
    this.updateRechargeButtonsCountdown(remaining);

    if (this.rechargeCooldownInterval) {
      clearInterval(this.rechargeCooldownInterval);
      this.rechargeCooldownInterval = null;
    }

    this.rechargeCooldownInterval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        this.updateRechargeButtonsCountdown(remaining);
      } else {
        clearInterval(this.rechargeCooldownInterval);
        this.rechargeCooldownInterval = null;
        this.isRechargePending = false;
        this.updateTimerDisplays(this.getWatchCredit());
      }
    }, 1000);
  }

  updateRechargeButtonsCountdown(secondsRemaining) {
    const navBtn = document.getElementById('navWatchTimerBtn');
    const playerBtn = document.getElementById('playerWatchTimerBtn') || this.playerWatchTimerBtn;
    const modalBtn = document.getElementById('timerModalRechargeBtn') || this.timerModalRechargeBtn;
    const zeroBtn = document.getElementById('zeroCreditRechargeBtn');

    const shortText = `⏳ ${secondsRemaining}s`;
    const fullText = `⏳ VALIDATION EN COURS (${secondsRemaining}s)...`;

    if (navBtn) {
      navBtn.disabled = true;
      navBtn.textContent = shortText;
    }
    if (playerBtn) {
      playerBtn.disabled = true;
      playerBtn.textContent = shortText;
    }
    if (modalBtn) {
      modalBtn.disabled = true;
      modalBtn.textContent = fullText;
    }
    if (zeroBtn) {
      zeroBtn.disabled = true;
      zeroBtn.textContent = fullText;
    }
  }

  updateTimerDisplays(credit) {
    credit = Math.max(0, Math.round(credit));
    const mins = Math.floor(credit / 60);
    const secs = credit % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (!this.playerWatchTimerVal) this.playerWatchTimerVal = document.getElementById('playerWatchTimerVal');
    if (this.playerWatchTimerVal) {
      this.playerWatchTimerVal.textContent = timeStr;
    }

    const navTimerVal = document.getElementById('navWatchTimerVal');
    if (navTimerVal) {
      navTimerVal.textContent = timeStr;
    }

    const navTimer = document.getElementById('navWatchTimer');
    if (navTimer) {
      if (this.isVipOrAdmin()) {
        navTimer.style.display = 'none';
      } else {
        navTimer.style.display = 'inline-flex';
        if (credit <= this.WARNING_THRESHOLD) {
          navTimer.classList.add('timer-low');
        } else {
          navTimer.classList.remove('timer-low');
        }
      }
    }

    // Gestion de l'état des boutons si aucune recharge n'est en cours d'attente
    if (!this.isRechargePending) {
      const isMax = (credit >= this.MAX_CREDIT);
      const navBtn = document.getElementById('navWatchTimerBtn');
      const playerBtn = document.getElementById('playerWatchTimerBtn') || this.playerWatchTimerBtn;
      const modalBtn = document.getElementById('timerModalRechargeBtn') || this.timerModalRechargeBtn;
      const zeroBtn = document.getElementById('zeroCreditRechargeBtn');

      if (navBtn) {
        navBtn.disabled = isMax;
        navBtn.textContent = isMax ? 'Max 60m' : '+20';
        navBtn.title = isMax ? 'Limite de 60 minutes atteinte' : 'Recharger +20 min gratuites';
      }
      if (playerBtn) {
        playerBtn.disabled = false;
        playerBtn.textContent = '+20m';
        playerBtn.title = isMax ? 'Limite de 60 minutes atteinte (Bon visionnage !)' : 'Recharger +20 min gratuites';
      }
      if (modalBtn) {
        modalBtn.disabled = isMax;
        modalBtn.textContent = isMax ? 'MAX 60 MIN ATTEINT' : 'RECHARGER +20 MIN GRATUITES';
      }
      if (zeroBtn) {
        zeroBtn.disabled = isMax;
        zeroBtn.textContent = isMax ? 'MAX 60 MIN ATTEINT' : 'RECHARGER +20 MIN GRATUITES';
      }
    }

    if (window.netflixApp && typeof window.netflixApp.updateHomeTimerDisplay === 'function') {
      try { window.netflixApp.updateHomeTimerDisplay(credit); } catch (e) {}
    }
  }

  startWatchTimer() {
    this.stopWatchTimer();
    this.dismissNextEpisodeCard();
    if (this.isVipOrAdmin()) {
      if (this.playerWatchTimer) this.playerWatchTimer.style.display = 'none';
      if (this.timerExpiredModal) this.timerExpiredModal.classList.add('hidden');
      return;
    }

    if (!this.playerWatchTimer) this.playerWatchTimer = document.getElementById('playerWatchTimer');
    if (this.playerWatchTimer) {
      this.playerWatchTimer.style.display = 'inline-flex';
      this.playerWatchTimer.classList.remove('timer-low');
    }

    const initialCredit = this.getWatchCredit();
    this.updateTimerDisplays(initialCredit);

    this.watchTimerInterval = setInterval(() => {
      if (this.isVipOrAdmin()) {
        this.stopWatchTimer();
    this.dismissNextEpisodeCard();
        return;
      }

      // Le timer s'écoule en temps réel continu (horloge réelle / wall-clock)
      const credit = this.getWatchCredit();
      this.updateTimerDisplays(credit);

      if (credit <= 0) {
        try { this.video.pause(); } catch (e) {}
        if (document.fullscreenElement) {
          try { document.exitFullscreen(); } catch (e) {}
        } else if (this.video && typeof this.video.webkitExitFullscreen === 'function') {
          try { this.video.webkitExitFullscreen(); } catch (e) {}
        }
        if (this.playerWatchTimer) this.playerWatchTimer.style.display = 'none';
        if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
        if (this.timerExpiredModal) this.timerExpiredModal.classList.remove('hidden');
        return;
      }

      if (credit <= this.WARNING_THRESHOLD) {
        // Alerte 5 min : style timer-low discret
        if (this.playerWatchTimer) this.playerWatchTimer.classList.add('timer-low');
      } else {
        if (this.playerWatchTimer) this.playerWatchTimer.classList.remove('timer-low');
      }
    }, 1000);
  }

  stopWatchTimer() {
    if (this.watchTimerInterval) {
      clearInterval(this.watchTimerInterval);
      this.watchTimerInterval = null;
    }
    if (this.playerWatchTimer) this.playerWatchTimer.style.display = 'none';
    if (!this.timerExpiredModal) this.timerExpiredModal = document.getElementById('timerExpiredModal');
    if (this.timerExpiredModal) this.timerExpiredModal.classList.add('hidden');
  }

  showToast(msg) {
    let toast = document.getElementById('playerZiflixToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'playerZiflixToast';
      toast.style.cssText = "position:fixed;top:75px;left:50%;transform:translateX(-50%);background:rgba(20,20,24,0.96);border:1.5px solid #e50914;color:#fff;padding:12px 26px;border-radius:30px;font-size:0.95rem;font-weight:700;z-index:2147483647;box-shadow:0 8px 30px rgba(0,0,0,0.9);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transition:opacity 0.3s ease, transform 0.3s ease;pointer-events:none;";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.display = 'block';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 350);
      }
    }, 3500);
  }

  savePlaybackProgress(force = false) {
    if (!this.currentMovie || !this.video) return;
    const isChannel = (this.currentMovie.media_type === 'channel' || this.currentMovie.is_live);
    if (isChannel) return;

    const cur = typeof this.getCurrentPlaybackTime === 'function' ? this.getCurrentPlaybackTime() : (this.video.currentTime || 0);
    const dur = typeof this.getEffectiveDuration === 'function' ? this.getEffectiveDuration() : (this.currentEpisodeDuration || this.currentMovieDuration || this.video.duration || 0);
    if (!isFinite(dur) || dur < 60) return;

    const now = Date.now();
    if (!force && now - (this.lastProgressSave || 0) < 4000) return;
    this.lastProgressSave = now;

    try {
      let list = JSON.parse(localStorage.getItem('ziflix_continue_watching')) || [];
      const movieId = String(this.currentMovie.id);

      // Si le contenu est regardé à plus de 95%, le supprimer
      if ((cur / dur) >= 0.95 || this.video.ended) {
        list = list.filter(item => String(item.id) !== movieId);
        localStorage.setItem('ziflix_continue_watching', JSON.stringify(list));
        try {
          let epMap = JSON.parse(localStorage.getItem('ziflix_episodes_progress')) || {};
          const epKey = `${movieId}_s${this.currentSeason || 1}_e${this.currentEpisode || 1}`;
          delete epMap[epKey];
          localStorage.setItem('ziflix_episodes_progress', JSON.stringify(epMap));
        } catch (e) {}

        if (window.netflixApp && typeof window.netflixApp.refreshContinueWatching === 'function') {
          window.netflixApp.refreshContinueWatching();
        }
        return;
      }

      if (cur >= 10) {
        const m = this.currentMovie;
        const posterImg = m.poster_url || m.poster || m.poster_path || m.cover || m.stream_icon || m.still_url || m.backdrop_url || m.backdrop || m.backdrop_path || '';
        const backdropImg = m.backdrop_url || m.backdrop || m.backdrop_path || m.poster_url || m.poster || m.poster_path || m.cover || '';

        const entry = {
          id: m.id,
          title: m.title || (this.titleDisplay ? this.titleDisplay.textContent : 'Titre'),
          poster: posterImg,
          backdrop: backdropImg,
          poster_url: posterImg,
          backdrop_url: backdropImg,
          cover: m.cover || posterImg,
          season: this.currentSeason || null,
          episode: this.currentEpisode || null,
          currentTime: Math.floor(cur),
          duration: Math.floor(dur),
          progressPct: Math.min(100, Math.max(1, Math.round((cur / dur) * 100))),
          media_type: m.media_type || (this.currentSeason ? 'series' : 'movie'),
          updatedAt: now,
          movieData: m
        };

        list = list.filter(item => String(item.id) !== movieId);
        list.unshift(entry);
        if (list.length > 15) list = list.slice(0, 15);
        localStorage.setItem('ziflix_continue_watching', JSON.stringify(list));

        // Enregistrer la progression par episode individuel
        const isSeries = (m.media_type === 'series' || m.is_xtream_series || !!m.seasons || String(m.id).startsWith('xtream_series_'));
        if (isSeries) {
          try {
            let epMap = JSON.parse(localStorage.getItem('ziflix_episodes_progress')) || {};
            const epKey = `${movieId}_s${this.currentSeason || 1}_e${this.currentEpisode || 1}`;
            epMap[epKey] = {
              currentTime: Math.floor(cur),
              duration: Math.floor(dur),
              progressPct: Math.min(100, Math.max(1, Math.round((cur / dur) * 100))),
              updatedAt: now
            };
            const keys = Object.keys(epMap);
            if (keys.length > 50) {
              keys.sort((a, b) => (epMap[b].updatedAt || 0) - (epMap[a].updatedAt || 0));
              const trimmed = {};
              keys.slice(0, 50).forEach(k => { trimmed[k] = epMap[k]; });
              epMap = trimmed;
            }
            localStorage.setItem('ziflix_episodes_progress', JSON.stringify(epMap));
          } catch (e) {}
        }

        if (window.netflixApp && typeof window.netflixApp.refreshContinueWatching === 'function') {
          window.netflixApp.refreshContinueWatching();
        }
      }
    } catch (e) {
      console.warn('[Continue Watching] Erreur sauvegarde:', e.message);
    }
  }

}
