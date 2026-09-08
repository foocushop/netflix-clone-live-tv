// ================= NETFLIX ADMIN STUDIO CONTROLLER =================
class NetflixAdmin {
  constructor() {
    this.overlay = document.getElementById('adminOverlay');
    this.tableBody = document.getElementById('adminCatalogBody');
    this.modal = document.getElementById('adminModal');
    this.form = document.getElementById('adminMovieForm');
    this.modalTitle = document.getElementById('adminModalTitle');
    this.editingId = null;

    this.initEvents();
  }

  initEvents() {
    // Bouton retour à Netflix
    document.getElementById('closeAdminBtn').addEventListener('click', () => this.close());

    // Bouton ajouter un film
    document.getElementById('openAddMovieModal').addEventListener('click', () => this.openAddModal());

    // Fermer modal formulaire
    document.getElementById('closeAdminModalBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('cancelAdminModalBtn').addEventListener('click', () => this.closeModal());

    // Soumission formulaire
    this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
  }

  open() {
    this.overlay.classList.add('active');
    this.loadStats();
    this.loadCatalog();
  }

  close() {
    this.overlay.classList.remove('active');
    // Rafraîchir l'application principale pour voir les changements en direct
    if (window.netflixApp) {
      window.netflixApp.loadCatalog();
    }
  }

  async loadStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        document.getElementById('statTotalTitles').textContent = s.total_titles;
        document.getElementById('statTotalMovies').textContent = s.total_movies;
        document.getElementById('statTotalSeries').textContent = s.total_series;
        document.getElementById('statHeroTitle').textContent = s.active_hero_title || 'Aucun';
        document.getElementById('statUptime').textContent = `${Math.floor(s.server_uptime_seconds / 60)}m ${s.server_uptime_seconds % 60}s`;
        document.getElementById('statRustEngine').textContent = s.rust_engine;
      }
    } catch (e) {
      console.error('Erreur chargement stats admin', e);
    }
  }

  async loadCatalog() {
    try {
      const res = await fetch('/api/admin/movies');
      const json = await res.json();
      if (json.success && json.data) {
        this.renderTable(json.data);
      }
    } catch (e) {
      console.error('Erreur chargement catalogue admin', e);
    }
  }

  renderTable(movies) {
    this.tableBody.innerHTML = '';
    movies.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><img src="${m.poster_url}" alt="${m.title}" class="table-poster" onerror="this.onerror=null; this.src='data:image/svg+xml;charset=UTF-8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'150\' viewBox=\'0 0 100 150\'><rect fill=\'%23222\' width=\'100\' height=\'150\'/><text fill=\'%23E50914\' font-family=\'sans-serif\' font-size=\'16\' font-weight=\'bold\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\'>NETFLIX</text></svg>'"></td>
        <td>
          <div style="font-weight: 700; color: #fff;">${m.title}</div>
          <div style="font-size: 0.75rem; color: #888;">${m.original_title || ''}</div>
        </td>
        <td><span class="badge-type">${m.media_type === 'series' ? 'Série' : 'Film'}</span></td>
        <td>${m.release_year}</td>
        <td><span style="color: #46d369; font-weight: 700;">${m.match_score}%</span></td>
        <td>
          ${m.is_hero ? '<span class="badge-hero">⭐ EN VEDETTE</span>' : '<span style="color: #666;">-</span>'}
        </td>
        <td>
          <div class="table-actions">
            ${!m.is_hero ? `<button class="btn-action-sm btn-star" onclick="window.netflixAdmin.setHero('${m.id}')" title="Mettre en vedette (Hero)">⭐ Vedette</button>` : ''}
            <button class="btn-action-sm" onclick="window.netflixAdmin.openEditModal('${m.id}')">✏️ Modifier</button>
            <button class="btn-action-sm btn-danger" onclick="window.netflixAdmin.deleteMovie('${m.id}')">🗑️ Supprimer</button>
          </div>
        </td>
      `;
      this.tableBody.appendChild(tr);
    });
  }

  openAddModal() {
    this.editingId = null;
    this.modalTitle.textContent = "Ajouter un nouveau titre au catalogue";
    this.form.reset();
    document.getElementById('inputMatchScore').value = 98;
    document.getElementById('inputReleaseYear').value = 2025;
    document.getElementById('inputAgeRating').value = '16+';
    document.getElementById('inputDuration').value = '2h 15m';
    this.modal.classList.add('active');
  }

  async openEditModal(id) {
    this.editingId = id;
    this.modalTitle.textContent = "Modifier le titre";
    try {
      const res = await fetch(`/api/movies/${id}`);
      const json = await res.json();
      if (json.success && json.data) {
        const m = json.data;
        document.getElementById('inputTitle').value = m.title;
        document.getElementById('inputOriginalTitle').value = m.original_title || '';
        document.getElementById('inputMediaType').value = m.media_type;
        document.getElementById('inputOverview').value = m.overview;
        document.getElementById('inputPosterUrl').value = m.poster_url;
        document.getElementById('inputBackdropUrl').value = m.backdrop_url;
        document.getElementById('inputVideoUrl').value = m.video_url;
        document.getElementById('inputCategories').value = m.categories.join(', ');
        document.getElementById('inputReleaseYear').value = m.release_year;
        document.getElementById('inputMatchScore').value = m.match_score;
        document.getElementById('inputAgeRating').value = m.age_rating;
        document.getElementById('inputDuration').value = m.duration;
        document.getElementById('inputCast').value = m.cast.join(', ');
        document.getElementById('inputDirector').value = m.director || '';
        document.getElementById('inputIsHero').checked = m.is_hero;

        this.modal.classList.add('active');
      }
    } catch (e) {
      this.showToast("Erreur lors de la récupération des données", true);
    }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

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
      this.showToast("Erreur de communication avec le serveur Rust", true);
    }
  }

  async setHero(id) {
    try {
      const res = await fetch(`/api/admin/movies/${id}/hero`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        this.showToast("Titre promu en vedette (Hero Billboard) !");
        this.loadCatalog();
        this.loadStats();
      }
    } catch (e) {
      this.showToast("Erreur lors de la mise en vedette", true);
    }
  }

  async deleteMovie(id) {
    if (!confirm("Voulez-vous vraiment supprimer ce média du catalogue ?")) return;

    try {
      const res = await fetch(`/api/admin/movies/${id}`, { method: 'DELETE' });
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
    const container = document.getElementById('toastContainer');
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
