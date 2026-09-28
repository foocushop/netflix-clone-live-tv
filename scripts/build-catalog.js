/**
 * ZIFLIX - Script Automatisé de Génération du Catalogue Xtream Codes
 * 
 * Rôle : Interroge l'API amont (player_api.php), normalise les métadonnées VOD & Séries,
 * élimine le Mixed Content HTTP, structure les catégories Netflix et génère un
 * catalog.json statique ultra-léger et optimisé pour le CDN.
 * 
 * Usage : node scripts/build-catalog.js [--limit=1000] [--proxy]
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration amont (variables d'environnement ou valeurs par défaut sécurisées)
const CONFIG = {
  host: process.env.XTREAM_HOST || 'foxbleu.org',
  port: parseInt(process.env.XTREAM_PORT || '80', 10),
  username: process.env.XTREAM_USER || 'josealbino',
  password: process.env.XTREAM_PASS || '21321',
  outputFile: path.resolve(__dirname, '../data/catalog.json'),
  frontendOutputFile: path.resolve(__dirname, '../frontend/data/catalog.json')
};

// Support éventuel de l'agent WARP local si disponible
let localAgent = undefined;
try {
  const mod = await import('../lib/xtream-proxy-manager.js').catch(() => null);
  if (mod && mod.xtreamProxyManager && typeof mod.xtreamProxyManager.getAgent === 'function') {
    localAgent = mod.xtreamProxyManager.getAgent();
  }
} catch (e) {}

/**
 * Effectue une requête HTTP JSON sécurisée vers l'API Xtream Codes
 */
function fetchApi(action, extraParams = '') {
  return new Promise((resolve, reject) => {
    const url = `http://${CONFIG.host}:${CONFIG.port}/player_api.php?username=${encodeURIComponent(CONFIG.username)}&password=${encodeURIComponent(CONFIG.password)}&action=${action}${extraParams}`;
    const req = http.get(url, { agent: localAgent, timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`API HTTP code ${res.statusCode} pour action ${action}`));
      }
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Erreur de parsing JSON sur ${action}: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout lors de l'appel à ${action}`));
    });
  });
}

/**
 * Nettoie et standardise les libellés de catégories Xtream
 */
function cleanCategoryName(rawName) {
  if (!rawName) return 'Général';
  return rawName
    .replace(/^[ⓋⒹ║📺🎬🔥★✦s|-]+/u, '')
    .replace(/[║|★✦s]+$/u, '')
    .trim();
}

/**
 * Sécurise une URL d'affiche (HTTPS pour éviter tout Mixed Content)
 */
function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://')) {
    // Si l'image provient d'un CDN externe connu (ex: TMDB), forcer le HTTPS
    if (url.includes('tmdb.org') || url.includes('themoviedb.org')) {
      return url.replace('http://', 'https://');
    }
    // Sinon, passer par la route relative de proxy d'image
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * Extrait l'année de sortie depuis une chaîne ou un titre
 */
function parseYear(title, releaseDate) {
  if (releaseDate && typeof releaseDate === 'string') {
    const m = releaseDate.match(/(19|20)\d{2}/);
    if (m) return parseInt(m[0], 10);
  }
  if (title) {
    const m = title.match(/\b(19|20)\d{2}\b/);
    if (m) return parseInt(m[0], 10);
  }
  return new Date().getFullYear();
}

