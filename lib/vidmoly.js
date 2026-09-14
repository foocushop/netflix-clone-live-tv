/**
 * lib/vidmoly.js - Passerelle Vidmoly Cloud & Stream Resolver pour ZIFLIX
 * Gère :
 * - Quota strict de 50 requêtes/jour (reset automatique à minuit UTC)
 * - Création d'arborescence (Séries / Saisons) sans appel redondant
 * - Remote Upload (aspiration directe depuis le flux)
 * - Résolution transparente du flux HLS (.m3u8) sans aucune pub (0 requête API consommée)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'vidmoly_state.json');
const FOLDERS_FILE = path.join(DATA_DIR, 'vidmoly_folders.json');
const EPISODES_FILE = path.join(DATA_DIR, 'vidmoly_episodes.json');
const QUEUE_FILE = path.join(DATA_DIR, 'vidmoly_queue.json');

const CONFIG = {
  apiKey: process.env.VIDMOLY_API_KEY || '632450vyz8luxvvelat48b',
  apiBase: 'https://vidmoly.me/api',
  maxRequestsPerDay: 50
};

// Cache en mémoire pour les liens résolus (TTL: 10 minutes)
const resolvedStreamsCache = new Map();

// Assure l'existence des répertoires et fichiers
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FOLDERS_FILE)) fs.writeFileSync(FOLDERS_FILE, '{}', 'utf8');
  if (!fs.existsSync(EPISODES_FILE)) fs.writeFileSync(EPISODES_FILE, '{}', 'utf8');
  if (!fs.existsSync(QUEUE_FILE)) fs.writeFileSync(QUEUE_FILE, '[]', 'utf8');

  const today = new Date().toISOString().split('T')[0];
  let state = { date: today, requestsToday: 0, maxRequests: CONFIG.maxRequestsPerDay, storageLeft: 16106127360000, storageUsed: 0 };
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (state.date !== today) {
        state.date = today;
        state.requestsToday = 0;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
      }
    } catch (e) {}
  } else {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  }
}

function getState() {
  ensureStorage();
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const today = new Date().toISOString().split('T')[0];
    if (state.date !== today) {
      state.date = today;
      state.requestsToday = 0;
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    }
    state.remainingRequests = Math.max(0, CONFIG.maxRequestsPerDay - (state.requestsToday || 0));
    return state;
  } catch (e) {
    return { date: new Date().toISOString().split('T')[0], requestsToday: 0, maxRequests: 50, remainingRequests: 50 };
  }
}

function incrementApiQuota() {
  const state = getState();
  state.requestsToday = (state.requestsToday || 0) + 1;
  state.remainingRequests = Math.max(0, CONFIG.maxRequestsPerDay - state.requestsToday);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function canMakeApiCall() {
  const state = getState();
  return state.remainingRequests > 0;
}

// Effectue un appel HTTP GET basique avec headers navigateur
function fetchHttp(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        ...headers
      },
      timeout: 15000
    }, (res) => {
      // Suivre redirection 301/302
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return resolve(fetchHttp(nextUrl, headers));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, text: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP timeout: ' + url)); });
  });
}

// 1. Informations du compte (rafraîchissement manuel ou au démarrage)
async function getAccountInfo(force = false) {
  const state = getState();
  if (!force) return state;
  if (!canMakeApiCall()) return { ...state, error: 'Quota journalier atteint (0/50)' };

  try {
    const url = `${CONFIG.apiBase}/account/info?key=${CONFIG.apiKey}`;
    const res = await fetchHttp(url);
    incrementApiQuota();
    const json = JSON.parse(res.text);
    if (json.status === 200 && json.result) {
      state.storageLeft = json.result.storage_left;
      state.storageUsed = json.result.storage_used;
      state.email = json.result.email;
      state.login = json.result.login;
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    }
    return getState();
  } catch (err) {
    return { ...state, error: err.message };
  }
}

// 2. Gestion et cache des dossiers dans Vidmoly
function getCachedFolders() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

async function getOrCreateFolder(seriesTitle, seasonNum) {
  const folders = getCachedFolders();
  const seriesSlug = seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
  const cacheKey = seasonNum ? `${seriesSlug}_s${seasonNum}` : seriesSlug;

  if (folders[cacheKey]) {
    return folders[cacheKey]; // 0 requête API consommée !
  }

  // Si quota épuisé, on utilise la racine (0) sans bloquer
  if (!canMakeApiCall()) {
    console.warn('[Vidmoly] Quota insuffisant pour créer le dossier. Utilisation du dossier racine (0).');
    return 0;
  }

  try {
    const folderName = seasonNum 
      ? `${seriesTitle} - S${String(seasonNum).padStart(2, '0')}`
      : seriesTitle;
    
    const url = `${CONFIG.apiBase}/folder/create?key=${CONFIG.apiKey}&name=${encodeURIComponent(folderName)}&parent_id=0`;
    const res = await fetchHttp(url);
    incrementApiQuota();
    const json = JSON.parse(res.text);
    if (json.status === 200 && json.result && json.result.fld_id) {
      folders[cacheKey] = json.result.fld_id;
      fs.writeFileSync(FOLDERS_FILE, JSON.stringify(folders, null, 2), 'utf8');
      return json.result.fld_id;
    }
  } catch (e) {
    console.error('[Vidmoly] Erreur création dossier:', e.message);
  }
  return 0;
}

// 3. Téléversement à distance (Remote Upload)
function getEpisodesMap() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveEpisodeEntry(epId, entry) {
  const map = getEpisodesMap();
  map[String(epId)] = { ...(map[String(epId)] || {}), ...entry, updatedAt: Date.now() };
  fs.writeFileSync(EPISODES_FILE, JSON.stringify(map, null, 2), 'utf8');
  return map[String(epId)];
}

function getQueue() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function addToQueue(job) {
  const queue = getQueue();
  queue.push({ ...job, queuedAt: Date.now() });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

async function uploadRemoteEpisode({ episodeId, seriesTitle, season, episode, title, streamSourceUrl }) {
  ensureStorage();
  const epId = String(episodeId);

  // Vérifier si le quota est disponible
  if (!canMakeApiCall()) {
    console.log(`[Vidmoly Queue] Quota atteint (50/50). Épisode ${epId} ajouté à la file d'attente locale.`);
    addToQueue({ episodeId: epId, seriesTitle, season, episode, title, streamSourceUrl });
    return saveEpisodeEntry(epId, {
      episodeId: epId,
      seriesTitle,
      season,
      episode,
      title,
      status: 'queued',
      statusMessage: 'En file d\'attente (Quota journalier atteint)'
    });
  }

  // 1. Récupérer ou créer le dossier
  const folderId = await getOrCreateFolder(seriesTitle, season);

  // 2. Lancer le remote upload
  try {
    console.log(`[Vidmoly Remote Upload] Envoi de l'épisode ${epId} (${seriesTitle} S${season}E${episode}) vers Vidmoly...`);
    const cleanFileName = `${seriesTitle.replace(/[^a-zA-Z0-9]/g, '_')}_S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.mp4`;
    const uploadApiUrl = `${CONFIG.apiBase}/upload/url?key=${CONFIG.apiKey}&url=${encodeURIComponent(streamSourceUrl)}&fld_id=${folderId}&name=${encodeURIComponent(cleanFileName)}`;
    
    const res = await fetchHttp(uploadApiUrl);
    incrementApiQuota();
    const json = JSON.parse(res.text);

    if (json.status === 200 && json.result) {
      const fileCode = json.result.file_code || json.result.filecode || json.result.id;
      const fileUrl = json.result.file_url || `https://vidmoly.me/${fileCode}.html`;
      const embedUrl = `https://vidmoly.me/embed-${fileCode}.html`;

      return saveEpisodeEntry(epId, {
        episodeId: epId,
        seriesTitle,
        season,
        episode,
        title,
        fileCode,
        fileUrl,
        embedUrl,
        folderId,
        status: 'uploading',
        statusMessage: 'Téléchargement et encodage en cours sur Vidmoly',
        createdAt: Date.now()
      });
    } else {
      console.warn('[Vidmoly Upload Reponse Inattendue]:', json);
      return saveEpisodeEntry(epId, {
        episodeId: epId,
        seriesTitle,
        season,
        episode,
        title,
        status: 'error',
        statusMessage: json.msg || 'Erreur API Vidmoly'
      });
    }
  } catch (err) {
    console.error('[Vidmoly Upload Error]:', err.message);
    return saveEpisodeEntry(epId, {
      episodeId: epId,
      seriesTitle,
      season,
      episode,
      title,
      status: 'error',
      statusMessage: err.message
    });
  }
}

// 4. Décodeur Dean Edwards Packer
function unpackDeanEdwards(packedCode) {
  const match = packedCode.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\(([\s\S]*?)\)\)/);
  if (!match) return packedCode;
  try {
    const regex = /\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\),\s*(\d+),\s*(\{.*\}|\{\})\)/;
    const m = packedCode.match(regex);
    if (!m) return packedCode;
    let [ , p, a, c, k ] = m;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    k = k.split('|');
    const e = (c) => (c < a ? '' : e(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    while (c--) {
      if (k[c]) {
        p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
      }
    }
    return p;
  } catch (err) {
    return packedCode;
  }
}

// 5. Stream Resolver Vidmoly (Extrait le flux .m3u8 direct - 0 QUOTA API)
async function resolveVidmolyStream(fileCode) {
  if (!fileCode) throw new Error('Code de fichier Vidmoly manquant');

  // Vérifier le cache mémoire (10 min)
  const cached = resolvedStreamsCache.get(fileCode);
  if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) {
    return cached.data;
  }

  const embedUrl = `https://vidmoly.me/embed-${fileCode}.html`;
  try {
    const res = await fetchHttp(embedUrl, {
      'Referer': 'https://vidmoly.me/'
    });

    if (res.statusCode !== 200 || !res.text) {
      throw new Error(`Vidmoly embed HTTP ${res.statusCode}`);
    }

    const html = res.text;

    // Détecter si la vidéo est encore en cours d'encodage
    if (html.includes('Video is converting') || html.includes('Video is being processed') || html.includes('processing')) {
      return { status: 'converting', message: 'Vidéo en cours d\'encodage chez Vidmoly' };
    }
    if (html.includes('This video not found') || html.includes('File was deleted')) {
      return { status: 'deleted', message: 'Fichier supprimé ou introuvable' };
    }

    let codeToSearch = html;
    if (html.includes('eval(function(p,a,c,k,e,d)')) {
      codeToSearch = unpackDeanEdwards(html);
    }

    // 1. Recherche de master.m3u8 ou flux HLS
    let m3u8Match = codeToSearch.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                    codeToSearch.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
                    codeToSearch.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/i);

    let directStreamUrl = m3u8Match ? m3u8Match[1] : null;

    // 2. Recherche alternative : MP4 direct si pas de m3u8
    if (!directStreamUrl) {
      const mp4Match = codeToSearch.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i) ||
                       codeToSearch.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i);
      if (mp4Match) directStreamUrl = mp4Match[1];
    }

    if (!directStreamUrl) {
      console.warn(`[Vidmoly Resolver] Aucun flux direct extrait pour ${fileCode}`);
      return { status: 'pending', message: 'Flux vidéo pas encore disponible' };
    }

    const resolved = {
      status: 'ready',
      streamUrl: directStreamUrl,
      isHls: directStreamUrl.includes('.m3u8'),
      embedUrl
    };

    resolvedStreamsCache.set(fileCode, { timestamp: Date.now(), data: resolved });
    return resolved;
  } catch (err) {
    console.error(`[Vidmoly Resolver Error] ${fileCode}:`, err.message);
    throw err;
  }
}

module.exports = {
  CONFIG,
  getState,
  canMakeApiCall,
  getAccountInfo,
  getOrCreateFolder,
  getEpisodesMap,
  saveEpisodeEntry,
  getQueue,
  addToQueue,
  uploadRemoteEpisode,
  resolveVidmolyStream
};
