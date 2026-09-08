/**
 * ============================================================================
 * NETFLIX CLONE - MODULE DE NAVIGATION TÉLÉVISION & TÉLÉCOMMANDE (10-FOOT UI)
 * ============================================================================
 * Support complet pour télécommandes Android TV, Fire TV, Tizen, WebOS, D-Pad
 * Flèches Directionnelles (Haut, Bas, Gauche, Droite), Entrée / OK, Touche Retour
 * Défilement spatial fluide et surbrillance haute visibilité (Glow Netflix)
 */

(function () {
  'use strict';

  class TVRemoteNavigator {
    constructor() {
      this.currentFocus = null;
      this.isTVMode = true; // Actif par défaut pour expérience TV optimale
      this.scrollTimeout = null;
      this.lastFocusedCard = null;

      this.init();
    }

    init() {
      // Activer les attributs TV sur le body
      document.body.classList.add('tv-experience-active');

      // Écoute des touches télécommande / clavier
      window.addEventListener('keydown', (e) => this.handleKeyDown(e), { capture: true });

      // Focus initial après chargement du catalogue
      window.addEventListener('load', () => {
        setTimeout(() => this.setInitialFocus(), 600);
      });
    }

    setInitialFocus() {
      // Priorité 1: Si le lecteur vidéo est ouvert
      const playerModal = document.getElementById('netflixPlayerModal') || document.getElementById('netflixPlayer');
      if (playerModal && playerModal.classList.contains('active')) {
        const firstServerBtn = playerModal.querySelector('.server-btn.active') || playerModal.querySelector('.server-btn');
        if (firstServerBtn) return this.setFocus(firstServerBtn);
      }

      // Priorité 2: Première carte d'une rangée ou bouton lecture du Hero
      const firstCard = document.querySelector('.movie-card');
      const heroPlay = document.getElementById('heroPlayBtn');
      if (firstCard) {
        this.setFocus(firstCard, false);
      } else if (heroPlay) {
        this.setFocus(heroPlay, false);
      }
    }

    setFocus(el, shouldScroll = true) {
      if (!el) return;
      if (this.currentFocus && this.currentFocus !== el) {
        this.currentFocus.classList.remove('tv-focused');
      }

      this.currentFocus = el;
      this.currentFocus.classList.add('tv-focused');
      
      // Empêcher le scroll brutal natif de focus()
      try {
        this.currentFocus.focus({ preventScroll: true });
      } catch (e) {
        this.currentFocus.focus();
      }

      if (this.currentFocus.classList.contains('movie-card')) {
        this.lastFocusedCard = this.currentFocus;
      }

      if (shouldScroll) {
        this.ensureVisible(el);
      }
    }

    ensureVisible(el) {
      if (!el) return;
      // Défilement horizontal dans la rangée (carrousel)
      const rowContainer = el.closest('.row-slider, .row-cards, .category-row-cards, .row-cards-container');
      if (rowContainer) {
        const rect = el.getBoundingClientRect();
        const containerRect = rowContainer.getBoundingClientRect();
        if (rect.left < containerRect.left + 80 || rect.right > containerRect.right - 80) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }

      // Défilement vertical de la page TV seulement si hors viewport
      const elRect = el.getBoundingClientRect();
      if (elRect.top < 100 || elRect.bottom > (window.innerHeight - 80)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }

    handleKeyDown(e) {
      const code = e.keyCode || e.which;
      const key = e.key;

      // Détection des touches de télécommande TV
      const isUp = key === 'ArrowUp' || code === 38 || code === 19;
      const isDown = key === 'ArrowDown' || code === 40 || code === 20;
      const isLeft = key === 'ArrowLeft' || code === 37 || code === 21;
      const isRight = key === 'ArrowRight' || code === 39 || code === 22;
      const isEnter = key === 'Enter' || key === ' ' || code === 13 || code === 32 || code === 23 || code === 66;
      const isBack = key === 'Escape' || key === 'Backspace' || code === 27 || code === 8 || code === 4 || code === 10009;

      // Touches médias
      const isPlayPause = code === 179 || code === 85 || code === 126 || code === 127;

      if (!isUp && !isDown && !isLeft && !isRight && !isEnter && !isBack && !isPlayPause) {
        return; // Laisser les autres touches (ex: saisie recherche)
      }

      // ================= CAS DU LECTEUR VIDÉO ACTIF =================
      const playerModal = document.getElementById('netflixPlayerModal');
      if (playerModal && playerModal.classList.contains('active')) {
        this.handlePlayerNavigation(e, { isUp, isDown, isLeft, isRight, isEnter, isBack, isPlayPause });
        return;
      }

      // ================= CAS D'UN MODAL DE DÉTAILS =================
      const detailsModal = document.getElementById('detailsModal');
      if (detailsModal && detailsModal.classList.contains('active')) {
        if (isBack) {
          e.preventDefault();
          const closeBtn = document.getElementById('modalCloseBtn');
          if (closeBtn) closeBtn.click();
          if (this.lastFocusedCard) this.setFocus(this.lastFocusedCard);
          return;
        }
      }

      // ================= NAVIGATION PRINCIPALE (CAROUSELS & HEADER) =================
      if (isEnter) {
        if (this.currentFocus) {
          e.preventDefault();
          this.currentFocus.click();
        }
        return;
      }

      if (isBack) {
        e.preventDefault();
        // Si filtre actif ou recherche, revenir à l'accueil
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
          return;
        }
        const homeNav = document.querySelector('.nav-link[data-filter="all"]');
        if (homeNav) homeNav.click();
        return;
      }

      if (isLeft) {
        e.preventDefault();
        this.moveHorizontal(-1);
      } else if (isRight) {
        e.preventDefault();
        this.moveHorizontal(1);
      } else if (isUp) {
        e.preventDefault();
        this.moveVertical(-1);
      } else if (isDown) {
        e.preventDefault();
        this.moveVertical(1);
      }
    }

    moveHorizontal(direction) {
      if (!this.currentFocus) {
        this.setInitialFocus();
        return;
      }

      // Si on est dans un rang de cartes
      const currentCard = this.currentFocus.closest('.movie-card');
      if (currentCard) {
        const sibling = direction > 0 ? currentCard.nextElementSibling : currentCard.previousElementSibling;
        if (sibling && sibling.classList.contains('movie-card')) {
          this.setFocus(sibling);
          return;
        }
      }

      // Si on est dans la navbar
      const currentNav = this.currentFocus.closest('.nav-link, .lang-btn, .search-input');
      if (currentNav) {
        const navItems = Array.from(document.querySelectorAll('.netflix-header .nav-link, .netflix-header .lang-btn, .netflix-header .search-input'));
        const idx = navItems.indexOf(this.currentFocus);
        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < navItems.length) {
          this.setFocus(navItems[nextIdx]);
          return;
        }
      }

      // Recherche spatiale générique
      this.spatialSearch(direction, 0);
    }

    moveVertical(direction) {
      if (!this.currentFocus) {
        this.setInitialFocus();
        return;
      }

      // Si on est sur une carte
      const currentCard = this.currentFocus.closest('.movie-card');
      if (currentCard) {
        const currentRow = currentCard.closest('.catalog-row, .category-row, .channels-grid');
        if (currentRow) {
          if (direction > 0) {
            const nextRow = currentRow.nextElementSibling;
            if (nextRow) {
              const targetCard = this.findClosestHorizontally(currentCard, nextRow.querySelectorAll('.movie-card'));
              if (targetCard) return this.setFocus(targetCard);
            }
          } else {
            const prevRow = currentRow.previousElementSibling;
            if (prevRow) {
              const targetCard = this.findClosestHorizontally(currentCard, prevRow.querySelectorAll('.movie-card'));
              if (targetCard) return this.setFocus(targetCard);
            } else {
              // Remonter vers le Hero ou le Header
              const heroBtn = document.getElementById('heroPlayBtn');
              if (heroBtn) return this.setFocus(heroBtn);
              const activeNav = document.querySelector('.nav-link.active') || document.querySelector('.nav-link');
              if (activeNav) return this.setFocus(activeNav);
            }
          }
        }
      }

      // Si on est sur les boutons du Hero
      if (this.currentFocus.id === 'heroPlayBtn' || this.currentFocus.id === 'heroMoreInfoBtn') {
        if (direction > 0) {
          const firstCard = document.querySelector('.movie-card');
          if (firstCard) return this.setFocus(firstCard);
        } else {
          const activeNav = document.querySelector('.nav-link.active') || document.querySelector('.nav-link');
          if (activeNav) return this.setFocus(activeNav);
        }
      }

      // Si on est sur le Header
      if (this.currentFocus.closest('.netflix-header')) {
        if (direction > 0) {
          const heroBtn = document.getElementById('heroPlayBtn');
          if (heroBtn) return this.setFocus(heroBtn);
          const firstCard = document.querySelector('.movie-card');
          if (firstCard) return this.setFocus(firstCard);
        }
      }

      // Recherche spatiale de secours
      this.spatialSearch(0, direction);
    }

    findClosestHorizontally(sourceEl, targetElements) {
      if (!targetElements || targetElements.length === 0) return null;
      const sourceRect = sourceEl.getBoundingClientRect();
      const sourceCenterX = sourceRect.left + sourceRect.width / 2;

      let closest = null;
      let minDistance = Infinity;

      targetElements.forEach(target => {
        const rect = target.getBoundingClientRect();
        const targetCenterX = rect.left + rect.width / 2;
        const dist = Math.abs(sourceCenterX - targetCenterX);
        if (dist < minDistance) {
          minDistance = dist;
          closest = target;
        }
      });

      return closest || targetElements[0];
    }

    spatialSearch(dx, dy) {
      const focusables = Array.from(document.querySelectorAll(
        '.movie-card:not([style*="display: none"]), .btn-netflix, .nav-link, .server-btn, .action-circle-btn, .modal-close-btn, .xtream-chip, .xtream-search-input, .xtream-search-clear, .telerealite-chip, .telerealite-search-input, .telerealite-search-clear, .modal-episode-card'
      ));

      if (focusables.length === 0) return;
      const currentRect = this.currentFocus.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;

      let bestCandidate = null;
      let bestScore = Infinity;

      focusables.forEach(candidate => {
        if (candidate === this.currentFocus) return;
        const rect = candidate.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = centerX - currentCenterX;
        const deltaY = centerY - currentCenterY;

        // Vérifier si le candidat est dans la bonne direction
        if (dx > 0 && deltaX <= 10) return;
        if (dx < 0 && deltaX >= -10) return;
        if (dy > 0 && deltaY <= 10) return;
        if (dy < 0 && deltaY >= -10) return;

        // Calcul score spatial pondéré
        let dist = 0;
        if (dx !== 0) {
          dist = Math.abs(deltaX) + Math.abs(deltaY) * 2.5;
        } else {
          dist = Math.abs(deltaY) + Math.abs(deltaX) * 2.0;
        }

        if (dist < bestScore) {
          bestScore = dist;
          bestCandidate = candidate;
        }
      });

      if (bestCandidate) {
        this.setFocus(bestCandidate);
      }
    }

    handlePlayerNavigation(e, { isUp, isDown, isLeft, isRight, isEnter, isBack, isPlayPause }) {
      const playerModal = document.getElementById('netflixPlayerModal');
      const video = document.getElementById('netflixVideo');

      if (isBack) {
        e.preventDefault();
        const closeBtn = document.getElementById('closePlayerBtn') || playerModal.querySelector('.player-close-btn');
        if (closeBtn) closeBtn.click();
        if (this.lastFocusedCard) this.setFocus(this.lastFocusedCard);
        return;
      }

      if (isPlayPause) {
        e.preventDefault();
        if (video) {
          if (video.paused) video.play();
          else video.pause();
        }
        return;
      }

      const serverButtons = Array.from(playerModal.querySelectorAll('.server-btn'));
      const activeServerBtn = playerModal.querySelector('.server-btn.active');

      if (isLeft || isRight) {
        e.preventDefault();
        if (serverButtons.length > 0) {
          let currIdx = serverButtons.indexOf(this.currentFocus);
          if (currIdx === -1 && activeServerBtn) currIdx = serverButtons.indexOf(activeServerBtn);
          if (currIdx === -1) currIdx = 0;

          const nextIdx = isRight ? (currIdx + 1) % serverButtons.length : (currIdx - 1 + serverButtons.length) % serverButtons.length;
          const nextBtn = serverButtons[nextIdx];
          this.setFocus(nextBtn);
          nextBtn.click(); // Changement automatique de serveur fluide au D-Pad !
        }
        return;
      }

      if (isEnter) {
        e.preventDefault();
        if (this.currentFocus && this.currentFocus.classList.contains('server-btn')) {
          this.currentFocus.click();
        } else if (video) {
          if (video.paused) video.play();
          else video.pause();
        }
        return;
      }

      if (isUp || isDown) {
        e.preventDefault();
        // Alterner entre la barre des serveurs et le bouton fermer
        const closeBtn = document.getElementById('closePlayerBtn') || playerModal.querySelector('.player-close-btn');
        if (isUp && closeBtn) {
          this.setFocus(closeBtn);
        } else if (activeServerBtn) {
          this.setFocus(activeServerBtn);
        }
      }
    }
  }

  // Démarrage automatique du système de navigation TV
  window.tvNavigator = new TVRemoteNavigator();
})();
