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

    // Signalements de Bugs ZIFLIX
    this.adminBugsTableBody = document.getElementById('adminBugsTableBody');
    this.adminBugsCount = document.getElementById('adminBugsCount');
    this.adminBugsCountAll = document.getElementById('adminBugsCountAll');
    this.adminBugsCountOpen = document.getElementById('adminBugsCountOpen');
    this.adminBugsRefreshBtn = document.getElementById('adminBugsRefreshBtn');
    this.adminBugsFilterAll = document.getElementById('adminBugsFilterAll');
    this.adminBugsFilterOpen = document.getElementById('adminBugsFilterOpen');
    this.currentBugFilter = 'all';
    this.cachedBugsList = [];

    window.netflixAdmin = this;

    this.initEvents();
    this.initVidmolyEvents();
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
        this.loadReportedBugs();
        this.showToast('👥 Modération actualisée');
      });
    }

    if (this.adminBugsRefreshBtn) {
      this.adminBugsRefreshBtn.addEventListener('click', () => {
        this.loadReportedBugs();
        this.showToast('🚨 Signalements actualisés');
      });
    }

    if (this.adminBugsFilterAll) {
      this.adminBugsFilterAll.addEventListener('click', () => {
        this.currentBugFilter = 'all';
        this.adminBugsFilterAll.classList.add('active');
        if (this.adminBugsFilterOpen) this.adminBugsFilterOpen.classList.remove('active');
        this.renderReportedBugs();
      });
    }

    if (this.adminBugsFilterOpen) {
      this.adminBugsFilterOpen.addEventListener('click', () => {
        this.currentBugFilter = 'open';
        this.adminBugsFilterOpen.classList.add('active');
        if (this.adminBugsFilterAll) this.adminBugsFilterAll.classList.remove('active');
        this.renderReportedBugs();
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
    this.loadReportedBugs();
    this.startClusterPolling();
    this.loadVidmolyStatus();
    this.loadVidmolySeries();
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
        this.loadReportedBugs();
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
        this.loadReportedBugs();
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
              ${this.escapeHtml(node.url || 'https://ziablo.xyz')}
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
          const isVip = (u.role === 'vip' || !!u.is_vip);

          let roleBadgeHtml = '';
          if (isAdmin) {
            roleBadgeHtml = `<span style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 700; background: rgba(229, 9, 20, 0.25); color: #ff6b6b; border: 1px solid rgba(229, 9, 20, 0.4);">👑 Admin</span>`;
          } else if (isVip) {
            roleBadgeHtml = `<span style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 700; background: rgba(255, 215, 0, 0.16); color: #ffd700; border: 1px solid rgba(255, 215, 0, 0.45); box-shadow: 0 0 8px rgba(255, 215, 0, 0.2);">⭐ VIP</span>`;
          } else {
            roleBadgeHtml = `<span style="font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 700; background: rgba(255,255,255,0.08); color: #aaa;">Membre</span>`;
          }

          tr.innerHTML = `
            <td style="padding: 10px 8px; display: flex; align-items: center; gap: 8px;">
              <img src="${u.avatar || 'assets/avatars/avatar-1.svg'}" alt="${u.username}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
              <div>
                <strong style="color: #fff; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  ${u.username}
                  <span style="color: #888; font-size: 0.72rem; font-weight: normal; font-family: monospace; background: rgba(255, 255, 255, 0.06); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.08);" title="Adresse IP enregistrée">
                    IP: ${u.ip || 'Inconnue'}
                  </span>
                </strong>
                ${isVip && !isAdmin ? '<span style="color: #ffd700; font-size: 0.65rem; font-weight: 600; display: block;">Sans pub • Illimité</span>' : ''}
              </div>
            </td>
            <td style="padding: 10px 8px; text-align: center;">
              ${roleBadgeHtml}
            </td>
            <td style="padding: 10px 8px; text-align: center;">
              <span style="font-size: 0.72rem; font-weight: 700; color: ${isBanned ? '#ff4d4d' : '#46d369'};">
                ${isBanned ? '🚫 Banni' : '✅ Actif'}
              </span>
            </td>
            <td style="padding: 10px 8px; text-align: right; white-space: nowrap;">
              <!-- Menu déroulant rapide de rôle -->
              <select class="btn-admin btn-admin-secondary btn-sm role-select" style="font-size: 0.7rem; padding: 3px 5px; background: #18181b; color: #fff; border: 1px solid var(--admin-border); border-radius: 4px; margin-right: 4px; cursor: pointer;" title="Changer le rôle du compte">
                <option value="user" ${!isAdmin && !isVip ? 'selected' : ''}>Membre</option>
                <option value="vip" ${isVip && !isAdmin ? 'selected' : ''}>⭐ VIP (Sans pub)</option>
                <option value="admin" ${isAdmin ? 'selected' : ''}>👑 Admin</option>
              </select>

              <!-- Bouton 1-clic VIP -->
              ${!isAdmin ? `
                <button type="button" class="btn-admin btn-sm toggle-vip-btn" style="font-size: 0.7rem; padding: 3px 7px; margin-right: 4px; font-weight: 700; ${isVip ? 'background: rgba(255, 215, 0, 0.15); color: #ffd700; border: 1px solid rgba(255, 215, 0, 0.4);' : 'background: linear-gradient(135deg, #ffd700, #ffaa00); color: #000; border: none;'}" title="${isVip ? 'Retirer le statut VIP' : 'Passer ce compte en VIP (sans pub)'}">
                  ${isVip ? '✕ Retirer VIP' : '⭐ VIP'}
                </button>
              ` : ''}

              <!-- Bouton Bannir / Débannir -->
              <button type="button" class="btn-admin ${isBanned ? 'btn-admin-green' : 'btn-admin-red'} btn-sm toggle-ban-btn" style="font-size: 0.7rem; padding: 3px 6px;">
                ${isBanned ? 'Débannir' : 'Bannir'}
              </button>
            </td>
          `;

          tr.querySelector('.role-select')?.addEventListener('change', async (e) => {
            await this.changeUserRole(u.id, e.target.value);
          });

          tr.querySelector('.toggle-vip-btn')?.addEventListener('click', async () => {
            const nextRole = isVip ? 'user' : 'vip';
            await this.changeUserRole(u.id, nextRole);
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
    if (ban && !confirm("Voulez-vous vraiment bannir cet utilisateur et son adresse IP ?\nIl ne pourra plus se connecter ni recréer de compte.")) {
      return;
    }
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/users/ban', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, banned: ban })
      });
      const json = await res.json();
      if (json.success) {
        this.showToast(ban ? '🚫 Utilisateur et adresse IP bannis' : '✅ Utilisateur et IP débannis');
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
        let label = role;
        if (role === 'vip') label = '⭐ VIP (Visionnage illimité & Sans publicité)';
        else if (role === 'admin') label = '👑 Administrateur';
        else label = 'Membre Standard';
        this.showToast(`Rôle mis à jour : ${label}`);
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
          const userIpBadge = c.ip ? `<span style="font-size: 0.72rem; color: #888; font-weight: normal; margin-left: 6px; font-family: monospace; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 3px;" title="Adresse IP enregistrée">IP: ${c.ip}</span>` : '<span style="font-size: 0.72rem; color: #666; font-weight: normal; margin-left: 6px;">(IP non liée)</span>';
          item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px;">
              <strong style="color: #fff; word-break: break-all;">${c.username || 'Anonyme'} ${userIpBadge} <span style="font-size: 0.72rem; color: #777; font-weight: 400;">(${c.mediaId || 'Général'})</span></strong>
              <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button type="button" class="btn-admin btn-admin-red btn-sm ban-comment-user-btn" style="padding: 3px 8px; font-size: 0.68rem; background: #e50914; color: #fff; font-weight: 600; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 3px;" title="Bannir l'utilisateur et son adresse IP">🚫 Bannir IP</button>
                <button type="button" class="btn-admin btn-sm delete-comment-btn" style="padding: 3px 8px; font-size: 0.68rem; background: rgba(255,255,255,0.1); color: #ccc; border: none; border-radius: 4px; cursor: pointer;" title="Supprimer uniquement ce message">🗑️</button>
              </div>
            </div>
            <div style="color: #e6e6e6; margin-bottom: 4px; word-break: break-word; line-height: 1.35;">${(c.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <div style="font-size: 0.68rem; color: #666;">${c.createdAt ? new Date(c.createdAt).toLocaleString('fr-FR') : ''}</div>
          `;
          item.querySelector('.ban-comment-user-btn')?.addEventListener('click', async () => {
            await this.banCommentUserAdmin(c.id, c.userId || c.user_id, c.username, c.ip);
          });
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

  // ================= 15. GESTION DES SIGNALEMENTS DE BUGS ZIFLIX =================
  async loadReportedBugs() {
    if (!this.adminBugsTableBody) return;
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/bugs', { headers });
      const json = await res.json();
      if (json.success && Array.isArray(json.bugs)) {
        this.cachedBugsList = json.bugs;
        const openCount = json.bugs.filter(b => b.status === 'open').length;

        if (this.adminBugsCount) this.adminBugsCount.textContent = openCount;
        if (this.adminBugsCountAll) this.adminBugsCountAll.textContent = json.bugs.length;
        if (this.adminBugsCountOpen) this.adminBugsCountOpen.textContent = openCount;

        this.renderReportedBugs();
      }
    } catch (e) {}
  }

  renderReportedBugs() {
    if (!this.adminBugsTableBody) return;
    const list = this.currentBugFilter === 'open' 
      ? this.cachedBugsList.filter(b => b.status === 'open')
      : this.cachedBugsList;

    if (list.length === 0) {
      this.adminBugsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #888; padding: 20px;">Aucun signalement de bug trouvé.</td></tr>';
      return;
    }

    const catLabels = {
      playback: '🎬 Lecture / Format',
      audio: '🔇 Son décalé/muet',
      episode: '📺 Épisode coupé',
      display: '📱 Affichage / Zoom',
      other: '💡 Autre'
    };

    this.adminBugsTableBody.innerHTML = '';
    list.forEach(b => {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;';
      const isOpen = (b.status === 'open');
      const statusBadge = isOpen
        ? '<span style="background: rgba(229,9,20,0.2); color: #ff5555; border: 1px solid rgba(229,9,20,0.4); border-radius: 4px; padding: 2px 6px; font-size: 0.7rem; font-weight: 700;">OUVERT</span>'
        : '<span style="background: rgba(46,204,113,0.2); color: #2ecc71; border: 1px solid rgba(46,204,113,0.4); border-radius: 4px; padding: 2px 6px; font-size: 0.7rem; font-weight: 700;">RÉSOLU</span>';

      const dateStr = b.created_at ? new Date(b.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
      const catText = catLabels[b.category] || b.category || 'Général';
      const mediaStr = b.media_title 
        ? `<strong>${this.escapeHtml(b.media_title)}</strong>${b.season ? `<br><span style="font-size: 0.7rem; color: #888;">S${b.season}E${b.episode}</span>` : ''}`
        : '<span style="color: #666;">-</span>';

      tr.innerHTML = `
        <td style="padding: 10px 8px; font-size: 0.72rem; color: #888; white-space: nowrap;">${dateStr}</td>
        <td style="padding: 10px 8px; font-size: 0.8rem; font-weight: 600; color: #fff;">${this.escapeHtml(b.username || 'Visiteur')}</td>
        <td style="padding: 10px 8px; font-size: 0.75rem; color: #e50914; font-weight: 600;">${catText}</td>
        <td style="padding: 10px 8px; font-size: 0.75rem;">${mediaStr}</td>
        <td style="padding: 10px 8px; font-size: 0.72rem; color: #aaa;">${this.escapeHtml(b.device_info || 'Inconnu')}</td>
        <td style="padding: 10px 8px; font-size: 0.75rem; color: #ddd; max-width: 220px; word-break: break-word;">${this.escapeHtml(b.description || 'Aucun détail fourni')}</td>
        <td style="padding: 10px 8px; text-align: center;">${statusBadge}</td>
        <td style="padding: 10px 8px; text-align: right; white-space: nowrap;">
          ${isOpen 
            ? `<button type="button" class="btn-admin btn-admin-blue btn-sm resolve-bug-btn" style="padding: 3px 8px; font-size: 0.7rem; margin-right: 4px;">✓ Résolu</button>`
            : `<button type="button" class="btn-admin btn-admin-secondary btn-sm reopen-bug-btn" style="padding: 3px 8px; font-size: 0.7rem; margin-right: 4px;">↺ Rouvrir</button>`}
          <button type="button" class="btn-admin btn-admin-red btn-sm delete-bug-btn" style="padding: 3px 6px; font-size: 0.7rem;" title="Supprimer">🗑️</button>
        </td>
      `;

      tr.querySelector('.resolve-bug-btn')?.addEventListener('click', () => this.updateBugStatus(b.id, 'resolved'));
      tr.querySelector('.reopen-bug-btn')?.addEventListener('click', () => this.updateBugStatus(b.id, 'open'));
      tr.querySelector('.delete-bug-btn')?.addEventListener('click', () => this.deleteBugAdmin(b.id));

      this.adminBugsTableBody.appendChild(tr);
    });
  }

  async updateBugStatus(bugId, newStatus) {
    try {
      const headers = this.getAdminHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/admin/bugs/status', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: bugId, status: newStatus })
      });
      const json = await res.json();
      if (json.success) {
        this.showToast(newStatus === 'resolved' ? '✅ Signalement marqué comme résolu !' : '↺ Signalement rouvert');
        this.loadReportedBugs();
      }
    } catch (e) {
      this.showToast('Erreur lors de la mise à jour', true);
    }
  }

  async deleteBugAdmin(bugId) {
    if (!confirm('Supprimer définitivement ce signalement de bug ?')) return;
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch(`/api/admin/bugs?id=${encodeURIComponent(bugId)}`, {
        method: 'DELETE',
        headers
      });
      const json = await res.json();
      if (json.success) {
        this.showToast('🗑️ Signalement supprimé');
        this.loadReportedBugs();
      }
    } catch (e) {
      this.showToast('Erreur lors de la suppression', true);
    }
  }

  // ================= PASSERELLE VIDMOLY CLOUD (16 To) =================
  initVidmolyEvents() {
    const seriesSelect = document.getElementById('vidmolySeriesSelect');
    const seasonSelect = document.getElementById('vidmolySeasonSelect');
    const loadEpsBtn = document.getElementById('vidmolyLoadEpisodesBtn');
    const selectAllCb = document.getElementById('vidmolySelectAllEp');
    const uploadBtn = document.getElementById('vidmolyStartUploadBtn');
    const keepAliveBtn = document.getElementById('vidmolyKeepAliveBtn');
    if (keepAliveBtn && !keepAliveBtn._hasKeepAliveListener) {
      keepAliveBtn._hasKeepAliveListener = true;
      keepAliveBtn.addEventListener('click', async () => {
        keepAliveBtn.disabled = true;
        keepAliveBtn.textContent = '🛡️ Lancement Sentinel...';
        try {
          const res = await fetch('/api/admin/vidmoly/keepalive/trigger', {
            method: 'POST',
            headers: { ...this.getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ forceAll: false })
          });
          const data = await res.json();
          if (data.success) {
            alert('🛡️ Sentinel Keep-Alive activé !\nLe serveur ping chaque vidéo en arrière-plan (1 toutes les 15s) pour renouveler vos 365 jours sans surcharger la bande passante.');
          } else {
            alert('Erreur Sentinel : ' + (data.error || 'Inconnue'));
          }
        } catch (err) {
          alert('Erreur connexion Sentinel : ' + err.message);
        } finally {
          keepAliveBtn.disabled = false;
          keepAliveBtn.textContent = '🛡️ Sentinel Keep-Alive (365j)';
        }
      });
    }

    const refreshBtn = document.getElementById('vidmolyRefreshStatusBtn');

    if (seriesSelect) {
      seriesSelect.addEventListener('change', () => {
        const selectedOpt = seriesSelect.selectedOptions[0];
        if (!selectedOpt || !selectedOpt.dataset.seasons) return;
        try {
          const seasons = JSON.parse(selectedOpt.dataset.seasons || '[]');
          seasonSelect.innerHTML = seasons.map(s => `<option value="${s}">Saison ${s}</option>`).join('');
          if (seasons.includes('10')) seasonSelect.value = '10';
          else if (seasons.length > 0) seasonSelect.value = seasons[seasons.length - 1];
          this.updateVidmolyAutoPublishUI();
          this.loadVidmolyEpisodes();
        } catch (e) {}
      });
    }

    if (seasonSelect) {
      seasonSelect.addEventListener('change', () => {
        this.updateVidmolyAutoPublishUI();
        this.loadVidmolyEpisodes();
      });
    }

    if (loadEpsBtn) {
      loadEpsBtn.addEventListener('click', () => this.loadVidmolyEpisodes());
    }

    const selectFoxBleuBtn = document.getElementById('vidmolySelectFoxBleuOnlyBtn');
    const selectAllBtn = document.getElementById('vidmolySelectAllBtn');
    const deselectAllBtn = document.getElementById('vidmolyDeselectAllBtn');

    if (selectFoxBleuBtn) {
      selectFoxBleuBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.vidmoly-ep-checkbox');
        let selectedCount = 0;
        checkboxes.forEach(cb => {
          const status = cb.dataset.status || 'none';
          const isDuplicate = cb.dataset.isDuplicate === '1';
          const isFoxBleu = !isDuplicate || status === 'none' || status === 'error';
          cb.checked = isFoxBleu;
          if (isFoxBleu) selectedCount++;
        });
        if (selectAllCb) selectAllCb.checked = false;
        this.updateVidmolySelectedCounter();
        if (selectedCount > 0) {
          this.showToast(`⚡ ${selectedCount} épisode(s) non transféré(s) coché(s) pour envoi`);
        } else {
          this.showToast(`ℹ️ Tous les épisodes de cette saison sont déjà sur Vidmoly !`);
        }
      });
    }

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.vidmoly-ep-checkbox');
        checkboxes.forEach(cb => cb.checked = true);
        if (selectAllCb) selectAllCb.checked = true;
        this.updateVidmolySelectedCounter();
      });
    }

    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.vidmoly-ep-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        if (selectAllCb) selectAllCb.checked = false;
        this.updateVidmolySelectedCounter();
      });
    }

    if (selectAllCb) {
      selectAllCb.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.vidmoly-ep-checkbox');
        checkboxes.forEach(cb => cb.checked = selectAllCb.checked);
        this.updateVidmolySelectedCounter();
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => this.exportEpisodesToVidmoly());
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.checkVidmolyEncodings());
    }

    const autoPublishBtn = document.getElementById('vidmolyToggleAutoPublishBtn');
    if (autoPublishBtn) {
      autoPublishBtn.addEventListener('click', () => this.toggleVidmolyAutoPublish());
    }
    if (seasonSelect) {
      seasonSelect.addEventListener('change', () => this.updateVidmolyAutoPublishUI());
    }

  }

  async loadVidmolyStatus() {
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/vidmoly/status', { headers });
      const data = await res.json();
      if (data.success && data.state) {
        const quotaText = document.getElementById('vidmolyQuotaRemaining');
        const quotaTotal = document.getElementById('vidmolyQuotaTotal');
        const rem = data.state.remainingRequests ?? data.state.totalRemainingRequests ?? 1000;
        const tot = data.state.totalLimit ?? ((data.state.accountsCount || 20) * 50);
        if (quotaText) quotaText.textContent = rem;
        if (quotaTotal) quotaTotal.textContent = tot;
      }
    } catch (e) {
      console.warn('[Admin Vidmoly] Impossible de charger le statut:', e);
    }
  }

  async loadVidmolySeries() {
    const select = document.getElementById('vidmolySeriesSelect');
    const seasonSelect = document.getElementById('vidmolySeasonSelect');
    if (!select) return;

    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/vidmoly/series', { headers });
      const data = await res.json();
      if (!data.success || !Array.isArray(data.series)) return;

      select.innerHTML = '<option value="">-- Choisir une série --</option>' +
        data.series.map(s => {
          const prefix = s.is_reality ? '⭐ [TÉLÉ-RÉALITÉ] ' : '📺 ';
          return `<option value="${s.series_id}" data-title="${this.escapeHtml(s.title)}" data-seasons='${JSON.stringify(s.seasons)}'>${prefix}${this.escapeHtml(s.title)} (${s.seasons.length} saison(s), ${s.episodes_count} ép.)</option>`;
        }).join('');

      // Auto-sélectionner la première télé-réalité
      const firstReality = data.series.find(s => s.is_reality);
      if (firstReality) {
        select.value = firstReality.series_id;
        seasonSelect.innerHTML = firstReality.seasons.map(s => `<option value="${s}">Saison ${s}</option>`).join('');
        if (firstReality.seasons.includes('10')) {
          seasonSelect.value = '10';
        } else if (firstReality.seasons.length > 0) {
          seasonSelect.value = firstReality.seasons[firstReality.seasons.length - 1];
        }
        this.loadVidmolyEpisodes();
      }
      this.loadVidmolyAutoPublishRules();
    } catch (e) {
      console.error('[Admin Vidmoly] Erreur séries:', e);
    }
  }


  // =============== VIDMOLY AUTO-PUBLISH METHODS ===============

  async loadVidmolyAutoPublishRules() {
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/vidmoly/autopublish', { headers });
      const data = await res.json();
      if (data.success) {
        this._autoPublishRules = data.rules || {};
      }
    } catch (e) {
      this._autoPublishRules = {};
    }
    this.updateVidmolyAutoPublishUI();
  }

  updateVidmolyAutoPublishUI() {
    const seriesSelect = document.getElementById('vidmolySeriesSelect');
    const seasonSelect = document.getElementById('vidmolySeasonSelect');
    const btn = document.getElementById('vidmolyToggleAutoPublishBtn');
    const badge = document.getElementById('vidmolyAutoPublishBadge');

    const seriesId = seriesSelect?.value;
    const season = seasonSelect?.value;

    if (!seriesId || !season) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⚙️ Sélectionner une saison';
        btn.style.background = '#333';
        btn.style.color = '#aaa';
      }
      if (badge) {
        badge.textContent = 'Sélectionnez une saison';
        badge.style.background = 'rgba(255,255,255,0.1)';
        badge.style.color = '#aaa';
      }
      return;
    }

    const ruleKey = `${seriesId}_${season}`;
    const rules = this._autoPublishRules || {};
    const rule = rules[ruleKey];
    const isEnabled = !!(rule && rule.enabled);

    if (btn) {
      btn.disabled = false;
      if (isEnabled) {
        btn.textContent = '✅ Auto-pub ACTIVE — Désactiver';
        btn.style.background = '#2e7d32';
        btn.style.color = '#fff';
      } else {
        btn.textContent = '⚙️ Activer l\'auto-publication';
        btn.style.background = '#b71c1c';
        btn.style.color = '#fff';
      }
    }
    if (badge) {
      if (isEnabled) {
        badge.textContent = '🟢 AUTO-PUB ACTIVE';
        badge.style.background = 'rgba(46,125,50,0.25)';
        badge.style.color = '#81c784';
      } else {
        badge.textContent = '⛔ Auto-pub inactive';
        badge.style.background = 'rgba(255,255,255,0.07)';
        badge.style.color = '#aaa';
      }
    }
  }

  async toggleVidmolyAutoPublish() {
    const seriesSelect = document.getElementById('vidmolySeriesSelect');
    const seasonSelect = document.getElementById('vidmolySeasonSelect');

    const seriesId = seriesSelect?.value;
    const season = seasonSelect?.value;
    const seriesTitle = seriesSelect?.selectedOptions[0]?.dataset?.title || 'Série';

    if (!seriesId || !season) {
      alert('Veuillez sélectionner une série et une saison.');
      return;
    }

    const ruleKey = `${seriesId}_${season}`;
    const rules = this._autoPublishRules || {};
    const rule = rules[ruleKey];
    const isCurrentlyEnabled = !!(rule && rule.enabled);
    const newEnabled = !isCurrentlyEnabled;

    try {
      const headers = this.getAdminHeaders();
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/admin/vidmoly/autopublish/toggle', {
        method: 'POST',
        headers,
        body: JSON.stringify({ seriesId, seriesTitle, season, enabled: newEnabled })
      });
      const data = await res.json();
      if (data.success) {
        this._autoPublishRules = data.rules || {};
        this.updateVidmolyAutoPublishUI();
        const msg = newEnabled
          ? `✅ Auto-publication activée pour la Saison ${season} de ${seriesTitle}.`
          : `⛔ Auto-publication désactivée pour la Saison ${season}.`;
        this.showAdminToast(msg);
      } else {
        alert('Erreur : ' + (data.error || 'Erreur inconnue'));
      }
    } catch (e) {
      alert('Erreur réseau : ' + e.message);
    }
  }

  // ===============================================================

  async loadVidmolyEpisodes(isSilent = false) {
    const seriesSelect = document.getElementById('vidmolySeriesSelect');
    const seasonSelect = document.getElementById('vidmolySeasonSelect');
    const wrapper = document.getElementById('vidmolyEpisodesWrapper');
    const tbody = document.getElementById('vidmolyEpisodesTableBody');
    const uploadBtn = document.getElementById('vidmolyStartUploadBtn');
    const alertBox = document.getElementById('vidmolyAlertBox');

    const seriesId = seriesSelect?.value;
    const season = seasonSelect?.value || '1';

    if (!seriesId) {
      if (wrapper) wrapper.style.display = 'none';
      return;
    }

    if (wrapper) wrapper.style.display = 'block';
    if (!isSilent && tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#aaa; padding: 20px;">Chargement des épisodes...</td></tr>';
    }

    try {
      // Mémoriser les épisodes cochés avant rafraîchissement
      const previouslyChecked = new Set(
        Array.from(document.querySelectorAll('.vidmoly-ep-checkbox:checked')).map(cb => cb.dataset.id)
      );

      const headers = this.getAdminHeaders();
      const res = await fetch(`/api/admin/vidmoly/episodes?series_id=${seriesId}&season=${season}`, { headers });
      const data = await res.json();
      if (!data.success || !Array.isArray(data.episodes)) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ff5252; padding: 20px;">Erreur de chargement des épisodes</td></tr>';
        return;
      }

      this.currentVidmolyEpisodes = data.episodes;
      this.currentVidmolySeriesTitle = data.seriesTitle || seriesSelect.selectedOptions[0]?.dataset.title || 'Série';
      this.currentVidmolySeason = season;

      if (data.episodes.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Aucun épisode trouvé pour cette saison.</td></tr>';
        if (uploadBtn) uploadBtn.style.display = 'none';
        return;
      }

      let hasActiveTransfers = false;

      if (tbody) {
        tbody.innerHTML = data.episodes.map(ep => {
          const v = ep.vidmoly || {};
          let badge = '<span style="background: rgba(255,255,255,0.08); color: #aaa; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem;">⚪ Sur FoxBleu</span>';
          let action = '<span style="color: #666; font-size: 0.8rem;">Prêt à transférer</span>';
          let isDuplicate = false;

          if (v.status === 'ready') {
            let keepAliveNotice = '';
          if (v.lastKeepAliveAt) {
            const daysSince = Math.floor((Date.now() - v.lastKeepAliveAt) / (24 * 3600 * 1000));
            const remainingDays = Math.max(0, 365 - daysSince);
            keepAliveNotice = `<div style="font-size: 0.7rem; color: #81c784; margin-top: 3px; font-weight: 600;">🛡️ Valable ${remainingDays}j (Ping: il y a ${daysSince}j)</div>`;
          } else {
            keepAliveNotice = `<div style="font-size: 0.7rem; color: #64b5f6; margin-top: 3px; font-weight: 600;">🛡️ Valable 365j</div>`;
          }
          badge = '<span style="background: #2e7d32; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-block;">🟢 C\'est fini</span>' + keepAliveNotice;
            const embedHref = v.fileCode ? `https://vidmoly.org/embed-${v.fileCode}.html` : ((v.embedUrl || '#').replace(/vidmoly\.(me|biz|net|to)/g, 'vidmoly.org').replace(/embed-embed-/g, 'embed-'));
            action = `<a href="${embedHref}" target="_blank" style="color: #4fc3f7; text-decoration: none; font-size: 0.8rem; font-weight: 600;">🔗 Voir embed</a>`;
            isDuplicate = true;
          } else if (v.status === 'converting' || v.status === 'uploading') {
            badge = '<span style="background: #f57f17; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-block;">🟡 En cours d\'encodage</span>';
            action = '<span style="color: #ffb74d; font-size: 0.8rem; font-weight: 500;">Traitement Cloud Vidmoly...</span>';
            isDuplicate = true;
            hasActiveTransfers = true;
          } else if (v.status === 'sending') {
            badge = '<span style="background: #e65100; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-block;">🟠 En cours d\'envoi sur le serveur Vidmoly</span>';
            action = '<span style="color: #ff9800; font-size: 0.8rem; font-weight: 500;">Transfert vers Vidmoly...</span>';
            isDuplicate = true;
            hasActiveTransfers = true;
          } else if (v.status === 'downloading') {
            const prog = v.downloadProgress;
            let progressTxt = 'En cours...';
            if (prog && prog.percent !== undefined) {
              progressTxt = `${prog.percent}% - ${prog.speedMB || '0.0'} Mo/s`;
            } else if (v.statusMessage) {
              progressTxt = v.statusMessage.replace(/^Téléchargement FoxBleus*/i, '');
            }
            badge = `<span style="background: #0288d1; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-block;">🔵 Téléchargement FoxBleu (${this.escapeHtml(progressTxt)})</span>`;
            action = `<span style="color: #29b6f6; font-size: 0.8rem; font-weight: 500;">${prog && prog.currentMB ? prog.currentMB + (prog.totalMB ? ' / ' + prog.totalMB : '') + ' MB' : 'Réception VPS'}</span>`;
            isDuplicate = true;
            hasActiveTransfers = true;
          } else if (v.status === 'queued') {
            badge = '<span style="background: #4a148c; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; display: inline-block;">🟣 En file d\'attente</span>';
            action = '<span style="color: #ba68c8; font-size: 0.8rem; font-weight: 600;">En attente de son tour (Transfert actif)</span>';
            isDuplicate = true;
            hasActiveTransfers = true;
          } else if (v.status === 'error') {
            const errDetail = v.statusMessage || 'Échec';
            badge = `<span style="background: #c62828; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-block;" title="${this.escapeHtml(errDetail)}">🔴 Échec upload : ${this.escapeHtml(errDetail)}</span>`;
            action = `<button type="button" class="btn-retry-upload" data-id="${ep.id}" style="background:#d32f2f; color:#fff; border:none; border-radius:4px; padding:3px 10px; font-size:0.75rem; cursor:pointer; font-weight:600; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">🔄 Relancer</button>`;
            isDuplicate = false;
          }

          const isChecked = previouslyChecked.has(ep.id) ? 'checked' : '';

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
              <td style="text-align: center; padding: 10px;">
                <input type="checkbox" class="vidmoly-ep-checkbox" data-id="${ep.id}" data-num="${ep.episode_num}" data-title="${this.escapeHtml(ep.title)}" data-ext="${ep.ext || 'mkv'}" data-is-duplicate="${isDuplicate ? '1' : '0'}" data-status="${v.status || 'none'}" ${isChecked}>
              </td>
              <td style="padding: 10px 14px; font-size: 0.88rem;">
                <strong>Épisode ${ep.episode_num}</strong> : ${this.escapeHtml(ep.title)}
              </td>
              <td style="text-align: center; padding: 10px 14px;">${badge}</td>
              <td style="text-align: right; padding: 10px 14px;">${action}</td>
            </tr>
          `;
        }).join('');
      }

      if (uploadBtn) uploadBtn.style.display = 'inline-block';
      this.updateVidmolySelectedCounter();

      // Mise à jour dynamique du bouton FoxBleu avec le compteur
      const foxBleuCount = data.episodes.filter(ep => {
        const s = ep.vidmoly?.status;
        return !s || s === 'none' || s === 'error';
      }).length;
      const selectFoxBleuBtn = document.getElementById('vidmolySelectFoxBleuOnlyBtn');
      if (selectFoxBleuBtn) {
        if (foxBleuCount > 0) {
          selectFoxBleuBtn.innerHTML = `⚡ Cocher non transférés (<strong>${foxBleuCount} FoxBleu</strong>)`;
          selectFoxBleuBtn.style.background = '#0288d1';
        } else {
          selectFoxBleuBtn.innerHTML = `✅ Tous transférés (0 FoxBleu)`;
          selectFoxBleuBtn.style.background = '#2e7d32';
        }
      }

      // Gestionnaires des cases à cocher
      document.querySelectorAll('.vidmoly-ep-checkbox').forEach(cb => {
        cb.addEventListener('change', () => this.updateVidmolySelectedCounter());
      });

      // Gestionnaires des boutons "Relancer"
      document.querySelectorAll('.btn-retry-upload').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const epId = btn.dataset.id;
          const cb = document.querySelector(`.vidmoly-ep-checkbox[data-id="${epId}"]`);
          if (cb) {
            this.exportEpisodesToVidmoly([cb], true);
          }
        });
      });

      // Démarrage ou maintien de l'auto-polling si des transferts sont actifs
      if (hasActiveTransfers) {
        this.startVidmolyAutoPoll();
      }

    } catch (e) {
      console.error('[Admin Vidmoly] Erreur épisodes:', e);
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ff5252; padding: 20px;">Erreur de connexion au serveur</td></tr>';
    }
  }

  updateVidmolySelectedCounter() {
    const checked = document.querySelectorAll('.vidmoly-ep-checkbox:checked');
    const counter = document.getElementById('vidmolySelectedCounter');
    const uploadBtn = document.getElementById('vidmolyStartUploadBtn');
    const alertBox = document.getElementById('vidmolyAlertBox');
    const quotaText = document.getElementById('vidmolyQuotaRemaining');
    const remainingQuota = parseInt(quotaText?.textContent || '1000', 10);

    const count = checked.length;
    if (counter) counter.textContent = `${count} épisode(s) sélectionné(s)`;

    if (uploadBtn) {
      uploadBtn.textContent = `🚀 Transférer vers Vidmoly (${count} sélectionné${count > 1 ? 's' : ''})`;
      uploadBtn.disabled = count === 0;
      uploadBtn.style.opacity = count === 0 ? '0.5' : '1';
    }

    if (alertBox) {
      if (count > remainingQuota) {
        alertBox.innerHTML = `<span style="color: #ffb74d;">⚠️ ${remainingQuota} épisode(s) seront envoyés aujourd'hui via les 20 comptes. Les ${count - remainingQuota} restants seront mis en file d'attente.</span>`;
      } else if (count > 0) {
        alertBox.innerHTML = `<span style="color: #81c784;">✔ ${count} épisode(s) seront traités séquentiellement via le pool de 20 comptes (Quota disponible : ${remainingQuota} requêtes).</span>`;
      } else {
        alertBox.innerHTML = '';
      }
    }
  }

  
  selectOnlyFoxBleu() {
    const checkboxes = document.querySelectorAll('.vidmoly-ep-checkbox');
    let selectedCount = 0;
    checkboxes.forEach(cb => {
      const status = cb.dataset.status || 'none';
      const isDuplicate = cb.dataset.isDuplicate === '1';
      const isFoxBleu = !isDuplicate || status === 'none' || status === 'error';
      cb.checked = isFoxBleu;
      if (isFoxBleu) selectedCount++;
    });
    const selectAllCb = document.getElementById('vidmolySelectAllEp');
    if (selectAllCb) selectAllCb.checked = false;
    this.updateVidmolySelectedCounter();
    if (selectedCount > 0) {
      this.showToast(`⚡ ${selectedCount} épisode(s) non transféré(s) coché(s) pour envoi`);
    } else {
      this.showToast(`ℹ️ Tous les épisodes de cette saison sont déjà sur Vidmoly !`);
    }
  }

  selectAllEpisodes(checked = true) {
    const checkboxes = document.querySelectorAll('.vidmoly-ep-checkbox');
    checkboxes.forEach(cb => cb.checked = !!checked);
    const selectAllCb = document.getElementById('vidmolySelectAllEp');
    if (selectAllCb) selectAllCb.checked = !!checked;
    this.updateVidmolySelectedCounter();
    this.showToast(checked ? `Tous les ${checkboxes.length} épisodes sont cochés` : `Tous les épisodes sont décochés`);
  }

  async exportEpisodesToVidmoly(forcedCheckboxes = null, skipConfirm = false) {
    const checked = forcedCheckboxes || Array.from(document.querySelectorAll('.vidmoly-ep-checkbox:checked'));
    if (checked.length === 0) {
      this.showToast('Veuillez cocher au moins un épisode', true);
      return;
    }

    const payloadEpisodes = checked.map(cb => ({
      id: cb.dataset.id,
      episode: parseInt(cb.dataset.num, 10),
      title: cb.dataset.title,
      ext: cb.dataset.ext || 'mkv',
      seriesTitle: this.currentVidmolySeriesTitle || 'Série',
      season: parseInt(this.currentVidmolySeason || '1', 10),
      isDuplicate: cb.dataset.isDuplicate === '1'
    }));

    // Vérification des duplicatas
    const duplicates = payloadEpisodes.filter(e => e.isDuplicate);
    let allowDuplicates = false;

    if (duplicates.length > 0) {
      const dupList = duplicates.map(d => `• Épisode ${d.episode} : ${d.title}`).join('\n');
      const confirmMsg = `⚠️ Attention : Le ou les épisodes suivants existent déjà sur Vidmoly :\n\n${dupList}\n\nVoulez-vous vraiment renvoyer ce duplicata ?`;
      if (!confirm(confirmMsg)) {
        return; // Annulation explicite demandée par l'utilisateur
      }
      allowDuplicates = true;
    } else if (!skipConfirm) {
      if (!confirm(`Lancer le transfert de ${payloadEpisodes.length} épisode(s) vers Vidmoly Cloud ?\n\nVidmoly va aspirer et encoder les vidéos sur ses serveurs. Votre VPS n'utilisera ni espace disque ni processeur.`)) {
        return;
      }
    }

    const uploadBtn = document.getElementById('vidmolyStartUploadBtn');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '⏳ Envoi en cours...';
    }

    try {
      const headers = { ...this.getAdminHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/vidmoly/upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({ episodes: payloadEpisodes, allowDuplicates })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(data.message || `✅ ${data.queued || payloadEpisodes.length} épisode(s) en file d'attente et en cours d'envoi !`);
        this.loadVidmolyStatus();
        this.loadVidmolyEpisodes();
        this.startVidmolyAutoPoll();
      } else {
        this.showToast(data.error || 'Erreur lors du transfert', true);
      }
    } catch (e) {
      this.showToast('Erreur de communication avec le serveur', true);
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
    }
  }

  startVidmolyAutoPoll() {
    if (this.vidmolyPollTimer) return;
    this.vidmolyPollTimer = setInterval(async () => {
      // 1. Silent check des encodages Vidmoly si des vidéos sont en attente
      try {
        const hasConverting = this.currentVidmolyEpisodes && this.currentVidmolyEpisodes.some(ep => {
          const s = ep.vidmoly?.status;
          return s === 'converting' || s === 'uploading' || s === 'sending';
        });
        if (hasConverting) {
          await fetch('/api/admin/vidmoly/check-status', { method: 'POST', headers: this.getAdminHeaders() });
        }
      } catch (e) {}

      // 2. Rafraîchissement silencieux de la vue
      if (this.currentVidmolyEpisodes) {
        await this.loadVidmolyEpisodes(true);
      }

      // 3. Si plus aucun transfert actif, arrêter le polling
      const stillActive = this.currentVidmolyEpisodes && this.currentVidmolyEpisodes.some(ep => {
        const s = ep.vidmoly?.status;
        return s === 'downloading' || s === 'sending' || s === 'converting' || s === 'uploading' || s === 'queued';
      });

      if (!stillActive) {
        clearInterval(this.vidmolyPollTimer);
        this.vidmolyPollTimer = null;
      }
    }, 4000);
  }

  async checkVidmolyEncodings() {
    this.showToast('🔄 Vérification des encodages sur Vidmoly...');
    try {
      const headers = this.getAdminHeaders();
      const res = await fetch('/api/admin/vidmoly/check-status', { method: 'POST', headers });
      const data = await res.json();
      if (data.success) {
        if (data.updated > 0) {
          this.showToast(`🎉 ${data.updated} vidéo(s) ont terminé l'encodage et sont prêtes !`);
        } else {
          this.showToast('ℹ️ Encodages toujours en cours sur Vidmoly');
        }
        this.loadVidmolyStatus();
        this.loadVidmolyEpisodes();
      }
    } catch (e) {
      this.showToast('Erreur lors de la vérification', true);
    }
  }

}

window.NetflixAdmin = NetflixAdmin;
