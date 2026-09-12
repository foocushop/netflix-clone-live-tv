// ================= NETFLIX ADMIN STUDIO CONTROLLER =================
// Mode Administrateur sécurisé (PIN 1965) avec filtrage direct, recherche, prévisualisation du flux et gestion avancée
class NetflixAdmin {
  constructor() {
    this.overlay = document.getElementById('adminOverlay');
    this.authModal = document.getElementById('adminAuthModal');
    this.authForm = document.getElementById('adminAuthForm');
    this.pinInput = document.getElementById('adminPinInput');
    this.authError = document.getElementById('adminAuthError');
    this.tableBody = document.getElementById('adminCatalogBody');
    this.modal = document.getElementById('adminModal');
    this.form = document.getElementById('adminMovieForm');
    this.modalTitle = document.getElementById('adminModalTitle');
    this.searchInput = document.getElementById('adminSearchInput');
    this.searchClear = document.getElementById('adminSearchClear');
    this.resultsInfo = document.getElementById('adminResultsInfo');
    this.filterTabs = document.getElementById('adminFilterTabs');
    
    this.editingId = null;
    this.allMovies = [];
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.searchDebounce = null;
    this.clusterPollingTimer = null;
    this.clusterNodesGrid = document.getElementById('clusterNodesGrid');
    this.clusterAddNodeForm = document.getElementById('clusterAddNodeForm');
    this.clusterRefreshBtn = document.getElementById('clusterRefreshBtn');

    // Télémétrie Sessions Xtream
    this.xtreamSessionsGrid = document.getElementById('xtreamSessionsGrid');
    this.xtreamActiveCountText = document.getElementById('xtreamActiveCountText');
    this.xtreamTotalRamText = document.getElementById('xtreamTotalRamText');
    this.xtreamSessionsRefreshBtn = document.getElementById('xtreamSessionsRefreshBtn');

    // Gestion des Comptes Xtream Codes
    this.xtreamUsersTableBody = document.getElementById('xtreamUsersTableBody');
    this.addXtreamUserContainer = document.getElementById('addXtreamUserContainer');
    this.addXtreamUserForm = document.getElementById('addXtreamUserForm');
    this.openAddXtreamUserBtn = document.getElementById('openAddXtreamUserBtn');
    this.closeAddXtreamUserBtn = document.getElementById('closeAddXtreamUserBtn');
    this.xtreamUsersRefreshBtn = document.getElementById('xtreamUsersRefreshBtn');

    // Communauté & Modération ZIFLIX
    this.adminUsersTableBody = document.getElementById('adminUsersTableBody');
    this.adminUsersCount = document.getElementById('adminUsersCount');
    this.adminCommentsList = document.getElementById('adminCommentsList');
    this.adminCommentsCount = document.getElementById('adminCommentsCount');
    this.adminUsersRefreshBtn = document.getElementById('adminUsersRefreshBtn');

    window.netflixAdmin = this;

    this.initEvents();
  }

  getAuthPassword() {
    return sessionStorage.getItem('netflix_admin_authenticated') || '';
  }

  isAuthenticated() {
    return this.getAuthPassword() === '1965';
  }

  initEvents() {
    // 1. Authentification & Sécurité
    if (this.authForm) {
      this.authForm.addEventListener('submit', (e) => this.handleAuthSubmit(e));
    }

    const toggleEye = document.getElementById('togglePinVisibilityBtn');
    if (toggleEye && this.pinInput) {
      toggleEye.addEventListener('click', () => {
        const isPassword = this.pinInput.type === 'password';
        this.pinInput.type = isPassword ? 'text' : 'password';
        toggleEye.textContent = isPassword ? '🙈' : '👁️';
      });
    }

    const cancelAuth = document.getElementById('cancelAdminAuthBtn');
    if (cancelAuth) {
      cancelAuth.addEventListener('click', () => this.closeAuthModal());
    }

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // Gestion de la boîte d'accès Xtream Codes
    const xtHostEl = document.getElementById('xtreamHostDisplay');
    if (xtHostEl) {
      const serverOrigin = this.apiBase() || window.location.origin;
      xtHostEl.textContent = serverOrigin;
    }

    const copyXtBtn = document.getElementById('copyXtreamUrlBtn');
    if (copyXtBtn) {
      copyXtBtn.addEventListener('click', () => {
        const serverOrigin = this.apiBase() || window.location.origin;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(serverOrigin);
        }
        this.showToast('📋 URL Serveur Xtream copiée : ' + serverOrigin);
      });
    }

