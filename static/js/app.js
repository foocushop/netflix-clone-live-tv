// ================= NETFLIX APP CONTROLLER =================
window.API_BASE = window.API_BASE || ((window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null' || window.location.origin.startsWith('file:'))
  ? 'https://netflix-clone-live-tv-j9ta.onrender.com'
  : '');

class NetflixApp {
  constructor() {
    this.catalogData = null;
    this.currentHero = null;
    this.myList = this.loadMyList();
    this.player = new NetflixPlayer();
    this.admin = new NetflixAdmin();
    window.netflixPlayer = this.player;
    window.netflixAdmin = this.admin;

    this.initElements();
    this.initEvents();
    this.loadCatalog();
    this.player.setLanguage(localStorage.getItem('netflix_lang') || 'vo', false);
  }

  normalizeImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('/api/proxy-image') || url.includes('/api/proxy-image')) return url;
    if (url.startsWith('http://') || url.includes('logo.smrtp2.com') || url.includes('logoipro2.com')) {
      const baseUrl = window.API_BASE || '';
      return `${baseUrl}/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  getMovieFallbackSvg(title) {
    const clean = (title || 'Titre Netflix').replace(/["'<>\\]/g, '').trim().substring(0, 24);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect fill="#1f1f1f" width="300" height="450"/><text fill="#E50914" font-family="sans-serif" font-size="32" font-weight="800" x="50%" y="45%" text-anchor="middle">NETFLIX</text><text fill="#888" font-family="sans-serif" font-size="13" x="50%" y="55%" text-anchor="middle">${clean}</text></svg>`;
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
    this.heroPlayBtn.addEventListener('click', () => {
      if (this.currentHero) this.player.open(this.currentHero);
    });

    this.heroMoreInfoBtn.addEventListener('click', () => {
      if (this.currentHero) this.openModal(this.currentHero);
    });

    // Recherche
    let searchDebounce = null;
    this.searchInput.addEventListener('input', (e) => {
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
    this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });

    this.modalPlayBtn.addEventListener('click', () => {
      if (this.currentModalMovie) {
        const s = (this.currentModalMovie.media_type === 'series') ? (this.selectedModalSeason || 1) : 1;
        const e = (this.currentModalMovie.media_type === 'series') ? (this.selectedModalEpisode || 1) : 1;
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

    this.modalListBtn.addEventListener('click', () => {
      if (this.currentModalMovie) {
        this.toggleMyList(this.currentModalMovie.id);
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
    document.getElementById('openAdminBtn').addEventListener('click', (e) => {
      e.preventDefault();
      this.admin.open();
    });

    // Sélecteurs de langue (Header, Modal)
    document.querySelectorAll('.lang-switch-capsule').forEach(capsule => {
      capsule.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lang = btn.dataset.lang || 'vo';
          this.player.setLanguage(lang);
        });
      });
    });
  }

  async loadCatalog() {
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/catalog?_t=${Date.now()}`);
      const json = await res.json();
      if (json.success && json.data) {
        this.catalogData = json.data;
        this.originalHero = json.data.hero;
        this.setupHero(json.data.hero);
        this.renderCatalog(json.data);
        const initialFilter = this.detectRouteFilter();
        if (initialFilter && initialFilter !== 'all') {
          this.applyFilter(initialFilter, false);
        }
      }
    } catch (e) {
      console.error("Erreur lors du chargement du catalogue", e);
    }
  }

  setupHero(movie) {
    if (!movie) return;
    this.currentHero = movie;

    this.heroBanner.style.backgroundImage = `url(${movie.backdrop_url || movie.poster_url})`;
    this.heroTitle.textContent = movie.title;
    this.heroSynopsis.textContent = movie.overview;

    const isLive = (movie.media_type === 'channel' || movie.is_live);
    if (isLive) {
      this.heroMatch.innerHTML = `<span class="live-pulse" style="color: #e50914; margin-right: 6px;">●</span> EN DIRECT HD`;
      this.heroAge.textContent = movie.age_rating || 'Tous publics';
      this.heroDuration.textContent = 'En direct 24/7';
      if (this.heroPlayBtn) {
        this.heroPlayBtn.innerHTML = '<span>▶</span> Regarder en direct';
      }
    } else {
      this.heroMatch.textContent = `Recommandé à ${movie.match_score}%`;
      this.heroAge.textContent = movie.age_rating;
      this.heroDuration.textContent = movie.duration;
      if (this.heroPlayBtn) {
        this.heroPlayBtn.innerHTML = '<span>▶</span> Lecture';
      }
    }

    // Badges de qualité
    this.heroBadges.innerHTML = '';
    (movie.quality_badges || ['4K Ultra HD', '5.1']).forEach(b => {
      const span = document.createElement('span');
      span.className = 'quality-badge';
      span.textContent = b;
      this.heroBadges.appendChild(span);
    });
  }

  renderCatalog(data) {
    this.catalogRowsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Ligne "Ma Liste" si elle contient des titres
    const myListMovies = this.getMyListMovies();
    if (myListMovies.length > 0) {
      fragment.appendChild(this.buildRowElement({
        category: { name: "Ma Liste", slug: "my-list" },
        movies: myListMovies
      }));
    }

    // Carrousels de catégories
    if (data.rows && data.rows.length > 0) {
      data.rows.forEach(row => {
        fragment.appendChild(this.buildRowElement(row));
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
      if (e.target.closest('.list-btn')) {
        e.stopPropagation();
        this.toggleMyList(movie.id);
        const btn = card.querySelector('.list-btn');
        btn.textContent = this.myList.includes(movie.id) ? '✓' : '+';
        return;
      }
      if (isChannel || movie.is_xtream) {
        // Clic direct pour lancer la chaîne de télévision sans détour
        this.player.open(movie, 1);
        return;
      }
      if (movie.is_xtream_series || (movie.id && String(movie.id).startsWith('xtream_series_'))) {
        e.stopPropagation();
        const isPlay = !!e.target.closest('.play-btn');
        const seriesId = movie.series_id || parseInt(String(movie.id).replace('xtream_series_', ''), 10);
        this.openTeleRealiteSeries({
          series_id: seriesId,
          name: movie.title,
          cover: movie.poster_url,
          backdrop: movie.backdrop_url,
          plot: movie.overview,
          genre: (movie.categories || []).join(' / '),
          year: movie.release_year || 2025
        }, isPlay);
        return;
      }
      if (e.target.closest('.play-btn')) {
        e.stopPropagation();
        this.player.open(movie);
      } else if (e.target.closest('.info-btn') || !e.target.closest('.card-actions')) {
        this.openModal(movie);
      }
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
    (movie.quality_badges || ['1080p FHD', 'Son 5.1']).forEach(b => {
      const span = document.createElement('span');
      span.className = 'quality-badge';
      span.textContent = b;
      this.modalBadges.appendChild(span);
    });

    this.modalCast.textContent = movie.cast && movie.cast.length > 0 ? movie.cast.join(', ') : 'Non communiqué';
    this.modalDirector.textContent = movie.director || 'Non communiqué';

    this.updateModalListButton();

    // Gestion des saisons & épisodes pour les séries
    if (movie.media_type === 'series') {
      if (this.modalEpisodesSection) {
        this.modalEpisodesSection.classList.remove('hidden');
      }
      const seasons = this.getMovieSeasons(movie);
      const showKey = 'netflix_ep_' + (movie.id || movie.tmdb_id || movie.series_id);
      let defaultS = (seasons && seasons[0]) ? seasons[0].season_number : 1;
      let defaultE = (seasons && seasons[0] && seasons[0].episodes && seasons[0].episodes[0]) ? seasons[0].episodes[0].episode_number : 1;
      try {
        const saved = JSON.parse(localStorage.getItem(showKey));
        if (saved && saved.season && saved.episode) {
          const sExists = seasons.some(s => parseInt(s.season_number) === parseInt(saved.season));
          if (sExists) {
            defaultS = parseInt(saved.season);
            const foundS = seasons.find(s => parseInt(s.season_number) === defaultS);
            if (foundS && foundS.episodes && foundS.episodes.some(e => parseInt(e.episode_number) === parseInt(saved.episode))) {
              defaultE = parseInt(saved.episode);
            }
          }
        }
      } catch (e) {}

      this.selectedModalSeason = defaultS;
      this.selectedModalEpisode = defaultE;
      this.setupModalSeasons(movie);
      this.renderModalEpisodes();

      // Si les saisons ne sont pas encore chargées sur l'objet local, interrogation de l'API
      if (!movie.seasons || movie.seasons.length === 0) {
        const baseUrl = window.API_BASE || '';
        fetch(`${baseUrl}/api/movies/${encodeURIComponent(movie.id)}`)
          .then(res => res.json())
          .then(res => {
            if (res.success && res.data && res.data.seasons && res.data.seasons.length > 0) {
              movie.seasons = res.data.seasons;
              if (this.currentModalMovie && this.currentModalMovie.id === movie.id) {
                this.setupModalSeasons(movie);
                this.renderModalEpisodes();
              }
            }
          })
          .catch(() => {});
      }
    } else {
      if (this.modalEpisodesSection) {
        this.modalEpisodesSection.classList.add('hidden');
      }
    }

    this.modalBackdrop.classList.add('active');
  }

  setupModalSeasons(movie) {
    if (!this.modalSeasonSelect) return;
    this.modalSeasonSelect.innerHTML = '';
    const seasons = this.getMovieSeasons(movie);
    seasons.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.season_number;
      opt.textContent = s.name || `Saison ${s.season_number}`;
      this.modalSeasonSelect.appendChild(opt);
    });
    this.modalSeasonSelect.value = this.selectedModalSeason;
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
            <span class="modal-episode-title">${ep.title}</span>
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
  }

  updateModalListButton() {
    if (!this.currentModalMovie) return;
    const isSaved = this.myList.includes(this.currentModalMovie.id);
    this.modalListBtn.innerHTML = isSaved ? '✓ Dans ma liste' : '+ Ajouter à ma liste';
  }

  toggleMyList(id) {
    if (this.myList.includes(id)) {
      this.myList = this.myList.filter(item => item !== id);
    } else {
      this.myList.push(id);
    }
    localStorage.setItem('netflix_my_list', JSON.stringify(this.myList));
  }

  loadMyList() {
    try {
      const saved = localStorage.getItem('netflix_my_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  getMyListMovies() {
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
    try {
      const baseUrl = window.API_BASE || '';
      const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (json.success && json.data) {
        this.catalogRowsContainer.innerHTML = '';
        const searchRow = {
          category: { name: `Résultats pour "${query}" (${json.data.length})`, slug: "search" },
          movies: json.data
        };
        this.renderRow(searchRow);
      }
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
      l.classList.toggle('active', l.dataset.filter === filter);
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
      const recentMovies = (this.catalogData?.movies || []).filter(m =>
        (m.release_year && m.release_year >= 2025) ||
        (m.created_at && m.created_at.startsWith('2026')) ||
        (m.year && m.year >= 2025)
      );
      this.renderRow({
        category: { name: "✨ Nouveautés 2025 - 2026", slug: "nouveautes" },
        movies: recentMovies
      });
      return;
    }

    if (filter === 'my-list') {
      if (this.originalHero) this.setupHero(this.originalHero);
      this.catalogRowsContainer.innerHTML = '';
      this.renderRow({
        category: { name: "Ma Liste", slug: "my-list" },
        movies: this.getMyListMovies()
      });
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
          <span style="color: #00d2ff; font-weight: 800;">💎 XTREAM</span>
          <span>${channel.category_name}</span>
        </div>
        <div class="card-actions">
          <button class="action-circle-btn play-btn" title="Lecture en direct">▶</button>
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
      e.stopPropagation();
      this.player.open(movieObj, 1);
    });

    return card;
  }

  async showXtreamView() {
    this.catalogRowsContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #888;">
        <div style="font-size: 2.2rem; margin-bottom: 12px; color: #00d2ff;">💎</div>
        <div style="font-size: 1.15rem; color: #fff; font-weight: 600;">Chargement des 1 268 chaînes françaises Xtream...</div>
        <div style="font-size: 0.9rem; color: #888; margin-top: 6px;">Indexation des flux UHD, FHD, HEVC, HD et SD...</div>
      </div>
    `;

    if (!this.xtreamChannels) {
      try {
        const baseUrl = window.API_BASE || '';
        const res = await fetch(`${baseUrl}/api/xtream/channels?limit=1500`);
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
        quality_badges: ['💎 Xtream Direct VIP', featured.quality_badge, 'Anti-Saccades Turbo']
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
          <div style="font-size: 2rem; margin-bottom: 8px; color: #00d2ff;">➕</div>
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
    fetch(`${baseUrl}/api/xtream/series-info?series_id=${seriesId}`)
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
      const isPlay = !!e.target.closest('.play-btn');
      await this.openTeleRealiteSeries(show, isPlay);
    });

    return card;
  }

  async openTeleRealiteSeries(show, directPlay = false) {
    // 1. Accélération immédiate : si la fiche et les saisons sont déjà en mémoire
    const cached = this.telerealiteSeriesCache.get(show.series_id);
    if (cached) {
      if (directPlay) {
        this.player.open(cached, 1);
      } else {
        this.openModal(cached);
      }
      return;
    }

    // 2. Retour visuel instantané pour rassurer l'utilisateur pendant le chargement
    if (directPlay) {
      this.player.showLoader(`⚡ Connexion aux épisodes de ${show.name} (💎 Xtream VIP)...`);
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
      const res = await fetch(`${baseUrl}/api/xtream/series-info?series_id=${show.series_id}`);
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
        this.player.setStep(1, 'done', `1. ${seriesObj.seasons.length} saison(s) chargée(s) avec succès`);
        this.player.open(seriesObj, 1);
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
        <div style="font-size: 2.2rem; margin-bottom: 12px; color: #e50914;">📺</div>
        <div style="font-size: 1.15rem; color: #fff; font-weight: 600;">Chargement des 221 séries de Télé-Réalité Xtream...</div>
        <div style="font-size: 0.9rem; color: #888; margin-top: 6px;">Vraies saisons, vrais épisodes en 1080p Full HD...</div>
      </div>
    `;

    if (!this.telerealiteShows) {
      try {
        const stored = sessionStorage.getItem('telerealite_shows_cache');
        if (stored) {
          this.telerealiteShows = JSON.parse(stored);
        }
      } catch (e) {}

      if (!this.telerealiteShows) {
        try {
          const baseUrl = window.API_BASE || '';
          const res = await fetch(`${baseUrl}/api/xtream/telerealite?limit=300`);
          const json = await res.json();
          if (json.success && json.data) {
            this.telerealiteShows = json.data;
            try { sessionStorage.setItem('telerealite_shows_cache', JSON.stringify(json.data)); } catch (e) {}
          }
        } catch (e) {
          console.error("Erreur chargement télé-réalité", e);
        }
      }
    }

    if (!this.telerealiteInitialized) {
      this.initTeleRealiteEvents();
      this.telerealiteInitialized = true;
    }

    // Configurer le Hero Banner avec une émission phare
    const featured = this.telerealiteShows ? (
      this.telerealiteShows.find(s => s.name.toLowerCase().includes('la villa')) ||
      this.telerealiteShows.find(s => s.year === 2026) ||
      this.telerealiteShows[0]
    ) : null;

    if (featured) {
      this.setupHero({
        id: `xtream_series_${featured.series_id}`,
        title: `${featured.name}`,
        overview: featured.plot || `Les épisodes authentiques de télé-réalité en streaming 1080p FHD sans coupure.`,
        backdrop_url: featured.backdrop || featured.cover,
        poster_url: featured.cover,
        media_type: 'series',
        is_xtream_series: true,
        quality_badges: ['📺 1080p FHD Natif', 'Saisons Complètes', '💎 Xtream VIP']
      });
      if (this.heroPlayBtn) {
        this.heroPlayBtn.onclick = () => {
          this.openTeleRealiteSeries(featured);
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
        '2026': '✨ Nouveautés 2026',
        '2025': '🔥 Saisons 2025',
        'villa': '❤️ La Villa des Cœurs Brisés & Séduction',
        'competition': '🏆 Compétition & Survie'
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
      this.renderTeleRealiteRow(`🏆 Compétition, Stratégie & Survie (${sCompetition.length})`, sCompetition);
    }
    this.renderTeleRealiteRow(`📺 Toutes les Émissions de Télé-Réalité (${filtered.length})`, filtered);
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
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  window.netflixApp = new NetflixApp();
});
