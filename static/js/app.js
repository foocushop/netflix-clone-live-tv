// ================= NETFLIX APP CONTROLLER =================
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
    // Défilement du header
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        this.header.classList.add('scrolled');
      } else {
        this.header.classList.remove('scrolled');
      }
    });

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
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const filter = link.dataset.filter;
        this.applyFilter(filter);
      });
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
      const res = await fetch('/api/catalog');
      const json = await res.json();
      if (json.success && json.data) {
        this.catalogData = json.data;
        this.originalHero = json.data.hero;
        this.setupHero(json.data.hero);
        this.renderCatalog(json.data);
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

    // Ligne "Ma Liste" si elle contient des titres
    const myListMovies = this.getMyListMovies();
    if (myListMovies.length > 0) {
      this.renderRow({
        category: { name: "Ma Liste", slug: "my-list" },
        movies: myListMovies
      });
    }

    // Carrousels de catégories
    if (data.rows && data.rows.length > 0) {
      data.rows.forEach(row => {
        this.renderRow(row);
      });
    }
  }

  renderRow(row) {
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

    row.movies.forEach(movie => {
      const card = this.createMovieCard(movie);
      slider.appendChild(card);
    });

    this.catalogRowsContainer.appendChild(rowEl);
  }

  createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    const isSaved = this.myList.includes(movie.id);
    const isChannel = (movie.media_type === 'channel' || movie.is_live);

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

    card.innerHTML = `
      <img src="${movie.poster_url}" alt="${movie.title}" class="card-image" loading="lazy" onerror="this.onerror=null; this.src='data:image/svg+xml;charset=UTF-8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'450\\' viewBox=\\'0 0 300 450\\'><rect fill=\\'%231f1f1f\\' width=\\'300\\' height=\\'450\\'/><text fill=\\'%23E50914\\' font-family=\\'sans-serif\\' font-size=\\'36\\' font-weight=\\'800\\' x=\\'50%25\\' y=\\'45%25\\' text-anchor=\\'middle\\'>NETFLIX</text><text fill=\\'%23888\\' font-family=\\'sans-serif\\' font-size=\\'13\\' x=\\'50%25\\' y=\\'55%25\\' text-anchor=\\'middle\\'>${isChannel ? 'Chaîne TV' : 'Titre Netflix'}</text></svg>'">
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

    // Événements sur la carte
    card.addEventListener('click', (e) => {
      if (e.target.closest('.list-btn')) {
        e.stopPropagation();
        this.toggleMyList(movie.id);
        const btn = card.querySelector('.list-btn');
        btn.textContent = this.myList.includes(movie.id) ? '✓' : '+';
        return;
      }
      if (isChannel) {
        // Clic direct pour lancer la chaîne de télévision sans détour
        this.player.open(movie, 1);
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
    this.modalMatch.textContent = `Recommandé à ${movie.match_score}%`;
    this.modalAge.textContent = movie.age_rating;
    this.modalDuration.textContent = movie.duration;
    this.modalSynopsis.textContent = movie.overview;

    this.modalBadges.innerHTML = '';
    (movie.quality_badges || ['4K Ultra HD', '5.1']).forEach(b => {
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
      this.selectedModalSeason = (seasons && seasons[0]) ? seasons[0].season_number : 1;
      this.selectedModalEpisode = (seasons && seasons[0] && seasons[0].episodes && seasons[0].episodes[0]) ? seasons[0].episodes[0].episode_number : 1;
      this.setupModalSeasons(movie);
      this.renderModalEpisodes();

      // Si les saisons ne sont pas encore chargées sur l'objet local, interrogation de l'API
      if (!movie.seasons || movie.seasons.length === 0) {
        fetch(`/api/movies/${encodeURIComponent(movie.id)}`)
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
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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

  applyFilter(filter) {
    if (!this.catalogData) return;
    if (filter === 'all') {
      if (this.originalHero) this.setupHero(this.originalHero);
      this.renderCatalog(this.catalogData);
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
}

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  window.netflixApp = new NetflixApp();
});