    const copyM3uBtn = document.getElementById('copyM3uUrlBtn');
    if (copyM3uBtn) {
      copyM3uBtn.addEventListener('click', () => {
        const serverOrigin = this.apiBase() || window.location.origin;
        const m3uUrl = `${serverOrigin}/get.php?username=jose&password=1965`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(m3uUrl);
        }
        this.showToast('🔗 Lien M3U copié ! Prêt pour VLC ou TiviMate.');
      });
    }

    const copyEpgBtn = document.getElementById('copyEpgUrlBtn');
    if (copyEpgBtn) {
      copyEpgBtn.addEventListener('click', () => {
        const serverOrigin = this.apiBase() || window.location.origin;
        const epgUrl = `${serverOrigin}/xmltv.php?username=jose&password=1965`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(epgUrl);
        }
        this.showToast('📅 Lien Guide TV EPG copié ! Prêt pour Televizo / TiviMate.');
      });
    }

    // 2. Navigation Studio Admin
    const closeAdminBtn = document.getElementById('closeAdminBtn');
    if (closeAdminBtn) {
      closeAdminBtn.addEventListener('click', () => this.close());
    }

    const openAddBtn = document.getElementById('openAddMovieModal');
    if (openAddBtn) {
      openAddBtn.addEventListener('click', () => this.openAddModal());
    }

    const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
    if (closeAdminModalBtn) {
      closeAdminModalBtn.addEventListener('click', () => this.closeModal());
    }

    const cancelAdminModalBtn = document.getElementById('cancelAdminModalBtn');
    if (cancelAdminModalBtn) {
      cancelAdminModalBtn.addEventListener('click', () => this.closeModal());
    }

    // 3. Formulaire de création / modification
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    // 4. Barre d'outils pratique : Recherche et Filtres
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (this.searchClear) {
          this.searchClear.style.display = val ? 'block' : 'none';
        }
        clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => {
          this.searchQuery = val.trim().toLowerCase();
          this.applyFilters();
        }, 150);
      });
    }

    if (this.searchClear) {
      this.searchClear.addEventListener('click', () => {
        this.searchInput.value = '';
        this.searchClear.style.display = 'none';
        this.searchQuery = '';
        this.applyFilters();
        this.searchInput.focus();
      });
    }

    if (this.filterTabs) {
      this.filterTabs.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.filterTabs.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeFilter = btn.dataset.filter || 'all';
          this.applyFilters();
        });
      });
    }

    const refreshBtn = document.getElementById('adminRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.showToast("Rafraîchissement du catalogue...");
        this.loadStats();
        this.loadCatalog();
      });
    }

    // Gestion du Cluster Multi-Serveurs Render
    if (this.clusterRefreshBtn) {
      this.clusterRefreshBtn.addEventListener('click', () => this.loadClusterStatus(true));
    }

    if (this.clusterAddNodeForm) {
      this.clusterAddNodeForm.addEventListener('submit', (e) => this.handleClusterAddNodeSubmit(e));
    }

    // Gestion de la Télémétrie des Sessions Xtream
    if (this.xtreamSessionsRefreshBtn) {
      this.xtreamSessionsRefreshBtn.addEventListener('click', () => this.loadXtreamSessions(true));
    }

    // Gestion des Utilisateurs Xtream Codes
    if (this.openAddXtreamUserBtn && this.addXtreamUserContainer) {
      this.openAddXtreamUserBtn.addEventListener('click', () => {
        const isHidden = this.addXtreamUserContainer.style.display === 'none';
        this.addXtreamUserContainer.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          const uInput = document.getElementById('newXtreamUsername');
          if (uInput) uInput.focus();
        }
      });
    }

    if (this.closeAddXtreamUserBtn && this.addXtreamUserContainer) {
      this.closeAddXtreamUserBtn.addEventListener('click', () => {
        this.addXtreamUserContainer.style.display = 'none';
      });
    }

    if (this.addXtreamUserForm) {
      this.addXtreamUserForm.addEventListener('submit', (e) => this.handleCreateXtreamUser(e));
    }

    if (this.xtreamUsersRefreshBtn) {
      this.xtreamUsersRefreshBtn.addEventListener('click', () => this.loadXtreamUsers(true));
    }

    if (this.adminUsersRefreshBtn) {
      this.adminUsersRefreshBtn.addEventListener('click', () => {
        this.loadCommunityUsers();
        this.loadCommunityComments();
        this.showToast('👥 Modération actualisée');
      });
    }
  }

  // ================= FLUX DE SÉCURITÉ & CONNEXION =================
  open() {
    if (!this.isAuthenticated()) {
      const user = window.netflixApp?.currentUser;
      if (user && user.role === 'admin') {
        sessionStorage.setItem('netflix_admin_authenticated', '1965');
      } else {
        this.openAuthModal();
        return;
      }
    }
    this.overlay.classList.add('active');
    this.loadStats();
    this.loadCatalog();
    this.loadClusterStatus();
    this.loadXtreamSessions();
    this.loadXtreamUsers();
    this.loadCommunityUsers();
    this.loadCommunityComments();
    this.startClusterPolling();
  }

  openAuthModal() {
    if (this.authModal) {
      this.authModal.classList.add('active');
      if (this.pinInput) {
        this.pinInput.value = '';
        this.pinInput.focus();
      }
      if (this.authError) {
        this.authError.style.display = 'none';
        this.authError.textContent = '';
      }
    }
  }

  closeAuthModal() {
    if (this.authModal) {
      this.authModal.classList.remove('active');
    }
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    const pin = (this.pinInput ? this.pinInput.value : '').trim();
    if (!pin) return;

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pin })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem('netflix_admin_authenticated', '1965');
        this.closeAuthModal();
        this.overlay.classList.add('active');
        this.showToast("🔓 Studio Administrateur déverrouillé avec succès !");
        this.loadStats();
        this.loadCatalog();
        this.loadClusterStatus();
        this.loadXtreamSessions();
        this.loadXtreamUsers();
        this.loadCommunityUsers();
        this.loadCommunityComments();
      } else {
        this.showAuthError(data.message || "Code PIN ou mot de passe incorrect");
      }
    } catch (err) {
      // Fallback local direct
      if (pin === '1965') {
        sessionStorage.setItem('netflix_admin_authenticated', '1965');
        this.closeAuthModal();
        this.overlay.classList.add('active');
        this.showToast("🔓 Studio Administrateur déverrouillé !");
        this.loadStats();
        this.loadCatalog();
        this.loadClusterStatus();
        this.loadXtreamSessions();
        this.loadXtreamUsers();
        this.loadCommunityUsers();
        this.loadCommunityComments();
      } else {
        this.showAuthError("Code PIN incorrect. Veuillez réessayer.");
      }
    }
  }

  showAuthError(msg) {
    if (this.authError) {
      this.authError.textContent = msg;
      this.authError.style.display = 'block';
    }
    if (this.pinInput) {
      this.pinInput.classList.add('input-shake');
      this.pinInput.focus();
      this.pinInput.select();
      setTimeout(() => this.pinInput.classList.remove('input-shake'), 600);
    }
  }

  logout() {
    this.stopClusterPolling();
    sessionStorage.removeItem('netflix_admin_authenticated');
    this.close();
    this.showToast("🔒 Mode Administrateur verrouillé et déconnecté");
  }

  close() {
    this.stopClusterPolling();
    this.overlay.classList.remove('active');
    // Rafraîchir l'application principale pour synchroniser les changements
    if (window.netflixApp && typeof window.netflixApp.loadCatalog === 'function') {
      window.netflixApp.loadCatalog();
    }
  }

  // Helper pour injecter l'en-tête de sécurité admin
  apiBase() {
    return window.API_BASE || '';
  }

  authHeaders(extra = {}) {
    return Object.assign({
      'x-admin-password': this.getAuthPassword() || '1965'
    }, extra);
  }

  async loadStats() {
    try {
      const res = await fetch(`${this.apiBase()}/api/admin/stats`, {
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setVal('statTotalTitles', s.total_titles);
        setVal('statTotalMovies', s.total_movies);
        setVal('statTotalSeries', s.total_series);
        setVal('statHeroTitle', s.active_hero_title || 'Aucun');
        setVal('statUptime', `${Math.floor(s.server_uptime_seconds / 60)}m ${s.server_uptime_seconds % 60}s`);
        setVal('statRustEngine', s.rust_engine || 'Rust + Tokio (Axum Engine)');
      }
    } catch (e) {
      console.error('Erreur chargement stats admin', e);
    }
  }



  async loadCatalog() {
    try {
      const res = await fetch(`${this.apiBase()}/api/admin/movies?_t=${Date.now()}`, {
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        this.allMovies = json.data;
        this.updateCounts();
        this.applyFilters();
      }
    } catch (e) {
      console.error('Erreur chargement catalogue admin', e);
      this.showToast("Erreur lors du chargement du catalogue", true);
    }
  }

  handleUnauthorized() {
    sessionStorage.removeItem('netflix_admin_authenticated');
    this.close();
    this.openAuthModal();
    this.showToast("Session expirée. Veuillez vous reconnecter.", true);
  }

  updateCounts() {
    const total = this.allMovies.length;
    const movies = this.allMovies.filter(m => m.media_type === 'movie' && !m.is_live).length;
    const series = this.allMovies.filter(m => m.media_type === 'series').length;
    const channels = this.allMovies.filter(m => m.media_type === 'channel' || m.is_live).length;
    const heroes = this.allMovies.filter(m => !!m.is_hero).length;

    const setC = (id, c) => { const el = document.getElementById(id); if (el) el.textContent = c; };
    setC('countAll', total);
    setC('countMovies', movies);
    setC('countSeries', series);
    setC('countChannels', channels);
    setC('countHero', heroes);
  }

  applyFilters() {
    let list = this.allMovies;

    // Filtrage par type
    if (this.activeFilter === 'movie') {
      list = list.filter(m => m.media_type === 'movie' && !m.is_live);
    } else if (this.activeFilter === 'series') {
      list = list.filter(m => m.media_type === 'series');
    } else if (this.activeFilter === 'channel') {
      list = list.filter(m => m.media_type === 'channel' || m.is_live);
    } else if (this.activeFilter === 'hero') {
      list = list.filter(m => !!m.is_hero);
    }

    // Filtrage par terme de recherche
    if (this.searchQuery) {
      const q = this.searchQuery;
      list = list.filter(m => {
        const title = (m.title || '').toLowerCase();
        const orig = (m.original_title || '').toLowerCase();
        const cats = Array.isArray(m.categories) ? m.categories.join(' ').toLowerCase() : '';
        const director = (m.director || '').toLowerCase();
        const cast = Array.isArray(m.cast) ? m.cast.join(' ').toLowerCase() : '';
        const year = String(m.release_year || '');
        return title.includes(q) || orig.includes(q) || cats.includes(q) || director.includes(q) || cast.includes(q) || year.includes(q);
      });
    }

    if (this.resultsInfo) {
      this.resultsInfo.textContent = `${list.length} média(s) affiché(s) sur ${this.allMovies.length} au total`;
    }

    this.renderTable(list);
  }

  renderTable(movies) {
    this.tableBody.innerHTML = '';

    if (movies.length === 0) {
      const emptyTr = document.createElement('tr');
      emptyTr.innerHTML = `
        <td colspan="7" style="text-align: center; padding: 40px 20px; color: #888;">
          <div style="font-size: 2rem; margin-bottom: 10px;">🔍</div>
          <div style="font-weight: 600; font-size: 1.1rem; color: #ccc;">Aucun média ne correspond à votre recherche</div>
          <div style="font-size: 0.85rem; margin-top: 6px;">Essayez d'autres mots-clés ou réinitialisez les filtres.</div>
        </td>
      `;
      this.tableBody.appendChild(emptyTr);
      return;
    }

    movies.forEach(m => {
      const tr = document.createElement('tr');
      const isHero = !!m.is_hero;
      const isChannel = m.media_type === 'channel' || m.is_live;
      const isSeries = m.media_type === 'series';
      const typeLabel = isChannel ? 'Chaîne TV' : (isSeries ? 'Série' : 'Film');
      const typeBadgeClass = isChannel ? 'badge-channel' : (isSeries ? 'badge-series' : 'badge-movie');

      const catsHtml = Array.isArray(m.categories)
        ? m.categories.slice(0, 2).map(c => `<span class="category-chip-mini">${c}</span>`).join(' ')
        : '';

      const rawId = String(m.id || m.tmdb_id || '').trim();
      const safeId = encodeURIComponent(rawId);

      tr.innerHTML = `
        <td>
          <img src="${m.poster_url || ''}" alt="${this.escapeHtml(m.title)}" class="table-poster" loading="lazy" onerror="this.onerror=null; this.src='data:image/svg+xml;charset=UTF-8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'150\\' viewBox=\\'0 0 100 150\\'><rect fill=\\'%23222\\' width=\\'100\\' height=\\'150\\'/><text fill=\\'%23E50914\\' font-family=\\'sans-serif\\' font-size=\\'16\\' font-weight=\\'bold\\' x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\'>ZIFLIX</text></svg>'">
        </td>
        <td>
          <div class="table-title-wrap">
            <span class="table-main-title">${this.escapeHtml(m.title)}</span>
            ${m.original_title ? `<span class="table-orig-title">${this.escapeHtml(m.original_title)}</span>` : ''}
            <div class="table-categories-list">${catsHtml}</div>
          </div>
        </td>
        <td><span class="badge-type ${typeBadgeClass}">${typeLabel}</span></td>
        <td><span class="table-year">${m.release_year || '2025'}</span></td>
        <td><span class="table-score">${m.match_score || 95}%</span></td>
        <td>
          ${isHero ? '<span class="badge-hero">⭐ EN VEDETTE</span>' : '<span style="color: #666; font-size: 0.8rem;">Non</span>'}
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-action-sm btn-play-test" onclick="window.netflixAdmin.testPlayback(decodeURIComponent('${safeId}'))" title="Tester le flux dans le lecteur ZIFLIX">▶ Tester</button>
            ${!isHero ? `<button class="btn-action-sm btn-star" onclick="window.netflixAdmin.setHero(decodeURIComponent('${safeId}'))" title="Mettre en tête d'affiche (Hero Billboard)">⭐ Vedette</button>` : ''}
            <button class="btn-action-sm" onclick="window.netflixAdmin.openEditModal(decodeURIComponent('${safeId}'))" title="Modifier les métadonnées">✏️ Modifier</button>
            <button class="btn-action-sm btn-clone" onclick="window.netflixAdmin.cloneMovie(decodeURIComponent('${safeId}'))" title="Dupliquer pour créer une variante">📋 Cloner</button>
            <button class="btn-action-sm btn-danger" onclick="window.netflixAdmin.deleteMovie(decodeURIComponent('${safeId}'))" title="Supprimer du catalogue">🗑️</button>
          </div>
        </td>
      `;
      this.tableBody.appendChild(tr);
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  testPlayback(id) {
    const movie = this.allMovies.find(m => String(m.id) === String(id) || String(m.tmdb_id) === String(id));
    if (!movie) {
      this.showToast("Média introuvable pour le test", true);
      return;
    }
    if (window.netflixPlayer && typeof window.netflixPlayer.open === 'function') {
      window.netflixPlayer.open(movie);
      this.showToast(`▶ Lecture test lancée : ${movie.title}`);
    } else {
      this.showToast("Lecteur ZIFLIX non initialisé", true);
    }
  }

  openAddModal() {
    this.editingId = null;
    this.modalTitle.textContent = "Ajouter un nouveau titre au catalogue";
    this.form.reset();
    document.getElementById('inputMatchScore').value = 98;
    document.getElementById('inputReleaseYear').value = 2026;
    document.getElementById('inputAgeRating').value = '16+';
    document.getElementById('inputDuration').value = '2h 15m';
    document.getElementById('inputMediaType').value = 'movie';
    this.modal.classList.add('active');
  }

  cloneMovie(id) {
    const m = this.allMovies.find(item => String(item.id) === String(id) || String(item.tmdb_id) === String(id));
    if (!m) return;
    this.openAddModal();
    this.modalTitle.textContent = `Dupliquer : ${m.title}`;
    document.getElementById('inputTitle').value = `${m.title} (Copie)`;
    document.getElementById('inputOriginalTitle').value = m.original_title || '';
    document.getElementById('inputMediaType').value = m.media_type || 'movie';
    document.getElementById('inputOverview').value = m.overview || '';
    document.getElementById('inputPosterUrl').value = m.poster_url || '';
    document.getElementById('inputBackdropUrl').value = m.backdrop_url || '';
    document.getElementById('inputVideoUrl').value = m.video_url || '';
    document.getElementById('inputCategories').value = Array.isArray(m.categories) ? m.categories.join(', ') : 'Tendances';
    document.getElementById('inputReleaseYear').value = m.release_year || 2026;
    document.getElementById('inputMatchScore').value = m.match_score || 95;
    document.getElementById('inputAgeRating').value = m.age_rating || '16+';
    document.getElementById('inputDuration').value = m.duration || '2h 10m';
    document.getElementById('inputCast').value = Array.isArray(m.cast) ? m.cast.join(', ') : '';
    document.getElementById('inputDirector').value = m.director || '';
    document.getElementById('inputIsHero').checked = false;
    this.showToast("📋 Données dupliquées dans le formulaire");
  }

  async openEditModal(id) {
    this.editingId = id;
    this.modalTitle.textContent = "Modifier le titre";
    const m = this.allMovies.find(item => String(item.id) === String(id) || String(item.tmdb_id) === String(id));
    if (m) {
      this.populateEditForm(m);
      this.modal.classList.add('active');
    } else {
      try {
        const res = await fetch(`/api/movies/${id}`);
        const json = await res.json();
        if (json.success && json.data) {
          this.populateEditForm(json.data);
          this.modal.classList.add('active');
        }
      } catch (e) {
        this.showToast("Erreur lors de la récupération des données", true);
      }
    }
  }

  populateEditForm(m) {
    document.getElementById('inputTitle').value = m.title || '';
    document.getElementById('inputOriginalTitle').value = m.original_title || '';
    document.getElementById('inputMediaType').value = m.media_type || 'movie';
    document.getElementById('inputOverview').value = m.overview || '';
    document.getElementById('inputPosterUrl').value = m.poster_url || '';
    document.getElementById('inputBackdropUrl').value = m.backdrop_url || '';
    document.getElementById('inputVideoUrl').value = m.video_url || '';
    document.getElementById('inputCategories').value = Array.isArray(m.categories) ? m.categories.join(', ') : '';
    document.getElementById('inputReleaseYear').value = m.release_year || 2025;
    document.getElementById('inputMatchScore').value = m.match_score || 95;
    document.getElementById('inputAgeRating').value = m.age_rating || '16+';
    document.getElementById('inputDuration').value = m.duration || '';
    document.getElementById('inputCast').value = Array.isArray(m.cast) ? m.cast.join(', ') : '';
    document.getElementById('inputDirector').value = m.director || '';
    document.getElementById('inputIsHero').checked = !!m.is_hero;
  }

  closeModal() {
    this.modal.classList.remove('active');
  }

  async handleFormSubmit(e) {
    e.preventDefault();

    const categoriesRaw = document.getElementById('inputCategories').value;
    const categories = categoriesRaw.split(',').map(c => c.trim()).filter(c => c.length > 0);

    const castRaw = document.getElementById('inputCast').value;
    const cast = castRaw.split(',').map(c => c.trim()).filter(c => c.length > 0);

    const payload = {
      title: document.getElementById('inputTitle').value.trim(),
      original_title: document.getElementById('inputOriginalTitle').value.trim() || null,
      overview: document.getElementById('inputOverview').value.trim(),
      media_type: document.getElementById('inputMediaType').value,
      poster_url: document.getElementById('inputPosterUrl').value.trim(),
      backdrop_url: document.getElementById('inputBackdropUrl').value.trim(),
      video_url: document.getElementById('inputVideoUrl').value.trim(),
      categories: categories.length > 0 ? categories : ['Tendances'],
      release_year: parseInt(document.getElementById('inputReleaseYear').value) || 2025,
      match_score: parseInt(document.getElementById('inputMatchScore').value) || 95,
      age_rating: document.getElementById('inputAgeRating').value,
      duration: document.getElementById('inputDuration').value.trim(),
      cast: cast,
      director: document.getElementById('inputDirector').value.trim() || null,
      is_hero: document.getElementById('inputIsHero').checked,
    };

    try {
      let url = `${this.apiBase()}/api/admin/movies`;
      let method = 'POST';

      if (this.editingId) {
        url = `${this.apiBase()}/api/admin/movies/${encodeURIComponent(this.editingId)}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method: method,
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }

      const json = await res.json();
      if (json.success) {
        this.showToast(this.editingId ? "Titre modifié avec succès !" : "Nouveau titre ajouté avec succès !");
        this.closeModal();
        await this.loadCatalog();
        await this.loadStats();
        if (window.netflixApp && typeof window.netflixApp.loadCatalog === 'function') {
          window.netflixApp.loadCatalog();
        }
      } else {
        this.showToast(json.message || "Erreur lors de l'enregistrement", true);
      }
    } catch (err) {
      this.showToast("Erreur de communication avec le serveur", true);
    }
  }

  async setHero(id) {
    try {
      const res = await fetch(`${this.apiBase()}/api/admin/movies/${encodeURIComponent(id)}/hero`, {
        method: 'POST',
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (json.success) {
        this.showToast("⭐ Titre promu en tête d'affiche (Hero Billboard) !");
        await this.loadCatalog();
        await this.loadStats();
        if (window.netflixApp && typeof window.netflixApp.loadCatalog === 'function') {
          window.netflixApp.loadCatalog();
        }
      }
    } catch (e) {
      this.showToast("Erreur lors de la mise en vedette", true);
    }
  }

  async deleteMovie(id) {
    const m = this.allMovies.find(item => item.id === id || item.tmdb_id === id);
    const title = m ? m.title : 'ce titre';
    if (!confirm(`Voulez-vous vraiment supprimer "${title}" du catalogue ?`)) return;

    try {
      const res = await fetch(`${this.apiBase()}/api/admin/movies/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (json.success) {
        this.showToast(`"${title}" supprimé du catalogue avec succès`);
        await this.loadCatalog();
        await this.loadStats();
        if (window.netflixApp && typeof window.netflixApp.loadCatalog === 'function') {
          window.netflixApp.loadCatalog();
        }
      } else {
        this.showToast(json.message || "Erreur lors de la suppression", true);
      }
    } catch (e) {
      this.showToast("Erreur de communication avec le serveur", true);
    }
  }

  showToast(message, isError = false) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (isError) toast.style.borderLeftColor = '#ff3333';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ================= CLUSTER MULTI-SERVEURS & TÉLÉMÉTRIE =================
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  startClusterPolling() {
    this.stopClusterPolling();
    this.clusterPollingTimer = setInterval(() => {
      if (this.overlay && this.overlay.classList.contains('active')) {
        this.loadClusterStatus(false);
      } else {
        this.stopClusterPolling();
      }
    }, 4500);
  }

  stopClusterPolling() {
    if (this.clusterPollingTimer) {
      clearInterval(this.clusterPollingTimer);
      this.clusterPollingTimer = null;
    }
  }

  formatUptime(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}j ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  async loadClusterStatus(showNotification = false) {
    if (!this.clusterNodesGrid) {
      this.clusterNodesGrid = document.getElementById('clusterNodesGrid');
    }
    if (!this.clusterNodesGrid) return;

    try {
      const res = await fetch(`${this.apiBase()}/api/cluster/status`, {
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const data = await res.json();
      if (data && data.success && Array.isArray(data.nodes)) {
        this.renderClusterNodes(data.nodes);
        if (Array.isArray(data.active_sessions)) {
          this.renderXtreamSessions(data.active_sessions, data.total_sessions_ram_mb);
        }
        if (showNotification) {
          this.showToast(`⚡ Cluster synchronisé : ${data.nodes.length} nœud(s)`);
        }
      }
    } catch (err) {
      console.warn('[Cluster] Erreur supervision:', err.message);
      if (showNotification) {
        this.showToast("Erreur lors de la lecture du cluster", true);
      }
    }
  }

  renderClusterNodes(nodes) {
    if (!this.clusterNodesGrid) return;
    if (!nodes || nodes.length === 0) {
      this.clusterNodesGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:30px; color:var(--admin-text-secondary);">
          Aucun serveur configuré dans le cluster.
        </div>`;
      return;
    }

    const html = nodes.map(node => {
      const isCurrent = !!node.is_current;
      const isOnline = !!node.online;
      const cpu = Math.min(100, Math.max(0, Math.round(node.cpu_percent || 0)));
      
      const mem = node.memory || {};
      const ramProcessMb = Math.round(mem.processUsedMb ?? mem.usedMb ?? mem.rss_mb ?? 0);
      const ramTotalMb = Math.round(mem.totalMb ?? 2048);
      const ramSystemUsedMb = Math.round(mem.systemUsedMb ?? ramProcessMb);
      const ramPercent = Math.min(100, Math.max(0, Math.round(mem.percent ?? ((ramSystemUsedMb / ramTotalMb) * 100))));
      const ramAvailableMb = Math.round(mem.availableMb ?? (ramTotalMb - ramSystemUsedMb));

      const streams = node.active_streams || 0;
      const requests = node.total_requests || 0;
      const uptimeStr = this.formatUptime(node.uptime_seconds);
      const latencyStr = node.latency_ms !== null && node.latency_ms !== undefined ? `${node.latency_ms} ms` : 'N/A';

      const cpuLevelClass = cpu > 80 ? 'danger' : (cpu > 50 ? 'warn' : 'normal');
      const ramLevelClass = ramPercent > 80 ? 'danger' : (ramPercent > 65 ? 'warn' : 'normal');

      const roleBadge = (node.role || 'edge').toLowerCase();
      const roleText = roleBadge === 'master' ? '👑 Serveur Maître VPS' : (roleBadge === 'backup' ? '🛡️ Secours' : '⚡ Nœud Edge');

      return `
        <div class="cluster-node-card ${isCurrent ? 'node-current' : ''} ${!isOnline ? 'node-offline' : ''}">
          <div class="node-card-top">
            <div class="node-identity">
              <div class="node-name-wrap">
                <span class="node-name">${this.escapeHtml(node.name || 'Serveur')}</span>
                ${isCurrent ? '<span class="node-current-tag">PROD ACTIVE</span>' : ''}
              </div>
              <div class="node-badges">
                <span class="node-role-badge ${roleBadge}">${roleText}</span>
              </div>
            </div>
            <div class="node-status-pill ${isOnline ? 'online' : 'offline'}">
              <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
              <span>${isOnline ? 'EN LIGNE' : 'HORS LIGNE'}</span>
            </div>
          </div>

          <div class="node-url-row">
            <span class="node-url-text" title="${this.escapeHtml(node.url || '')}">
              ${this.escapeHtml(node.url || 'http://74.50.66.196')}
            </span>
            <span class="node-latency-pill" title="Latence de réponse">${latencyStr}</span>
          </div>

          <div class="node-metrics-wrap">
            <!-- CPU Gauge -->
            <div class="node-metric-row">
              <div class="metric-header">
                <span class="metric-title">⚙️ Processeur (CPU)</span>
                <span class="metric-value">${cpu}%</span>
              </div>
              <div class="metric-bar-track">
                <div class="metric-bar-fill ${cpuLevelClass}" style="width: ${cpu}%"></div>
              </div>
            </div>

            <!-- RAM Gauge Réelle -->
            <div class="node-metric-row">
              <div class="metric-header">
                <span class="metric-title">🧠 Mémoire RAM (${ramSystemUsedMb} Mo / ${ramTotalMb} Mo)</span>
                <span class="metric-value">${ramPercent}%</span>
              </div>
              <div class="metric-bar-track">
                <div class="metric-bar-fill ${ramLevelClass}" style="width: ${ramPercent}%"></div>
              </div>
              <div style="font-size:0.75rem; color:#aaa; margin-top:3px; display:flex; justify-content:space-between;">
                <span>App Node.js : <strong>${ramProcessMb} Mo</strong></span>
                <span>Libre : <strong>${ramAvailableMb} Mo</strong></span>
              </div>
            </div>

            <!-- Disque SSD Réel si disponible -->
            ${mem.diskTotalGb ? `
            <div class="node-metric-row" style="margin-top:6px;">
              <div class="metric-header">
                <span class="metric-title">💾 Stockage Disque (${mem.diskUsedGb} Go / ${mem.diskTotalGb} Go)</span>
                <span class="metric-value">${mem.diskPercent}%</span>
              </div>
              <div class="metric-bar-track">
                <div class="metric-bar-fill ${mem.diskPercent > 80 ? 'danger' : 'normal'}" style="width: ${mem.diskPercent}%"></div>
              </div>
            </div>
            ` : ''}
          </div>

          <div class="node-stats-grid">
            <div class="node-stat-col">
              <span class="node-stat-label">Flux Vidéo</span>
              <span class="node-stat-val" style="color: ${streams > 0 ? '#00e676' : '#fff'}">${streams}</span>
            </div>
            <div class="node-stat-col">
              <span class="node-stat-label">Requêtes</span>
              <span class="node-stat-val">${requests}</span>
            </div>
            <div class="node-stat-col">
              <span class="node-stat-label">Uptime</span>
              <span class="node-stat-val" style="font-size:0.82rem;">${uptimeStr}</span>
            </div>
          </div>

          <div class="node-card-footer">
            <span class="node-uptime-label">
              ${isOnline ? '🟢 VPS Dédié 24/7 (En ligne)' : '🔴 Injoignable'}
            </span>
            ${!isCurrent ? `
              <button type="button" class="btn-delete-node" data-node-id="${this.escapeHtml(node.id || '')}" data-node-name="${this.escapeHtml(node.name || '')}">
                🗑️ Supprimer
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.clusterNodesGrid.innerHTML = html;

    // Lier les boutons de suppression
    const deleteBtns = this.clusterNodesGrid.querySelectorAll('.btn-delete-node');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-node-id');
        const name = btn.getAttribute('data-node-name');
        this.deleteClusterNode(id, name);
      });
    });
  }

  async handleClusterAddNodeSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('clusterNodeNameInput');
    const urlInput = document.getElementById('clusterNodeUrlInput');
    const roleSelect = document.getElementById('clusterNodeRoleSelect');
    const addBtn = document.getElementById('clusterAddNodeBtn');

    const name = nameInput ? nameInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';
    const role = roleSelect ? roleSelect.value : 'edge';

    if (!url) {
      this.showToast("Veuillez renseigner l'URL du serveur Render", true);
      return;
    }

    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Connexion...';
    }

    try {
      const res = await fetch(`${this.apiBase()}/api/admin/cluster/nodes`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, url, role })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`✅ ${data.message || 'Serveur ajouté au cluster avec succès'}`);
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        await this.loadClusterStatus();
      } else {
        this.showToast(data.message || "Erreur lors de l'ajout au cluster", true);
      }
    } catch (err) {
      this.showToast("Erreur de communication avec le serveur", true);
    } finally {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = '🔗 Connecter au Cluster';
      }
    }
  }

  async deleteClusterNode(nodeId, nodeName) {
    if (!nodeId) return;
    if (!confirm(`Confirmez-vous le retrait de "${nodeName || 'ce serveur'}" du cluster ?`)) {
      return;
    }

    try {
      const res = await fetch(`${this.apiBase()}/api/admin/cluster/nodes`, {
        method: 'DELETE',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: nodeId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`🗑️ Serveur retiré du cluster`);
        await this.loadClusterStatus();
      } else {
        this.showToast(data.message || "Erreur lors de la suppression", true);
      }
    } catch (err) {
      this.showToast("Erreur de communication avec le serveur", true);
    }
  }

  // ================= TÉLÉMÉTRIE EN DIRECT DES SESSIONS XTREAM =================
  async loadXtreamSessions(showNotification = false) {
    try {
      const res = await fetch(`${this.apiBase()}/api/admin/xtream/sessions`, {
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (json && json.success && json.data) {
        this.renderXtreamSessions(json.data.sessions || [], json.data.total_ram_mb || 0);
        if (showNotification) {
          this.showToast(`📡 Télémétrie Xtream actualisée : ${json.data.count || 0} session(s) active(s)`);
        }
      }
    } catch (err) {
      console.warn('[Xtream Telemetry Error]:', err.message);
    }
  }

  renderXtreamSessions(sessions = [], totalRamMb = 0) {
    if (!this.xtreamSessionsGrid) {
      this.xtreamSessionsGrid = document.getElementById('xtreamSessionsGrid');
    }
    if (!this.xtreamActiveCountText) {
      this.xtreamActiveCountText = document.getElementById('xtreamActiveCountText');
    }
    if (!this.xtreamTotalRamText) {
      this.xtreamTotalRamText = document.getElementById('xtreamTotalRamText');
    }

    const count = Array.isArray(sessions) ? sessions.length : 0;
    if (this.xtreamActiveCountText) {
      this.xtreamActiveCountText.textContent = `${count} SESSION${count > 1 ? 'S' : ''} ACTIVE${count > 1 ? 'S' : ''}`;
    }
    if (this.xtreamTotalRamText) {
      this.xtreamTotalRamText.textContent = `${totalRamMb || (count * 8.5).toFixed(1)} Mo`;
    }

    if (!this.xtreamSessionsGrid) return;

    if (!sessions || sessions.length === 0) {
      this.xtreamSessionsGrid.innerHTML = `
        <div class="xtream-empty-sessions" id="xtreamEmptySessions">
          <span style="font-size: 1.6rem; display: block; margin-bottom: 6px;">📡</span>
          Aucun flux Xtream en cours de diffusion pour le moment.<br>
          <span style="font-size: 0.8rem; color: var(--admin-text-muted);">Lancez une chaîne sur Televizo, TiviMate ou le lecteur web pour voir la session s'afficher en direct ici.</span>
        </div>
      `;
      return;
    }

    const html = sessions.map(s => {
      const app = s.client_app || { name: 'Client IPTV', icon: '📡', badge: 'other' };
      const media = s.media || { name: 'Flux Direct', category: 'TV', icon: 'assets/hero/live-tv-banner.webp', quality: 'HD' };
      const durationStr = this.formatUptime(s.duration_seconds || 0);
      const ramMb = s.estimated_ram_mb ? `${s.estimated_ram_mb} Mo` : '8.5 Mo';
      const serverName = s.server_node || 'Serveur 1';
      const safeIp = (s.client_ip || '127.0.0.1').replace(/::ffff:/, '');

      return `
        <div class="xtream-session-card" data-session-id="${this.escapeHtml(s.id)}">
          <div class="session-left">
            <img class="session-channel-icon" src="${this.escapeHtml(media.icon || 'assets/hero/live-tv-banner.webp')}" alt="${this.escapeHtml(media.name)}" onerror="this.src='assets/hero/live-tv-banner.webp'">
            <div class="session-info">
              <span class="session-channel-name" title="${this.escapeHtml(media.name)}">${this.escapeHtml(media.name)}</span>
              <span class="session-category">${this.escapeHtml(media.category)} • ${this.escapeHtml(media.quality || 'HD')}</span>
            </div>
          </div>

          <div class="session-center">
            <span class="badge-app ${this.escapeHtml(app.badge || 'other')}">
              <span>${app.icon || '📺'}</span> ${this.escapeHtml(app.name)}
            </span>
            <span class="badge-server-node" title="Serveur qui délivre le flux">
              🖥️ ${this.escapeHtml(serverName)}
            </span>
            <span class="session-stat-pill duration" title="Durée de visionnage active">
              ⏱️ ${durationStr}
            </span>
            <span class="session-stat-pill ram" title="Mémoire RAM allouée au buffer">
              🧠 ${ramMb} RAM
            </span>
            <span class="session-stat-pill ip" title="Adresse IP cliente">
              🌐 ${this.escapeHtml(safeIp)}
            </span>
          </div>

          <div class="session-right">
            <button type="button" class="btn-kill-session" data-session-id="${this.escapeHtml(s.id)}" data-channel-name="${this.escapeHtml(media.name)}" title="Couper cette diffusion">
              ✕ Interrompre
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.xtreamSessionsGrid.innerHTML = html;

    // Lier les boutons d'interruption
    this.xtreamSessionsGrid.querySelectorAll('.btn-kill-session').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-session-id');
        const chName = btn.getAttribute('data-channel-name');
        this.killXtreamSession(id, chName);
      });
    });
  }

  async killXtreamSession(sessionId, channelName) {
    if (!sessionId) return;
    if (!confirm(`Voulez-vous vraiment couper la session de diffusion de "${channelName || 'cette chaîne'}" ?`)) {
      return;
    }

    try {
      const res = await fetch(`${this.apiBase()}/api/admin/xtream/sessions`, {
        method: 'DELETE',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: sessionId })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`🛑 Session "${channelName || sessionId}" interrompue`);
        this.renderXtreamSessions(data.data?.sessions || [], data.data?.total_ram_mb || 0);
      } else {
        this.showToast(data.message || "Erreur lors de l'interruption", true);
      }
    } catch (e) {
      this.showToast("Erreur de communication avec le serveur", true);
    }
  }

  // ================= GESTION DES COMPTES UTILISATEURS XTREAM CODES =================
  async loadXtreamUsers(showNotification = false) {
    if (!this.isAuthenticated()) return;
    try {
      const res = await fetch(`${this.apiBase()}/api/admin/xtream/users`, {
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        this.renderXtreamUsers(json.data);
        if (showNotification) {
          this.showToast('👥 Liste des comptes IPTV actualisée');
        }
      }
    } catch (err) {
      console.error('Erreur chargement utilisateurs Xtream:', err);
    }
  }

  renderXtreamUsers(users) {
    if (!this.xtreamUsersTableBody) return;
    if (!users || users.length === 0) {
      this.xtreamUsersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: var(--admin-text-muted);">
            Aucun compte IPTV configuré pour le moment.
          </td>
        </tr>
      `;
      return;
    }

    const serverOrigin = this.apiBase() || window.location.origin;

    const html = users.map(user => {
      const username = this.escapeHtml(user.username || '');
      const password = this.escapeHtml(user.password || '');
      const maxCons = user.max_connections || 1;
      const status = user.status || 'Active';
      const isActive = status === 'Active';

      let expStr = 'Illimité (Permanent)';
      if (user.exp_date && user.exp_date < 2000000000) {
        const expDate = new Date(user.exp_date * 1000);
        expStr = expDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      }

      const m3uUrl = `${serverOrigin}/get.php?username=${encodeURIComponent(user.username)}&password=${encodeURIComponent(user.password)}`;
      const epgUrl = `${serverOrigin}/xmltv.php?username=${encodeURIComponent(user.username)}&password=${encodeURIComponent(user.password)}`;

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 14px 16px; font-weight: 600; color: #fff;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.2rem;">👤</span>
              <span>${username}</span>
            </div>
          </td>
          <td style="padding: 14px 16px;">
            <code style="background: rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 4px; color: #46d369; font-family: monospace; font-size: 0.9rem;">${password}</code>
          </td>
          <td style="padding: 14px 16px; text-align: center;">
            <span style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 20px; font-size: 0.82rem; color: var(--admin-text-secondary);">
              📺 ${maxCons} max
            </span>
          </td>
          <td style="padding: 14px 16px; text-align: center; font-size: 0.85rem; color: ${expStr.includes('Illimité') ? '#46d369' : 'var(--admin-text-secondary)'};">
            ${expStr}
          </td>
          <td style="padding: 14px 16px; text-align: center;">
            <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; ${isActive ? 'background: rgba(70,211,105,0.15); color: #46d369; border: 1px solid rgba(70,211,105,0.3);' : 'background: rgba(255,255,255,0.1); color: var(--admin-text-muted); border: 1px solid rgba(255,255,255,0.1);'}">
              ${isActive ? 'ACTIF' : 'SUSPENDU'}
            </span>
          </td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end;">
              <button type="button" class="btn-admin btn-admin-secondary btn-sm" onclick="navigator.clipboard.writeText('${m3uUrl}'); window.netflixAdmin.showToast('🔗 Lien M3U pour ${username} copié !');" title="Copier lien M3U">
                🔗 M3U
              </button>
              <button type="button" class="btn-admin btn-admin-blue btn-sm" onclick="navigator.clipboard.writeText('${epgUrl}'); window.netflixAdmin.showToast('📅 Lien EPG XMLTV pour ${username} copié !');" title="Copier lien XMLTV EPG">
                📅 EPG
              </button>
              <button type="button" class="btn-admin btn-admin-red btn-sm" onclick="window.netflixAdmin.deleteXtreamUser('${username}')" title="Supprimer ce compte" ${users.length <= 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.xtreamUsersTableBody.innerHTML = html;
  }

  async handleCreateXtreamUser(e) {
    e.preventDefault();
    const uInput = document.getElementById('newXtreamUsername');
    const pInput = document.getElementById('newXtreamPassword');
    const mInput = document.getElementById('newXtreamMaxCons');
    const dInput = document.getElementById('newXtreamDuration');

    const username = (uInput ? uInput.value : '').trim();
    const password = (pInput ? pInput.value : '').trim();
    const maxCons = parseInt(mInput ? mInput.value : '5', 10) || 5;
    const duration = dInput ? dInput.value : 'unlimited';

    if (!username || !password) {
      this.showToast("Veuillez renseigner un identifiant et un mot de passe", true);
      return;
    }

    let expDate = 2147483647; // 2038 / unlimited
    const nowSec = Math.floor(Date.now() / 1000);
    if (duration === '1m') expDate = nowSec + 30 * 86400;
    else if (duration === '3m') expDate = nowSec + 90 * 86400;
    else if (duration === '6m') expDate = nowSec + 180 * 86400;
    else if (duration === '1y') expDate = nowSec + 365 * 86400;

    try {
      const res = await fetch(`${this.apiBase()}/api/admin/xtream/users`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          username,
          password,
          max_connections: maxCons,
          exp_date: expDate,
          status: 'Active'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`🎉 Compte IPTV "${username}" créé avec succès !`);
        if (uInput) uInput.value = '';
        if (pInput) pInput.value = '';
        if (this.addXtreamUserContainer) {
          this.addXtreamUserContainer.style.display = 'none';
        }
        await this.loadXtreamUsers();
      } else {
        this.showToast(data.message || "Erreur lors de la création du compte", true);
      }
    } catch (err) {
      console.error('Erreur création compte Xtream:', err);
      this.showToast("Erreur de connexion au serveur", true);
    }
  }

  async deleteXtreamUser(username) {
    if (!username) return;
    if (!confirm(`Voulez-vous vraiment supprimer le compte abonné "${username}" ?`)) {
      return;
    }

    try {
      const res = await fetch(`${this.apiBase()}/api/admin/xtream/users`, {
        method: 'DELETE',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ username })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        this.showToast(`🗑️ Compte "${username}" supprimé avec succès`);
        this.renderXtreamUsers(data.data || []);
      } else {
        this.showToast(data.message || "Erreur lors de la suppression", true);
      }
    } catch (err) {
      console.error('Erreur suppression compte Xtream:', err);
      this.showToast("Erreur de communication avec le serveur", true);
    }
  }

  // ================= MODÉRATION COMMUNAUTÉ & UTILISATEURS ZIFLIX =================
  getAdminHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('ziflix_auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const pass = this.getAuthPassword() || '1965';
    if (pass) headers['x-admin-password'] = pass;
    return headers;
  }

  async loadCommunityUsers() {
    if (!this.adminUsersTableBody) return;
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/users', { headers });
      const json = await res.json();
      if (json.success && Array.isArray(json.users)) {
        if (this.adminUsersCount) this.adminUsersCount.textContent = json.users.length;
        if (json.users.length === 0) {
          this.adminUsersTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #888; padding: 16px;">Aucun utilisateur enregistré.</td></tr>';
          return;
        }
        this.adminUsersTableBody.innerHTML = '';
        json.users.forEach(u => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--admin-border)';
          const isBanned = !!u.banned;
          const isAdmin = (u.role === 'admin');

          tr.innerHTML = `
            <td style="padding: 10px 8px; display: flex; align-items: center; gap: 8px;">
              <img src="${u.avatar || 'assets/avatars/avatar-1.svg'}" alt="${u.username}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
              <strong style="color: #fff; font-size: 0.82rem;">${u.username}</strong>
            </td>
            <td style="padding: 10px 8px; text-align: center;">
              <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; ${isAdmin ? 'background: rgba(229, 9, 20, 0.25); color: #ff6b6b;' : 'background: rgba(255,255,255,0.08); color: #aaa;'}">
                ${isAdmin ? '👑 Admin' : 'Membre'}
              </span>
            </td>
            <td style="padding: 10px 8px; text-align: center;">
              <span style="font-size: 0.72rem; font-weight: 700; color: ${isBanned ? '#ff4d4d' : '#46d369'};">
                ${isBanned ? '🚫 Banni' : '✅ Actif'}
              </span>
            </td>
            <td style="padding: 10px 8px; text-align: right; white-space: nowrap;">
              <button type="button" class="btn-admin btn-admin-secondary btn-sm toggle-role-btn" style="font-size: 0.7rem; padding: 3px 6px;">
                ${isAdmin ? 'Rétrograder' : 'Promouvoir'}
              </button>
              <button type="button" class="btn-admin ${isBanned ? 'btn-admin-green' : 'btn-admin-red'} btn-sm toggle-ban-btn" style="font-size: 0.7rem; padding: 3px 6px; margin-left: 4px;">
                ${isBanned ? 'Débannir' : 'Bannir'}
              </button>
            </td>
          `;

          tr.querySelector('.toggle-role-btn')?.addEventListener('click', async () => {
            const newRole = isAdmin ? 'user' : 'admin';
            await this.changeUserRole(u.id, newRole);
          });

          tr.querySelector('.toggle-ban-btn')?.addEventListener('click', async () => {
            await this.toggleUserBan(u.id, !isBanned);
          });

          this.adminUsersTableBody.appendChild(tr);
        });
      }
    } catch (e) {}
  }

  async toggleUserBan(userId, ban) {
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/users/ban', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, banned: ban })
      });
      const json = await res.json();
      if (json.success) {
        this.showToast(ban ? '🚫 Utilisateur banni' : '✅ Utilisateur débanni');
        this.loadCommunityUsers();
      } else {
        this.showToast(json.error || "Erreur lors de l'opération", true);
      }
    } catch (e) {
      this.showToast('Erreur réseau', true);
    }
  }

  async changeUserRole(userId, role) {
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/users/role', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, role })
      });
      const json = await res.json();
      if (json.success) {
        this.showToast(`Rôle mis à jour : ${role}`);
        this.loadCommunityUsers();
      } else {
        this.showToast(json.error || 'Erreur lors de la mise à jour du rôle', true);
      }
    } catch (e) {
      this.showToast('Erreur réseau', true);
    }
  }

  async loadCommunityComments() {
    if (!this.adminCommentsList) return;
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/comments?recent=true', { headers });
      const json = await res.json();
      if (json.success && Array.isArray(json.comments)) {
        if (this.adminCommentsCount) this.adminCommentsCount.textContent = json.comments.length;
        if (json.comments.length === 0) {
          this.adminCommentsList.innerHTML = '<div style="color: #888; font-size: 0.8rem; text-align: center; padding: 20px;">Aucun avis posté.</div>';
          return;
        }
        this.adminCommentsList.innerHTML = '';
        json.comments.forEach(c => {
          const item = document.createElement('div');
          item.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid var(--admin-border); border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 0.8rem;';
          item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: #fff;">${c.username} <span style="font-size: 0.72rem; color: #888; font-weight: 400;">(${c.mediaId})</span></strong>
              <button type="button" class="btn-admin btn-admin-red btn-sm delete-comment-btn" style="padding: 2px 6px; font-size: 0.68rem;">Supprimer</button>
            </div>
            <div style="color: #ccc; margin-bottom: 4px;">${c.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <div style="font-size: 0.68rem; color: #666;">${new Date(c.createdAt).toLocaleString('fr-FR')}</div>
          `;
          item.querySelector('.delete-comment-btn')?.addEventListener('click', async () => {
            await this.deleteCommentAdmin(c.id);
          });
          this.adminCommentsList.appendChild(item);
        });
      }
    } catch (e) {}
  }

  async deleteCommentAdmin(commentId) {
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch(`/api/comments?id=${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ commentId, id: commentId })
      });
      const json = await res.json();
      if (json.success) {
        this.showToast('🗑️ Avis supprimé par la modération');
        this.loadCommunityComments();
      } else {
        this.showToast(json.error || 'Erreur lors de la suppression', true);
      }
    } catch (e) {
      this.showToast('Erreur réseau', true);
    }
  }
}

window.NetflixAdmin = NetflixAdmin;
