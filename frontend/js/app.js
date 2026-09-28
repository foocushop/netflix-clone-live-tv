// ================= NETFLIX APP CONTROLLER =================
window.API_BASE = window.API_BASE || ((window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null' || window.location.origin.startsWith('file:'))
  ? 'https://ziablo.xyz'
  : '');

class NetflixApp {
  constructor() {
    this.catalogData = null;
    this.currentHero = null;
    this.myListItems = [];
    this.myList = this.loadMyList();
    this.player = new NetflixPlayer();
    this.admin = new NetflixAdmin();
    window.netflixPlayer = this.player;
    window.netflixAdmin = this.admin;
    window.netflixApp = this;
    window.app = this;
    this.bgAbortController = new AbortController();

    this.currentUser = null;
    this.avatarsList = Array.from({ length: 10 }, (_, i) => `assets/avatars/avatar-${i + 1}.svg`);
    this.selectedRegAvatar = this.avatarsList[0];
    this.selectedProfileAvatar = this.avatarsList[0];

    this.splashStartTime = window.__ZIFLIX_SPLASH_START || Date.now();
    this.splashDismissed = false;
    this.splashWatchdog = null;

    this.initElements();
    this.initAuthElements();
    this.initEvents();
    this.initAuthEvents();
    this.initBugReporting();
    this.checkAuth();
    this.initTimerUI();
  }

  getAuthHeaders(extra = {}) {
    const token = localStorage.getItem('ziflix_auth_token');
    const headers = Object.assign({}, extra);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }
    return headers;
  }

  pauseBackgroundTasks() {
    window.isVideoPlaying = true;
    if (this.bgAbortController) {
      try { this.bgAbortController.abort(); } catch (e) {}
    }
    this.bgAbortController = new AbortController();
  }

  resumeBackgroundTasks() {
    window.isVideoPlaying = false;
  }

  normalizeImageUrl(url) {
    if (!url) return '';
    if (typeof url === 'string' && url.includes('image.tmdb.org/t/p/original/')) {
      url = url.replace('/t/p/original/', '/t/p/w780/');
    }
    if (url.startsWith('/api/proxy-image') || url.includes('/api/proxy-image')) return url;
    if (url.startsWith('http://') || url.includes('logo.smrtp2.com') || url.includes('logoipro2.com')) {
      const baseUrl = window.API_BASE || '';
      return `${baseUrl}/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  getMovieFallbackSvg(title) {
    const clean = (title || 'Titre ZIFLIX').replace(/["'<>\\]/g, '').trim().substring(0, 24);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1f1f1f" width="300" height="450"/><text fill="#E50914" font-family="sans-serif" font-size="32" font-weight="800" x="50%" y="45%" text-anchor="middle">ZIFLIX</text><text fill="#888" font-family="sans-serif" font-size="13" x="50%" y="55%" text-anchor="middle">${clean}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  getChannelFallbackSvg(channelName) {
    const clean = (channelName || 'TV DIRECT').replace(/["'<>\\]/g, '').trim().substring(0, 22);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="300" height="450"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#18181b"/><stop offset="100%" stop-color="#050505"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="15" y="15" width="270" height="420" rx="14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/><circle cx="150" cy="180" r="55" fill="#e50914" opacity="0.15"/><g transform="translate(125, 155) scale(2.2)" fill="#e50914"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></g><text x="150" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="800" fill="#ffffff" text-anchor="middle">${clean}</text><rect x="95" y="292" width="110" height="22" rx="11" fill="#e50914"/><text x="150" y="307" font-family="system-ui, sans-serif" font-size="10" font-weight="800" fill="#ffffff" text-anchor="middle">● EN DIRECT</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  initElements() {
    this.header = document.querySelector('.netflix-header');
    this.heroBanner = document.getElementById('heroBanner');
    this.heroTitle = document.getElementById('heroTitle');
    this.heroSynopsis = document.getElementById('heroSynopsis');
    this.heroMatch = document.getElementById('heroMatch');
    this.heroAge = document.getElementById('heroAge');
    this.heroDuration = document.getElementById('heroDuration');
    this.heroBadges = document.getElementById('heroBadges');
    this.heroPlayBtn = document.getElementById('heroPlayBtn');
    this.heroMoreInfoBtn = document.getElementById('heroMoreInfoBtn');
    this.catalogRowsContainer = document.getElementById('catalogRows');
    this.searchInput = document.getElementById('searchInput');

    // Éléments Xtream VIP Toolbar
    this.xtreamToolbar = document.getElementById('xtreamToolbar');
    this.xtreamSearchInput = document.getElementById('xtreamSearchInput');
    this.xtreamSearchClear = document.getElementById('xtreamSearchClear');
    this.xtreamCategoryChips = document.getElementById('xtreamCategoryChips');
    this.xtreamQualityChips = document.getElementById('xtreamQualityChips');
    this.xtreamCountDisplay = document.getElementById('xtreamCountDisplay');

    this.xtreamChannels = null;
    this.xtreamCategories = [];
    this.selectedXtreamCategory = 'all';
    this.selectedXtreamQuality = 'all';
    this.xtreamSearchQuery = '';
    this.xtreamInitialized = false;

    // Éléments Télé-Réalité Toolbar & État
    this.telerealiteToolbar = document.getElementById('telerealiteToolbar');
    this.telerealiteSearchInput = document.getElementById('telerealiteSearchInput');
    this.telerealiteSearchClear = document.getElementById('telerealiteSearchClear');
    this.telerealiteFilterChips = document.getElementById('telerealiteFilterChips');
    this.telerealiteCountDisplay = document.getElementById('telerealiteCountDisplay');
    this.telerealiteShows = null;
    this.telerealiteFilter = 'all';
    this.telerealiteSearchQuery = '';
    this.telerealiteInitialized = false;
    this.telerealiteSeriesCache = new Map();

    // Modal
    this.modalBackdrop = document.getElementById('detailsModal');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.modalBanner = document.getElementById('modalBanner');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalMatch = document.getElementById('modalMatch');
    this.modalAge = document.getElementById('modalAge');
    this.modalDuration = document.getElementById('modalDuration');
    this.modalBadges = document.getElementById('modalBadges');
    this.modalSynopsis = document.getElementById('modalSynopsis');
    this.modalCast = document.getElementById('modalCast');
    this.modalDirector = document.getElementById('modalDirector');
    this.modalPlayBtn = document.getElementById('modalPlayBtn');
    this.modalListBtn = document.getElementById('modalListBtn');

    // Section Épisodes Modal
    this.modalEpisodesSection = document.getElementById('modalEpisodesSection');
    this.modalEpisodesSubtitle = document.getElementById('modalEpisodesSubtitle');
    this.modalSeasonSelect = document.getElementById('modalSeasonSelect');
    this.modalEpisodesList = document.getElementById('modalEpisodesList');
    this.selectedModalSeason = 1;
    this.selectedModalEpisode = 1;

    this.currentModalMovie = null;
  }

  initEvents() {
    
    // PWA Service Worker disabled
    // Défilement optimisé du header
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
      if (!scrollTicking) {
        window.requestAnimationFrame(() => {
          if (window.scrollY > 50) {
            this.header.classList.add('scrolled');
          } else {
            this.header.classList.remove('scrolled');
          }
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    }, { passive: true });

    // Hero buttons
    this.heroPlayBtn && this.heroPlayBtn.addEventListener('click', () => {
      if (this.currentHero) this.player.open(this.currentHero);
    });

    this.heroMoreInfoBtn && this.heroMoreInfoBtn.addEventListener('click', () => {
      if (this.currentHero) this.openModal(this.currentHero);
    });

    // Recherche
    let searchDebounce = null;
    this.searchInput && this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const query = e.target.value.trim();
      searchDebounce = setTimeout(() => {
        if (query.length > 0) {
          this.performSearch(query);
        } else {
          this.renderCatalog(this.catalogData);
        }
      }, 300);
    });

    // Modal
    this.modalCloseBtn && this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.modalBackdrop && this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });

    this.modalPlayBtn && this.modalPlayBtn.addEventListener('click', () => {
      if (this.currentModalMovie) {
        let s = null;
        let e = null;
        if (this.currentModalMovie.media_type === 'series' || this.currentModalMovie.is_xtream_series) {
          const seasons = this.getMovieSeasons(this.currentModalMovie);
          const validSeasons = seasons.filter(sec => Array.isArray(sec.episodes) && sec.episodes.length > 0);
          const targetSeasons = validSeasons.length > 0 ? validSeasons : seasons;

          let sObj = targetSeasons.find(sec => parseInt(sec.season_number, 10) === parseInt(this.selectedModalSeason, 10));
          if (!sObj) sObj = targetSeasons[0];
          s = sObj ? sObj.season_number : 1;
          const epObj = (sObj?.episodes?.find(ep => parseInt(ep.episode_number, 10) === parseInt(this.selectedModalEpisode, 10))) || sObj?.episodes?.[0];
          e = epObj ? epObj.episode_number : 1;
        }
        this.closeModal();
        this.player.open(this.currentModalMovie, 1, s, e);
      }
    });

    if (this.modalSeasonSelect) {
      this.modalSeasonSelect.addEventListener('change', (e) => {
        this.selectedModalSeason = parseInt(e.target.value) || 1;
        const seasons = this.getMovieSeasons(this.currentModalMovie);
        const seasonObj = seasons.find(s => s.season_number === this.selectedModalSeason) || seasons[0];
        this.selectedModalEpisode = (seasonObj && seasonObj.episodes && seasonObj.episodes[0]) ? seasonObj.episodes[0].episode_number : 1;
        if (this.modalEpisodesSubtitle) {
          this.modalEpisodesSubtitle.textContent = seasonObj ? (seasonObj.name || `Saison ${this.selectedModalSeason}`) : `Saison ${this.selectedModalSeason}`;
        }
        this.renderModalEpisodes();
      });
    }

    this.modalListBtn && this.modalListBtn.addEventListener('click', () => {
      if (this.currentModalMovie) {
        this.toggleMyList(this.currentModalMovie);
        this.updateModalListButton();
      }
    });

    // Liens du header
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const filter = link.dataset.filter;
        this.applyFilter(filter, true);
      });
    });

    // Navigation par l'historique navigateur (Boutons Précédent / Suivant)
    window.addEventListener('popstate', (e) => {
      const filter = (e.state && e.state.filter) || this.detectRouteFilter();
      this.applyFilter(filter, false);
    });

    // Ouverture Mode Admin
    const openAdminBtn = document.getElementById('openAdminBtn');
    if (openAdminBtn) {
      openAdminBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const profileContainer = document.getElementById('profileContainer');
        if (profileContainer) profileContainer.classList.remove('open');
        this.admin.open();
      });
    }

    // Toggle Dropdown Profil au survol (avec marge de tolérance) & au clic
    const profileAvatarBtn = document.getElementById('profileAvatarBtn');
    const profileContainer = document.getElementById('profileContainer');
    if (profileAvatarBtn && profileContainer) {
      let closeTimeout = null;

      profileContainer.addEventListener('mouseenter', () => {
        if (closeTimeout) clearTimeout(closeTimeout);
        profileContainer.classList.add('open');
      });

      profileContainer.addEventListener('mouseleave', () => {
        closeTimeout = setTimeout(() => {
          profileContainer.classList.remove('open');
        }, 350);
      });

      profileAvatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (closeTimeout) clearTimeout(closeTimeout);
        profileContainer.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
        if (!profileContainer.contains(e.target)) {
          if (closeTimeout) clearTimeout(closeTimeout);
          profileContainer.classList.remove('open');
        }
      });
    }

    // Modal de Personnalisation Profil
    const openProfileModalBtn = document.getElementById('openProfileModalBtn');
    if (openProfileModalBtn) {
      openProfileModalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (profileContainer) profileContainer.classList.remove('open');
        this.openProfileModal();
      });
    }
    const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
    if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', () => this.closeProfileModal());
    if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', () => this.closeProfileModal());

    // Déconnexion
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (profileContainer) profileContainer.classList.remove('open');
        this.handleLogout();
      });
    }

    // Centre d'aide
    const helpCenterBtn = document.getElementById('helpCenterBtn');
    if (helpCenterBtn) {
      helpCenterBtn.addEventListener('click', () => {
        if (profileContainer) profileContainer.classList.remove('open');
        this.showToast("ℹ️ Centre d'aide ZIFLIX : Support technique 24/7 actif.");
      });
    }

    // Publication de commentaire dans la fiche média
    const submitCommentBtn = document.getElementById('submitCommentBtn');
    if (submitCommentBtn) {
      submitCommentBtn.addEventListener('click', () => this.submitComment());
    }
    const commentTextInput = document.getElementById('commentTextInput');
    if (commentTextInput) {
      commentTextInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.submitComment();
        }
      });
    }
  }

  async loadCatalog(isInitialSplashLoad = false) {
    try {
      // 1. Rendu instantané 0ms depuis le cache de session (Expérience instantanée sur Mobile)
      if (isInitialSplashLoad && !this.catalogData) {
        try {
          const cachedStr = sessionStorage.getItem('ziflix_catalog_cache');
          if (cachedStr) {
            const cached = JSON.parse(cachedStr);
            if (cached && cached.hero && cached.rows) {
              this.catalogData = cached;
              this.originalHero = cached.hero;
              this.setupHero(cached.hero);
              this.renderCatalog(cached);
              this.dismissSplash();
            }
          }
        } catch (e) {}
      }

      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/catalog`, {
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });
      if (res.status === 401) {
        this.handleLogout();
        return;
      }
      if (res.status === 304) {
        if (isInitialSplashLoad) this.dismissSplash();
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        this.catalogData = json.data;
        const allMovies = json.data.movies || [];
        if (allMovies.length === 0) {
          const seen = new Set();
          (json.data.rows || []).forEach(r => {
            (r.movies || []).forEach(m => {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                allMovies.push(m);
              }
            });
          });
          if (json.data.hero && !seen.has(json.data.hero.id)) {
            allMovies.unshift(json.data.hero);
          }
        }
        this.catalogData.movies = allMovies;

        this.originalHero = json.data.hero;
        this.setupHero(json.data.hero);
        this.renderCatalog(json.data);
        const initialFilter = this.detectRouteFilter();
        if (initialFilter && initialFilter !== 'all') {
          this.applyFilter(initialFilter, false);
        }

        try {
          sessionStorage.setItem('ziflix_catalog_cache', JSON.stringify({
            hero: json.data.hero,
            rows: json.data.rows,
            movies: allMovies
          }));
        } catch (e) {}

        // Déverrouillage immédiat du splash (plus d'attente bloquante 1.6s sur images distantes)
        if (isInitialSplashLoad) {
          this.dismissSplash();
        }
      } else if (isInitialSplashLoad) {
        this.dismissSplash();
      }
    } catch (e) {
      console.error("Erreur lors du chargement du catalogue", e);
      if (isInitialSplashLoad) {
        this.dismissSplash();
      }
    }
  }

  async preloadHeroImage(hero) {
    const urls = [];
    const heroImgUrl = hero ? (hero.backdrop_url || hero.poster_url) : null;
    if (heroImgUrl) urls.push(this.normalizeImageUrl(heroImgUrl));

    // Précharger aussi les 4 premières vignettes de la première rangée
    if (this.catalogData && this.catalogData.rows && this.catalogData.rows[0]) {
      const topMovies = (this.catalogData.rows[0].movies || []).slice(0, 4);
      topMovies.forEach(m => {
        const p = m.poster_url || m.backdrop_url;
        if (p) urls.push(this.normalizeImageUrl(p));
      });
    }

    if (urls.length === 0) return;

    const promises = urls.map(url => {
      return new Promise((resolve) => {
        const img = new Image();
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        img.onload = finish;
        img.onerror = finish;
        img.src = url;
        if (img.decode) {
          img.decode().then(finish).catch(finish);
        }
        setTimeout(finish, 1600); // Max 1.6s par image
      });
    });

    await Promise.race([
      Promise.all(promises),
      new Promise(r => setTimeout(r, 2000)) // Sécurité globale max 2s
    ]);

    // Attendre deux ticks RAF pour que le moteur de rendu peigne la scène sur le GPU
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  setupHero(movie) {
    if (!movie) return;
    this.currentHero = movie;

    if (!this.heroBanner) this.heroBanner = document.getElementById('heroBanner');
    if (!this.heroTitle) this.heroTitle = document.getElementById('heroTitle');
    if (!this.heroSynopsis) this.heroSynopsis = document.getElementById('heroSynopsis');
    if (!this.heroMatch) this.heroMatch = document.getElementById('heroMatch');
    if (!this.heroAge) this.heroAge = document.getElementById('heroAge');
    if (!this.heroDuration) this.heroDuration = document.getElementById('heroDuration');
    if (!this.heroBadges) this.heroBadges = document.getElementById('heroBadges');
    if (!this.heroPlayBtn) this.heroPlayBtn = document.getElementById('heroPlayBtn');

    if (this.heroBanner) {
      this.heroBanner.style.display = '';
      const bgUrl = this.normalizeImageUrl(movie.backdrop_url || movie.poster_url);
      this.heroBanner.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : 'none';
    }
    if (this.heroTitle) this.heroTitle.textContent = movie.title || 'Titre Vedette';
    if (this.heroSynopsis) this.heroSynopsis.textContent = movie.overview || '';

    // Réinitialiser tout gestionnaire onclick spécifique précédent
    if (this.heroPlayBtn) {
      this.heroPlayBtn.onclick = null;
    }

    const isLive = (movie.media_type === 'channel' || movie.is_live);
    if (isLive) {
      if (this.heroMatch) this.heroMatch.innerHTML = `<span class="live-pulse" style="color: #e50914; margin-right: 6px;">●</span> EN DIRECT HD`;
      if (this.heroAge) this.heroAge.textContent = movie.age_rating || 'Tous publics';
      if (this.heroDuration) this.heroDuration.textContent = 'En direct 24/7';
      if (this.heroPlayBtn) {
        this.heroPlayBtn.innerHTML = '<span>▶</span> Regarder en direct';
      }
    } else {
      if (this.heroMatch) this.heroMatch.textContent = movie.match_score ? `Recommandé à ${movie.match_score}%` : 'Recommandé à 98%';
      if (this.heroAge) this.heroAge.textContent = movie.age_rating || '16+';
      const dur = movie.duration || (movie.seasons ? `${movie.seasons.length} Saison(s)` : (movie.media_type === 'series' ? 'Série' : 'Film'));
      if (this.heroDuration) this.heroDuration.textContent = dur;
      if (this.heroPlayBtn) {
        this.heroPlayBtn.innerHTML = '<span>▶</span> Lecture';
      }
    }

    // Badges de qualité
    if (this.heroBadges) {
      this.heroBadges.innerHTML = '';
      (movie.quality_badges || ['4K Ultra HD', '5.1']).forEach(b => {
        const span = document.createElement('span');
        span.className = 'quality-badge';
        span.textContent = b;
        this.heroBadges.appendChild(span);
      });
    }
  }

  renderCatalog(data) {
    if (!this.catalogRowsContainer) this.catalogRowsContainer = document.getElementById('catalogRows');
    if (!this.catalogRowsContainer) return;
    this.catalogRowsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Rangée Reprendre la lecture
    try {
      const continueItems = this.getContinueWatchingList();
      if (continueItems && continueItems.length > 0) {
        const continueRow = this.buildContinueWatchingRow(continueItems);
        if (continueRow) fragment.appendChild(continueRow);
      }
    } catch (e) {
      console.warn('[ZIFLIX] Erreur continue watching:', e);
    }

    // Ligne "Ma Liste" si elle contient des titres
    // Ma Liste uniquement dans onglet Dédié


    // Carrousels de catégories
    if (data && data.rows && data.rows.length > 0) {
      data.rows.forEach(row => {
        try {
          const rowEl = this.buildRowElement(row);
          if (rowEl) fragment.appendChild(rowEl);
        } catch (e) {
          console.warn('[ZIFLIX] Erreur rendu rangée:', row?.category?.name, e);
        }
      });
    }

    this.catalogRowsContainer.appendChild(fragment);
  }

  renderRow(row) {
    if (!row || !row.movies || row.movies.length === 0) return;
    const rowEl = this.buildRowElement(row);
    this.catalogRowsContainer.appendChild(rowEl);
  }

  buildRowElement(row) {
    const rowEl = document.createElement('div');
    rowEl.className = 'movie-row';
    rowEl.innerHTML = `
      <h2 class="row-title">${row.category.name}</h2>
      <div class="row-slider-container">
        <button class="slider-arrow left" aria-label="Défiler à gauche">‹</button>
        <div class="row-slider"></div>
        <button class="slider-arrow right" aria-label="Défiler à droite">›</button>
      </div>
    `;

    const slider = rowEl.querySelector('.row-slider');
    const arrowLeft = rowEl.querySelector('.slider-arrow.left');
    const arrowRight = rowEl.querySelector('.slider-arrow.right');

    arrowLeft.addEventListener('click', () => {
      slider.scrollBy({ left: -600, behavior: 'smooth' });
    });

    arrowRight.addEventListener('click', () => {
      slider.scrollBy({ left: 600, behavior: 'smooth' });
    });

    const cardFragment = document.createDocumentFragment();
    row.movies.forEach(movie => {
      const card = this.createMovieCard(movie);
      cardFragment.appendChild(card);
    });
    slider.appendChild(cardFragment);

    return rowEl;
  }

  createMovieCard(movie) {
    const card = document.createElement('div');
    const isSaved = this.myList.includes(movie.id);
    const isChannel = (movie.media_type === 'channel' || movie.is_live);
    card.className = 'movie-card' + (isChannel ? ' channel-card' : '') + ' focusable';
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-id', movie.id);

    let topBadges = '';
    if (isChannel) {
      topBadges = `
        <span class="live-badge-card"><span class="live-pulse">●</span> EN DIRECT</span>
        ${movie.channel_number ? `<span class="channel-num-badge">CH ${movie.channel_number}</span>` : ''}
      `;
    }

    let tagsHtml = '';
    if (isChannel) {
      tagsHtml = `
        <span style="color: #e50914; font-weight: 800;"><span class="live-pulse">●</span> DIRECT</span>
        <span>${movie.age_rating || 'Tous publics'}</span>
        <span>1080p FHD</span>
      `;
    } else {
      tagsHtml = `
        <span style="color: #46d369; font-weight: 700;">${movie.match_score}%</span>
        <span>${movie.age_rating}</span>
        <span>${movie.duration}</span>
      `;
    }

    const securePoster = this.normalizeImageUrl(movie.poster_url);
    const channelFallback = isChannel ? this.getChannelFallbackSvg(movie.title) : this.getMovieFallbackSvg(movie.title);

    card.innerHTML = `
      <img src="${securePoster}" alt="${movie.title}" class="card-image" loading="lazy" decoding="async">
      ${topBadges}
      <div class="card-overlay">
        <div class="card-title">${movie.title}</div>
        <div class="card-tags">
          ${tagsHtml}
        </div>
        <div class="card-actions">
          <button class="action-circle-btn play-btn" title="Lecture">▶</button>
          <button class="action-circle-btn list-btn" title="${isSaved ? 'Retirer de ma liste' : 'Ajouter à ma liste'}">${isSaved ? '✓' : '+'}</button>
          ${isChannel ? '' : '<button class="action-circle-btn info-btn" title="Plus d\'infos" style="margin-left: auto;">⌄</button>'}
        </div>
      </div>
    `;

    const imgEl = card.querySelector('.card-image');
    if (imgEl) {
      imgEl.addEventListener('error', () => {
        imgEl.src = channelFallback;
      }, { once: true });
    }

    // Événements sur la carte
    card.addEventListener('click', (e) => {
      // 1. Bouton "Ma Liste"
      if (e.target.closest('.list-btn')) {
        e.stopPropagation();
        this.toggleMyList(movie);
        const btn = card.querySelector('.list-btn');
        const isFav = this.isFavorite(movie);
        if (btn) {
          btn.textContent = isFav ? '✓' : '+';
          btn.title = isFav ? 'Retirer de ma liste' : 'Ajouter à ma liste';
        }
        return;
      }

      // 2. Bouton "Plus d'infos" (⌄) : LE SEUL qui doit ouvrir la fiche détaillée (modal)
      if (e.target.closest('.info-btn')) {
        e.stopPropagation();
        this.openModal(movie);
        return;
      }

      // 3. TOUT AUTRE CLIC SUR LA CARTE (affiche, titre, overlay, play-btn) :
      // DÉMARRAGE IMMÉDIAT EN 1 CLIC (0 clic intermédiaire !)
      e.stopPropagation();

      // Chaîne Live
      if (isChannel || movie.is_xtream) {
        this.player.open(movie, 1);
        return;
      }

      // Séries Xtream (Télé-Réalité & séries officielles)
      if (movie.is_xtream_series || (movie.id && String(movie.id).startsWith('xtream_series_')) || movie.series_id) {
        const seriesId = movie.series_id || parseInt(String(movie.id).replace('xtream_series_', ''), 10);
        this.openTeleRealiteSeries({
          series_id: seriesId,
          name: movie.title,
          cover: movie.poster_url,
          backdrop: movie.backdrop_url,
          plot: movie.overview,
          genre: (movie.categories || []).join(' / '),
          year: movie.release_year || 2025
        }, true);
        return;
      }

      // Séries catalogue multi-saisons
      if (movie.media_type === 'series' || (Array.isArray(movie.seasons) && movie.seasons.length > 0)) {
        this.player.open(movie, 1);
        return;
      }

      // Film (Xtream ou catalogue) : Démarrage direct
      this.player.open(movie, 1);
    });

    return card;
  }

  openModal(movie) {
    this.currentModalMovie = movie;
    this.modalBanner.style.backgroundImage = `url(${movie.backdrop_url || movie.poster_url})`;
    this.modalTitle.textContent = movie.title;
    this.modalMatch.textContent = movie.match_score ? `Recommandé à ${movie.match_score}%` : 'Recommandé à 98%';
    this.modalAge.textContent = movie.age_rating || '12+';
    this.modalDuration.textContent = movie.duration || (movie.seasons ? `${movie.seasons.length} saison(s)` : '1 saison');
    this.modalSynopsis.textContent = movie.overview || 'Aucune description disponible pour ce programme.';

    this.modalBadges.innerHTML = '';
    const rawBadges = (movie.quality_badges && movie.quality_badges.length > 0) ? movie.quality_badges : ['1080p FHD', 'Son 5.1'];
    const cleanBadges = [];
    rawBadges.forEach(b => {
      let cleaned = String(b)
        .replace(/1080p FHD Natif/gi, '1080p FHD')
        .replace(/1080p FHD Direct/gi, '1080p FHD')
        .replace(/1080p FHD/gi, '1080p FHD')
        .replace(/Saisons Complètes/gi, 'Saisons Intégrales')
        .trim();
      if (cleaned && !cleanBadges.includes(cleaned)) cleanBadges.push(cleaned);
    });
    (cleanBadges.length > 0 ? cleanBadges : ['1080p FHD', 'Son 5.1']).forEach(b => {
      const span = document.createElement('span');
      span.className = 'quality-badge';
      span.textContent = b;
      this.modalBadges.appendChild(span);
    });

    this.modalCast.textContent = movie.cast && movie.cast.length > 0 ? movie.cast.join(', ') : 'Non communiqué';
    this.modalDirector.textContent = movie.director || 'Non communiqué';

    this.updateModalListButton();
    this.loadModalComments(movie.id);

    // Gestion des saisons & épisodes pour les séries
    if (movie.media_type === 'series' || movie.is_xtream_series) {
      if (this.modalEpisodesSection) {
        this.modalEpisodesSection.classList.remove('hidden');
      }
      const seasons = this.getMovieSeasons(movie);
      const validSeasons = seasons.filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
      const targetSeasons = validSeasons.length > 0 ? validSeasons : seasons;

      const showKey = 'netflix_ep_' + (movie.id || movie.tmdb_id || movie.series_id);
      let defaultS = (targetSeasons && targetSeasons[0]) ? targetSeasons[0].season_number : 1;
      let defaultE = (targetSeasons && targetSeasons[0] && targetSeasons[0].episodes && targetSeasons[0].episodes[0]) ? targetSeasons[0].episodes[0].episode_number : 1;
      try {
        const saved = JSON.parse(localStorage.getItem(showKey));
        if (saved && saved.season && saved.episode) {
          const sExists = targetSeasons.some(s => parseInt(s.season_number, 10) === parseInt(saved.season, 10));
          if (sExists) {
            defaultS = parseInt(saved.season, 10);
            const foundS = targetSeasons.find(s => parseInt(s.season_number, 10) === defaultS);
            if (foundS && foundS.episodes && foundS.episodes.some(e => parseInt(e.episode_number, 10) === parseInt(saved.episode, 10))) {
              defaultE = parseInt(saved.episode, 10);
            }
          }
        }
      } catch (e) {}

      this.selectedModalSeason = defaultS;
      this.selectedModalEpisode = defaultE;
      this.setupModalSeasons(movie);
      this.renderModalEpisodes();

      // Toujours vérifier en direct si de nouveaux épisodes sont sortis sur FoxBleu / Xtream
      const baseUrl = window.API_BASE || '';
      const sId = movie.series_id || (String(movie.id).startsWith('xtream_series_') ? String(movie.id).replace('xtream_series_', '') : ((String(movie.id) === '68628' || String(movie.tmdb_id) === '68628') ? 6715 : null));
      const endpoint = sId ? `${baseUrl}/api/xtream/series-info?series_id=${sId}&refresh=1` : `${baseUrl}/api/movies/${encodeURIComponent(movie.id)}`;
      fetch(endpoint, { headers: this.getAuthHeaders(), credentials: 'include' })
        .then(res => res.json())
        .then(res => {
          const freshSeasons = res.seasons || (res.data && res.data.seasons);
          if (freshSeasons && freshSeasons.length > 0) {
            const oldTotalEps = (movie.seasons || []).reduce((acc, s) => acc + (s.episodes ? s.episodes.length : 0), 0);
            const newTotalEps = freshSeasons.reduce((acc, s) => acc + (s.episodes ? s.episodes.length : 0), 0);
            if (newTotalEps !== oldTotalEps || !movie.seasons || movie.seasons.length === 0) {
              movie.seasons = freshSeasons;
              if (this.catalogData && this.catalogData.movies) {
                const catMovie = this.catalogData.movies.find(m => m.id === movie.id || (sId && (m.series_id == sId || (sId == 6715 && m.id === '68628'))));
                if (catMovie) catMovie.seasons = freshSeasons;
              }
              if (this.currentModalMovie && (this.currentModalMovie.id === movie.id || (sId && this.currentModalMovie.series_id == sId))) {
                const currentS = this.selectedModalSeason;
                this.setupModalSeasons(movie);
                if (freshSeasons.some(s => parseInt(s.season_number, 10) === parseInt(currentS, 10))) {
                  this.selectedModalSeason = currentS;
                  if (this.modalSeasonSelect) this.modalSeasonSelect.value = String(currentS);
                }
                this.renderModalEpisodes();
              }
            }
          }
        })
        .catch(() => {});
    } else {
      if (this.modalEpisodesSection) {
        this.modalEpisodesSection.classList.add('hidden');
      }
    }

    this.modalBackdrop.classList.add('active');
    document.body.classList.add('modal-open');
  }

  setupModalSeasons(movie) {
    if (!this.modalSeasonSelect) return;
    this.modalSeasonSelect.innerHTML = '';
    const seasons = this.getMovieSeasons(movie);
    const validSeasons = seasons.filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
    const seasonsToDisplay = validSeasons.length > 0 ? validSeasons : seasons;

    seasonsToDisplay.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.season_number;
      opt.textContent = s.name || s.title || `Saison ${s.season_number}`;
      this.modalSeasonSelect.appendChild(opt);
    });

    if (!seasonsToDisplay.some(s => parseInt(s.season_number, 10) === parseInt(this.selectedModalSeason, 10))) {
      this.selectedModalSeason = seasonsToDisplay[0] ? seasonsToDisplay[0].season_number : 1;
    }
    this.modalSeasonSelect.value = String(this.selectedModalSeason);
    if (this.modalEpisodesSubtitle) {
      this.modalEpisodesSubtitle.textContent = `Saison ${this.selectedModalSeason}`;
    }
  }

  getMovieSeasons(movie) {
    if (movie.seasons && movie.seasons.length > 0) {
      return movie.seasons;
    }
    // Génération dynamique si aucune saison prédéfinie
    const totalSeasons = Math.min(8, parseInt(movie.duration) || 3);
    const generated = [];
    for (let s = 1; s <= totalSeasons; s++) {
      const epCount = 8;
      const episodes = [];
      for (let e = 1; e <= epCount; e++) {
        episodes.push({
          episode_number: e,
          title: `Épisode ${e}`,
          duration: `${40 + ((e * 3) % 15)} min`,
          overview: `Épisode ${e} de la saison ${s} de ${movie.title}. Un tournant décisif dans l'intrigue.`,
          still_url: movie.backdrop_url || movie.poster_url
        });
      }
      generated.push({
        season_number: s,
        name: `Saison ${s}`,
        episode_count: epCount,
        episodes
      });
    }
    return generated;
  }

  renderModalEpisodes() {
    if (!this.currentModalMovie || this.currentModalMovie.media_type !== 'series') return;
    if (!this.modalEpisodesList) return;
    this.modalEpisodesList.innerHTML = '';
    const seasons = this.getMovieSeasons(this.currentModalMovie);
    const season = seasons.find(s => s.season_number === this.selectedModalSeason) || seasons[0];
    if (!season || !season.episodes) return;

    season.episodes.forEach(ep => {
      const card = document.createElement('div');
      card.className = 'modal-episode-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('title', `Lancer ${this.currentModalMovie.title} - Saison ${this.selectedModalSeason}, Épisode ${ep.episode_number}`);

      const thumbUrl = ep.still_url || this.currentModalMovie.backdrop_url || this.currentModalMovie.poster_url;
      let epTitleClean = ep.title || ("Épisode " + ep.episode_number);
      if (/s\d+e\d+/i.test(epTitleClean) || epTitleClean.toLowerCase().includes('apprentis') || epTitleClean.toLowerCase().includes('villa') || (this.currentModalMovie && this.currentModalMovie.title && epTitleClean.includes(this.currentModalMovie.title))) {
        const m = epTitleClean.match(/épisode\s*(\d+)/i) || epTitleClean.match(/episode\s*(\d+)/i);
        epTitleClean = m ? ("Épisode " + m[1]) : ("Épisode " + ep.episode_number);
      } else if (/^épisode\s*\d+\s*[-:]/i.test(epTitleClean)) {
        const m = epTitleClean.match(/^épisode\s*(\d+)\s*[-:]\s*(.+)$/i);
        if (m && (m[2].toLowerCase().includes('apprentis') || m[2].toLowerCase().includes('2018') || m[2].toLowerCase().includes('2016') || (this.currentModalMovie && this.currentModalMovie.title && m[2].includes(this.currentModalMovie.title)))) {
          epTitleClean = "Épisode " + m[1];
        }
      }

      card.innerHTML = `
        <div class="modal-episode-num">${ep.episode_number}</div>
        <div class="modal-episode-thumb-container">
          <img class="modal-episode-thumb" src="${thumbUrl}" alt="Épisode ${ep.episode_number}" loading="lazy">
          <div class="modal-episode-play-overlay">
            <span class="modal-episode-play-icon">▶</span>
          </div>
        </div>
        <div class="modal-episode-details">
          <div class="modal-episode-top">
            <span class="modal-episode-title">${epTitleClean}</span>
            <span class="modal-episode-duration">${ep.duration || '45 min'}</span>
          </div>
          <p class="modal-episode-overview">${ep.overview || 'Aucune description disponible pour cet épisode.'}</p>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectedModalEpisode = ep.episode_number;
        this.closeModal();
        this.player.open(this.currentModalMovie, 1, this.selectedModalSeason, ep.episode_number);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });

      this.modalEpisodesList.appendChild(card);
    });
  }

  closeModal() {
    this.modalBackdrop.classList.remove('active');
    document.body.classList.remove('modal-open');
  }

  isFavorite(movieOrChannel) {
    if (!movieOrChannel) return false;
    const id = String(movieOrChannel.id || movieOrChannel.stream_id || '');
    if (!id) return false;
    return (this.myList && this.myList.includes(id)) || 
           (Array.isArray(this.myListItems) && this.myListItems.some(x => String(x.id) === id));
  }

  updateModalListButton() {
    if (!this.currentModalMovie || !this.modalListBtn) return;
    const isSaved = this.isFavorite(this.currentModalMovie);
    this.modalListBtn.innerHTML = isSaved ? '✓ Dans ma liste' : '+ Ajouter à ma liste';
    this.modalListBtn.classList.toggle('active', isSaved);
  }

  toggleMyList(movieOrChannel) {
    if (!movieOrChannel) return;
    let itemObj = null;

    if (typeof movieOrChannel === 'string' || typeof movieOrChannel === 'number') {
      const id = String(movieOrChannel);
      itemObj = (this.myListItems || []).find(x => String(x.id) === id);
      if (!itemObj && this.catalogData && this.catalogData.rows) {
        for (const r of this.catalogData.rows) {
          const found = r.movies.find(m => String(m.id) === id);
          if (found) { itemObj = found; break; }
        }
      }
      if (!itemObj) itemObj = { id: id, title: 'Titre' };
    } else {
      itemObj = movieOrChannel;
    }

    const id = String(itemObj.id || itemObj.stream_id || '');
    if (!id) return;

    const isLive = !!(itemObj.is_live || itemObj.media_type === 'channel' || id.startsWith('xtream_'));
    const cleanItem = {
      id: id,
      title: itemObj.title || itemObj.name || 'Sans titre',
      media_type: isLive ? 'channel' : (itemObj.media_type || 'movie'),
      poster_url: this.normalizeImageUrl(itemObj.poster_url || itemObj.icon || itemObj.backdrop_url || ''),
      backdrop_url: this.normalizeImageUrl(itemObj.backdrop_url || itemObj.poster_url || itemObj.icon || ''),
      stream_id: itemObj.stream_id || null,
      stream_url: itemObj.stream_url || (isLive && itemObj.stream_id ? ('/api/stream/xtream?stream_id=' + itemObj.stream_id) : ''),
      is_live: isLive,
      is_xtream: !!(itemObj.is_xtream || id.startsWith('xtream_')),
      category_name: itemObj.category_name || (isLive ? 'Chaîne TV' : ''),
      match_score: itemObj.match_score || 99,
      age_rating: itemObj.age_rating || 'Tous publics'
    };

    if (!Array.isArray(this.myListItems)) this.myListItems = [];
    const existingIdx = this.myListItems.findIndex(x => String(x.id) === id);
    let inList = false;

    if (existingIdx !== -1) {
      this.myListItems.splice(existingIdx, 1);
      this.myList = this.myList.filter(item => String(item) !== id);
      inList = false;
      this.showToast('Retiré de Ma Liste : ' + cleanItem.title);
    } else {
      this.myListItems.unshift(cleanItem);
      if (!this.myList.includes(id)) this.myList.unshift(id);
      inList = true;
      this.showToast('Ajouté à Ma Liste : ' + cleanItem.title);
    }

    try {
      localStorage.setItem('netflix_my_list_items', JSON.stringify(this.myListItems));
      localStorage.setItem('netflix_my_list', JSON.stringify(this.myList));
    } catch (e) {}

    // Synchronisation Cloud avec l\'API
    fetch('/api/favorites/toggle', {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ item: cleanItem })
    }).catch(err => console.warn('[Favorites Sync Error]', err));

    this.updateModalListButton();
    if (this.player && typeof this.player.updatePlayerFavoriteUI === 'function') {
      this.player.updatePlayerFavoriteUI();
    }

    // Mettre à jour tous les boutons cœurs sur la page
    document.querySelectorAll('[data-id="' + id + '"] .fav-btn').forEach(btn => {
      btn.classList.toggle('active', inList);
      btn.innerHTML = inList ? '♥' : '♡';
      btn.title = inList ? 'Retirer de ma liste' : 'Ajouter à ma liste';
    });

    // Si on est actuellement sur la vue "Ma Liste", rafraîchir immédiatement
    const currentFilter = this.detectRouteFilter();
    if (currentFilter === 'my-list') {
      this.applyFilter('my-list', false);
    }
  }

  loadMyList() {
    let items = [];
    let ids = [];
    try {
      const savedItems = localStorage.getItem('netflix_my_list_items');
      if (savedItems) items = JSON.parse(savedItems);
    } catch (e) {}
    try {
      const savedIds = localStorage.getItem('netflix_my_list');
      if (savedIds) ids = JSON.parse(savedIds);
    } catch (e) {}

    this.myListItems = Array.isArray(items) ? items : [];
    this.myList = Array.isArray(ids) ? ids : this.myListItems.map(x => String(x.id));

    // Synchronisation en tâche de fond avec le serveur
    fetch('/api/favorites', { headers: this.getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.favorites)) {
          const serverItems = data.favorites;
          const merged = [...this.myListItems];
          serverItems.forEach(sItem => {
            const exists = merged.some(m => String(m.id) === String(sItem.id));
            if (!exists) merged.push(sItem);
          });
          this.myListItems = merged;
          this.myList = this.myListItems.map(x => String(x.id));
          try {
            localStorage.setItem('netflix_my_list_items', JSON.stringify(this.myListItems));
            localStorage.setItem('netflix_my_list', JSON.stringify(this.myList));
          } catch (e) {}
        }
      })
      .catch(() => {});

    return this.myList;
  }

  getMyListMovies() {
    if (Array.isArray(this.myListItems) && this.myListItems.length > 0) {
      return this.myListItems;
    }
    if (!this.catalogData || !this.catalogData.rows) return [];
    const all = [];
    const seen = new Set();
    this.catalogData.rows.forEach(r => {
      r.movies.forEach(m => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          all.push(m);
        }
      });
    });
    return all.filter(m => this.myList.includes(m.id));
  }

  async performSearch(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      if (this.catalogData) this.renderCatalog(this.catalogData);
      return;
    }

    // 1. Recherche instantanée 0ms en mémoire côté client (Serverless Pure)
    const sourceList = (this.allMovies && this.allMovies.length > 0) ? this.allMovies : (this.catalogData?.movies || []);
    if (sourceList.length > 0) {
      const filtered = sourceList.filter(m => {
        return (m.title && m.title.toLowerCase().includes(q)) ||
               (m.original_title && m.original_title.toLowerCase().includes(q)) ||
               (m.overview && m.overview.toLowerCase().includes(q));
      });

      this.catalogRowsContainer.innerHTML = '';
      const searchRow = {
        category: { name: `Résultats pour "${query}" (${filtered.length})`, slug: "search" },
        movies: filtered
      };
      this.renderRow(searchRow);
      return;
    }

    // 2. Fallback réseau vers le proxy Worker si catalogue non encore en mémoire
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/catalog?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      const results = json.movies || json.data || [];
      this.catalogRowsContainer.innerHTML = '';
      const searchRow = {
        category: { name: `Résultats pour "${query}" (${results.length})`, slug: "search" },
        movies: results
      };
      this.renderRow(searchRow);
    } catch (e) {
      console.error("Erreur de recherche", e);
    }
  }

  detectRouteFilter() {
    const p = window.location.pathname.replace(/^\/+/, '').toLowerCase();
    const h = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const route = p || h;
    if (route === 'series') return 'series';
    if (route === 'films' || route === 'movie' || route === 'movies') return 'movie';
    if (route === 'telerealite' || route === 'tv-realite') return 'telerealite';
    if (route === 'chaines' || route === 'channels' || route === 'live') return 'channels';
    if (route === 'xtream') return 'xtream';
    if (route === 'nouveautes') return 'nouveautes';
    if (route === 'ma-liste' || route === 'my-list') return 'my-list';
    return 'all';
  }

  setActiveNav(filter) {
    document.querySelectorAll('.nav-link').forEach(l => {
      const isActive = l.dataset.filter === filter;
      l.classList.toggle('active', isActive);
      if (isActive && l.classList.contains('mobile-sub-pill')) {
        try {
          l.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } catch (e) {}
      }
    });
  }

  applyFilter(filter, updateHistory = true) {
    if (updateHistory && window.history && window.history.pushState) {
      const filterToPath = {
        'all': '/',
        'series': '/series',
        'movie': '/films',
        'nouveautes': '/nouveautes',
        'my-list': '/ma-liste',
        'channels': '/chaines',
        'xtream': '/xtream',
        'telerealite': '/telerealite'
      };
      const targetPath = filterToPath[filter] || '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ filter }, '', targetPath);
      }
    }
    this.setActiveNav(filter);
    const xtreamToolbar = document.getElementById('xtreamToolbar');
    const telerealiteToolbar = document.getElementById('telerealiteToolbar');

    if (filter === 'xtream') {
      if (xtreamToolbar) xtreamToolbar.style.display = 'block';
      if (telerealiteToolbar) telerealiteToolbar.style.display = 'none';
      this.showXtreamView();
      return;
    } else if (filter === 'telerealite') {
      if (xtreamToolbar) xtreamToolbar.style.display = 'none';
      if (telerealiteToolbar) telerealiteToolbar.style.display = 'block';
      this.showTeleRealiteView();
      return;
    } else {
      if (xtreamToolbar) xtreamToolbar.style.display = 'none';
      if (telerealiteToolbar) telerealiteToolbar.style.display = 'none';
    }

    if (!this.catalogData) return;
    if (filter === 'all') {
      if (this.originalHero) this.setupHero(this.originalHero);
      this.renderCatalog(this.catalogData);
      return;
    }

    if (filter === 'nouveautes') {
      if (this.originalHero) this.setupHero(this.originalHero);
      this.catalogRowsContainer.innerHTML = '';
      const all = this.catalogData?.movies || [];

      // 1. Les plus regardés (Triés par score de match & popularité)
      const topWatched = [...all]
        .filter(m => m.media_type !== 'channel')
        .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
        .slice(0, 18);

      // 2. Nouveautés 2025 - 2026
      const recentMovies = [...all]
        .filter(m =>
          (m.release_year && m.release_year >= 2025) ||
          (m.created_at && m.created_at.startsWith('2026')) ||
          (m.year && m.year >= 2025)
        )
        .sort((a, b) => (b.release_year || b.year || 0) - (a.release_year || a.year || 0));

      // 3. Séries en cours les plus suivies
      const popularSeries = [...all]
        .filter(m => m.media_type === 'series')
        .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
        .slice(0, 18);

      this.renderRow({
        category: { name: "Les Plus Regardés sur ZIFLIX", slug: "top-regardes" },
        movies: topWatched
      });

      if (recentMovies.length > 0) {
        this.renderRow({
          category: { name: "Nouveautés & Sorties Récentes", slug: "nouveautes" },
          movies: recentMovies
        });
      }

      if (popularSeries.length > 0) {
        this.renderRow({
          category: { name: "Séries Populaires", slug: "series-populaires" },
          movies: popularSeries
        });
      }
      return;
    }

    if (filter === 'my-list') {
      if (this.originalHero) this.setupHero(this.originalHero);
      this.catalogRowsContainer.innerHTML = '';
      const myMovies = this.getMyListMovies();
      if (!myMovies || myMovies.length === 0) {
        this.catalogRowsContainer.innerHTML = '<div style="text-align: center; padding: 90px 20px; color: #888;"><h2 style="font-size: 1.6rem; color: #fff; margin-bottom: 8px;">Votre liste est vide</h2><p style="font-size: 0.95rem; color: #aaa; max-width: 460px; margin: 0 auto 24px;">Ajoutez vos films, séries et chaînes de télévision favorites pour les retrouver ici en un clic !</p><button class="btn btn-primary" onclick="window.netflixApp.applyFilter(\'all\')" style="padding: 10px 24px; border-radius: 20px; background: #e50914; border: none; color: #fff; font-weight: 700; cursor: pointer;">Explorer le catalogue</button></div>';
        return;
      }

      const tvChannels = myMovies.filter(m => m.media_type === 'channel' || m.is_live);
      const vodMedia = myMovies.filter(m => m.media_type !== 'channel' && !m.is_live);

      if (tvChannels.length > 0 && vodMedia.length > 0) {
        this.renderRow({
          category: { name: "Chaînes TV Favorites (" + tvChannels.length + ")", slug: "fav-channels" },
          movies: tvChannels
        });
        this.renderRow({
          category: { name: "Films & Séries Favoris (" + vodMedia.length + ")", slug: "fav-vod" },
          movies: vodMedia
        });
      } else {
        this.renderRow({
          category: { name: "Ma Liste (" + myMovies.length + ")", slug: "my-list" },
          movies: myMovies
        });
      }
      return;
    }

    if (filter === 'channels') {
      this.catalogRowsContainer.innerHTML = '';
      const channelCategorySlugs = [
        'c_sports_fr', 'c_ppv_combat', 'c_sports_extreme', 'c_tnt_fr',
        'sports_fr', 'ppv_combat', 'tnt_fr', 'sports_extreme',
        'sport-direct-hd', 'ppv-combat-direct', 'sports-extremes-decouverte'
      ];

      const channelRows = this.catalogData.rows.filter(row =>
        channelCategorySlugs.includes(row.category.slug) ||
        channelCategorySlugs.includes(row.category.id) ||
        row.category.name.toLowerCase().includes('chaîne') ||
        row.category.name.toLowerCase().includes('sport') ||
        row.category.name.toLowerCase().includes('combat') ||
        row.category.name.toLowerCase().includes('tnt') ||
        row.movies.some(m => m.media_type === 'channel' || m.is_live)
      ).map(row => ({
        category: row.category,
        movies: row.movies.filter(m => m.media_type === 'channel' || m.is_live)
      })).filter(row => row.movies.length > 0);

      // Mettre en vedette une chaîne sportive majeure dans la bannière hero
      const featuredChannel = (channelRows[0] && channelRows[0].movies[0]) ||
                              (this.catalogData.movies && this.catalogData.movies.find(m => m.media_type === 'channel'));
      if (featuredChannel) {
        this.setupHero(featuredChannel);
      }

      channelRows.forEach(r => this.renderRow(r));
      return;
    }

    // Filtre par films ou séries
    if (this.originalHero) this.setupHero(this.originalHero);
    this.catalogRowsContainer.innerHTML = '';
    const filteredRows = this.catalogData.rows.map(row => {
      return {
        category: row.category,
        movies: row.movies.filter(m => m.media_type === filter)
      };
    }).filter(row => row.movies.length > 0);

    filteredRows.forEach(r => this.renderRow(r));
  }

  // ================= MÉTHODES XTREAM VIP CATALOGUE & RECHERCHE =================
  initXtreamEvents() {
    if (!this.xtreamSearchInput) return;

    let xtreamSearchDebounce = null;
    this.xtreamSearchInput.addEventListener('input', (e) => {
      clearTimeout(xtreamSearchDebounce);
      const val = e.target.value.trim();
      this.xtreamSearchQuery = val;
      if (this.xtreamSearchClear) {
        this.xtreamSearchClear.style.display = val.length > 0 ? 'flex' : 'none';
      }
      xtreamSearchDebounce = setTimeout(() => {
        this.filterAndRenderXtream();
      }, 200);
    });

    if (this.xtreamSearchClear) {
      this.xtreamSearchClear.addEventListener('click', () => {
        this.xtreamSearchInput.value = '';
        this.xtreamSearchQuery = '';
        this.xtreamSearchClear.style.display = 'none';
        this.filterAndRenderXtream();
        this.xtreamSearchInput.focus();
      });
    }

    if (this.xtreamQualityChips) {
      this.xtreamQualityChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.quality-chip');
        if (!chip) return;
        this.xtreamQualityChips.querySelectorAll('.quality-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedXtreamQuality = chip.getAttribute('data-quality') || 'all';
        this.filterAndRenderXtream();
      });
    }
  }

  renderXtreamCategoryChips(categories) {
    if (!this.xtreamCategoryChips) return;
    this.xtreamCategoryChips.innerHTML = '';
    
    // Bouton "Toutes"
    const allBtn = document.createElement('button');
    allBtn.className = 'xtream-chip category-chip active';
    allBtn.setAttribute('data-category', 'all');
    allBtn.textContent = `Toutes (${this.xtreamChannels ? this.xtreamChannels.length : 1268})`;
    allBtn.addEventListener('click', () => {
      this.xtreamCategoryChips.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      allBtn.classList.add('active');
      this.selectedXtreamCategory = 'all';
      this.filterAndRenderXtream();
    });
    this.xtreamCategoryChips.appendChild(allBtn);

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'xtream-chip category-chip';
      btn.setAttribute('data-category', cat.id);
      btn.textContent = `${cat.name} (${cat.count})`;
      btn.addEventListener('click', () => {
        this.xtreamCategoryChips.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.selectedXtreamCategory = cat.id;
        this.filterAndRenderXtream();
      });
      this.xtreamCategoryChips.appendChild(btn);
    });
  }

  createXtreamCard(channel) {
    const card = document.createElement('div');
    const qClass = (channel.quality || 'hd').toLowerCase();
    card.className = 'movie-card channel-card xtream-card focusable';
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-id', `xtream_${channel.stream_id}`);

    const secureIcon = this.normalizeImageUrl(channel.icon) || 'assets/hero/live-tv-banner.webp';
    const fallbackSvg = this.getChannelFallbackSvg(channel.name);

    const isFav = this.isFavorite('xtream_' + channel.stream_id);
    const movieObj = {
      id: `xtream_${channel.stream_id}`,
      title: channel.name,
      overview: `Chaîne Xtream VIP — Catégorie : ${channel.category_name} • Qualité : ${channel.quality_badge}`,
      poster_url: secureIcon,
      poster_path: secureIcon,
      backdrop_url: secureIcon,
      backdrop_path: secureIcon,
      media_type: 'channel',
      is_live: true,
      is_xtream: true,
      stream_url: `/api/stream/xtream?stream_id=${channel.stream_id}`,
      player_type: 'direct_hls',
      age_rating: 'Tous publics',
      match_score: 99
    };

    card.innerHTML = `
      <img src="${secureIcon}" alt="${channel.name}" class="card-image" loading="lazy" decoding="async">
      <span class="xtream-card-quality-badge badge-${qClass}">${channel.quality_badge}</span>
      <span class="live-badge-card" style="top: 8px; right: 8px; left: auto;"><span class="live-pulse">●</span> DIRECT</span>
      <div class="card-overlay">
        <div class="card-title">${channel.name}</div>
        <div class="card-tags">
          <span style="color: #00d2ff; font-weight: 800;">XTREAM DIRECT</span>
          <span>${channel.category_name}</span>
        </div>
        <div class="card-actions">
          <button class="action-circle-btn play-btn" title="Lecture en direct">▶</button>
          <button class="action-circle-btn fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Retirer de ma liste' : 'Ajouter à ma liste'}">${isFav ? '♥' : '♡'}</button>
        </div>
      </div>
    `;

    const imgEl = card.querySelector('.card-image');
    if (imgEl) {
      imgEl.addEventListener('error', () => {
        imgEl.src = fallbackSvg;
      }, { once: true });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) {
        e.stopPropagation();
        this.toggleMyList(movieObj);
        const btn = card.querySelector('.fav-btn');
        const nowFav = this.isFavorite(movieObj);
        if (btn) {
          btn.classList.toggle('active', nowFav);
          btn.innerHTML = nowFav ? '♥' : '♡';
          btn.title = nowFav ? 'Retirer de ma liste' : 'Ajouter à ma liste';
        }
        return;
      }
      e.stopPropagation();
      this.player.open(movieObj, 1);
    });

    return card;
  }

  async showXtreamView() {
    this.catalogRowsContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #888;">
        <div style="font-size: 1.5rem; margin-bottom: 12px; font-weight: bold; color: #e50914;">ZIFLIX</div>
        <div style="font-size: 1.15rem; color: #fff; font-weight: 600;">Chargement des chaînes Xtream & Sports...</div>
        <div style="font-size: 0.9rem; color: #888; margin-top: 6px;">Indexation des flux UHD, FHD, HEVC, HD et SD...</div>
      </div>
    `;

    if (!this.xtreamChannels) {
      try {
        const baseUrl = window.API_BASE || '';
        const res = await fetch(`${baseUrl}/api/xtream/channels?limit=3500`, {
          headers: this.getAuthHeaders(),
          credentials: 'include'
        });
        const json = await res.json();
        if (json.success && json.data) {
          this.xtreamChannels = json.data;
          this.xtreamCategories = json.categories || [];
          this.renderXtreamCategoryChips(this.xtreamCategories);
        }
      } catch (e) {
        console.error("Erreur chargement chaînes Xtream", e);
      }
    }

    if (!this.xtreamInitialized) {
      this.initXtreamEvents();
      this.xtreamInitialized = true;
    }

    // Configurer le Hero Banner Xtream
    const featured = this.xtreamChannels ? (
      this.xtreamChannels.find(c => c.name.includes('CANAL+ FOOT') && c.quality === 'FHD') ||
      this.xtreamChannels.find(c => c.quality === '4K') ||
      this.xtreamChannels[0]
    ) : null;

    if (featured) {
      this.setupHero({
        id: `xtream_${featured.stream_id}`,
        title: `${featured.name} (Xtream VIP)`,
        overview: `Profitez de plus de 1 268 chaînes françaises en direct : Sports, Généralistes, Cinéma et Événements en 4K UHD, 1080p FHD, HEVC H.265 ou SD.`,
        backdrop_url: featured.icon || 'assets/hero/live-tv-banner.webp',
        poster_url: featured.icon || 'assets/hero/live-tv-banner.webp',
        media_type: 'channel',
        is_live: true,
        is_xtream: true,
        stream_url: `/api/stream/xtream?stream_id=${featured.stream_id}`,
        player_type: 'direct_hls',
        quality_badges: ['1080p FHD', featured.quality_badge, 'Anti-Saccades Turbo']
      });
    }

    this.filterAndRenderXtream();
  }

  filterAndRenderXtream() {
    if (!this.xtreamChannels) return;
    this.catalogRowsContainer.innerHTML = '';

    const q = (this.xtreamSearchQuery || '').toLowerCase().trim();
    const cat = this.selectedXtreamCategory;
    const qual = this.selectedXtreamQuality;

    let filtered = this.xtreamChannels;

    if (cat !== 'all') {
      filtered = filtered.filter(c => c.category_id === cat);
    }

    if (qual !== 'all') {
      filtered = filtered.filter(c => c.quality.toLowerCase() === qual);
    }

    if (q) {
      const terms = q.split(/\s+/).filter(t => t.length > 0);
      filtered = filtered.filter(c => {
        const target = `${c.name} ${c.raw_name} ${c.category_name} ${c.quality_badge}`.toLowerCase();
        return terms.every(term => target.includes(term));
      });
    }

    // Mettre à jour le compteur
    if (this.xtreamCountDisplay) {
      this.xtreamCountDisplay.textContent = `${filtered.length} chaîne${filtered.length > 1 ? 's' : ''} française${filtered.length > 1 ? 's' : ''} trouvée${filtered.length > 1 ? 's' : ''} sur ${this.xtreamChannels.length}`;
    }

    if (filtered.length === 0) {
      this.catalogRowsContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #888;">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
          <h3 style="color: #fff; margin-bottom: 8px;">Aucune chaîne trouvée</h3>
          <p>Essayez avec d'autres mots-clés (ex: "Canal", "TF1", "4K", "beIN", "Foot", "SD").</p>
        </div>
      `;
      return;
    }

    // Si recherche active ou filtre qualité actif -> Grille progressive ultra-fluide (36 par lot)
    if (q || qual !== 'all' || (cat !== 'all' && filtered.length > 36)) {
      const grid = document.createElement('div');
      grid.className = 'xtream-grid-container';
      
      const BATCH_SIZE = 36;
      let renderedCount = 0;

      const renderNextBatch = () => {
        const nextBatch = filtered.slice(renderedCount, renderedCount + BATCH_SIZE);
        const frag = document.createDocumentFragment();
        nextBatch.forEach(channel => {
          frag.appendChild(this.createXtreamCard(channel));
        });
        grid.appendChild(frag);
        renderedCount += nextBatch.length;

        const oldMoreBtn = grid.parentElement?.querySelector('.xtream-load-more-container');
        if (oldMoreBtn) oldMoreBtn.remove();

        if (renderedCount < filtered.length) {
          const loadMoreDiv = document.createElement('div');
          loadMoreDiv.className = 'xtream-load-more-container';
          loadMoreDiv.style.cssText = 'text-align: center; margin: 32px 0 48px; width: 100%;';
          loadMoreDiv.innerHTML = `
            <button class="btn btn-secondary" style="padding: 12px 28px; font-weight: 700; border-radius: 24px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; transition: all 0.2s;">
              Afficher plus de chaînes (${renderedCount} / ${filtered.length})
            </button>
          `;
          loadMoreDiv.querySelector('button').addEventListener('click', () => renderNextBatch());
          this.catalogRowsContainer.appendChild(loadMoreDiv);
        }
      };

      this.catalogRowsContainer.appendChild(grid);
      renderNextBatch();
      return;
    }

    // Sinon -> Rangées thématiques style Netflix
    const groups = {};
    filtered.forEach(c => {
      groups[c.category_name] = groups[c.category_name] || [];
      groups[c.category_name].push(c);
    });

    Object.keys(groups).forEach(catName => {
      const channels = groups[catName];
      if (channels.length === 0) return;
      const rowEl = document.createElement('div');
      rowEl.className = 'movie-row';
      rowEl.innerHTML = `
        <h2 class="row-title">${catName} <span style="font-size: 0.85rem; color: #00d2ff; font-weight: 500;">(${channels.length})</span></h2>
        <div class="row-slider-container">
          <button class="slider-arrow left" aria-label="Défiler à gauche"><</button>
          <div class="row-slider"></div>
          <button class="slider-arrow right" aria-label="Défiler à droite">></button>
        </div>
      `;
      const slider = rowEl.querySelector('.row-slider');
      const leftArrow = rowEl.querySelector('.slider-arrow.left');
      const rightArrow = rowEl.querySelector('.slider-arrow.right');

      leftArrow.addEventListener('click', () => {
        slider.scrollBy({ left: -slider.clientWidth * 0.75, behavior: 'smooth' });
      });
      rightArrow.addEventListener('click', () => {
        slider.scrollBy({ left: slider.clientWidth * 0.75, behavior: 'smooth' });
      });

      const fragment = document.createDocumentFragment();
      const visibleChannels = channels.slice(0, 24);
      visibleChannels.forEach(ch => {
        fragment.appendChild(this.createXtreamCard(ch));
      });
      if (channels.length > 24) {
        const moreCard = document.createElement('div');
        moreCard.className = 'movie-card channel-card xtream-card focusable';
        moreCard.style.display = 'flex';
        moreCard.style.flexDirection = 'column';
        moreCard.style.alignItems = 'center';
        moreCard.style.justifyContent = 'center';
        moreCard.style.background = 'linear-gradient(135deg, rgba(0, 210, 255, 0.15), rgba(0, 0, 0, 0.8))';
        moreCard.style.border = '1px dashed #00d2ff';
        moreCard.style.cursor = 'pointer';
        moreCard.innerHTML = `
          <div style="font-size: 1.8rem; margin-bottom: 8px; color: #e50914;">+</div>
          <div style="font-weight: 700; color: #fff; text-align: center; padding: 0 10px;">Voir toutes les ${channels.length} chaînes</div>
          <div style="font-size: 0.8rem; color: #00d2ff; margin-top: 4px;">${catName}</div>
        `;
        moreCard.addEventListener('click', () => {
          this.selectedXtreamCategory = channels[0].category_id;
          const chips = this.xtreamCategoryChips.querySelectorAll('.xtream-chip');
          chips.forEach(c => {
            if (c.getAttribute('data-cat') === this.selectedXtreamCategory) c.classList.add('active');
            else c.classList.remove('active');
          });
          this.filterAndRenderXtream();
        });
        fragment.appendChild(moreCard);
      }
      slider.appendChild(fragment);
      this.catalogRowsContainer.appendChild(rowEl);
    });
  }

  // ================= MÉTHODES TÉLÉ-RÉALITÉ XTREAM (CATÉGORIE 947) =================
  initTeleRealiteEvents() {
    if (!this.telerealiteSearchInput) return;

    let searchDebounce = null;
    this.telerealiteSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const rawVal = e.target.value;
      this.telerealiteSearchQuery = rawVal;
      if (this.telerealiteSearchClear) {
        this.telerealiteSearchClear.style.display = rawVal.trim().length > 0 ? 'flex' : 'none';
      }
      searchDebounce = setTimeout(() => {
        this.filterAndRenderTeleRealite();
      }, 150);
    });

    if (this.telerealiteSearchClear) {
      this.telerealiteSearchClear.addEventListener('click', () => {
        this.telerealiteSearchInput.value = '';
        this.telerealiteSearchQuery = '';
        this.telerealiteSearchClear.style.display = 'none';
        this.filterAndRenderTeleRealite();
        this.telerealiteSearchInput.focus();
      });
    }

    if (this.telerealiteFilterChips) {
      this.telerealiteFilterChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.telerealite-chip');
        if (!chip) return;
        this.telerealiteFilterChips.querySelectorAll('.telerealite-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.telerealiteFilter = chip.getAttribute('data-filter') || 'all';
        this.filterAndRenderTeleRealite();
      });
    }
  }

  prefetchTeleRealiteSeries(seriesId) {
    if (!seriesId || this.telerealiteSeriesCache.has(seriesId)) return;
    const baseUrl = window.API_BASE || '';
    fetch(`${baseUrl}/api/xtream/series-info?series_id=${seriesId}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    })
      .then(res => res.json())
      .then(seriesObj => {
        if (seriesObj.success && seriesObj.seasons) {
          this.telerealiteSeriesCache.set(seriesId, seriesObj);
        }
      })
      .catch(() => {});
  }

  createTeleRealiteCard(show) {
    const card = document.createElement('div');
    card.className = 'movie-card focusable';
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-id', `xtream_series_${show.series_id}`);

    const badgeYear = show.year ? `<span class="movie-card-badge">${show.year}</span>` : '';
    const ratingText = show.rating ? `★ ${show.rating}` : '★ 7.5';

    card.innerHTML = `
      <img src="${show.cover}" alt="${show.name}" class="card-image" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='assets/hero/live-tv-banner.webp'">
      ${badgeYear}
      <span class="live-badge-card" style="top: 8px; right: 8px; left: auto; background: linear-gradient(135deg, #e50914, #b20710); font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; font-weight: 800;">📺 FHD</span>
      <div class="card-overlay">
        <div class="card-title">${show.name}</div>
        <div class="card-tags">
          <span style="color: #46d369; font-weight: 800;">${ratingText}</span>
          <span>${show.genre || 'Télé-Réalité'}</span>
          <span>${show.year || '2025'}</span>
        </div>
        <div class="card-actions">
          <button class="action-circle-btn play-btn" title="Lecture directe">▶</button>
          <button class="action-circle-btn info-btn" title="Voir les saisons et épisodes" style="margin-left: auto;">⌄</button>
        </div>
      </div>
    `;

    // Préchargement intelligent au survol ou au focus pour ouverture instantanée (0ms)
    card.addEventListener('mouseenter', () => {
      this.prefetchTeleRealiteSeries(show.series_id);
    }, { once: true });
    card.addEventListener('focus', () => {
      this.prefetchTeleRealiteSeries(show.series_id);
    }, { once: true });

    card.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.target.closest('.info-btn')) {
        await this.openTeleRealiteSeries(show, false);
      } else {
        await this.openTeleRealiteSeries(show, true);
      }
    });

    return card;
  }

  async openTeleRealiteSeries(show, directPlay = false) {
    const pickEpisode = (seasons) => {
      const valid = (seasons || []).filter(s => Array.isArray(s.episodes) && s.episodes.length > 0);
      if (valid.length === 0) return { sNum: 1, epNum: 1 };

      const showKey = 'netflix_ep_' + (show.series_id || show.id);
      try {
        const saved = JSON.parse(localStorage.getItem(showKey));
        if (saved && saved.season && saved.episode) {
          const sExists = valid.some(s => parseInt(s.season_number, 10) === parseInt(saved.season, 10));
          if (sExists) return { sNum: parseInt(saved.season, 10), epNum: parseInt(saved.episode, 10) };
        }
      } catch (e) {}

      const sorted = [...valid].sort((a, b) => parseInt(b.season_number, 10) - parseInt(a.season_number, 10));
      const targetSeason = sorted[0] || valid[0];
      const sNum = parseInt(targetSeason.season_number, 10);
      const eps = targetSeason.episodes || [];
      const epNum = (eps[0] && (eps[0].episode_number || eps[0].episode_num)) ? (eps[0].episode_number || eps[0].episode_num) : 1;
      return { sNum, epNum };
    };

    // 1. Accélération immédiate : si la fiche et les saisons sont déjà en mémoire
    const cached = this.telerealiteSeriesCache.get(show.series_id);
    if (cached) {
      if (directPlay) {
        const { sNum, epNum } = pickEpisode(cached.seasons);
        this.player.open(cached, 1, sNum, epNum);
      } else {
        this.openModal(cached);
      }
      return;
    }

    // 2. Retour visuel instantané pour rassurer l'utilisateur pendant le chargement
    if (directPlay) {
      this.player.showLoader(`⚡ Connexion aux épisodes de ${show.name} (1080p FHD)...`);
      this.player.overlay.classList.add('active');
      this.player.showControls();
      this.player.resetSteps();
      this.player.setStep(1, 'active', `1. Récupération des saisons et épisodes (${show.name})...`);
    } else {
      // Pré-ouvrir la modal avec les informations de base immédiatement
      this.openModal({
        id: `xtream_series_${show.series_id}`,
        title: show.name,
        poster_url: show.cover,
        backdrop_url: show.backdrop || show.cover,
        overview: show.plot || 'Chargement des saisons et épisodes officiels Xtream en cours...',
        media_type: 'series',
        is_xtream_series: true,
        seasons: []
      });
      if (this.modalEpisodesSection) {
        this.modalEpisodesSection.classList.remove('hidden');
        if (this.modalEpisodesList) {
          this.modalEpisodesList.innerHTML = `<div style="padding: 30px; text-align: center; color: #bbb;"><span style="display:inline-block; font-size: 1.4rem; margin-bottom: 8px;">⏳</span><br>Chargement des saisons & épisodes en cours...</div>`;
        }
      }
    }

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/xtream/series-info?series_id=${show.series_id}`, {
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });
      const seriesObj = await res.json();

      if (!seriesObj.success || !seriesObj.seasons || seriesObj.seasons.length === 0) {
        throw new Error(seriesObj.message || "Aucune saison disponible pour cette émission");
      }

      this.telerealiteSeriesCache.set(show.series_id, seriesObj);

      // Synchroniser la fiche du catalogue si présente (ex: La Villa) pour que la page d'accueil ait les nouveaux épisodes
      const existingInCatalog = this.catalogData?.movies?.find(m => m.id === '68628' || m.tmdb_id === '68628');
      if (show.series_id === 6715 && existingInCatalog) {
        existingInCatalog.seasons = seriesObj.seasons;
      }

      if (directPlay) {
        const { sNum, epNum } = pickEpisode(seriesObj.seasons);
        this.player.setStep(1, 'done', `1. ${seriesObj.seasons.length} saison(s) chargée(s) avec succès`);
        this.player.open(seriesObj, 1, sNum, epNum);
      } else {
        this.openModal(seriesObj);
      }
    } catch (err) {
      console.warn('[TV Réalité Open Error]:', err.message);
      if (directPlay) {
        this.player.showStatusBanner(`Erreur lors du chargement des épisodes: ${err.message}`);
        setTimeout(() => {
          this.player.close();
        }, 2500);
      } else if (this.modalEpisodesList) {
        this.modalEpisodesList.innerHTML = `<div style="padding: 24px; text-align: center; color: #e50914;">Impossible de charger les épisodes (${err.message}). Veuillez réessayer.</div>`;
      }
    }
  }

  async showTeleRealiteView() {
    this.catalogRowsContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #888;">
        <div style="font-size: 1.3rem; margin-bottom: 12px; font-weight: bold; color: #e50914;">ZIFLIX DIRECT</div>
        <div style="font-size: 1.15rem; color: #fff; font-weight: 600;">Chargement des 223 séries de Télé-Réalité...</div>
        <div style="font-size: 0.9rem; color: #888; margin-top: 6px;">Vraies saisons, vrais épisodes en 1080p Full HD...</div>
      </div>
    `;

    if (!this.telerealiteShows || this.telerealiteShows.length === 0) {
      try {
        const stored = sessionStorage.getItem('telerealite_shows_cache');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.telerealiteShows = parsed;
          }
        }
      } catch (e) {}

      if (!this.telerealiteShows || this.telerealiteShows.length === 0) {
        try {
          const baseUrl = window.API_BASE || '';
          const res = await fetch(`${baseUrl}/api/xtream/telerealite?limit=300`, {
            headers: this.getAuthHeaders(),
            credentials: 'include'
          });
          const json = await res.json();
          if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
            this.telerealiteShows = json.data;
            try { sessionStorage.setItem('telerealite_shows_cache', JSON.stringify(json.data)); } catch (e) {}
          }
        } catch (e) {
          console.error("Erreur chargement télé-réalité", e);
        }
      }
    }

    if (!this.telerealiteShows || this.telerealiteShows.length === 0) {
      this.catalogRowsContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #888;">
          <div style="font-size: 2.2rem; margin-bottom: 12px; color: #e50914;">⚠️</div>
          <div style="font-size: 1.15rem; color: #fff; font-weight: 600;">Impossible de charger le catalogue Télé-Réalité pour le moment.</div>
          <p style="font-size: 0.9rem; color: #aaa; margin: 8px auto 16px;">Veuillez vérifier votre connexion ou réactualiser la page.</p>
          <button class="btn btn-primary" style="padding: 10px 24px; background: #e50914; border: none; color: #fff; border-radius: 20px; cursor: pointer; font-weight: bold;" onclick="delete window.netflixApp.telerealiteShows; sessionStorage.removeItem('telerealite_shows_cache'); window.netflixApp.showTeleRealiteView();">Réessayer 🔄</button>
        </div>
      `;
      return;
    }

    if (!this.telerealiteInitialized) {
      this.initTeleRealiteEvents();
      this.telerealiteInitialized = true;
    }

    // Configurer le Hero Banner avec une émission phare
    const featured = (
      this.telerealiteShows.find(s => s.name.toLowerCase().includes('la villa')) ||
      this.telerealiteShows.find(s => s.year === 2026) ||
      this.telerealiteShows[0]
    );

    if (featured) {
      this.setupHero({
        id: `xtream_series_${featured.series_id}`,
        title: `${featured.name}`,
        overview: featured.plot || `Les épisodes authentiques de télé-réalité en streaming 1080p FHD sans coupure.`,
        backdrop_url: featured.backdrop || featured.cover,
        poster_url: featured.cover,
        media_type: 'series',
        is_xtream_series: true,
        quality_badges: ['1080p FHD Natif', 'Saisons Complètes', '1080p FHD']
      });
      if (this.heroPlayBtn) {
        this.heroPlayBtn.onclick = () => {
          this.openTeleRealiteSeries(featured, true);
        };
      }
    }

    this.filterAndRenderTeleRealite();
  }

  filterAndRenderTeleRealite() {
    if (!this.telerealiteShows) return;
    this.catalogRowsContainer.innerHTML = '';

    const q = (this.telerealiteSearchQuery || '').toLowerCase().trim();
    const filter = this.telerealiteFilter || 'all';

    let filtered = this.telerealiteShows;

    if (filter === '2026') {
      filtered = filtered.filter(s => s.year === 2026);
    } else if (filter === '2025') {
      filtered = filtered.filter(s => s.year === 2025);
    } else if (filter === 'villa') {
      filtered = filtered.filter(s => {
        const n = (s.name + ' ' + (s.plot || '')).toLowerCase();
        return n.includes('villa') || n.includes('tentation') || n.includes('séduction') || n.includes('love') || n.includes('amoureuse') || n.includes('princes');
      });
    } else if (filter === 'competition') {
      filtered = filtered.filter(s => {
        const n = (s.name + ' ' + (s.plot || '')).toLowerCase();
        return n.includes('cinquante') || n.includes('traîtres') || n.includes('lanta') || n.includes('ferme') || n.includes('sauce') || n.includes('defi');
      });
    }

    if (q) {
      const terms = q.split(/\s+/).filter(t => t.length > 0);
      filtered = filtered.filter(s => {
        const target = `${s.name} ${s.raw_name || ''} ${s.cast || ''} ${s.year || ''}`.toLowerCase();
        return terms.every(term => target.includes(term));
      });
    }

    // Mettre à jour le compteur
    if (this.telerealiteCountDisplay) {
      this.telerealiteCountDisplay.textContent = `${filtered.length} émission${filtered.length > 1 ? 's' : ''} trouvée${filtered.length > 1 ? 's' : ''} sur ${this.telerealiteShows.length} séries de Télé-Réalité`;
    }

    if (filtered.length === 0) {
      this.catalogRowsContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: #888;">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 1.2rem; color: #fff; font-weight: 600;">Aucune émission de télé-réalité ne correspond à votre recherche</div>
          <div style="font-size: 0.9rem; color: #888; margin-top: 6px;">Essayez d'autres mots-clés (ex: "La Villa", "Les Cinquante", "Traîtres", "2026")...</div>
        </div>
      `;
      return;
    }

    // Si recherche active ou filtre spécifique : afficher en carrousel direct des résultats
    if (q || filter !== 'all') {
      const filterLabels = {
        '2026': 'Nouveautés 2026',
        '2025': 'Saisons 2025',
        'villa': '❤️ La Villa des Cœurs Brisés & Séduction',
        'competition': 'Compétition & Survie'
      };
      const title = q ? `Résultats pour "${q}" (${filtered.length})` : `${filterLabels[filter] || 'Sélection'} (${filtered.length})`;
      this.renderTeleRealiteRow(title, filtered);
      return;
    }

    // Mode "Toutes les émissions" : Générer des carrousels thématiques Netflix
    const s2026 = filtered.filter(s => s.year === 2026);
    const sVilla = filtered.filter(s => {
      const n = (s.name + ' ' + (s.plot || '')).toLowerCase();
      return n.includes('villa') || n.includes('tentation') || n.includes('séduction') || n.includes('love');
    });
    const sCompetition = filtered.filter(s => {
      const n = (s.name + ' ' + (s.plot || '')).toLowerCase();
      return n.includes('cinquante') || n.includes('traîtres') || n.includes('lanta') || n.includes('ferme') || n.includes('island');
    });

    if (s2026.length > 0) {
      this.renderTeleRealiteRow(`✨ Nouveautés Télé-Réalité 2026 (${s2026.length})`, s2026);
    }
    if (sVilla.length > 0) {
      this.renderTeleRealiteRow(`❤️ Romance, La Villa & Séduction (${sVilla.length})`, sVilla);
    }
    if (sCompetition.length > 0) {
      this.renderTeleRealiteRow(`Compétition, Stratégie & Survie (${sCompetition.length})`, sCompetition);
    }
    this.renderTeleRealiteRow(`Toutes les Émissions de Télé-Réalité (${filtered.length})`, filtered);
  }

  renderTeleRealiteRow(title, shows) {
    const rowEl = document.createElement('section');
    rowEl.className = 'catalog-row';
    rowEl.innerHTML = `
      <h2 class="row-title">${title}</h2>
      <div class="row-slider-container">
        <button class="slider-arrow left" aria-label="Précédent">‹</button>
        <div class="row-slider"></div>
        <button class="slider-arrow right" aria-label="Suivant">›</button>
      </div>
    `;
    const slider = rowEl.querySelector('.row-slider');
    const leftArrow = rowEl.querySelector('.slider-arrow.left');
    const rightArrow = rowEl.querySelector('.slider-arrow.right');

    leftArrow.addEventListener('click', () => {
      slider.scrollBy({ left: -slider.clientWidth * 0.75, behavior: 'smooth' });
    });
    rightArrow.addEventListener('click', () => {
      slider.scrollBy({ left: slider.clientWidth * 0.75, behavior: 'smooth' });
    });

    const fragment = document.createDocumentFragment();
    shows.forEach(show => {
      fragment.appendChild(this.createTeleRealiteCard(show));
    });
    slider.appendChild(fragment);
    this.catalogRowsContainer.appendChild(rowEl);
  }

  // ================= 12. GESTION DU PROFIL & AUTHENTIFICATION OBLIGATOIRE ZIFLIX =================
  initAuthElements() {
    this.ziflixApp = document.getElementById('ziflixApp');
    this.authGateModal = document.getElementById('authGateModal');
    this.splashElement = document.getElementById('ziflixSplash');
    this.authGateTitle = document.getElementById('authGateTitle');
    this.authGateSubtitle = document.getElementById('authGateSubtitle');
    this.tabLoginBtn = document.getElementById('tabLoginBtn');
    this.tabRegisterBtn = document.getElementById('tabRegisterBtn');
    this.loginForm = document.getElementById('loginForm');
    this.registerForm = document.getElementById('registerForm');
    this.loginError = document.getElementById('loginError');
    this.registerError = document.getElementById('registerError');

    this.profileCustomModal = document.getElementById('profileCustomModal');
    this.profileUpdateForm = document.getElementById('profileUpdateForm');
    this.profileInputUsername = document.getElementById('profileInputUsername');
    this.profileInputCustomUrl = document.getElementById('profileInputCustomUrl');
    this.profileUpdateError = document.getElementById('profileUpdateError');
  }

  initAuthEvents() {
    // Onglets Connexion / Inscription
    if (this.tabLoginBtn && this.tabRegisterBtn) {
      const resetModalScroll = () => {
        const modal = document.getElementById('authGateModal');
        if (modal) modal.scrollTop = 0;
      };

      this.tabLoginBtn.addEventListener('click', () => {
        this.tabLoginBtn.classList.add('active');
        this.tabRegisterBtn.classList.remove('active');
        if (this.loginForm) this.loginForm.classList.remove('hidden');
        if (this.registerForm) this.registerForm.classList.add('hidden');
        if (this.loginError) this.loginError.classList.add('hidden');
        if (this.authGateTitle) this.authGateTitle.textContent = 'Bienvenue sur ZIFLIX';
        if (this.authGateSubtitle) this.authGateSubtitle.textContent = 'Films & séries en streaming illimité';
        resetModalScroll();
      });

      this.tabRegisterBtn.addEventListener('click', () => {
        this.tabRegisterBtn.classList.add('active');
        this.tabLoginBtn.classList.remove('active');
        if (this.registerForm) this.registerForm.classList.remove('hidden');
        if (this.loginForm) this.loginForm.classList.add('hidden');
        if (this.registerError) this.registerError.classList.add('hidden');
        if (this.authGateTitle) this.authGateTitle.textContent = 'Créer mon profil ZIFLIX';
        if (this.authGateSubtitle) this.authGateSubtitle.textContent = 'Choisissez votre pseudo et votre avatar exclusif';
        resetModalScroll();
      });
    }

    // Toggle d'URL personnalisée (Création de profil)
    const toggleCustomBtn = document.getElementById('regToggleCustomUrlBtn');
    const customContainer = document.getElementById('regCustomUrlContainer');
    const toggleArrow = document.getElementById('regToggleArrow');
    if (toggleCustomBtn && customContainer) {
      toggleCustomBtn.addEventListener('click', () => {
        customContainer.classList.toggle('hidden');
        const isOpen = !customContainer.classList.contains('hidden');
        if (toggleArrow) toggleArrow.classList.toggle('open', isOpen);
        if (isOpen) {
          const inp = document.getElementById('regCustomAvatarUrl');
          if (inp) inp.focus();
        }
      });
    }

    const regCustomInput = document.getElementById('regCustomAvatarUrl');
    if (regCustomInput) {
      regCustomInput.addEventListener('input', () => {
        if (regCustomInput.value.trim()) {
          const regGrid = document.getElementById('regAvatarGrid');
          if (regGrid) {
            regGrid.querySelectorAll('.avatar-choice-item').forEach(el => el.classList.remove('active'));
          }
        }
      });
    }

    // Boutons pour afficher/masquer le mot de passe
    document.querySelectorAll('.auth-eye-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          const isPass = input.type === 'password';
          input.type = isPass ? 'text' : 'password';
          btn.textContent = isPass ? '🙈' : '👁️';
        }
      });
    });

    // Soumission Connexion
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Soumission Inscription
    if (this.registerForm) {
      this.registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    }

    // Soumission Mise à jour Profil
    if (this.profileUpdateForm) {
      this.profileUpdateForm.addEventListener('submit', (e) => this.handleProfileUpdate(e));
    }
  }

  renderAvatarSelectionGrids() {
    const regGrid = document.getElementById('regAvatarGrid');
    const profileGrid = document.getElementById('profileAvatarGrid');

    const populateGrid = (gridEl, isProfileModal = false) => {
      if (!gridEl) return;
      gridEl.innerHTML = '';
      this.avatarsList.forEach(avatarPath => {
        const item = document.createElement('div');
        item.className = 'avatar-choice-item';
        const isSelected = isProfileModal
          ? (this.selectedProfileAvatar === avatarPath)
          : (this.selectedRegAvatar === avatarPath);
        if (isSelected) item.classList.add('active');

        item.innerHTML = `<img src="${avatarPath}" alt="Avatar ZIFLIX" class="avatar-choice-img">`;
        item.addEventListener('click', () => {
          gridEl.querySelectorAll('.avatar-choice-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          if (isProfileModal) {
            this.selectedProfileAvatar = avatarPath;
            const previewImg = document.getElementById('profileModalCurrentAvatar');
            if (previewImg) previewImg.src = avatarPath;
            if (this.profileInputCustomUrl) this.profileInputCustomUrl.value = '';
          } else {
            this.selectedRegAvatar = avatarPath;
            const regCustomUrl = document.getElementById('regCustomAvatarUrl');
            if (regCustomUrl) regCustomUrl.value = '';
          }
        });
        gridEl.appendChild(item);
      });
    };

    populateGrid(regGrid, false);
    populateGrid(profileGrid, true);
  }

  async checkAuth() {
    const token = localStorage.getItem('ziflix_auth_token');
    this.renderAvatarSelectionGrids();

    // Watchdog de sécurité (max 3.8s) : empêche tout blocage sur le splash si le réseau lag
    this.splashWatchdog = setTimeout(() => {
      if (!this.splashDismissed) {
        console.warn('[ZIFLIX] Splash watchdog triggered');
        if (!this.currentUser) {
          this.showAuthGate();
        } else {
          this.dismissSplash();
        }
      }
    }, 3800);

    if (!token) {
      this.showAuthGate();
      return;
    }

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });
      const json = await res.json();
      if (json.success && json.user) {
        this.setCurrentUser(json.user);
        this.unlockApp();
      } else {
        localStorage.removeItem('ziflix_auth_token');
        this.showAuthGate();
      }
    } catch (e) {
      this.showAuthGate();
    }
  }

  dismissSplash() {
    if (this.splashDismissed) return;
    this.splashDismissed = true;
    if (this.splashWatchdog) {
      clearTimeout(this.splashWatchdog);
      this.splashWatchdog = null;
    }

    const splash = this.splashElement || document.getElementById('ziflixSplash');
    if (!splash) return;

    const startTime = this.splashStartTime || window.__ZIFLIX_SPLASH_START || Date.now();
    const elapsed = Date.now() - startTime;
    // Durée minimale de 450ms pour une expérience fluide et cinématique (évite un flash cut)
    const minDuration = 450;
    const delay = Math.max(0, minDuration - elapsed);

    setTimeout(() => {
      splash.classList.add('splash-dismiss');
      const cleanup = () => {
        splash.setAttribute('aria-hidden', 'true');
        splash.style.display = 'none';
        splash.removeEventListener('transitionend', cleanup);
      };
      splash.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 550); // Watchdog Smart TV si transitionend n'est pas émis
    }, delay);
  }

  async unlockApp() {
    if (this.authGateModal) this.authGateModal.classList.add('hidden');
    if (this.ziflixApp) this.ziflixApp.style.display = 'block';

    if (!this.catalogData) {
      // Charger le catalogue et attendre le préchargement complet du Hero et des cartes
      await this.loadCatalog(true);
    } else {
      this.dismissSplash();
    }
    this.checkWelcomeTimerModal();
    this.initHomeTimer();
  }

  showAuthGate() {
    if (this.splashWatchdog) {
      clearTimeout(this.splashWatchdog);
      this.splashWatchdog = null;
    }
    if (this.ziflixApp) this.ziflixApp.style.display = 'none';
    if (this.authGateModal) this.authGateModal.classList.remove('hidden');
    const welcomeToast = document.getElementById('welcomeTimerModal');
    if (welcomeToast) welcomeToast.classList.add('hidden');
    const navTimer = document.getElementById('navWatchTimer');
    if (navTimer) navTimer.style.display = 'none';
    this.dismissSplash();
  }

  setCurrentUser(user) {
    this.currentUser = user;
    try {
      localStorage.setItem('ziflix_user', JSON.stringify(user));
      const isVipUser = !!(user && (user.role === 'vip' || user.is_vip));
      localStorage.setItem('ziflix_is_vip', isVipUser ? 'true' : 'false');
      localStorage.setItem('ziflix_is_admin', (user && user.role === 'admin') ? 'true' : 'false');

      const prevUserId = localStorage.getItem('ziflix_current_user_id');
      if (user && user.id && user.id !== prevUserId) {
        localStorage.setItem('ziflix_current_user_id', user.id);
        const userAccepted = localStorage.getItem('ziflix_welcome_accepted_' + user.id);
        if (userAccepted !== 'true') {
          localStorage.removeItem('ziflix_welcome_accepted');
          const now = Date.now();
          const currentExp = parseInt(localStorage.getItem('ziflix_watch_expires_at') || '0', 10);
          if (isNaN(currentExp) || currentExp <= now) {
            localStorage.setItem('ziflix_watch_expires_at', String(now + 1200 * 1000));
            localStorage.setItem('ziflix_watch_credit', '1200');
          }
        }
      }
    } catch (e) {}

    const headerProfileImg = document.getElementById('headerProfileImg');
    const headerUsernameDisplay = document.getElementById('headerUsernameDisplay');
    const commentCurrentUserAvatar = document.getElementById('commentCurrentUserAvatar');

    if (headerProfileImg && user.avatar) headerProfileImg.src = user.avatar;
    if (commentCurrentUserAvatar && user.avatar) commentCurrentUserAvatar.src = user.avatar;

    const isVip = !!(user && (user.role === 'vip' || user.is_vip));
    const isAdmin = (user.role === 'admin' || user.is_admin || user.isAdmin);
    const isVipOrAdmin = this.isVipOrAdmin(user);

    if (headerUsernameDisplay && user.username) {
      if (isVip && !isAdmin) {
        headerUsernameDisplay.innerHTML = `${this.escapeHtml(user.username)} <span class="badge-vip" style="background: linear-gradient(135deg, #ffd700, #ffaa00); color: #000; font-weight: 800; font-size: 0.65rem; padding: 2px 5px; border-radius: 4px; margin-left: 5px; vertical-align: middle; box-shadow: 0 0 8px rgba(255,215,0,0.35);">⭐ VIP</span>`;
      } else {
        headerUsernameDisplay.textContent = user.username;
      }
    }

    const openAdminBtn = document.getElementById('openAdminBtn');
    if (openAdminBtn) {
      openAdminBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    const welcomeModal = document.getElementById('welcomeTimerModal');
    const navTimer = document.getElementById('navWatchTimer');
    const zeroModal = document.getElementById('zeroCreditHomeModal');

    if (isVipOrAdmin) {
      if (welcomeModal) {
        welcomeModal.classList.add('hidden');
        welcomeModal.style.display = 'none';
      }
      if (navTimer) navTimer.style.display = 'none';
      if (zeroModal) zeroModal.classList.add('hidden');
    } else {
      if (welcomeModal) welcomeModal.style.display = '';
      if (navTimer) navTimer.style.display = 'inline-flex';
      if (zeroModal) zeroModal.classList.add('hidden');
      if (!this.authGateModal || this.authGateModal.classList.contains('hidden')) {
        this.checkWelcomeTimerModal();
      }
      this.initHomeTimer();
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) return;

    if (this.loginError) this.loginError.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Connexion en cours...';
    }

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json();

      if (json.success && json.token && json.user) {
        localStorage.setItem('ziflix_auth_token', json.token);
        this.setCurrentUser(json.user);
        this.unlockApp();
        this.showToast(`✨ Bienvenue ${json.user.username} sur ZIFLIX !`);
      } else {
        if (this.loginError) {
          this.loginError.textContent = json.error || 'Identifiant ou mot de passe incorrect.';
          this.loginError.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (this.loginError) {
        this.loginError.textContent = 'Erreur réseau. Veuillez réessayer.';
        this.loginError.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Entrer sur ZIFLIX ▶';
      }
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('regUsername');
    const passwordInput = document.getElementById('regPassword');
    const customUrlInput = document.getElementById('regCustomAvatarUrl');
    const submitBtn = document.getElementById('registerSubmitBtn');
    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const customUrl = customUrlInput ? customUrlInput.value.trim() : '';
    const avatar = customUrl || this.selectedRegAvatar || 'assets/avatars/avatar-1.svg';

    if (!username || !password) return;

    if (this.registerError) this.registerError.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Création du profil...';
    }

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, avatar })
      });
      const json = await res.json();

      if (json.success && json.token && json.user) {
        localStorage.setItem('ziflix_auth_token', json.token);

        // NOUVEAU COMPTE : Réinitialiser pour ce profil et accorder immédiatement 20 minutes offertes (1200s) sans pub
        const now = Date.now();
        const initial20Min = 1200;
        localStorage.setItem('ziflix_current_user_id', json.user.id);
        localStorage.setItem('ziflix_watch_expires_at', String(now + initial20Min * 1000));
        localStorage.setItem('ziflix_watch_credit', String(initial20Min));
        localStorage.removeItem('ziflix_welcome_accepted');
        localStorage.setItem('ziflix_welcome_accepted_' + json.user.id, 'false');

        // Masquer immédiatement tout modal zéro crédit hérité
        const zeroModal = document.getElementById('zeroCreditHomeModal');
        if (zeroModal) zeroModal.classList.add('hidden');

        this.setCurrentUser(json.user);
        this.unlockApp();

        // Afficher directement le modal de félicitations d'accueil 20 min sans pub
        this.checkWelcomeTimerModal(true);
        this.showToast(`Profil ZIFLIX créé ! Félicitations, vos 20 minutes offertes sans pub sont activées.`);
      } else {
        if (this.registerError) {
          this.registerError.textContent = json.error || 'Erreur lors de la création du profil.';
          this.registerError.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (this.registerError) {
        this.registerError.textContent = 'Erreur réseau. Veuillez réessayer.';
        this.registerError.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Créer mon profil ZIFLIX ✨';
      }
    }
  }

  async handleLogout() {
    const token = localStorage.getItem('ziflix_auth_token');
    if (token) {
      try {
        const baseUrl = window.API_BASE || '';
        await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'include'
        });
      } catch (e) {}
    }
    localStorage.removeItem('ziflix_auth_token');
    localStorage.removeItem('ziflix_user');
    localStorage.removeItem('ziflix_is_vip');
    localStorage.removeItem('ziflix_is_admin');
    localStorage.removeItem('ziflix_current_user_id');
    localStorage.removeItem('ziflix_welcome_accepted');
    localStorage.removeItem('ziflix_watch_expires_at');
    localStorage.removeItem('ziflix_watch_credit');
    this.currentUser = null;
    this.catalogData = null;
    if (this.catalogRowsContainer) this.catalogRowsContainer.innerHTML = '';
    const welcomeToast = document.getElementById('welcomeTimerModal');
    if (welcomeToast) welcomeToast.classList.add('hidden');
    const zeroModal = document.getElementById('zeroCreditHomeModal');
    if (zeroModal) zeroModal.classList.add('hidden');
    this.showAuthGate();
    this.showToast('Vous avez été déconnecté.');
  }

  openProfileModal() {
    if (!this.profileCustomModal) return;
    if (this.currentUser) {
      if (this.profileInputUsername) this.profileInputUsername.value = this.currentUser.username || '';
      const modalAvatar = document.getElementById('profileModalCurrentAvatar');
      const modalUsername = document.getElementById('profileModalUsername');
      const modalRole = document.getElementById('profileModalRole');
      if (modalAvatar) modalAvatar.src = this.currentUser.avatar || 'assets/avatars/avatar-1.svg';
      if (modalUsername) modalUsername.textContent = this.currentUser.username || 'Membre';
      if (modalRole) {
        if (this.currentUser.role === 'admin') {
          modalRole.textContent = 'Administrateur';
        } else if (this.currentUser.role === 'vip' || this.currentUser.is_vip) {
          modalRole.innerHTML = '<span style="color: #ffd700; font-weight: bold;">⭐ VIP (Illimité & Sans pub)</span>';
        } else {
          modalRole.textContent = 'Membre ZIFLIX';
        }
      }
      this.selectedProfileAvatar = this.currentUser.avatar || this.avatarsList[0];
      this.renderAvatarSelectionGrids();
    }
    if (this.profileUpdateError) this.profileUpdateError.classList.add('hidden');
    this.profileCustomModal.classList.add('active');
  }

  closeProfileModal() {
    if (this.profileCustomModal) {
      this.profileCustomModal.classList.remove('active');
    }
  }

  async handleProfileUpdate(e) {
    e.preventDefault();
    const token = localStorage.getItem('ziflix_auth_token');
    if (!token) return;

    const newUsername = this.profileInputUsername ? this.profileInputUsername.value.trim() : '';
    const customUrl = this.profileInputCustomUrl ? this.profileInputCustomUrl.value.trim() : '';
    const avatar = customUrl || this.selectedProfileAvatar;

    if (!newUsername) return;

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: newUsername, avatar })
      });
      const json = await res.json();

      if (json.success && json.user) {
        this.setCurrentUser(json.user);
        this.closeProfileModal();
        this.showToast('✅ Profil mis à jour avec succès !');
      } else {
        if (this.profileUpdateError) {
          this.profileUpdateError.textContent = json.error || 'Erreur lors de la modification.';
          this.profileUpdateError.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (this.profileUpdateError) {
        this.profileUpdateError.textContent = 'Erreur de communication.';
        this.profileUpdateError.classList.remove('hidden');
      }
    }
  }

  // ================= 13. COMMENTAIRES FICHE MÉDIA =================
  async loadModalComments(mediaId) {
    const listEl = document.getElementById('modalCommentsList');
    const countEl = document.getElementById('modalCommentsCount');
    if (!listEl) return;
    listEl.innerHTML = '<div style="color: #888; font-size: 0.85rem; padding: 10px 0;">Chargement des avis...</div>';

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/comments?mediaId=${encodeURIComponent(mediaId)}`, {
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.comments)) {
        if (countEl) countEl.textContent = json.comments.length;
        if (json.comments.length === 0) {
          listEl.innerHTML = '<div style="color: #777; font-size: 0.85rem; font-style: italic; padding: 12px 0;">Soyez le premier à partager votre avis sur ce programme !</div>';
          return;
        }
        listEl.innerHTML = '';
        json.comments.forEach(c => {
          const item = document.createElement('div');
          item.className = 'comment-card';
          const isAuthor = this.currentUser && this.currentUser.id === c.userId;
          const isAdmin = this.currentUser && (this.currentUser.role === 'admin' || localStorage.getItem('ziflix_admin_token') === '1965');
          const isAuthorOrAdmin = isAuthor || isAdmin;
          item.innerHTML = `
            <img src="${c.avatar || 'assets/avatars/avatar-1.svg'}" alt="${c.username}" class="comment-author-avatar">
            <div class="comment-card-body">
              <div class="comment-card-header">
                <span class="comment-author-name">
                  ${c.username}
                  ${isAdmin && c.ip ? `<span style="color: #888; font-size: 0.7rem; font-weight: normal; margin-left: 6px; font-family: monospace; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px;">IP: ${c.ip}</span>` : ''}
                </span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="comment-date">${new Date(c.createdAt || c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  ${isAdmin ? `<button type="button" class="comment-ban-btn" data-id="${c.id}" data-user-id="${c.userId || c.user_id}" data-username="${c.username}" title="Bannir cet utilisateur et son adresse IP" style="background: rgba(229, 9, 20, 0.22); color: #ff5252; border: 1px solid rgba(229, 9, 20, 0.45); border-radius: 4px; padding: 2px 7px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;">🚫 Bannir</button>` : ''}
                  ${isAuthorOrAdmin ? `<button type="button" class="comment-delete-btn" data-id="${c.id}" title="Supprimer">🗑️</button>` : ''}
                </div>
              </div>
              <p class="comment-text">${c.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
          `;
          if (isAuthorOrAdmin) {
            item.querySelector('.comment-delete-btn')?.addEventListener('click', () => this.deleteComment(c.id, mediaId));
          }
          if (isAdmin) {
            item.querySelector('.comment-ban-btn')?.addEventListener('click', () => this.banUserFromComment(c.id, c.userId || c.user_id, c.username, mediaId));
          }
          listEl.appendChild(item);
        });
      }
    } catch (err) {
      if (listEl) listEl.innerHTML = '<div style="color: #e50914; font-size: 0.82rem;">Erreur de chargement des avis.</div>';
    }
  }

  async submitComment() {
    const input = document.getElementById('commentTextInput');
    if (!input || !this.currentModalMovie) return;
    const text = input.value.trim();
    if (!text) return;

    const token = localStorage.getItem('ziflix_auth_token');
    if (!token) {
      this.showToast('Veuillez vous connecter pour publier un avis.', true);
      return;
    }

    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          mediaId: this.currentModalMovie.id,
          text
        })
      });
      const json = await res.json();
      if (json.success) {
        input.value = '';
        this.loadModalComments(this.currentModalMovie.id);
        this.showToast('Votre avis a été publié !');
      } else {
        this.showToast(json.error || 'Erreur lors de la publication', true);
      }
    } catch (e) {
      this.showToast('Erreur réseau lors de la publication', true);
    }
  }

  async banUserFromComment(commentId, userId, username, mediaId) {
    if (!confirm(`Voulez-vous vraiment bannir définitivement "${username}" et son adresse IP ?\nLe compte sera suspendu, son IP bannie et le commentaire supprimé.`)) {
      return;
    }
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
        this.showToast(`Utilisateur "${username}" et son adresse IP ont été bannis`);
        this.loadModalComments(mediaId);
      } else {
        this.showToast(json.error || 'Erreur lors du bannissement', true);
      }
    } catch(e) {
      this.showToast('Erreur réseau', true);
    }
  }

  async deleteComment(commentId, mediaId) {
    const token = localStorage.getItem('ziflix_auth_token');
    if (!token) return;
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/comments?id=${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ commentId, id: commentId })
      });
      const json = await res.json();
      if (json.success) {
        this.loadModalComments(mediaId);
        this.showToast('Commentaire supprimé.');
      }
    } catch (e) {}
  }

  // ================= 18. GESTION DU SIGNALEMENT DE BUGS ZIFLIX =================
  initBugReporting() {
    const modal = document.getElementById('bugReportModal');
    const form = document.getElementById('bugReportForm');
    const closeBtn = document.getElementById('closeBugReportModalBtn');
    const cancelBtn = document.getElementById('cancelBugReportBtn');
    const detailBtn = document.getElementById('detailReportBugBtn');
    const contextBox = document.getElementById('bugContextBox');
    const contextTitle = document.getElementById('bugContextTitle');
    const feedbackMsg = document.getElementById('bugFeedbackMsg');
    const submitBtn = document.getElementById('submitBugReportBtn');

    let currentBugContext = {
      media_title: '',
      media_id: '',
      season: null,
      episode: null,
      episode_id: null
    };

    window.openBugReportModal = (ctx = {}) => {
      currentBugContext = {
        media_title: ctx.media_title || '',
        media_id: ctx.media_id || '',
        season: ctx.season || null,
        episode: ctx.episode || null,
        episode_id: ctx.episode_id || null
      };

      if (contextBox && contextTitle) {
        if (currentBugContext.media_title) {
          let label = currentBugContext.media_title;
          if (currentBugContext.season && currentBugContext.episode) {
            label += ` • Saison ${currentBugContext.season} Épisode ${currentBugContext.episode}`;
          }
          contextTitle.textContent = label;
          contextBox.style.display = 'flex';
        } else {
          contextBox.style.display = 'none';
        }
      }

      if (feedbackMsg) {
        feedbackMsg.className = 'bug-feedback-msg hidden';
        feedbackMsg.textContent = '';
      }

      if (form) form.reset();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Envoyer le signalement ▶';
      }

      if (modal) modal.style.display = 'flex';
    };

    const closeBugModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeBugModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeBugModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBugModal();
      });
    }

    if (detailBtn) {
      detailBtn.addEventListener('click', () => {
        if (this.currentMovie) {
          window.openBugReportModal({
            media_title: this.currentMovie.title || '',
            media_id: this.currentMovie.id || '',
            season: this.currentSeason || 1,
            episode: this.currentEpisode || 1
          });
        } else {
          window.openBugReportModal();
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedCat = form.querySelector('input[name="bugCategory"]:checked')?.value || 'other';
        const description = (document.getElementById('bugDescription')?.value || '').trim();

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Envoi en cours...';
        }

        try {
          const baseUrl = window.API_BASE || '';
          const token = localStorage.getItem('ziflix_auth_token');
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const payload = {
            category: selectedCat,
            description,
            media_id: currentBugContext.media_id,
            media_title: currentBugContext.media_title,
            season: currentBugContext.season,
            episode: currentBugContext.episode,
            episode_id: currentBugContext.episode_id,
            url: window.location.href
          };

          const res = await fetch(`${baseUrl}/api/bugs/report`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          const data = await res.json();

          if (data.success) {
            if (feedbackMsg) {
              feedbackMsg.className = 'bug-feedback-msg success';
              feedbackMsg.textContent = '✅ ' + (data.message || 'Signalement transmis à l\'administrateur !');
              feedbackMsg.classList.remove('hidden');
            }
            setTimeout(() => {
              closeBugModal();
              this.showToast('Signalement transmis avec succès.');
            }, 1600);
          } else {
            throw new Error(data.error || 'Erreur lors de l\'envoi');
          }
        } catch (err) {
          if (feedbackMsg) {
            feedbackMsg.className = 'bug-feedback-msg error';
            feedbackMsg.textContent = '⚠️ ' + err.message;
            feedbackMsg.classList.remove('hidden');
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Réessayer ▶';
          }
        }
      });
    }
  }

  showToast(message, isError = false) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }


  // ================= 🎬 REPRENDRE LA LECTURE & GESTION ADMIN =================
  isAdmin() {
    if (this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.is_admin || this.currentUser.isAdmin)) return true;
    try {
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

  isVipOrAdmin(user = null) {
    if (this.isAdmin()) return true;
    const u = user || this.currentUser;
    if (u && (u.role === 'vip' || u.role === 'admin' || u.is_vip || u.is_premium)) return true;
    try {
      const raw = localStorage.getItem('ziflix_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.role === 'vip' || parsed.role === 'admin' || parsed.is_vip || parsed.is_premium)) return true;
      }
      if (localStorage.getItem('ziflix_is_vip') === 'true') return true;
    } catch (e) {}
    return false;
  }

  getContinueWatchingList() {
    try {
      const raw = localStorage.getItem('ziflix_continue_watching');
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter(item => item && item.id && (item.currentTime >= 10 || item.progressPct > 0) && (item.progressPct || 0) < 95);
    } catch (e) {
      return [];
    }
  }

  buildContinueWatchingRow(items) {
    const rowEl = document.createElement('div');
    rowEl.className = 'movie-row continue-watching-row';
    rowEl.innerHTML = `
      <h2 class="row-title">Reprendre la lecture</h2>
      <div class="row-slider-container">
        <button class="slider-arrow left" aria-label="Défiler à gauche">‹</button>
        <div class="row-slider"></div>
        <button class="slider-arrow right" aria-label="Défiler à droite">›</button>
      </div>
    `;

    const slider = rowEl.querySelector('.row-slider');
    const arrowLeft = rowEl.querySelector('.slider-arrow.left');
    const arrowRight = rowEl.querySelector('.slider-arrow.right');

    if (arrowLeft) arrowLeft.addEventListener('click', () => slider.scrollBy({ left: -600, behavior: 'smooth' }));
    if (arrowRight) arrowRight.addEventListener('click', () => slider.scrollBy({ left: 600, behavior: 'smooth' }));

    const cardFragment = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'movie-card continue-card focusable';
      card.setAttribute('tabindex', '0');

      // Priorité absolue à la carte d'affiche verticale (poster_url, poster, cover)
      let rawImg = item.poster_url || item.poster || item.cover || item.card_image;
      if (!rawImg && item.movieData) {
        rawImg = item.movieData.poster_url || item.movieData.poster || item.movieData.cover;
      }
      if (!rawImg && this.catalogData && Array.isArray(this.catalogData.movies)) {
        const found = this.catalogData.movies.find(m => String(m.id) === String(item.id) || (item.title && m.title && m.title.toLowerCase() === item.title.toLowerCase()));
        if (found) {
          rawImg = found.poster_url || found.poster || found.cover;
        }
      }
      if (!rawImg && this.movies && Array.isArray(this.movies)) {
        const found = this.movies.find(m => String(m.id) === String(item.id) || (item.title && m.title && m.title.toLowerCase() === item.title.toLowerCase()));
        if (found) {
          rawImg = found.poster_url || found.poster || found.cover;
        }
      }
      if (!rawImg && this.catalog && Array.isArray(this.catalog)) {
        const found = this.catalog.find(m => String(m.id) === String(item.id) || (item.title && m.title && m.title.toLowerCase() === item.title.toLowerCase()));
        if (found) {
          rawImg = found.poster_url || found.poster || found.cover;
        }
      }
      // Fallback si aucune affiche portrait n'est disponible
      if (!rawImg) {
        rawImg = item.backdrop_url || item.backdrop || item.still_url || (item.movieData && (item.movieData.backdrop_url || item.movieData.backdrop));
      }

      const secureImg = this.normalizeImageUrl(rawImg) || 'assets/hero/live-tv-banner.webp';
      const fallbackSvg = this.getMovieFallbackSvg(item.title);
      const remSec = Math.max(0, (item.duration || 0) - (item.currentTime || 0));
      const remMin = Math.round(remSec / 60);
      const remLabel = remMin > 0 ? `${remMin} min restantes` : '';
      const epLabel = item.season ? `S${item.season}:E${item.episode}` : (item.media_type === 'series' ? 'Série' : 'Film');

      card.innerHTML = `
        <img class="card-image card-img" src="${secureImg}" alt="${this.escapeHtml(item.title || '')}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${fallbackSvg}';">
        <button type="button" class="continue-remove-btn" title="Retirer de la liste" aria-label="Supprimer">✕</button>
        <div class="continue-info-pill">
          <span class="continue-ep-tag">${epLabel}</span>
          ${remLabel ? `<span class="continue-time-tag">${remLabel}</span>` : ''}
        </div>
        <div class="continue-progress-wrap">
          <div class="continue-progress-fill" style="width: ${item.progressPct || 0}%;"></div>
        </div>
        <div class="card-overlay">
          <div class="card-title">${this.escapeHtml(item.title || '')}</div>
          <div class="card-actions">
            <button class="action-btn play-btn" title="Reprendre la lecture">▶</button>
          </div>
        </div>
      `;

      const removeBtn = card.querySelector('.continue-remove-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeFromContinueWatching(item.id);
          card.remove();
          if (slider.children.length === 0) {
            rowEl.remove();
          }
        });
      }

      card.addEventListener('click', () => {
        let movieObj = item.movieData;
        if (!movieObj) {
          if (this.movies && Array.isArray(this.movies)) {
            movieObj = this.movies.find(m => String(m.id) === String(item.id));
          }
          if (!movieObj && this.catalog && Array.isArray(this.catalog)) {
            movieObj = this.catalog.find(m => String(m.id) === String(item.id));
          }
        }
        if (!movieObj) {
          movieObj = {
            id: item.id,
            title: item.title,
            poster: item.poster || item.poster_url,
            backdrop: item.backdrop || item.backdrop_url,
            poster_url: item.poster_url || item.poster,
            backdrop_url: item.backdrop_url || item.backdrop,
            media_type: item.media_type
          };
        }
        this.player.open(movieObj, 1, item.season, item.episode);
      });

      cardFragment.appendChild(card);
    });

    slider.appendChild(cardFragment);
    return rowEl;
  }

  removeFromContinueWatching(id) {
    try {
      let list = JSON.parse(localStorage.getItem('ziflix_continue_watching')) || [];
      list = list.filter(item => String(item.id) !== String(id));
      localStorage.setItem('ziflix_continue_watching', JSON.stringify(list));
    } catch (e) {}
  }


  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  initTimerUI() {
    this.initHomeTimer();
    // Ne pas afficher si l'utilisateur n'est pas encore connecté ou si l'auth gate est affichée
    if (this.currentUser && (!this.authGateModal || this.authGateModal.classList.contains('hidden'))) {
      this.checkZeroCreditModal();
      this.checkWelcomeTimerModal();
    }
  }

  getWatchCredit() {
    if (this.isVipOrAdmin()) return 999999;
    if (this.player && typeof this.player.getWatchCredit === 'function') {
      return this.player.getWatchCredit();
    }
    try {
      const expStr = localStorage.getItem('ziflix_watch_expires_at');
      const now = Date.now();
      if (!expStr) {
        const legacy = parseInt(localStorage.getItem('ziflix_watch_credit') || '0', 10);
        if (legacy > 0 && !localStorage.getItem('ziflix_watch_migrated')) {
          localStorage.setItem('ziflix_watch_migrated', 'true');
          const newExp = now + legacy * 1000;
          localStorage.setItem('ziflix_watch_expires_at', String(newExp));
          return Math.min(3600, legacy);
        }
        const currentUserId = (this.currentUser && this.currentUser.id) ? this.currentUser.id : localStorage.getItem('ziflix_current_user_id');
        const userAccepted = currentUserId ? localStorage.getItem('ziflix_welcome_accepted_' + currentUserId) : null;
        const accepted = userAccepted === 'true' || (userAccepted === null && localStorage.getItem('ziflix_welcome_accepted') === 'true');
        if (!accepted) return 1200;
        return 0;
      }
      const exp = parseInt(expStr, 10);
      if (isNaN(exp) || exp <= now) return 0;
      return Math.min(3600, Math.floor((exp - now) / 1000));
    } catch (e) {
      return 0;
    }
  }

  initHomeTimer() {
    this.navWatchTimer = document.getElementById('navWatchTimer');
    this.navWatchTimerVal = document.getElementById('navWatchTimerVal');
    this.navWatchTimerBtn = document.getElementById('navWatchTimerBtn');

    if (this.isVipOrAdmin()) {
      if (this.navWatchTimer) this.navWatchTimer.style.display = 'none';
      const zeroModal = document.getElementById('zeroCreditHomeModal');
      if (zeroModal) zeroModal.classList.add('hidden');
      const welcomeModal = document.getElementById('welcomeTimerModal');
      if (welcomeModal) welcomeModal.classList.add('hidden');
      return;
    }

    if (this.navWatchTimer) {
      this.navWatchTimer.style.display = 'inline-flex';
    }

    const currentCredit = this.getWatchCredit();
    this.updateHomeTimerDisplay(currentCredit);

    if (this.navWatchTimerBtn && !this.navWatchTimerBtn._hasListener) {
      this.navWatchTimerBtn._hasListener = true;
      const onBtnRecharge = (e) => {
        if (e) {
          try { e.preventDefault(); } catch (err) {}
          try { e.stopPropagation(); } catch (err) {}
        }
        if (typeof window.rechargeWatchCreditDirect === "function") {
          window.rechargeWatchCreditDirect(e);
        } else if (window.netflixPlayer && typeof window.netflixPlayer.rechargeWatchCredit === "function") {
          window.netflixPlayer.rechargeWatchCredit(false);
        } else if (this.player && typeof this.player.rechargeWatchCredit === "function") {
          this.player.rechargeWatchCredit(false);
        }
      };
      this.navWatchTimerBtn.onclick = onBtnRecharge;
      this.navWatchTimerBtn.addEventListener("click", onBtnRecharge);
      this.navWatchTimerBtn.addEventListener("pointerdown", (e) => { if(e) e.stopPropagation(); });
      this.navWatchTimerBtn.addEventListener("touchend", (e) => {
        if (e) e.preventDefault();
        onBtnRecharge(e);
      });
    }

    // Défilement continu du timer en temps réel (horloge réelle / wall-clock)
    if (this.homeTimerInterval) {
      clearInterval(this.homeTimerInterval);
      this.homeTimerInterval = null;
    }
    this.homeTimerInterval = setInterval(() => {
      if (this.isVipOrAdmin()) {
        if (this.navWatchTimer) this.navWatchTimer.style.display = 'none';
        return;
      }
      const credit = this.getWatchCredit();
      this.updateHomeTimerDisplay(credit);

      // Si le lecteur n'est pas ouvert et que le crédit est à 0 pour un utilisateur ayant déjà accepté
      const playerOverlay = document.getElementById('netflixPlayer');
      const isPlayerOpen = playerOverlay && playerOverlay.classList.contains('active');
      if (!isPlayerOpen && credit <= 0) {
        const accepted = localStorage.getItem('ziflix_welcome_accepted');
        if (accepted) {
          this.checkZeroCreditModal();
        }
      }
    }, 1000);
  }

  updateHomeTimerDisplay(credit) {
    if (this.isVipOrAdmin()) {
      if (this.navWatchTimer) this.navWatchTimer.style.display = 'none';
      const zeroModal = document.getElementById('zeroCreditHomeModal');
      if (zeroModal) zeroModal.classList.add('hidden');
      const welcomeModal = document.getElementById('welcomeTimerModal');
      if (welcomeModal) welcomeModal.classList.add('hidden');
      return;
    }
    if (!this.navWatchTimer) this.navWatchTimer = document.getElementById('navWatchTimer');
    if (!this.navWatchTimerVal) this.navWatchTimerVal = document.getElementById('navWatchTimerVal');
    if (!this.navWatchTimerBtn) this.navWatchTimerBtn = document.getElementById('navWatchTimerBtn');

    if (this.navWatchTimer) {
      this.navWatchTimer.style.display = 'inline-flex';
      if (credit <= 300) {
        this.navWatchTimer.classList.add('timer-low');
      } else {
        this.navWatchTimer.classList.remove('timer-low');
      }
    }

    credit = Math.max(0, Math.round(credit));
    const mins = Math.floor(credit / 60);
    const secs = credit % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (this.navWatchTimerVal) {
      this.navWatchTimerVal.textContent = timeStr;
    }

    // Si le crédit redevient > 0, masquer le pop-up 0 minute
    if (credit > 0) {
      const zeroModal = document.getElementById('zeroCreditHomeModal');
      if (zeroModal) zeroModal.classList.add('hidden');
    }

    // Si aucune recharge en cours, gérer l'état max 60 min
    const isPending = (this.player && this.player.isRechargePending);
    if (!isPending && this.navWatchTimerBtn) {
      if (credit >= 3600) {
        this.navWatchTimerBtn.disabled = true;
        this.navWatchTimerBtn.textContent = 'Max 60m';
        this.navWatchTimerBtn.title = 'Crédit maximum de 60 minutes atteint';
      } else {
        this.navWatchTimerBtn.disabled = false;
        this.navWatchTimerBtn.textContent = '+20';
        this.navWatchTimerBtn.title = 'Recharger +20 min gratuites';
      }
    }
  }

  checkZeroCreditModal() {
    if (this.isVipOrAdmin()) {
      const modal = document.getElementById('zeroCreditHomeModal');
      if (modal) modal.classList.add('hidden');
      return;
    }
    const modal = document.getElementById('zeroCreditHomeModal');
    if (!modal) return;
    if (this.authGateModal && !this.authGateModal.classList.contains('hidden')) return;
    if (document.getElementById('netflixPlayer')?.classList.contains('active')) return;

    // Si l'utilisateur n'a pas encore validé l'offre de bienvenue, lui laisser voir le welcome modal et masquer le zéro crédit
    const currentUserId = (this.currentUser && this.currentUser.id) ? this.currentUser.id : localStorage.getItem('ziflix_current_user_id');
    const userAccepted = currentUserId ? localStorage.getItem('ziflix_welcome_accepted_' + currentUserId) : null;
    const globalAccepted = localStorage.getItem('ziflix_welcome_accepted');
    const isAccepted = userAccepted === 'true' || (userAccepted === null && globalAccepted === 'true');

    if (!isAccepted) {
      modal.classList.add('hidden');
      this.checkWelcomeTimerModal();
      return;
    }

    const credit = this.getWatchCredit();

    if (credit <= 0) {
      // Masquer le toast d'accueil normal
      const welcomeToast = document.getElementById('welcomeTimerModal');
      if (welcomeToast) welcomeToast.classList.add('hidden');

      modal.classList.remove('hidden');

      const closeBtn = document.getElementById('zeroCreditCloseBtn');
      if (closeBtn && !closeBtn._hasListener) {
        closeBtn._hasListener = true;
        closeBtn.addEventListener('click', () => {
          modal.classList.add('hidden');
        });
      }

      const rechargeBtn = document.getElementById('zeroCreditRechargeBtn');
      if (rechargeBtn && !rechargeBtn._hasListener) {
        rechargeBtn._hasListener = true;
        rechargeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (this.player && typeof this.player.rechargeWatchCredit === 'function') {
            this.player.rechargeWatchCredit(false);
          }
        });
      }
    } else {
      modal.classList.add('hidden');
    }
  }

  checkWelcomeTimerModal(force = false) {
    if (this.isVipOrAdmin()) {
      const modal = document.getElementById('welcomeTimerModal');
      if (modal) modal.classList.add('hidden');
      return;
    }
    const modal = document.getElementById('welcomeTimerModal');
    const acceptBtn = document.getElementById('welcomeTimerAcceptBtn');
    const dismissBtn = document.getElementById('welcomeTimerDismissBtn');
    if (!modal || !acceptBtn) return;

    // Ne pas afficher si l'auth gate est active ou si le lecteur plein écran est ouvert
    if (this.authGateModal && !this.authGateModal.classList.contains('hidden')) return;
    if (document.getElementById('netflixPlayer')?.classList.contains('active')) return;

    const currentUserId = (this.currentUser && this.currentUser.id) ? this.currentUser.id : localStorage.getItem('ziflix_current_user_id');
    const userAccepted = currentUserId ? localStorage.getItem('ziflix_welcome_accepted_' + currentUserId) : null;
    const globalAccepted = localStorage.getItem('ziflix_welcome_accepted');
    const isAccepted = userAccepted === 'true' || (userAccepted === null && globalAccepted === 'true');

    if (!isAccepted || force) {
      // S'assurer que le modal zéro crédit est strictement masqué
      const zeroModal = document.getElementById('zeroCreditHomeModal');
      if (zeroModal) zeroModal.classList.add('hidden');

      modal.classList.remove('hidden');

      const onAccept = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        localStorage.setItem('ziflix_welcome_accepted', 'true');
        if (currentUserId) {
          localStorage.setItem('ziflix_welcome_accepted_' + currentUserId, 'true');
        }
        modal.classList.add('hidden');

        const now = Date.now();
        const currentExp = parseInt(localStorage.getItem('ziflix_watch_expires_at') || '0', 10);
        let remaining = (!isNaN(currentExp) && currentExp > now) ? Math.floor((currentExp - now) / 1000) : 0;
        if (remaining < 1200) {
          remaining = 1200;
          localStorage.setItem('ziflix_watch_expires_at', String(now + 1200 * 1000));
          localStorage.setItem('ziflix_watch_credit', '1200');
        }
        if (this.player && typeof this.player.updateTimerDisplays === 'function') {
          this.player.updateTimerDisplays(remaining);
        }
        this.updateHomeTimerDisplay(remaining);
        this.showToast('Félicitations ! Vos 20 minutes offertes sans pub sont activées.');
      };

      acceptBtn.onclick = onAccept;
      if (dismissBtn) {
        dismissBtn.onclick = onAccept;
      }
    } else {
      modal.classList.add('hidden');
    }
  }

    refreshContinueWatching() {
    if (!this.catalogRowsContainer) return;
    const existing = this.catalogRowsContainer.querySelector('.continue-watching-row');
    const items = this.getContinueWatchingList();
    if (items.length > 0) {
      const newRow = this.buildContinueWatchingRow(items);
      if (existing) {
        existing.replaceWith(newRow);
      } else {
        this.catalogRowsContainer.prepend(newRow);
      }
    } else if (existing) {
      existing.remove();
    }
  }
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  window.netflixApp = new NetflixApp();
});
