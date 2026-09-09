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
  }

  // ================= FLUX DE SÉCURITÉ & CONNEXION =================
  open() {
    if (!this.isAuthenticated()) {
      this.openAuthModal();
      return;
    }
    this.overlay.classList.add('active');
    this.loadStats();
    this.loadCatalog();
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
      } else {
        this.showAuthError(data.message || "Code PIN incorrect (Code requis : 1965)");
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
    sessionStorage.removeItem('netflix_admin_authenticated');
    this.close();
    this.showToast("🔒 Mode Administrateur verrouillé et déconnecté");
  }

  close() {
    this.overlay.classList.remove('active');
    // Rafraîchir l'application principale pour synchroniser les changements
    if (window.netflixApp && typeof window.netflixApp.loadCatalog === 'function') {
      window.netflixApp.loadCatalog();
    }
  }

  // Helper pour injecter l'en-tête de sécurité admin
  authHeaders(extra = {}) {
    return Object.assign({
      'x-admin-password': this.getAuthPassword() || '1965'
    }, extra);
  }

  async loadStats() {
    try {
      const res = await fetch('/api/admin/stats', {
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
      const res = await fetch('/api/admin/movies', {
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
    this.showToast("Session expirée. Veuillez saisir le code PIN (1965).", true);
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

      tr.innerHTML = `
        <td>
          <img src="${m.poster_url || ''}" alt="${m.title}" class="table-poster" loading="lazy" onerror="this.onerror=null; this.src='data:image/svg+xml;charset=UTF-8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'150\\' viewBox=\\'0 0 100 150\\'><rect fill=\\'%23222\\' width=\\'100\\' height=\\'150\\'/><text fill=\\'%23E50914\\' font-family=\\'sans-serif\\' font-size=\\'16\\' font-weight=\\'bold\\' x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\'>NETFLIX</text></svg>'">
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
            <button class="btn-action-sm btn-play-test" onclick="window.netflixAdmin.testPlayback('${m.id}')" title="Tester le flux dans le lecteur Netflix">▶ Tester</button>
            ${!isHero ? `<button class="btn-action-sm btn-star" onclick="window.netflixAdmin.setHero('${m.id}')" title="Mettre en tête d'affiche (Hero Billboard)">⭐ Vedette</button>` : ''}
            <button class="btn-action-sm" onclick="window.netflixAdmin.openEditModal('${m.id}')" title="Modifier les métadonnées">✏️ Modifier</button>
            <button class="btn-action-sm btn-clone" onclick="window.netflixAdmin.cloneMovie('${m.id}')" title="Dupliquer pour créer une variante">📋 Cloner</button>
            <button class="btn-action-sm btn-danger" onclick="window.netflixAdmin.deleteMovie('${m.id}')" title="Supprimer du catalogue">🗑️</button>
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
    const movie = this.allMovies.find(m => m.id === id);
    if (!movie) {
      this.showToast("Média introuvable pour le test", true);
      return;
    }
    if (window.netflixPlayer && typeof window.netflixPlayer.open === 'function') {
      window.netflixPlayer.open(movie);
      this.showToast(`▶ Lecture test lancée : ${movie.title}`);
    } else {
      this.showToast("Lecteur Netflix non initialisé", true);
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
    const m = this.allMovies.find(item => item.id === id);
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
    const m = this.allMovies.find(item => item.id === id);
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
      let url = '/api/admin/movies';
      let method = 'POST';

      if (this.editingId) {
        url = `/api/admin/movies/${this.editingId}`;
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
        this.loadCatalog();
        this.loadStats();
      } else {
        this.showToast(json.message || "Erreur lors de l'enregistrement", true);
      }
    } catch (err) {
      this.showToast("Erreur de communication avec le serveur", true);
    }
  }

  async setHero(id) {
    try {
      const res = await fetch(`/api/admin/movies/${id}/hero`, {
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
        this.loadCatalog();
        this.loadStats();
      }
    } catch (e) {
      this.showToast("Erreur lors de la mise en vedette", true);
    }
  }

  async deleteMovie(id) {
    const m = this.allMovies.find(item => item.id === id);
    const title = m ? m.title : 'ce titre';
    if (!confirm(`Voulez-vous vraiment supprimer "${title}" du catalogue ?`)) return;

    try {
      const res = await fetch(`/api/admin/movies/${id}`, {
        method: 'DELETE',
        headers: this.authHeaders()
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return;
      }
      const json = await res.json();
      if (json.success) {
        this.showToast("Média supprimé du catalogue avec succès");
        this.loadCatalog();
        this.loadStats();
      } else {
        this.showToast(json.message || "Erreur lors de la suppression", true);
      }
    } catch (e) {
      this.showToast("Erreur de suppression", true);
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
}

window.NetflixAdmin = NetflixAdmin;