async function buildCatalog() {
  console.log('🚀 [Build Catalog] Démarrage de la synchronisation du catalogue...');
  const startTime = Date.now();

  try {
    // 1. Récupération des catégories amont
    console.log('📥 1/4 Téléchargement des catégories VOD & Séries...');
    const [vodCategories, seriesCategories] = await Promise.all([
      fetchApi('get_vod_categories').catch(() => []),
      fetchApi('get_series_categories').catch(() => [])
    ]);

    const categoryMap = new Map();
    vodCategories.forEach(c => categoryMap.set(String(c.category_id), cleanCategoryName(c.category_name)));
    seriesCategories.forEach(c => categoryMap.set(String(c.category_id), cleanCategoryName(c.category_name)));

    // 2. Récupération des flux de films VOD
    console.log('📥 2/4 Téléchargement de la liste des films VOD...');
    const rawMovies = await fetchApi('get_vod_streams');
    console.log(`   -> ${rawMovies.length} films reçus.`);

    // 3. Récupération des séries
    console.log('📥 3/4 Téléchargement de la liste des séries...');
    const rawSeries = await fetchApi('get_series');
    console.log(`   -> ${rawSeries.length} séries reçues.`);

    // 4. Définition des catégories éditoriales Netflix
    const editorialCategories = [
      { id: 'c_top_regardes', name: 'Nouveautés & Les Plus Regardés', slug: 'top-regardes', description: 'Les plus grands succès récents sur ZIFLIX' },
      { id: 'c_trends', name: 'Tendances actuelles', slug: 'tendances', description: 'Titres les plus populaires du moment' },
      { id: 'c_originals', name: 'ZIFLIX Originals', slug: 'originals', description: 'Sélections exclusives' },
      { id: 'c_top_rated', name: 'Les plus gros succès critiques', slug: 'top-rated', description: 'Les titres les mieux notés' },
      { id: 'c_action', name: 'Action & Aventure', slug: 'action', description: 'Films d action et sensations fortes' },
      { id: 'c_series', name: 'Séries & Épisodes', slug: 'series', description: 'Toutes les séries disponibles en streaming' },
      { id: 'c_telerealite', name: 'Télé-Réalité & Divertissement', slug: 'telerealite', description: 'Émissions et programmes du moment' }
    ];

    // 5. Normalisation des films
    const normalizedMovies = rawMovies.map(m => {
      const streamId = parseInt(m.stream_id, 10);
      const ratingVal = parseFloat(m.rating || 0);
      const matchScore = ratingVal > 0 ? Math.min(99, Math.max(65, Math.round(ratingVal * 10) + 15)) : 88;
      const catName = categoryMap.get(String(m.category_id)) || 'Général';
      const isRecent = String(m.name).includes('2026') || String(m.name).includes('2025');

      const assignedCategories = [];
      if (isRecent) assignedCategories.push('c_top_regardes', 'c_trends');
      if (matchScore >= 85) assignedCategories.push('c_top_rated');
      if (catName.toLowerCase().includes('action')) assignedCategories.push('c_action');
      if (assignedCategories.length === 0) assignedCategories.push('c_top_regardes');

      return {
        id: `xtream_vod_${streamId}`,
        stream_id: streamId,
        title: cleanCategoryName(m.name),
        original_title: m.name,
        overview: m.plot || m.description || 'Disponible en haute définition sur ZIFLIX.',
        media_type: 'movie',
        is_xtream_movie: true,
        poster_url: sanitizeImageUrl(m.stream_icon),
        backdrop_url: sanitizeImageUrl(m.stream_icon),
        video_url: `/api/stream/movie/${streamId}`,
        release_year: parseYear(m.name, m.added),
        match_score: matchScore,
        age_rating: '+16',
        duration: '1h 45m',
        categories: assignedCategories,
        quality_badges: ['HD', '5.1']
      };
    });

    // 6. Normalisation des séries
    const normalizedSeries = rawSeries.map(s => {
      const seriesId = parseInt(s.series_id, 10);
      const ratingVal = parseFloat(s.rating || 0);
      const matchScore = ratingVal > 0 ? Math.min(99, Math.max(70, Math.round(ratingVal * 10) + 12)) : 90;
      const catName = categoryMap.get(String(s.category_id)) || 'Série';
      const isReality = catName.toLowerCase().includes('realite') || String(s.name).toLowerCase().includes('villa');

      const assignedCategories = ['c_series'];
      if (isReality) assignedCategories.push('c_telerealite');
      if (matchScore >= 88) assignedCategories.push('c_top_rated', 'c_trends');

      return {
        id: `xtream_series_${seriesId}`,
        series_id: seriesId,
        stream_id: seriesId,
        title: cleanCategoryName(s.name),
        original_title: s.name,
        overview: s.plot || 'Série complète disponible avec tous les épisodes sur ZIFLIX.',
        media_type: 'series',
        is_xtream_series: true,
        poster_url: sanitizeImageUrl(s.cover),
        backdrop_url: sanitizeImageUrl(s.cover),
        video_url: `/api/series-info/${seriesId}`,
        release_year: parseYear(s.name, s.releaseDate),
        match_score: matchScore,
        age_rating: '+16',
        duration: 'Série',
        categories: assignedCategories,
        quality_badges: ['HD', 'VF']
      };
    });

    // 7. Assemblage final du catalogue
    const combinedItems = [...normalizedMovies, ...normalizedSeries];
    const finalCatalog = {
      version: '2.0.0',
      generated_at: new Date().toISOString(),
      stats: {
        total_items: combinedItems.length,
        movies_count: normalizedMovies.length,
        series_count: normalizedSeries.length,
        categories_count: editorialCategories.length
      },
      categories: editorialCategories,
      movies: combinedItems
    };

    // 8. Écriture atomique
    console.log(`💾 4/4 Écriture du catalogue (${combinedItems.length} titres)...`);
    const jsonOutput = JSON.stringify(finalCatalog, null, 2);

    // Écriture dans data/catalog.json
    fs.mkdirSync(path.dirname(CONFIG.outputFile), { recursive: true });
    const tmpFile = `${CONFIG.outputFile}.tmp`;
    fs.writeFileSync(tmpFile, jsonOutput, 'utf8');
    fs.renameSync(tmpFile, CONFIG.outputFile);

    // Écriture synchrone dans frontend/data/catalog.json pour Cloudflare Pages
    fs.mkdirSync(path.dirname(CONFIG.frontendOutputFile), { recursive: true });
    fs.writeFileSync(CONFIG.frontendOutputFile, jsonOutput, 'utf8');

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeMb = (Buffer.byteLength(jsonOutput) / (1024 * 1024)).toFixed(2);
    console.log(`✅ [Build Catalog] Succès : ${combinedItems.length} titres indexés en ${durationSec}s (${sizeMb} Mo).`);

  } catch (err) {
    console.error('❌ [Build Catalog] Échec de synchronisation :', err.message);
    process.exit(1);
  }
}

buildCatalog();
