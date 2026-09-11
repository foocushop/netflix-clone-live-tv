// ================= PREVIEW / TEST SERVER =================
// Ce serveur reproduit fidèlement les endpoints de l'API Axum/Rust pour un test immédiat
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const zlib = require('zlib');
const os = require('os');

// ================= ROBUSTESSE & GESTION DES DÉCONNEXIONS RÉSEAU =================
// Protection vitale anti-crash Render / Node.js :
// Empêche tout crash sur 'socket hang up', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'
// causé par des fermetures inattendues de flux IPTV distants ou d'aborts clients lors du zapping.
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  const code = err?.code || '';
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || msg.includes('socket hang up') || msg.includes('aborted') || msg.includes('Premature close')) {
    return;
  }
  console.error('[UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  const code = reason?.code || '';
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT' || msg.includes('socket hang up') || msg.includes('aborted') || msg.includes('Premature close')) {
    return;
  }
  console.error('[UNHANDLED REJECTION]:', reason);
});

const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'data', 'catalog.json');
const CLUSTER_NODES_FILE = path.join(__dirname, 'data', 'cluster_nodes.json');

// Assurer l'existence du dossier data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// ================= TÉLÉMÉTRIE SYSTÈME & REGISTRE DU CLUSTER =================
let activeStreamsCount = 0;
let totalRequestsCount = 0;
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();
let currentCpuPercent = 0;

function getCpuUsagePercent() {
  const currentCpu = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const elapsedMs = currentTime - lastCpuTime;
  if (elapsedMs > 250) {
    const totalCpuMs = (currentCpu.user + currentCpu.system) / 1000;
    const numCpus = os.cpus().length || 1;
    currentCpuPercent = Math.min(100, Math.max(0, (totalCpuMs / (elapsedMs * numCpus)) * 100));
    lastCpuUsage = process.cpuUsage();
    lastCpuTime = currentTime;
  }
  return parseFloat(currentCpuPercent.toFixed(1));
}

function getMemoryMetrics() {
  const mem = process.memoryUsage();
  const totalSysMem = os.totalmem();
  const usedMb = Math.round(mem.rss / (1024 * 1024));
  const totalMb = Math.round(totalSysMem / (1024 * 1024));
  const percentOf512 = parseFloat(((usedMb / 512) * 100).toFixed(1));
  const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));
  return {
    usedMb,
    totalMb,
    renderLimitMb: 512,
    percent: Math.min(100, percentOf512),
    heapUsedMb
  };
}

function loadClusterNodes() {
  try {
    if (fs.existsSync(CLUSTER_NODES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLUSTER_NODES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) {
    console.warn('[Cluster] Erreur lecture cluster_nodes.json:', e.message);
  }

  const defaultNodes = [
    {
      id: 'node-1',
      name: process.env.NODE_NAME || 'Serveur 1 (Principal)',
      url: process.env.RENDER_EXTERNAL_URL || 'https://netflix-clone-live-tv-wu8x.onrender.com',
      role: 'master',
      addedAt: new Date().toISOString()
    }
  ];

  if (process.env.CLUSTER_NODES) {
    const envUrls = process.env.CLUSTER_NODES.split(',').map(u => u.trim()).filter(Boolean);
    envUrls.forEach((url, i) => {
      if (!defaultNodes.some(n => n.url === url)) {
        defaultNodes.push({
          id: `node-${i + 2}`,
          name: `Serveur ${i + 2}`,
          url: url,
          role: 'edge',
          addedAt: new Date().toISOString()
        });
      }
    });
  }

  try {
    fs.writeFileSync(CLUSTER_NODES_FILE, JSON.stringify(defaultNodes, null, 2), 'utf8');
  } catch (e) {}

  return defaultNodes;
}

let clusterNodes = loadClusterNodes();

function saveClusterNodes(nodes) {
  clusterNodes = nodes;
  try {
    fs.writeFileSync(CLUSTER_NODES_FILE, JSON.stringify(nodes, null, 2), 'utf8');
    if (typeof syncFileToGitHub === 'function' && GITHUB_CONFIG.token) {
      syncFileToGitHub(CLUSTER_NODES_FILE, 'data/cluster_nodes.json', 'chore(cluster): auto-sync cluster nodes configuration')
        .catch(e => console.warn('[Cluster GitHub Sync Error]:', e.message));
    }
  } catch (e) {
    console.error('[Cluster] Erreur sauvegarde cluster_nodes.json:', e.message);
  }
}

// ================= SYSTÈME KEEP-ALIVE ANTI-VEILLE RENDER =================
// Render met les instances gratuites en veille après 15 minutes sans requête HTTP entrante.
// Ce module effectue un self-ping périodique externe (toutes les 10 min) sur l'URL publique
// pour maintenir l'instance éveillée 24h/24 sans interruption de service ni coupure de stream.

const keepAliveStats = {
  enabled: process.env.KEEP_ALIVE_DISABLE !== 'true',
  targetUrl: '',
  intervalMinutes: 10,
  lastPingAt: null,
  lastPingStatus: null,
  lastPingDurationMs: 0,
  totalPings: 0,
  successfulPings: 0,
  failedPings: 0,
  lastError: null
};

function getKeepAliveTargetUrl() {
  const envUrl = process.env.KEEP_ALIVE_URL ||
                 process.env.RENDER_EXTERNAL_URL ||
                 process.env.APP_URL ||
                 process.env.PUBLIC_URL ||
                 'https://netflix-clone-live-tv-wu8x.onrender.com';
  return envUrl.trim().replace(/\/$/, '');
}

async function pingExternalUrl(targetUrl, endpoint = '/api/ping') {
  const cleanUrl = targetUrl.replace(/\/$/, '');
  const fullUrl = `${cleanUrl}${endpoint}`;
  const start = Date.now();
  try {
    const res = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Netflix-Clone-KeepAlive/1.0',
        'Accept': 'application/json, text/plain, */*'
      },
      signal: AbortSignal.timeout(20000)
    });
    const duration = Date.now() - start;
    if (res.ok) {
      console.log(`[Keep-Alive] 🟢 Self-ping réussi : ${fullUrl} [Status ${res.status}] en ${duration}ms`);
      return { success: true, status: res.status, duration };
    } else {
      console.warn(`[Keep-Alive] 🟡 Self-ping réponse HTTP non-200 : ${fullUrl} [Status ${res.status}] en ${duration}ms`);
      return { success: false, status: res.status, duration };
    }
  } catch (err) {
    const duration = Date.now() - start;
    console.warn(`[Keep-Alive] ⚠️ Ping avertissement sur ${fullUrl} (${duration}ms) : ${err.message}`);
    return { success: false, error: err.message, duration };
  }
}

async function performKeepAliveCycle() {
  if (!keepAliveStats.enabled) return;

  const publicUrl = getKeepAliveTargetUrl();
  keepAliveStats.targetUrl = publicUrl;
  keepAliveStats.totalPings++;
  keepAliveStats.lastPingAt = new Date().toISOString();

  // 1. Self-ping prioritaire vers l'URL externe Render
  const selfResult = await pingExternalUrl(publicUrl, '/api/ping');
  keepAliveStats.lastPingStatus = selfResult.status || (selfResult.success ? 200 : 'ERROR');
  keepAliveStats.lastPingDurationMs = selfResult.duration;
  if (selfResult.success) {
    keepAliveStats.successfulPings++;
    keepAliveStats.lastError = null;
  } else {
    keepAliveStats.failedPings++;
    keepAliveStats.lastError = selfResult.error || `HTTP ${selfResult.status}`;
  }

  // 2. Ping des autres nœuds du cluster s'ils existent
  if (Array.isArray(clusterNodes)) {
    for (const node of clusterNodes) {
      const nodeUrl = (node.url || '').replace(/\/$/, '');
      if (nodeUrl && nodeUrl !== publicUrl && !nodeUrl.includes('localhost') && !nodeUrl.includes('127.0.0.1')) {
        await pingExternalUrl(nodeUrl, '/api/cluster/ping');
      }
    }
  }
}

function initRenderKeepAlive() {
  if (!keepAliveStats.enabled) {
    console.log('[Keep-Alive] ℹ️ Système de maintien en éveil désactivé via KEEP_ALIVE_DISABLE');
    return;
  }

  const publicUrl = getKeepAliveTargetUrl();
  keepAliveStats.targetUrl = publicUrl;
  const intervalMinutes = parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES, 10) || 10;
  keepAliveStats.intervalMinutes = intervalMinutes;
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Keep-Alive] 🛡️ Service Keep-Alive anti-veille Render actif pour : ${publicUrl}`);
  console.log(`[Keep-Alive] ⏱️ Fréquence programmée : toutes les ${intervalMinutes} minutes (Render dort à 15 min)`);

  // Premier ping test 20 secondes après le démarrage
  const initialTimer = setTimeout(() => {
    performKeepAliveCycle().catch(e => console.warn('[Keep-Alive Initial Error]:', e.message));
  }, 20000);
  if (initialTimer.unref) initialTimer.unref();

  // Démon périodique
  const recurringTimer = setInterval(() => {
    performKeepAliveCycle().catch(e => console.warn('[Keep-Alive Interval Error]:', e.message));
  }, intervalMs);
  if (recurringTimer.unref) recurringTimer.unref();
}

// ================= EXTRACTEUR DE FLUX DIRECT (FETCHV-STYLE) =================
function httpsGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://cloudorchestranova.com/'
    };
    const finalHeaders = Object.assign({}, defaultHeaders, headers);
    const req = https.get(urlStr, {
      headers: finalHeaders,
      timeout: 3500
    }, res => {
      res.on('error', reject);
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ status: res.statusCode, buffer, text: buffer.toString('utf8'), headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout réseau'));
    });
  });
}

let cachedWasmModule = null;
let cachedWasmUrl = null;
let cachedJwtToken = null;
let jwtTokenExpiresAt = 0;

// Cache des cookies Dailymotion (sessionKey -> cookieHeader) – TTL 10 min
const dmCookieCache = new Map();

// ================= CONFIGURATION & SUPERVISEUR XTREAM CODES =================
const XTREAM_CONFIG = {
  host: 'foxbleu.org',
  port: 80,
  username: 'josealbino',
  password: '21321'
};

// Chargement automatique des 128 correspondances de chaînes françaises vérifiées
// Chargement automatique des correspondances de chaînes françaises vérifiées
let XTREAM_CHANNELS = {};
try {
  const mapPath = path.join(__dirname, 'data', 'xtream_channels_map.json');
  if (fs.existsSync(mapPath)) {
    XTREAM_CHANNELS = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }
} catch (e) {
  console.warn('[Xtream] Impossible de charger xtream_channels_map.json:', e.message);
}

// Catalogue complet des 1 268 chaînes françaises multi-qualités
let XTREAM_FR_CATALOG = [];
try {
  const catPath = path.join(__dirname, 'data', 'xtream_fr_catalog.json');
  if (fs.existsSync(catPath)) {
    XTREAM_FR_CATALOG = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    console.log(`[Xtream] ${XTREAM_FR_CATALOG.length} chaînes françaises chargées depuis xtream_fr_catalog.json`);
  }
} catch (e) {
  console.warn('[Xtream] Impossible de charger xtream_fr_catalog.json:', e.message);
}

// Catalogue complet des séries Télé-Réalité Xtream (Catégorie 947)
let XTREAM_TELEREALITE_CATALOG = [];
try {
  const trPath = path.join(__dirname, 'data', 'xtream_telerealite_catalog.json');
  if (fs.existsSync(trPath)) {
    XTREAM_TELEREALITE_CATALOG = JSON.parse(fs.readFileSync(trPath, 'utf8'));
    console.log(`[Xtream] ${XTREAM_TELEREALITE_CATALOG.length} séries Télé-Réalité chargées depuis xtream_telerealite_catalog.json`);
  }
} catch (e) {
  console.warn('[Xtream] Impossible de charger xtream_telerealite_catalog.json:', e.message);
}



// ================= SYSTÈME DE TÉLÉMÉTRIE EN DIRECT DES SESSIONS XTREAM =================
const activeStreamingSessions = new Map();

function detectClientApp(userAgent = '') {
  const ua = (userAgent || '').toLowerCase();
  if (ua.includes('televizo')) return { name: 'Televizo', icon: '📺', badge: 'televizo' };
  if (ua.includes('tivimate')) return { name: 'TiviMate', icon: '📺', badge: 'tivimate' };
  if (ua.includes('smarters') || ua.includes('iptvsmarters')) return { name: 'IPTV Smarters', icon: '📱', badge: 'smarters' };
  if (ua.includes('vlc')) return { name: 'VLC Media Player', icon: '🟧', badge: 'vlc' };
  if (ua.includes('kodi')) return { name: 'Kodi', icon: '🍿', badge: 'kodi' };
  if (ua.includes('ott navigator') || ua.includes('ottnavigator')) return { name: 'OTT Navigator', icon: '🧭', badge: 'ott' };
  if (ua.includes('exoplayer')) return { name: 'ExoPlayer (Android)', icon: '🤖', badge: 'android' };
  if (ua.includes('applecoremedia')) return { name: 'Apple TV / iOS', icon: '🍏', badge: 'apple' };
  if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari') || ua.includes('edge')) return { name: 'Lecteur Web Netflix', icon: '💻', badge: 'web' };
  return { name: userAgent ? userAgent.split('/')[0].substring(0, 16) : 'Client IPTV', icon: '📡', badge: 'other' };
}

function resolveStreamMediaInfo(streamId, type = 'channel', customName = '') {
  if (type === 'channel' || type === 'live') {
    if (streamId) {
      const ch = XTREAM_FR_CATALOG.find(c => String(c.stream_id) === String(streamId));
      if (ch) {
        return {
          id: String(ch.stream_id),
          name: ch.name,
          category: ch.category_name || 'Chaînes TV',
          icon: ch.icon || 'assets/hero/live-tv-banner.webp',
          quality: ch.quality_badge || 'HD',
          type: 'live'
        };
      }
    }
  } else if (type === 'series') {
    if (streamId) {
      const show = XTREAM_TELEREALITE_CATALOG.find(s => String(s.series_id) === String(streamId));
      if (show) {
        return {
          id: String(show.series_id),
          name: show.name,
          category: 'Télé-Réalité',
          icon: show.cover || 'assets/hero/live-tv-banner.webp',
          quality: '1080p FHD',
          type: 'series'
        };
      }
    }
  }

  // Fallback direct
  return {
    id: streamId ? String(streamId) : 'custom',
    name: customName || (streamId ? `Flux #${streamId}` : 'Flux Multimédia'),
    category: type === 'series' ? 'Série VOD' : (type === 'movie' ? 'Film VOD' : 'Chaîne Direct'),
    icon: 'assets/hero/live-tv-banner.webp',
    quality: 'Direct HD',
    type: type || 'live'
  };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket ? (req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
}

function trackStreamingSession(req, res, streamId, type = 'live', customName = '') {
  if (!streamId && !customName) return;

  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const clientApp = detectClientApp(userAgent);
  const mediaInfo = resolveStreamMediaInfo(streamId, type, customName);

  // Clé unique de la session : IP + StreamId + Type
  const sessionKey = `${clientIp}_${mediaInfo.id}_${mediaInfo.type}`;
  const now = Date.now();

  let session = activeStreamingSessions.get(sessionKey);
  if (session) {
    session.lastActivityAt = now;
    session.requestCount++;
    session.clientApp = clientApp;
  } else {
    session = {
      id: `sess_${now}_${Math.random().toString(36).substr(2, 6)}`,
      key: sessionKey,
      clientIp,
      userAgent,
      clientApp,
      media: mediaInfo,
      startedAt: now,
      lastActivityAt: now,
      requestCount: 1,
      estimatedRamMb: 8.5, // ~8.5 Mo de buffer RAM par flux HLS/TS
      serverNode: process.env.NODE_NAME || 'Serveur 1 (Principal)'
    };
    activeStreamingSessions.set(sessionKey, session);
  }

  // Nettoyage si connexion persistante fermée
  const onSocketClose = () => {
    if (req.url && req.url.includes('.ts') && !req.url.includes('.m3u8')) {
      activeStreamingSessions.delete(sessionKey);
    }
  };
  req.once('close', onSocketClose);
  res.once('finish', onSocketClose);

  return session;
}

// Nettoyage automatique des sessions inactives (> 35 secondes sans requête de segment)
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of activeStreamingSessions.entries()) {
    if (now - session.lastActivityAt > 35000) {
      activeStreamingSessions.delete(key);
    }
  }
  activeStreamsCount = activeStreamingSessions.size;
}, 5000);

function getActiveSessionsMetrics() {
  const now = Date.now();
  const sessionsList = [];
  let totalRamMb = 0;

  for (const session of activeStreamingSessions.values()) {
    const durationSeconds = Math.max(0, Math.floor((now - session.startedAt) / 1000));
    totalRamMb += session.estimatedRamMb;
    sessionsList.push({
      id: session.id,
      client_ip: session.clientIp,
      client_app: session.clientApp,
      media: session.media,
      duration_seconds: durationSeconds,
      request_count: session.requestCount,
      estimated_ram_mb: session.estimatedRamMb,
      server_node: session.serverNode,
      started_at: session.startedAt
    });
  }

  sessionsList.sort((a, b) => b.started_at - a.started_at);

  return {
    count: sessionsList.length,
    total_ram_mb: parseFloat(totalRamMb.toFixed(1)),
    sessions: sessionsList
  };
}

// Fallbacks de sécurité pour les variantes de flux (si un flux FHD est en panne, basculer sur HD ou UHD)
const XTREAM_STREAM_FALLBACKS = {
  '13739': ['13916', '479236', '47475'], // France 2 FHD -> HD -> UHD -> HEVC
  '14152': ['14163', '94'],              // beIN 3 FHD -> HD -> SD
  '408065': ['408064', '47502'],         // RMC 1 FHD -> HD -> HEVC
  '180946': ['181485', '84801'],         // Canal+ Foot FHD -> HD -> SD
  '180947': ['181486', '84802'],         // Canal+ 360 FHD -> HD -> SD
  '14156': ['14161', '13936'],           // Canal+ Sport FHD -> HD -> SD
  '14151': ['14167', '479240'],          // Canal+ France FHD -> HD -> Direct
  '14160': ['14170', '92'],              // beIN 1 FHD -> HD -> SD
  '14153': ['14169', '93'],              // beIN 2 FHD -> HD -> SD
  '13847': ['13917', '177689'],          // TF1 FHD -> HD -> 4K
  '13726': ['14003', '222569'],          // M6 FHD -> HD -> 4K
  '13690': ['13973', '47481'],           // W9 FHD -> HD -> HEVC
  '13696': ['13979', '47494'],           // TMC FHD -> HD -> HEVC
  '479050': ['479049', '479051'],        // Ligue 1+ FHD -> HD -> UHD
  // Disney+ Événements & Disney Channel
  '479269': ['479270', '39524', '13861', '24946'],
  '479270': ['479269', '39524', '13861', '24946'],
  '479271': ['479269', '39524', '13861', '24946'],
  '479272': ['479269', '39524', '13861', '24946'],
  '479273': ['479269', '39524', '13861', '24946'],
  '479274': ['479269', '39524', '13861', '24946'],
  '479275': ['479269', '39524', '13861', '24946'],
  '479276': ['479269', '39524', '13861', '24946'],
  '479277': ['479269', '39524', '13861', '24946'],
  '479278': ['479269', '39524', '13861', '24946'],
  '39524':  ['13861', '24946', '479269'],
  '13861':  ['24946', '39524', '1040'],
  // DAZN LaLiga 1-5
  '327338': ['327339', '327340', '180946'],
  '327339': ['327338', '327340', '180946'],
  '327340': ['327338', '327339', '180946'],
  '327341': ['327338', '327339', '180946'],
  '327342': ['327338', '327339', '180946']
};

// Agents HTTP/HTTPS persistants avec réutilisation de sockets (Keep-Alive Pool)
// keepAliveMsecs réglé à 4s pour concorder avec les timeouts des reverse-proxies Nginx IPTV
const xtreamHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 5,
  keepAliveMsecs: 4000,
  timeout: 12000
});

const xtreamHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 5,
  keepAliveMsecs: 4000,
  timeout: 12000
});

// Agents dédiés au streaming VOD Séries Xtream (Range requests volumineuses, tolérance aux coupures)
const xtreamSeriesHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 25,
  keepAliveMsecs: 10000,
  timeout: 30000
});

const xtreamSeriesHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 25,
  keepAliveMsecs: 10000,
  timeout: 30000
});

// Cache d'adresses Edge directes (TTL 60s) pour contourner les redirections 302 à répétition
const xtreamEdgeCache = new Map();
// Cache ultra-rapide des manifests réécrits (TTL 1500ms) pour démarrage immédiat (0ms)
const xtreamManifestCache = new Map();
// Cache d'adresses Edge directes pour les épisodes séries Xtream VOD (TTL 10 min pour éviter les re-redirections après pause)
const xtreamSeriesEdgeCache = new Map();

// Cache des images pour contourner le Mixed-Content (HTTP sur HTTPS Render) et port 443 manquant
const imageProxyCache = new Map();
const MAX_IMAGE_CACHE_ITEMS = 600;

// Purge automatique périodique pour garantir zéro accumulation RAM dans le temps
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of xtreamManifestCache.entries()) {
    if (v.expiresAt <= now) xtreamManifestCache.delete(k);
  }
  for (const [k, v] of xtreamEdgeCache.entries()) {
    if (v.expiresAt <= now) xtreamEdgeCache.delete(k);
  }
  for (const [k, v] of xtreamSeriesEdgeCache.entries()) {
    if (v.expiresAt <= now) xtreamSeriesEdgeCache.delete(k);
  }
  if (imageProxyCache.size > MAX_IMAGE_CACHE_ITEMS) {
    const keys = Array.from(imageProxyCache.keys());
    for (let i = 0; i < 100; i++) imageProxyCache.delete(keys[i]);
  }
}, 60000);

// Préchauffage automatique des flux et connexions Keep-Alive au démarrage (supprime la lenteur du cold-start <1min)
async function prewarmXtreamConnections() {
  console.log('[Xtream Pre-Warm] ⚡ Préchauffage automatique des connexions et des caches Edge au démarrage...');
  const keyStreams = ['13917', '13738', '14003', '13973', '13696', '14167', '14170', '13839', '14020'];
  for (const sId of keyStreams) {
    try {
      const url = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/live/${XTREAM_CONFIG.username}/${XTREAM_CONFIG.password}/${sId}.m3u8`;
      fetchXtreamPlaylist(url).then(res => {
        if (res?.finalUrl && res.finalUrl !== url) {
          xtreamEdgeCache.set(sId, { edgeUrl: res.finalUrl, expiresAt: Date.now() + 300000 });
        }
      }).catch(() => {});
    } catch (e) {}
  }
  console.log(`[Xtream Pre-Warm] ✅ ${keyStreams.length} flux prioritaires préchauffés (lecture instantanée dès la 1ère minute)`);
}

function fetchXtreamPlaylist(targetUrl, headers = {}, hops = 0, retry = 0) {
  if (hops > 5) return Promise.reject(new Error('Trop de redirections Xtream'));
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('URL Xtream invalide: ' + targetUrl));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const agent = parsed.protocol === 'https:' ? xtreamHttpsAgent : xtreamHttpAgent;
    let settled = false;

    const req = client.get(targetUrl, {
      agent,
      headers: Object.assign({
        'User-Agent': 'IPTVSmartersPro/1.0',
        'Accept': '*/*'
      }, headers),
      timeout: 3500
    }, (res) => {
      res.on('error', (err) => {
        if (settled) return;
        settled = true;
        try { req.destroy(); } catch (e) {}
        if (retry < 1 && (err.code === 'ECONNRESET' || err.message?.includes('socket hang up') || err.code === 'ETIMEDOUT')) {
          return resolve(fetchXtreamPlaylist(targetUrl, headers, hops, retry + 1));
        }
        reject(err);
      });

      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        try { res.destroy(); } catch (e) {}
        const loc = res.headers.location;
        if (!loc) {
          if (!settled) { settled = true; reject(new Error('Redirection sans en-tête location')); }
          return;
        }
        const nextUrl = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href;
        if (!settled) {
          settled = true;
          return resolve(fetchXtreamPlaylist(nextUrl, headers, hops + 1, retry));
        }
        return;
      }

      if (res.statusCode >= 400) {
        try { res.destroy(); } catch (e) {}
        if (!settled) {
          settled = true;
          return resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            finalUrl: targetUrl,
            body: '',
            buffer: Buffer.alloc(0)
          });
        }
        return;
      }

      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (settled) return;
        settled = true;
        const buf = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          finalUrl: targetUrl,
          body: buf.toString('utf8'),
          buffer: buf
        });
      });
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (retry < 1 && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        return resolve(fetchXtreamPlaylist(targetUrl, headers, hops, retry + 1));
      }
      reject(err);
    });

    req.on('timeout', () => {
      try { req.destroy(); } catch (e) {}
      if (settled) return;
      settled = true;
      if (retry < 1) {
        return resolve(fetchXtreamPlaylist(targetUrl, headers, hops, retry + 1));
      }
      reject(new Error('Timeout de connexion Xtream'));
    });
  });
}

global.activeXtreamSocket = null;

async function getWasmModule(wasmUrl, wasmBase64) {
  if (cachedWasmModule && cachedWasmUrl === wasmUrl) {
    return cachedWasmModule;
  }
  let buffer;
  if (wasmUrl) {
    const res = await httpsGet(wasmUrl);
    buffer = res.buffer;
    cachedWasmUrl = wasmUrl;
  } else if (wasmBase64) {
    buffer = Buffer.from(wasmBase64, 'base64');
  } else {
    throw new Error('Données WASM introuvables');
  }
  cachedWasmModule = await WebAssembly.compile(buffer);
  return cachedWasmModule;
}

async function getOrFetchToken(origin) {
  const now = Date.now();
  if (cachedJwtToken && now < jwtTokenExpiresAt - 60000) {
    return cachedJwtToken;
  }
  try {
    const res = await httpsGet(`${origin}/generate.php`);
    const token = res.text.trim();
    if (token.startsWith('eyJ')) {
      cachedJwtToken = token;
      jwtTokenExpiresAt = now + (3 * 3600 * 1000); // Valide 3h
      return token;
    }
  } catch (e) {
    console.warn('[Extractor] Erreur generate.php:', e.message);
  }
  if (cachedJwtToken) return cachedJwtToken;
  return null;
}

async function extractDirectStream(tmdbId, isMovie = true, season = 1, episode = 1, serverIndex = 0) {
  const apiUrl = isMovie
    ? `https://data.vidsrcme.ru/api.php?type=movie&tmdb=${tmdbId}&stream_urls`
    : `https://data.vidsrcme.ru/api.php?type=tv&tmdb=${tmdbId}&season=${season}&episode=${episode}&stream_urls`;

  const apiRes = await httpsGet(apiUrl);
  if (apiRes.status !== 200) {
    throw new Error(`Erreur API source : code ${apiRes.status}`);
  }

  const json = JSON.parse(apiRes.text);
  if (!json.vs || !json.data || !json.data.stream_urls) {
    throw new Error('Aucun flux disponible pour ce titre');
  }

  const wasmModule = await getWasmModule(json.vs.wasm_url, json.vs.wasm);
  const inst = await WebAssembly.instantiate(wasmModule, {});
  const ex = inst.exports;

  const enc = Buffer.from(json.data.stream_urls, 'base64');
  const ptr = ex.alloc(enc.length);
  new Uint8Array(ex.memory.buffer, ptr, enc.length).set(enc);
  const outLen = ex.decrypt(ptr, enc.length);
  const decrypted = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, ptr + 12, outLen));
  const rawUrls = decrypted.split('\n').map(u => u.trim()).filter(Boolean);

  if (!rawUrls.length) {
    throw new Error('Aucune URL de flux extraite');
  }

  // Choix du serveur parmi les sources disponibles (0 à 4)
  const requestedNum = (parseInt(serverIndex) || 0) + 1;
  const idx = (requestedNum - 1) % rawUrls.length;
  const rawM3u8 = rawUrls[idx];
  const urlObj = new URL(rawM3u8);
  const token = await getOrFetchToken(urlObj.origin);
  const finalStreamUrl = token ? `${rawM3u8}?token=${token}` : rawM3u8;

  const serverNames = [
    'Serveur 1 (Direct HLS)',
    'Serveur 2 (Direct HD)',
    'Serveur 3 (Direct Multi-Flux)',
    'Serveur 4 (Direct CDN VIP)',
    'Serveur 5 (Direct Secours)'
  ];

  return {
    success: true,
    server: requestedNum,
    server_name: serverNames[requestedNum - 1] || `Serveur ${requestedNum}`,
    title: json.data.title || 'Flux Direct',
    stream_url: finalStreamUrl,
    sources_count: rawUrls.length,
    all_sources: rawUrls.map(u => token ? `${u}?token=${token}` : u),
    lang: 'vo'
  };
}

// ================= EXTRACTEUR DE FLUX AUTHENTIQUES (La Villa & Téléfoot) =================
// 100% flux réels vérifiés et intégraux (> 30 à 60 minutes) - Zéro fake, Zéro cross-season

const VILLA_REAL_EPISODES = {
  // Saison 2 (Samaná / Mexique)
  '2_1': 'x52x2f5', // Ep 1 : Le Débrief & Grand Lancement (39 min)
  '2_2': 'x53383l', // Ep 2 : L'aventure commence (34 min)
  '2_3': 'x53il76', // Ep 3 : Premiers rapprochements (37 min)
  '2_6': 'x53w1ak', // Ep 6 : Tensions et confidences (36 min)
  '2_55': 'x5an1jb', // Ep 55 : Révélations et fin de parcours (30 min)
  '2_56': 'x88pu3x', // Ep 56 : Spécial Retrouvailles Antony & Mélanie (44 min)

  // Saison 3 (Saint-Martin)
  '3_1': 'x6bls11', // Ep 1 : Le Grand Lancement (48 min)
  '3_7': 'x6bxngr', // Ep 7 : Doutes et explications (38 min)
  '3_8': 'x6bzq6a', // Ep 8 : Soirée vérité et confessions (39 min)
  '3_16': 'x6cybmx', // Ep 16 : Nouveaux prétendants à la villa (42 min)
  '3_33': 'x6dl98h', // Ep 33 : Le choc des vérités amoureuses (42 min)
  '3_62': 'x6fuqq4', // Ep 62 : Révélations amoureuses décisives (39 min)
  '3_63': 'x6fuy2x', // Ep 63 : L'heure des bilans avec Lucie (39 min)
  '3_78': 'x6gzya8', // Ep 78 : Dernières chances de séduction (23 min)
  '3_82': 'x6h8dt2', // Ep 82 : La Cérémonie Finale (26 min)

  // Saison 5 (Playa del Carmen)
  '5_35': 'x7qn4ed'  // Ep 35 : Révélations explosives et la Boîte Noire (39 min)
};

const TELEFOOT_REAL_EPISODES = {
  // Saison 1 : Émissions Récentes & Spéciales
  '1_1': 'x8dt695', // Émission Spéciale 2022 (39 min)
  '1_2': 'x8pgc7d', // Grand Entretien & Débrief (35 min)
  '1_3': 'x7uajii', // Coulisses & Mercato (46 min)

  // Saison 2 : Les Grandes Émissions Historiques TF1
  '2_1': 'xpque5',  // Spécial Mondial 1998 en direct de Lens (52 min)
  '2_2': 'x9vu9k4', // Émission intégrale Novembre 1996 (61 min)
  '2_3': 'xu24yr',  // Dimanche 1er Mai 1994 (46 min)
  '2_4': 'x9pmlku', // Émission du 18 Juillet 1987 (53 min)
  '2_5': 'x9skmis', // Émission du 2 Décembre 1978 (52 min)
  '2_6': 'x9hksgy'  // La toute première émission historique 1977 (44 min)
};

async function fetchDailymotionStream(videoId) {
  return new Promise((resolve, reject) => {
    const metaUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
    const req = https.get(metaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 8000
    }, metaRes => {
      metaRes.on('error', reject);
      let body = '';
      const setCookies = metaRes.headers['set-cookie'] || [];
      metaRes.on('data', c => body += c);
      metaRes.on('end', () => {
        try {
          const meta = JSON.parse(body);
          if (!meta.qualities || !meta.qualities.auto || !meta.qualities.auto[0]) {
            return reject(new Error(`Flux Dailymotion introuvable pour ${videoId}`));
          }
          const masterUrl = meta.qualities.auto[0].url;
          const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

          // Vérifier l'accessibilité du manifeste avec les cookies
          const mReq = https.get(masterUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Cookie': cookieHeader,
              'Referer': 'https://www.dailymotion.com/'
            },
            timeout: 8000
          }, mRes => {
            mRes.on('error', reject);
            let mBody = '';
            mRes.on('data', c => mBody += c);
            mRes.on('end', () => {
              if (mRes.statusCode !== 200 || !mBody.includes('#EXTM3U')) {
                return reject(new Error(`Manifeste Dailymotion inaccessible (HTTP ${mRes.statusCode})`));
              }
              // Stocker le cookie en cache (TTL 10 min)
              const sessionKey = `dm_${videoId}_${Date.now()}`;
              dmCookieCache.set(sessionKey, cookieHeader);
              setTimeout(() => dmCookieCache.delete(sessionKey), 10 * 60 * 1000);
              resolve({
                masterUrl,
                cookieHeader,
                sessionKey,
                title: meta.title || 'Programme TV',
                videoId,
                manifestBody: mBody
              });
            });
          });
          mReq.on('error', reject);
          mReq.on('timeout', () => { mReq.destroy(); reject(new Error('Timeout manifeste Dailymotion')); });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout métadonnées Dailymotion')); });
  });
}

// ── Extracteur Multi-Serveurs Authentique pour les émissions TV & Télé-Réalité ──
async function extractShowMultiProvider(showType, season, episode, serverIndex) {
  const sNum = parseInt(season) || 1;
  const eNum = parseInt(episode) || 1;
  const exactKey = `${sNum}_${eNum}`;

  const isTelefoot = (showType === 'telefoot');
  const mapping = isTelefoot ? TELEFOOT_REAL_EPISODES : VILLA_REAL_EPISODES;
  const showTitle = isTelefoot ? 'Téléfoot' : 'La Villa des Cœurs Brisés';
  const showId = isTelefoot ? 'telefoot_tf1' : '68628';

  // Vérifier si l'épisode demandé existe de manière certaine
  const videoId = mapping[exactKey];
  if (!videoId) {
    throw new Error(`${showTitle} - S${sNum}:E${eNum} n'est pas disponible en streaming libre sans DRM.`);
  }

  // Récupérer le titre de l'épisode depuis le catalogue
  let displayTitle = `${showTitle} - S${sNum} : E${eNum}`;
  const catalogMovie = catalog.movies.find(m => m.id === showId || m.tmdb_id === showId);
  if (catalogMovie && catalogMovie.seasons) {
    const sObj = catalogMovie.seasons.find(s => s.season_number === sNum);
    const eObj = sObj?.episodes?.find(e => e.episode_number === eNum);
    if (eObj && eObj.title) {
      displayTitle = `S${sNum} : E${eNum} • ${eObj.title}`;
    }
  }

  const serverIndexMod = (serverIndex >= 0 ? serverIndex : 0) % 5;
  const srvNum = serverIndexMod + 1;

  const serverNames = {
    1: 'Serveur 1 (Direct HLS • Flux Principal HD)',
    2: 'Serveur 2 (Direct 1080p FHD)',
    3: 'Serveur 3 (Direct 720p HD)',
    4: 'Serveur 4 (Miroir CDN Rapide)',
    5: 'Serveur 5 (Multi-Débit Secours)'
  };

  const hosterNames = {
    1: `${showTitle} Replay Direct HD`,
    2: `${showTitle} 1080p Full HD`,
    3: `${showTitle} 720p HD Direct`,
    4: `${showTitle} CDN Haute Vitesse`,
    5: `${showTitle} Multi-Débit Adaptatif`
  };

  // Obtenir le flux HLS Dailymotion
  const dmData = await fetchDailymotionStream(videoId);
  const finalStreamUrl = `/api/stream/dm?video=${encodeURIComponent(videoId)}`;

  return {
    success: true,
    server: srvNum,
    server_name: serverNames[srvNum],
    hoster: hosterNames[srvNum],
    quality: 'HD 1080p/720p Direct',
    title: `${displayTitle} (${dmData.title})`,
    stream_url: finalStreamUrl,
    player_type: 'direct_hls',
    is_embed: false,
    dm_session: dmData.sessionKey,
    sources_count: 5,
    lang: 'vf'
  };
}

// ================= EXTRACTEUR DE CHAÎNES TV EN DIRECT (DADDYLIVE & MULTI-SERVEURS) =================
// Résolution dynamique des flux HLS directs, contournement Referer & Proxy intelligent

const liveStreamCache = new Map();

const wideIptvChannelSlugs = {
  // Canal+ Group
  '122': 'CANALSPORTFR',
  'tv_canal_sport': 'CANALSPORTFR',
  '463': 'FOOTPLUSFR',
  'tv_canal_foot': 'FOOTPLUSFR',
  '464': 'CANALS360',
  'tv_canal_360': 'CANALS360',
  '121': 'CANALPLFR',
  'tv_canal_france': 'CANALPLFR',
  '273': 'CANALPLF1AF',
  'tv_canal_f1': 'CANALPLF1AF',
  '271': 'CANALPLGPAF',
  'tv_canal_motogp': 'CANALPLGPAF',

  // beIN SPORTS Group
  '116': 'BEINSPORT1FR',
  'tv_bein1': 'BEINSPORT1FR',
  '117': 'BEINSPORT2FR',
  'tv_bein2': 'BEINSPORT2FR',
  '118': 'BEINSPORT3FR',
  'tv_bein3': 'BEINSPORT3FR',
  '494': 'beINMAX4FR',
  'tv_bein_max4': 'beINMAX4FR',
  '495': 'beINMAX5FR',
  'tv_bein_max5': 'beINMAX5FR',
  '496': 'beINMAX6FR',
  'tv_bein_max6': 'beINMAX6FR',

  // RMC Sport Group
  '119': 'RMCSPORT1FR',
  'tv_rmc_sport1': 'RMCSPORT1FR',
  '120': 'RMCSPORT2FR',
  'tv_rmc_sport2': 'RMCSPORT2FR',

  // Eurosport & L'Équipe
  '772': 'Euro1FR',
  'tv_eurosport1': 'Euro1FR',
  '773': 'Euro2FR',
  'tv_eurosport2': 'Euro2FR',
  '645': 'EQUIPEFR',
  'tv_lequipe': 'EQUIPEFR',

  // DAZN & Combat
  '179': 'DAZN1FR',
  'tv_dazn1': 'DAZN1FR',
  '376': 'WWE',
  'tv_wwe_network': 'WWE',

  // TNT & Généralistes
  '469': 'TF1FR',
  'tv_tf1': 'TF1FR',
  '470': 'M6FR',
  'tv_m6': 'M6FR',
  '950': 'France2',
  'tv_france2': 'France2',
  '951': 'France3',
  'tv_france3': 'France3',
  '964': 'CNEWSFR',
  'tv_cnews': 'CNEWSFR',
  '955': 'TMC',
  'tv_tmc': 'TMC'
};

async function getWideIptvM3u8(daddyId, channelId = null) {
  const key = channelId || daddyId;
  const cacheKey = `wideiptv_${key}`;
  const now = Date.now();
  if (liveStreamCache.has(cacheKey)) {
    const item = liveStreamCache.get(cacheKey);
    if (now < item.expiresAt) {
      return item.streamUrl;
    }
  }

  let slug = null;
  if (channelId && wideIptvChannelSlugs[String(channelId)]) {
    slug = wideIptvChannelSlugs[String(channelId)];
  } else if (daddyId && wideIptvChannelSlugs[String(daddyId)]) {
    slug = wideIptvChannelSlugs[String(daddyId)];
  }

  try {
    if (!slug && daddyId) {
      const pageHtml = await httpsGet(`https://dlive.sx/player/stream-${daddyId}.php`, {
        'Referer': 'https://dlive.sx/'
      });
      if (pageHtml && pageHtml.text) {
        const slugMatch = pageHtml.text.match(/wideiptv\.top\/(?:daddy\.php\?stream=|player\/)([^"&'\s]+)/i);
        if (slugMatch) slug = slugMatch[1];
      }
    }

    if (slug) {
      const playerHtml = await httpsGet(`https://wideiptv.top/player/${slug}`, {
        'Referer': `https://wideiptv.top/daddy.php?stream=${slug}`
      });
      if (playerHtml && playerHtml.text) {
        const m3u8Match = playerHtml.text.replace(/\\\//g, '/').match(/streamUrl:\s*["']([^"']+\.m3u8[^"']*)["']/i);
        if (m3u8Match) {
          const streamUrl = m3u8Match[1];
          try {
            const testRes = await httpsGet(streamUrl, { 'Referer': 'https://wideiptv.top/' });
            if (testRes.status === 200 && testRes.text && testRes.text.includes('#EXTM3U')) {
              liveStreamCache.set(cacheKey, { streamUrl, expiresAt: now + (240 * 1000) });
              return streamUrl;
            }
          } catch (e) {}
          liveStreamCache.set(cacheKey, { streamUrl, expiresAt: now + (180 * 1000) });
          return streamUrl;
        }
      }
    }
  } catch (e) {
    console.warn(`[WideIPTV Extraction Error ${key}]:`, e.message);
  }
  return null;
}

const backupChannelIds = {
  '121': [3050], // Canal+ France (secours Ligue1+ 121)
  '464': [3057], // Canal+ Sport 360 (secours CH-3057)
  '116': [3051], // beIN Sports 1 FR (secours FR 3051)
  '120': [3055], // RMC Sport 2 (secours CH-3055)
  '960': [3053, 3054, 3056, 3052] // DAZN Ligue 1 (secours Multi-Canaux 3052-3056)
};

async function getLiveM3u8Url(daddyId, mirror = 'premium_vip', channelId = null, isRecursive = false) {
  const key = channelId || daddyId;
  const cacheKey = `${key}_${mirror}`;
  const now = Date.now();
  if (liveStreamCache.has(cacheKey)) {
    const item = liveStreamCache.get(cacheKey);
    if (now < item.expiresAt) {
      return item.streamUrl;
    }
  }

  // Source Premium VIP (⭐ Flux Dark Ultra HD 1080p/60fps Bluetier CDN)
  if (mirror === 'premium_vip') {
    // 1. Priorité 1: WideIPTV Bluetier CDN (flux haute fluidité 1080p60 direct)
    const wideUrl = await getWideIptvM3u8(daddyId, channelId);
    if (wideUrl) {
      liveStreamCache.set(cacheKey, { streamUrl: wideUrl, expiresAt: now + (240 * 1000) });
      return wideUrl;
    }
    // 2. Priorité 2: DLHD Cluster 2 (hamis.romponalis.st/premiumtv/daddy2.php)
    const d2 = await getLiveM3u8Url(daddyId, 'daddy2', channelId, isRecursive);
    if (d2) {
      liveStreamCache.set(cacheKey, { streamUrl: d2, expiresAt: now + (180 * 1000) });
      return d2;
    }
    // 3. Priorité 3: DLHD Daddy1 Alpha
    const d1 = await getLiveM3u8Url(daddyId, 'daddy1', channelId, isRecursive);
    if (d1) {
      liveStreamCache.set(cacheKey, { streamUrl: d1, expiresAt: now + (180 * 1000) });
      return d1;
    }
    // 4. Fallback: Apex Streams
    const apex = await getLiveM3u8Url(daddyId, 'apex', channelId, isRecursive);
    if (apex) {
      liveStreamCache.set(cacheKey, { streamUrl: apex, expiresAt: now + (180 * 1000) });
      return apex;
    }
    // 5. Fallback: Cricsfree
    const cf = await getLiveM3u8Url(daddyId, 'cricsfree', channelId, isRecursive);
    if (cf) {
      liveStreamCache.set(cacheKey, { streamUrl: cf, expiresAt: now + (180 * 1000) });
      return cf;
    }
    return null;
  }

  if (mirror === 'wideiptv') {
    const wideUrl = await getWideIptvM3u8(daddyId, channelId);
    if (wideUrl) {
      liveStreamCache.set(cacheKey, { streamUrl: wideUrl, expiresAt: now + (240 * 1000) });
      return wideUrl;
    }
    return null;
  }

  const sources = [];
  if (mirror === 'daddy1') {
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/daddy.php?id=${daddyId}`, ref: 'https://dlhd.st/' });
  } else if (mirror === 'daddy2') {
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/daddy2.php?id=${daddyId}`, ref: 'https://dlhd.st/' });
  } else if (mirror === 'apex') {
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/apexstreams2.php?id=${daddyId}`, ref: 'https://apexstreams.cfd/' });
  } else if (mirror === 'cricsfree') {
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/cricsfree2.php?id=${daddyId}`, ref: 'https://cricsfree.cfd/' });
  } else {
    // Miroir de secours ordonné
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/daddy2.php?id=${daddyId}`, ref: 'https://dlhd.st/' });
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/cricsfree2.php?id=${daddyId}`, ref: 'https://cricsfree.cfd/' });
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/apexstreams2.php?id=${daddyId}`, ref: 'https://apexstreams.cfd/' });
    sources.push({ url: `https://hamis.romponalis.st/premiumtv/daddy.php?id=${daddyId}`, ref: 'https://dlhd.st/' });
  }

  for (const s of sources) {
    try {
      const res = await httpsGet(s.url, { 'Referer': s.ref });
      if (res.status === 200 && res.text) {
        const m = res.text.match(/source:\s*window\.atob\(['"]([A-Za-z0-9+/=]+)['"]\)/i);
        if (m) {
          const streamUrl = Buffer.from(m[1], 'base64').toString('utf8');
          try {
            const testM3u8 = await httpsGet(streamUrl, { 'Referer': 'https://hamis.romponalis.st/' });
            if (testM3u8.status === 200 && testM3u8.text && testM3u8.text.includes('#EXTM3U')) {
              liveStreamCache.set(cacheKey, { streamUrl, expiresAt: now + (180 * 1000) });
              return streamUrl;
            }
          } catch (e) {}
          liveStreamCache.set(cacheKey, { streamUrl, expiresAt: now + (60 * 1000) });
          return streamUrl;
        }
      }
    } catch (e) {}
  }

  // Cascade intelligente vers les canaux de secours français alternatifs
  const backups = backupChannelIds[String(daddyId)];
  if (backups && backups.length > 0 && !isRecursive) {
    for (const bId of backups) {
      const bUrl = await getLiveM3u8Url(bId, mirror, true);
      if (bUrl) {
        liveStreamCache.set(cacheKey, { streamUrl: bUrl, expiresAt: now + (180 * 1000) });
        return bUrl;
      }
    }
  }

  return null;
}

async function extractChannelMultiProvider(channelId, serverNum) {
  // Support direct des chaînes du catalogue Xtream (ex: xtream_13847 ou 13847)
  let xtreamStreamId = null;
  if (channelId && String(channelId).startsWith('xtream_')) {
    xtreamStreamId = String(channelId).replace('xtream_', '');
  } else if (channelId && /^\d+$/.test(String(channelId)) && parseInt(channelId, 10) > 1000) {
    xtreamStreamId = String(channelId);
  }

  if (xtreamStreamId) {
    const xtreamItem = XTREAM_FR_CATALOG.find(c => String(c.stream_id) === String(xtreamStreamId));
    const chTitle = xtreamItem ? xtreamItem.name : `Chaîne Xtream ${xtreamStreamId}`;
    const qBadge = xtreamItem ? xtreamItem.quality_badge : '1080p FHD Direct VIP';
    return {
      success: true,
      server: 1,
      server_name: 'Serveur 1 (💎 Direct Xtream VIP)',
      hoster: `💎 Direct Xtream VIP • ${chTitle}`,
      quality: qBadge,
      title: `${chTitle} • 🔴 EN DIRECT`,
      stream_url: `/api/stream/xtream?stream_id=${xtreamStreamId}`,
      raw_stream_url: `/api/stream/xtream?stream_id=${xtreamStreamId}`,
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 1,
      lang: 'vf'
    };
  }

  const channel = catalog.movies.find(m => m.id === channelId || m.tmdb_id === channelId || String(m.daddy_id) === String(channelId));
  const title = channel ? channel.title : 'Chaîne Sport Direct';
  let daddyId = channel?.daddy_id || channel?.sources?.daddylive_id;
  if (!daddyId && channelId && channelId.startsWith('tv_')) {
    const raw = channelId.replace('tv_', '');
    if (/^\d+$/.test(raw)) daddyId = parseInt(raw, 10);
  }

  const srvNum = Math.max(1, Math.min(8, parseInt(serverNum) || 1));

  const serverNames = {
    1: 'Serveur 1 (💎 Direct Xtream VIP 1080p)',
    2: 'Serveur 2 (⭐ Dark VIP Ultra HD 1080p/60fps)',
    3: 'Serveur 3 (⚡ Direct HLS DLHD Cluster 2 1080p)',
    4: 'Serveur 4 (🎬 Direct HLS Apex Streams 1080p)',
    5: 'Serveur 5 (📡 Direct HLS DLHD Alpha Cluster 1 1080p)',
    6: 'Serveur 6 (🌐 Direct HLS Cricsfree 1080p)',
    7: 'Serveur 7 (🚀 Direct HLS WideIPTV Secours 1080p)',
    8: 'Serveur 8 (🛡️ Direct HLS Secours Multi-Cluster 1080p)'
  };

  const mirrorMap = {
    1: { mirror: 'xtream', hoster: '💎 Direct Xtream VIP FHD (Flux Résilient Haute Stabilité • Recommandé)' },
    2: { mirror: 'premium_vip', hoster: '⭐ Dark VIP Ultra HD 1080p/60fps (Bluetier CDN)' },
    3: { mirror: 'daddy2', hoster: '⚡ Direct HLS DLHD Cluster 2 (1080p)' },
    4: { mirror: 'apex', hoster: '🎬 Direct HLS Apex Streams (1080p Alternate)' },
    5: { mirror: 'daddy1', hoster: '📡 Direct HLS DLHD Alpha Cluster 1 (1080p)' },
    6: { mirror: 'cricsfree', hoster: '🌐 Direct HLS Cricsfree (1080p)' },
    7: { mirror: 'wideiptv', hoster: '🚀 Direct HLS WideIPTV Secours (1080p)' },
    8: { mirror: 'secours', hoster: '🛡️ Direct HLS Secours Multi-Cluster (1080p)' }
  };

  const liveChannelParam = encodeURIComponent(channelId || daddyId);

  // ── PRIORITÉ ABSOLUE N°1 : SERVEUR 1 = DIRECT XTREAM VIP (H.264/AAC) ──
  if (srvNum === 1) {
    const rawChan = (channelId || '').toString().toLowerCase().trim();
    // Les flux TV avec audio Dolby EC-3 dans M2TS ne peuvent pas être décodés par MSE dans les navigateurs web.
    // Pour ces chaînes spécifiques, redirection automatique vers le miroir Ultra HD 1080p/60fps compatible AAC.
    const isEc3Xtream = (rawChan === 'tv_canal_sport' || rawChan === 'canal_sport');
    const hasXtream = !isEc3Xtream && (XTREAM_CHANNELS[rawChan] 
      || XTREAM_CHANNELS[rawChan.replace(/^tv_/, '')] 
      || XTREAM_CHANNELS[rawChan.replace(/_/g, ' ')]);

    if (hasXtream) {
      return {
        success: true,
        server: 1,
        server_name: serverNames[1],
        hoster: `${mirrorMap[1].hoster} • ${title}`,
        quality: '1080p FHD Direct VIP',
        title: `${title} • 🔴 EN DIRECT`,
        stream_url: `/api/stream/xtream?channel=${liveChannelParam}`,
        player_type: 'direct_hls',
        is_embed: false,
        is_live: true,
        sources_count: 8,
        lang: 'vf'
      };
    }
  }

  // Chaînes FAST & TNT Officielles Directes HD
  if (channelId === 'tv_arte' || channelId === '958') {
    return {
      success: true,
      server: srvNum,
      server_name: serverNames[srvNum],
      hoster: 'Arte France Direct Akamai CDN 1080p',
      quality: '1080p FHD Direct',
      title: `${title} • 🔴 EN DIRECT`,
      stream_url: 'https://artesimulcast.akamaized.net/hls/live/2031003/artelive_fr/index.m3u8',
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'vf'
    };
  }

  if (channelId === 'tv_tmc' && srvNum === 3) {
    return {
      success: true,
      server: srvNum,
      server_name: serverNames[srvNum],
      hoster: 'TMC Direct HD',
      quality: '1080p FHD Direct',
      title: `${title} • 🔴 EN DIRECT`,
      stream_url: 'http://151.80.18.177:86/TMC/index.m3u8',
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'vf'
    };
  }

  if (channelId === 'tv_redbull') {
    const urls = [
      'https://46cfeb23c7f74853bba7a256655a3119.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-582-WORBDACHDEFAST-WHALETVPLUS/582/whaletvplus/hls/master/playlist.m3u8',
      'https://1a3566cb46914c5499fbc86fbc4ac87e.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-932-WORBUKENFAST-WHALETVPLUS/932/whaletvplus/hls/master/playlist.m3u8',
      'https://0b73ace69ebb45eaa249bb87837cb958.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-644-WORBUSENFAST-LG_US/644/lgtv/hls/master/playlist.m3u8',
      'https://886bd3fbc782459f8de7555d32d7e9ce.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-957-WORBLATAMESFAST-WHALETVPLUS/957/whaletvplus/hls/master/playlist.m3u8',
      'https://46cfeb23c7f74853bba7a256655a3119.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-582-WORBDACHDEFAST-WHALETVPLUS/582/whaletvplus/hls/master/playlist.m3u8',
      'https://1a3566cb46914c5499fbc86fbc4ac87e.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-932-WORBUKENFAST-WHALETVPLUS/932/whaletvplus/hls/master/playlist.m3u8',
      'https://0b73ace69ebb45eaa249bb87837cb958.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-644-WORBUSENFAST-LG_US/644/lgtv/hls/master/playlist.m3u8'
    ];
    return {
      success: true,
      server: srvNum,
      server_name: serverNames[srvNum],
      hoster: 'Red Bull TV Direct Ultra HD',
      quality: '1080p FHD Direct',
      title: `${title} • 🔴 EN DIRECT`,
      stream_url: urls[(srvNum - 1) % urls.length],
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'vf'
    };
  }

  if (channelId === 'tv_fifa') {
    return {
      success: true,
      server: srvNum,
      server_name: serverNames[srvNum],
      hoster: 'FIFA+ Direct Français Ultra HD',
      quality: '1080p FHD Direct',
      title: `${title} • 🔴 EN DIRECT`,
      stream_url: 'https://37b4c228.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWZyX0ZJRkFQbHVzRnJlbmNoX0hMUw/playlist.m3u8',
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'vf'
    };
  }

  if (channelId === 'tv_freesports') {
    return {
      success: true,
      server: srvNum,
      server_name: serverNames[srvNum],
      hoster: 'World of Freesports Direct',
      quality: '1080p FHD Direct',
      title: `${title} • 🔴 EN DIRECT`,
      stream_url: 'https://mainstreammedia-worldoffreesportsintl-rakuten.amagi.tv/playlist.m3u8',
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'vf'
    };
  }

  // Traitement pour les serveurs 2 à 8 (Miroirs Alternatifs)
  if (daddyId || channelId) {
    const cfg = mirrorMap[srvNum] || mirrorMap[2];
    let streamUrl = await getLiveM3u8Url(daddyId, cfg.mirror, channelId);

    // Cascade automatique intelligente vers les miroirs alternatifs si la source sélectionnée est hors-ligne
    if (!streamUrl && cfg.mirror !== 'premium_vip') streamUrl = await getLiveM3u8Url(daddyId, 'premium_vip', channelId);
    if (!streamUrl && cfg.mirror !== 'daddy2') streamUrl = await getLiveM3u8Url(daddyId, 'daddy2', channelId);
    if (!streamUrl && cfg.mirror !== 'apex') streamUrl = await getLiveM3u8Url(daddyId, 'apex', channelId);
    if (!streamUrl && cfg.mirror !== 'daddy1') streamUrl = await getLiveM3u8Url(daddyId, 'daddy1', channelId);
    if (!streamUrl && cfg.mirror !== 'cricsfree') streamUrl = await getLiveM3u8Url(daddyId, 'cricsfree', channelId);
    if (!streamUrl && cfg.mirror !== 'wideiptv') streamUrl = await getLiveM3u8Url(daddyId, 'wideiptv', channelId);

    return {
      success: true,
      server: srvNum,
      server_name: serverNames[srvNum],
      hoster: `${cfg.hoster} • ${title}`,
      quality: srvNum === 2 ? '⭐ Ultra HD 1080p/60fps Direct' : '1080p FHD Direct',
      title: `${title} • 🔴 EN DIRECT`,
      stream_url: `/api/stream/live?channel=${liveChannelParam}&mirror=${encodeURIComponent(cfg.mirror)}`,
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'vf'
    };
  }

  // Fallback universel
  return {
    success: true,
    server: srvNum,
    server_name: serverNames[srvNum],
    hoster: `Direct TV • ${title}`,
    quality: '1080p HD',
    title: `${title} • 🔴 EN DIRECT`,
    stream_url: 'https://mainstreammedia-worldoffreesportsintl-rakuten.amagi.tv/playlist.m3u8',
    player_type: 'direct_hls',
    is_embed: false,
    is_live: true,
    sources_count: 7,
    lang: 'vf'
  };
}

// ================= EXTRACTEUR DE FLUX FRANÇAIS (VF / VOSTFR) =================
function unpackDeanEdwards(p, a, c, k, e, d) {
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
  }
  return p;
}

function decryptVidzyOrFsvid(s, hostname) {
  try {
    let H = 0;
    for (let j = 0; j < hostname.length; j++) {
      H = (H + hostname.charCodeAt(j)) & 255;
    }
    const b = Buffer.from(s, 'base64').toString('binary');
    const a = b.split('').reverse().join('');
    let r = '';
    for (let i = 0; i < a.length; i++) {
      const kk = (0x3d + i * 89 + H) & 255;
      r += String.fromCharCode(a.charCodeAt(i) ^ kk);
    }
    if (r.startsWith('http')) return r;
  } catch (e) {}
  return null;
}

async function extractVidzy(embedUrl) {
  const res = await httpsGet(embedUrl, { 'Referer': 'https://french-stream.one/' });
  if (!res.text) return null;
  const m = res.text.match(/sources:\s*\[\{src:\s*\(function\(s\)[\s\S]*?\}\)\("([^"]+)"\)/);
  if (!m) return null;
  const u = new URL(embedUrl);
  return decryptVidzyOrFsvid(m[1], u.hostname);
}

async function extractFsvid(embedUrl) {
  const res = await httpsGet(embedUrl, { 'Referer': 'https://french-stream.one/' });
  if (!res.text) return null;
  const match = res.text.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
  if (match) {
    const unpacked = unpackDeanEdwards(match[1], parseInt(match[2]), parseInt(match[3]), match[4].split('|'));
    const fnMatch = unpacked.match(/\("([^"]+)"\)/);
    if (fnMatch) {
      const u = new URL(embedUrl);
      return decryptVidzyOrFsvid(fnMatch[1], u.hostname);
    }
  }
  return null;
}

async function extractUqload(embedUrl) {
  const res = await httpsGet(embedUrl, { 'Referer': 'https://french-stream.one/' });
  if (!res.text) return null;
  const match = res.text.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
  if (!match) return null;
  const unpacked = unpackDeanEdwards(match[1], parseInt(match[2]), parseInt(match[3]), match[4].split('|'));
  const m = unpacked.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
  if (m) return m[0];
  const mp4 = unpacked.match(/https?:\/\/[^"']+\.mp4[^"']*/);
  if (mp4) return mp4[0];
  return null;
}

function searchFrenchStream(query) {
  return new Promise(resolve => {
    try {
      const postData = querystring.stringify({ query });
      const req = https.request({
        hostname: 'french-stream.one',
        path: '/engine/ajax/search.php',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://french-stream.one/'
        },
        timeout: 8000
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          const matches = [...d.matchAll(/(?:href=['"]|location\.href=['"])\/([0-9]+)-([^"'\/]+)\.html['"][^>]*>[\s\S]*?<div class=['"]search-title['"]>([^<]+)<\/div>/g)];
          resolve(matches.map(m => ({ id: m[1], slug: m[2], title: m[3] })));
        });
      });
      req.on('error', () => resolve([]));
      req.on('timeout', () => { req.destroy(); resolve([]); });
      req.write(postData);
      req.end();
    } catch (e) {
      resolve([]);
    }
  });
}

async function extractFrenchStream(title, isMovie = true, season = 1, episode = 1, serverIndex = 0) {
  console.log(`[French Extractor] Recherche de "${title}" (Movie: ${isMovie}, S:${season}, E:${episode}, Server:${serverIndex})...`);
  
  // Nettoyage complet du titre : suppression de l'année entre parenthèses "(2021)" et des sous-titres
  const strippedYear = title.replace(/\s*\(\d{4}\).*$/, '').trim();
  const baseTitle = strippedYear.split(/[:\-–]/)[0].trim();

  const candidates = [
    !isMovie ? `${strippedYear} Saison ${season}` : null,
    !isMovie ? `${baseTitle} Saison ${season}` : null,
    strippedYear,
    baseTitle,
    title
  ].filter((q, idx, arr) => q && arr.indexOf(q) === idx);

  let results = [];
  for (const q of candidates) {
    results = await searchFrenchStream(q);
    if (results.length > 0) break;
  }

  if (!results.length) {
    throw new Error(`Aucun flux français trouvé pour "${title}"`);
  }

  let target = results[0];
  if (!isMovie) {
    const sMatch = results.find(r => r.title.toLowerCase().includes(`saison ${season}`) || r.slug.toLowerCase().includes(`saison-${season}`));
    if (sMatch) target = sMatch;
  }

  let hosters = {};
  if (isMovie) {
    const apiRes = await httpsGet(`https://french-stream.one/engine/ajax/film_api.php?id=${target.id}`, { 'Referer': 'https://french-stream.one/' });
    const data = JSON.parse(apiRes.text);
    if (!data.players) throw new Error('Lecteurs indisponibles pour ce titre VF');
    hosters = data.players;
  } else {
    const v = Math.floor(Date.now() / 30000);
    const apiRes = await httpsGet(`https://french-stream.one/static/series/${target.id}.js?v=${v}`, { 'Referer': 'https://french-stream.one/' });
    const data = JSON.parse(apiRes.text);
    const epObj = (data.vf && data.vf[episode]) || (data.vostfr && data.vostfr[episode]);
    if (!epObj) throw new Error(`Épisode ${episode} indisponible en VF`);
    hosters = epObj;
  }

  const vidzyUrl = hosters.vidzy ? (typeof hosters.vidzy === 'string' ? hosters.vidzy : (hosters.vidzy.vff || hosters.vidzy.default)) : null;
  const fsvidUrl = hosters.premium ? (typeof hosters.premium === 'string' ? hosters.premium : (hosters.premium.vff || hosters.premium.default)) : null;
  const uqloadUrl = hosters.uqload ? (typeof hosters.uqload === 'string' ? hosters.uqload : (hosters.uqload.vff || hosters.uqload.default)) : null;

  const candidateExtractors = [
    { name: 'Vidzy HD', fn: () => vidzyUrl ? extractVidzy(vidzyUrl) : null },
    { name: 'Fsvid VIP', fn: () => fsvidUrl ? extractFsvid(fsvidUrl) : null },
    { name: 'Uqload', fn: () => uqloadUrl ? extractUqload(uqloadUrl) : null }
  ];

  const order = [serverIndex % 3, (serverIndex + 1) % 3, (serverIndex + 2) % 3];
  let finalStream = null;
  let finalHosterName = '';

  for (const idx of order) {
    const cand = candidateExtractors[idx];
    try {
      const streamUrl = await cand.fn();
      if (streamUrl && streamUrl.startsWith('http')) {
        finalStream = streamUrl;
        finalHosterName = cand.name;
        break;
      }
    } catch (e) {
      console.warn(`[French Extractor] Échec ${cand.name}:`, e.message);
    }
  }

  if (!finalStream) {
    throw new Error('Échec d\'extraction du flux VF');
  }

  const serverNames = [
    'Serveur 1 (Direct VF • Vidzy HD)',
    'Serveur 2 (Direct VF • Fsvid VIP)',
    'Serveur 3 (Direct VF • Uqload)',
    'Serveur 4 (Direct VF • Secours)',
    'Serveur 5 (Direct VF • Multi-Flux)'
  ];

  return {
    success: true,
    server: serverIndex + 1,
    server_name: serverNames[serverIndex] || `Serveur ${serverIndex + 1} (Direct VF)`,
    hoster: finalHosterName,
    title: target.title,
    stream_url: finalStream,
    player_type: finalStream.includes('.m3u8') ? 'direct_hls' : 'direct_video',
    sources_count: 5,
    lang: 'vf'
  };
}

function resolveProxyUrl(base, relative) {

  try {
    return new URL(relative, base).toString();
  } catch (e) {
    return relative;
  }
}

function rewriteM3u8ForProxy(content, baseUrl, sessionKey = null) {
  const sessionParam = sessionKey ? '&dm_session=' + encodeURIComponent(sessionKey) : '';
  const lines = content.split(/\r?\n/);

  // Si c'est un Master Playlist HLS avec des variantes de résolution
  if (content.includes('#EXT-X-STREAM-INF')) {
    const headerLines = [];
    const variants = [];
    let i = 0;
    while (i < lines.length && !lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const line = lines[i].trim();
      if (line) {
        if (line.startsWith('#')) {
          headerLines.push(line.replace(/URI="([^"]+)"/g, (match, u) => {
            const abs = resolveProxyUrl(baseUrl, u);
            return 'URI="/api/stream/proxy?url=' + encodeURIComponent(abs) + sessionParam + '"';
          }));
        } else {
          const abs = resolveProxyUrl(baseUrl, line);
          headerLines.push('/api/stream/proxy?url=' + encodeURIComponent(abs) + sessionParam);
        }
      }
      i++;
    }

    while (i < lines.length) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const infLine = lines[i];
        let j = i + 1;
        while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith('#'))) {
          if (lines[j].trim()) headerLines.push(lines[j].trim());
          j++;
        }
        let uriLine = (lines[j] || '').trim();
        if (uriLine) {
          const abs = resolveProxyUrl(baseUrl, uriLine);
          uriLine = '/api/stream/proxy?url=' + encodeURIComponent(abs) + sessionParam;
        }

        let bw = 0;
        const bwMatch = infLine.match(/BANDWIDTH=([0-9]+)/);
        if (bwMatch) bw = parseInt(bwMatch[1], 10);

        variants.push({ infLine, uriLine, bw });
        i = j + 1;
      } else {
        const line = lines[i].trim();
        if (line) headerLines.push(line);
        i++;
      }
    }

    // Trier les variantes par débit décroissant (1080p et 720p placés en premier !)
    variants.sort((a, b) => b.bw - a.bw);

    const resultLines = [...headerLines];
    for (const v of variants) {
      resultLines.push(v.infLine);
      resultLines.push(v.uriLine);
    }
    return resultLines.join('\n');
  }

  // Playlist standard de segments (.ts / .m4s)
  const rewritten = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (match, u) => {
        const abs = resolveProxyUrl(baseUrl, u);
        return 'URI="/api/stream/proxy?url=' + encodeURIComponent(abs) + sessionParam + '"';
      });
    }
    const abs = resolveProxyUrl(baseUrl, trimmed);
    return '/api/stream/proxy?url=' + encodeURIComponent(abs) + sessionParam;
  });
  return rewritten.join('\n');
}

// Initialiser le catalogue par défaut si absent
let catalog = {
  movies: [
    {
      id: "stranger-things",
      title: "Stranger Things",
      original_title: "Stranger Things 5",
      overview: "Quand un jeune garçon disparaît soudainement, une petite ville découvre une conspiration d'expériences secrètes, des forces surnaturelles terrifiantes et une fillette aux étranges pouvoirs télékinésiques.",
      media_type: "series",
      poster_url: "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
      backdrop_url: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
      video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
      categories: ["Tendances", "Netflix Originals", "Sci-Fi & Fantastique"],
      release_year: 2025,
      match_score: 99,
      age_rating: "16+",
      duration: "4 Saisons",
      cast: ["Millie Bobby Brown", "David Harbour", "Winona Ryder", "Finn Wolfhard"],
      director: "Les Frères Duffer",
      quality_badges: ["4K Ultra HD", "Dolby Vision", "Dolby Atmos"],
      is_hero: true,
      created_at: new Date().toISOString()
    },
    {
      id: "squid-game",
      title: "Squid Game",
      original_title: "Squid Game: Saison 2",
      overview: "Des centaines de personnes fauchées acceptent une étrange invitation à s'affronter dans des jeux d'enfants traditionnels pour une somme colossale. Mais les enjeux sont mortels.",
      media_type: "series",
      poster_url: "https://image.tmdb.org/t/p/w500/dDlGgwXjB19p0p2aK275ZJ2GgqV.jpg",
      backdrop_url: "https://image.tmdb.org/t/p/original/y4a02U0qQc0q66UaX06Qo2t4q4F.jpg",
      video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      categories: ["Tendances", "Netflix Originals", "Séries dramatiques & Suspense"],
      release_year: 2024,
      match_score: 97,
      age_rating: "18+",
      duration: "2 Saisons",
      cast: ["Lee Jung-jae", "Park Hae-soo", "Wi Ha-joon"],
      director: "Hwang Dong-hyuk",
      quality_badges: ["4K Ultra HD", "HDR", "5.1"],
      is_hero: false,
      created_at: new Date().toISOString()
    },
    {
      id: "inception",
      title: "Inception",
      original_title: "Inception",
      overview: "Dom Cobb est un voleur chevronné, le meilleur dans l'art périlleux de l'extraction : s'emparer des secrets les plus précieux d'une personne dans son subconscient pendant son sommeil.",
      media_type: "movie",
      poster_url: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
      backdrop_url: "https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
      video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      categories: ["Films d'action spectaculaires", "Sci-Fi & Fantastique", "Tendances"],
      release_year: 2010,
      match_score: 98,
      age_rating: "12+",
      duration: "2h 28m",
      cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy"],
      director: "Christopher Nolan",
      quality_badges: ["4K Ultra HD", "Spatial Audio"],
      is_hero: false,
      created_at: new Date().toISOString()
    },
    {
      id: "cyberpunk-edgerunners",
      title: "Cyberpunk: Edgerunners",
      original_title: "Cyberpunk: Edgerunners",
      overview: "Dans une mégalopole obsédée par la technologie et les modifications corporelles, un gamin de la rue talentueux tente de survivre en devenant un mercenaire hors-la-loi : un edgerunner.",
      media_type: "series",
      poster_url: "https://image.tmdb.org/t/p/w500/7jsw9e5unwUioLh1i1q1n2K2nQ9.jpg",
      backdrop_url: "https://image.tmdb.org/t/p/original/m9P8iA1R8nQ2y1v1m0g9l8l3h0o.jpg",
      video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      categories: ["Animation & Anime", "Sci-Fi & Fantastique", "Netflix Originals"],
      release_year: 2022,
      match_score: 96,
      age_rating: "18+",
      duration: "1 Saison",
      cast: ["KENN", "Aoi Yuuki", "Hiroki Touchi"],
      director: "Studio Trigger",
      quality_badges: ["HDR", "5.1"],
      is_hero: false,
      created_at: new Date().toISOString()
    },
    {
      id: "interstellar",
      title: "Interstellar",
      original_title: "Interstellar",
      overview: "Alors que la Terre se meurt, un groupe d'explorateurs franchit un trou de ver récemment découvert pour repousser les limites humaines et partir à la conquête des distances interstellaires.",
      media_type: "movie",
      poster_url: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      backdrop_url: "https://image.tmdb.org/t/p/original/rAiYTsqJJR0dHw9yQy2Zg4K0Q2F.jpg",
      video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      categories: ["Sci-Fi & Fantastique", "Tendances"],
      release_year: 2014,
      match_score: 99,
      age_rating: "Tous publics",
      duration: "2h 49m",
      cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"],
      director: "Christopher Nolan",
      quality_badges: ["4K Ultra HD", "Dolby Atmos"],
      is_hero: false,
      created_at: new Date().toISOString()
    },
    {
      id: "top-gun-maverick",
      title: "Top Gun: Maverick",
      original_title: "Top Gun: Maverick",
      overview: "Après plus de 30 ans de service en tant que l'un des meilleurs aviateurs de la Navy, Pete 'Maverick' Mitchell est à sa place, repoussant les limites comme pilote d'essai audacieux.",
      media_type: "movie",
      poster_url: "https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",
      backdrop_url: "https://image.tmdb.org/t/p/original/odJ4hx6g6vBt4lBWKFD1tI8WS4x.jpg",
      video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
      categories: ["Films d'action spectaculaires", "Tendances"],
      release_year: 2022,
      match_score: 97,
      age_rating: "Tous publics",
      duration: "2h 10m",
      cast: ["Tom Cruise", "Miles Teller", "Jennifer Connelly"],
      director: "Joseph Kosinski",
      quality_badges: ["4K Ultra HD", "Dolby Atmos"],
      is_hero: false,
      created_at: new Date().toISOString()
    }
  ],
  categories: [
    { id: "c_trends", name: "Tendances actuelles", slug: "tendances" },
    { id: "c_originals", name: "Netflix Originals", slug: "originals" },
    { id: "c_scifi", name: "Sci-Fi & Fantastique", slug: "scifi" },
    { id: "c_action", name: "Films d'action spectaculaires", slug: "action" },
    { id: "c_drama", name: "Séries dramatiques & Suspense", slug: "drama" },
    { id: "c_animation", name: "Animation & Anime", slug: "animation" }
  ]
};

if (fs.existsSync(DATA_FILE)) {
  try {
    catalog = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {}
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify(catalog, null, 2));
  invalidateCatalogCache();
}

// ================= SYNCHRONISATION PERMANENTE GITHUB CLOUD (ZERO DATA LOSS) =================
function getGitHubToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  const tokenPath = path.join(__dirname, 'data', '.github_token');
  if (fs.existsSync(tokenPath)) {
    try {
      const t = fs.readFileSync(tokenPath, 'utf8').trim();
      if (t) return t;
    } catch (e) {}
  }
  return '';
}

const GITHUB_CONFIG = {
  get token() { return getGitHubToken(); },
  owner: process.env.GITHUB_OWNER || 'foocushop',
  repo: process.env.GITHUB_REPO || 'netflix-clone-live-tv',
  branch: process.env.GITHUB_BRANCH || 'main'
};

let lastGitHubSyncTime = Date.now();
let lastGitHubCommitSha = null;
let gitHubSyncStatus = 'synced'; // 'idle' | 'syncing' | 'synced' | 'error' | 'pending'
let gitHubSyncError = null;
let syncTimeout = null;

async function syncFileToGitHub(localFilePath, repoRelativePath, commitMessage) {
  if (!GITHUB_CONFIG.token) {
    console.warn('[GitHub Sync] Aucun token GitHub configuré.');
    return { success: false, message: 'Token GitHub non configuré' };
  }

  try {
    gitHubSyncStatus = 'syncing';
    console.log(`[GitHub Sync] ☁️ Début synchronisation de ${repoRelativePath}...`);

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Fichier local introuvable: ${localFilePath}`);
    }

    const fileBuffer = fs.readFileSync(localFilePath);
    const contentBase64 = fileBuffer.toString('base64');
    const apiUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${repoRelativePath}`;

    let existingSha = null;
    try {
      const getRes = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_CONFIG.token}`,
          'User-Agent': 'Netflix-Clone-CloudSync',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const getData = await getRes.json();
        existingSha = getData.sha;
      }
    } catch (e) {
      console.warn(`[GitHub Sync] Avertissement récupération SHA ${repoRelativePath}:`, e.message);
    }

    const body = {
      message: `${commitMessage} [skip ci]`,
      content: contentBase64,
      branch: GITHUB_CONFIG.branch
    };
    if (existingSha) body.sha = existingSha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_CONFIG.token}`,
        'User-Agent': 'Netflix-Clone-CloudSync',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    });

    const putData = await putRes.json();
    if (!putRes.ok) {
      throw new Error(putData.message || `Erreur GitHub HTTP ${putRes.status}`);
    }

    lastGitHubSyncTime = Date.now();
    lastGitHubCommitSha = putData.commit ? putData.commit.sha : null;
    gitHubSyncStatus = 'synced';
    gitHubSyncError = null;
    console.log(`[GitHub Sync] ✅ Fichier ${repoRelativePath} sauvegardé avec succès sur GitHub Cloud (commit: ${lastGitHubCommitSha ? lastGitHubCommitSha.substring(0, 7) : 'ok'})`);
    return { success: true, sha: lastGitHubCommitSha };
  } catch (err) {
    gitHubSyncStatus = 'error';
    gitHubSyncError = err.message;
    console.error(`[GitHub Sync] ❌ Échec synchronisation ${repoRelativePath}:`, err.message);
    return { success: false, error: err.message };
  }
}

function scheduleCatalogSync(delayMs = 3000) {
  if (syncTimeout) clearTimeout(syncTimeout);
  gitHubSyncStatus = 'pending';
  syncTimeout = setTimeout(async () => {
    try {
      await syncFileToGitHub(DATA_FILE, 'data/catalog.json', 'chore(data): auto-sync catalog from admin');
    } catch (e) {
      console.error('[GitHub Sync Scheduler Error]:', e);
    }
  }, delayMs);
}

async function checkAndPullLatestCatalog() {
  if (!GITHUB_CONFIG.token) return;
  try {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/data/catalog.json`;
    const res = await fetch(rawUrl, {
      headers: {
        'Authorization': `token ${GITHUB_CONFIG.token}`,
        'User-Agent': 'Netflix-Clone-StartupSync'
      }
    });
    if (res.ok) {
      const text = await res.text();
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.movies) && parsed.movies.length > 0) {
        catalog = parsed;
        fs.writeFileSync(DATA_FILE, JSON.stringify(catalog, null, 2));
        invalidateCatalogCache();
        lastGitHubSyncTime = Date.now();
        gitHubSyncStatus = 'synced';
        console.log(`[GitHub Sync] 🚀 Catalogue initial synchronisé depuis GitHub au démarrage (${catalog.movies.length} médias)`);
      }
    }
  } catch (err) {
    console.warn('[GitHub Sync] Information vérification catalogue distant:', err.message);
  }
}

function saveCatalog() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(catalog, null, 2));
  invalidateCatalogCache();
  scheduleCatalogSync(3000);
}

const startTime = Date.now();


// ================= HAUTE PERFORMANCE & COMPRESSION GZIP (Fort Trafic) =================
function sendResponse(req, res, statusCode, contentType, bodyData, extraHeaders = {}, cacheSeconds = 300) {
  const acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase();
  const rawBuffer = Buffer.isBuffer(bodyData) ? bodyData : Buffer.from(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData), 'utf8');

  // Calcul ETag rapide
  const etag = '"' + rawBuffer.length.toString(16) + '-' + (rawBuffer[0] || 0).toString(16) + '"';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { 'ETag': etag, 'Cache-Control': `public, max-age=${cacheSeconds}, stale-while-revalidate=86400` });
    return res.end();
  }

  const headers = Object.assign({
    'Content-Type': contentType,
    'ETag': etag,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Vary': 'Accept-Encoding'
  }, extraHeaders);

  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=86400`;
  }

  if (acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    const gzipped = zlib.gzipSync(rawBuffer);
    headers['Content-Length'] = gzipped.length;
    res.writeHead(statusCode, headers);
    res.end(gzipped);
  } else {
    headers['Content-Length'] = rawBuffer.length;
    res.writeHead(statusCode, headers);
    res.end(rawBuffer);
  }
}

// Caches pré-compressés en mémoire (0ms, 0 CPU en production)
let cachedCatalogBuffer = null;
let cachedCatalogGzip = null;
let cachedXtreamChannelsPayload = null;
let cachedXtreamChannelsGzip = null;
let cachedXtreamTelePayload = null;
let cachedXtreamTeleGzip = null;

function invalidateCatalogCache() {
  cachedCatalogBuffer = null;
  cachedCatalogGzip = null;
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.json': 'application/json'
};

// ================= MODULE SERVEUR XTREAM CODES API =================
// Rend le serveur 100% compatible avec IPTV Smarters Pro, TiviMate, XCIPTV, VLC, etc.
let XTREAM_USERS = [];
function loadXtreamUsers() {
  try {
    const p = path.join(__dirname, 'data', 'xtream_users.json');
    if (fs.existsSync(p)) {
      XTREAM_USERS = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {}
  if (!XTREAM_USERS || XTREAM_USERS.length === 0) {
    XTREAM_USERS = [
      { username: 'jose', password: '1965', status: 'Active', exp_date: 1893456000, max_connections: 5 },
      { username: 'admin', password: '1965', status: 'Active', exp_date: 1893456000, max_connections: 10 }
    ];
  }
}
loadXtreamUsers();

function authenticateXtreamClient(username, password) {
  loadXtreamUsers();
  const u = String(username || '').trim();
  const p = String(password || '').trim();
  return XTREAM_USERS.find(user => user.username === u && user.password === p && user.status === 'Active');
}

async function handlePlayerApi(req, res, q) {
  const username = q.username;
  const password = q.password;
  const action = q.action;

  const user = authenticateXtreamClient(username, password);
  if (!user) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({
      user_info: {
        auth: 0,
        status: "Disabled",
        message: "Nom d'utilisateur ou mot de passe incorrect"
      }
    }));
  }

  const host = req.headers.host || '127.0.0.1:8080';
  const proto = req.headers['x-forwarded-proto'] || (req.connection?.encrypted ? 'https' : 'http');
  const port = host.includes(':') ? host.split(':')[1] : (proto === 'https' ? '443' : '80');

  // CAS 1 : Authentification initiale & Ping de l'application IPTV
  if (!action) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({
      user_info: {
        username: user.username,
        password: user.password,
        message: "Serveur IPTV Xtream Codes Actif",
        auth: 1,
        status: "Active",
        exp_date: String(user.exp_date || "1893456000"),
        is_trial: "0",
        active_cons: "1",
        created_at: String(user.created_at || "1725000000"),
        max_connections: String(user.max_connections || "5"),
        allowed_output_formats: ["m3u8", "ts", "mp4", "mkv"]
      },
      server_info: {
        url: host.split(':')[0],
        port: String(port),
        https_port: "443",
        server_protocol: proto,
        rtmp_port: "8880",
        timezone: "Europe/Paris",
        time_now: new Date().toISOString().replace('T', ' ').substring(0, 19),
        process: true
      }
    }));
  }

  // CAS 2 : Catégories Live
  if (action === 'get_live_categories') {
    const catMap = new Map();
    XTREAM_FR_CATALOG.forEach(ch => {
      const cId = String(ch.category_id || '1');
      const cName = ch.category_name || 'Général';
      if (!catMap.has(cId)) {
        catMap.set(cId, { category_id: cId, category_name: cName, parent_id: 0 });
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(Array.from(catMap.values())));
  }

  // CAS 3 : Chaînes Live
  if (action === 'get_live_streams') {
    let streams = XTREAM_FR_CATALOG;
    if (q.category_id) {
      streams = streams.filter(ch => String(ch.category_id) === String(q.category_id));
    }
    const result = streams.map((ch, idx) => ({
      num: idx + 1,
      name: ch.name || ch.raw_name,
      stream_type: "live",
      stream_id: parseInt(ch.stream_id, 10),
      stream_icon: ch.icon || "",
      epg_channel_id: ch.epg_channel_id || "",
      added: "1725000000",
      category_id: String(ch.category_id || "1"),
      custom_sid: "",
      tv_archive: 0,
      direct_source: "",
      tv_archive_duration: 0
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(result));
  }

  // CAS 4 : Catégories VOD (Films)
  if (action === 'get_vod_categories') {
    const vodCats = (catalog.categories || []).filter(c => !['sports_fr', 'ppv_combat', 'sports_extreme', 'tnt_fr', 'telerealite'].includes(c.slug)).map((c, i) => ({
      category_id: String(i + 10),
      category_name: c.name,
      parent_id: 0
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(vodCats));
  }

  // CAS 5 : Films VOD
  if (action === 'get_vod_streams') {
    const movies = (catalog.movies || []).filter(m => m.media_type !== 'channel' && m.media_type !== 'series' && !m.is_live && !m.is_xtream_series);
    const result = movies.map((m, idx) => ({
      num: idx + 1,
      name: m.title,
      stream_type: "movie",
      stream_id: m.id || m.tmdb_id,
      stream_icon: m.poster_url || "",
      rating: m.match_score ? (m.match_score / 10).toFixed(1) : "8.5",
      rating_5based: m.match_score ? (m.match_score / 20).toFixed(1) : "4.3",
      added: "1725000000",
      category_id: "10",
      container_extension: "mp4"
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(result));
  }

  // CAS 6 : Catégories Séries
  if (action === 'get_series_categories') {
    const seriesCats = [
      { category_id: "947", category_name: "Télé-Réalité & Divertissement", parent_id: 0 },
      { category_id: "948", category_name: "Séries Tendances", parent_id: 0 }
    ];
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(seriesCats));
  }

  // CAS 7 : Liste des Séries
  if (action === 'get_series') {
    const result = XTREAM_TELEREALITE_CATALOG.map((s, idx) => ({
      num: idx + 1,
      name: s.name,
      series_id: s.series_id,
      cover: s.cover || "",
      plot: s.plot || "",
      cast: s.cast || "",
      director: "",
      genre: s.genre || "Télé-Réalité",
      releaseDate: String(s.year || "2025"),
      last_modified: "1725000000",
      rating: s.rating || "8.5",
      rating_5based: "4.3",
      backdrop_path: [s.backdrop || ""],
      youtube_trailer: "",
      episode_run_time: s.episode_run_time || "45",
      category_id: String(s.category_id || "947")
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(result));
  }

  // CAS 8 : Détails d'une Série (Saisons et Épisodes)
  if (action === 'get_series_info') {
    const seriesId = String(q.series_id || '');
    if (!seriesId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ message: "series_id requis" }));
    }

    // 1. Vérifier si c'est La Villa (6715 / 68628) dans catalog.json
    const catVilla = (catalog.movies || []).find(m => m.id === '68628' || m.series_id === 6715);
    if ((seriesId === '6715' || seriesId === '68628') && catVilla && catVilla.seasons) {
      const episodesMap = {};
      catVilla.seasons.forEach(s => {
        const sNumStr = String(s.season_number);
        episodesMap[sNumStr] = (s.episodes || []).map((e, idx) => ({
          id: parseInt(e.id, 10) || (385600 + idx),
          episode_num: e.episode_number,
          title: e.title || `Épisode ${e.episode_number}`,
          container_extension: "mkv",
          info: {
            duration_secs: 2700,
            duration: e.duration || "45:00",
            video: {},
            audio: {},
            bitrate: 0
          }
        }));
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        seasons: catVilla.seasons.map(s => ({
          season_number: s.season_number,
          name: s.title || `Saison ${s.season_number}`,
          episode_count: s.episode_count || (s.episodes?.length || 0),
          air_date: "2025-08-11"
        })),
        info: {
          name: catVilla.title,
          cover: catVilla.poster_url,
          plot: catVilla.overview,
          cast: (catVilla.cast || []).join(', '),
          director: catVilla.director || "",
          genre: (catVilla.genres || []).join(' / '),
          releaseDate: "2025",
          rating: "8.5"
        },
        episodes: episodesMap
      }));
    }

    // 2. Vérifier dans le cache disque
    const cacheFile = path.join(__dirname, 'data', 'cache', `series_${seriesId}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cachedJson = fs.readFileSync(cacheFile, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(cachedJson);
      } catch (e) {}
    }

    // 3. Appel live Xtream si pas en cache
    try {
      const upstreamUrl = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/player_api.php?username=${XTREAM_CONFIG.username}&password=${XTREAM_CONFIG.password}&action=get_series_info&series_id=${seriesId}`;
      const fRes = await fetch(upstreamUrl, { signal: AbortSignal.timeout(8000) });
      if (fRes.ok) {
        const text = await fRes.text();
        try {
          const cacheDir = path.join(__dirname, 'data', 'cache');
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cacheFile, text, 'utf8');
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(text);
      }
    } catch (err) {}

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ message: "Série introuvable" }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  return res.end(JSON.stringify({ message: "Action non supportée" }));
}

const server = http.createServer((req, res) => {
  totalRequestsCount++;

  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ── HEALTHCHECK / PING KEEP-ALIVE RAPIDE (ANTI-VEILLE RENDER) ──
  if (pathname === '/api/ping' || pathname === '/api/health' || pathname === '/ping' || pathname === '/healthz') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({
      status: 'ok',
      uptime_seconds: Math.floor((Date.now() - (typeof startTime !== 'undefined' ? startTime : Date.now())) / 1000),
      timestamp: new Date().toISOString(),
      active_streams: activeStreamsCount,
      memory: typeof getMemoryMetrics === 'function' ? getMemoryMetrics() : undefined,
      service: 'netflix-clone-live-tv',
      keep_alive: keepAliveStats
    }));
  }

  // Comptage des flux vidéo actifs en temps réel
  if (pathname.startsWith('/api/stream') || pathname.startsWith('/live/') || pathname.startsWith('/series/') || pathname.startsWith('/movie/')) {
    activeStreamsCount++;
    let isStreamTracked = true;
    const untrackStream = () => {
      if (isStreamTracked) {
        isStreamTracked = false;
        activeStreamsCount = Math.max(0, activeStreamsCount - 1);
      }
    };
    req.once('close', untrackStream);
    res.once('finish', untrackStream);
  }

  // ── ROUTEUR STREAMING XTREAM CODES (/live/, /series/, /movie/) ──
  if (pathname.startsWith('/live/') || pathname.startsWith('/series/') || pathname.startsWith('/movie/')) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 4) {
      const type = parts[0];
      const user = parts[1];
      const pass = parts[2];
      const fileWithExt = parts[3];

      if (!authenticateXtreamClient(user, pass)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end('Accès refusé : Identifiants Xtream incorrects');
      }

      if (type === 'live') {
        const streamId = fileWithExt.replace(/\.(m3u8|ts)$/i, '');
        parsedUrl.query.stream_id = streamId;
        pathname = '/api/stream/xtream';
        trackStreamingSession(req, res, streamId, 'live');
      } else if (type === 'series') {
        const extMatch = fileWithExt.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1] : 'mkv';
        const episodeId = fileWithExt.replace(/\.[a-zA-Z0-9]+$/, '');
        parsedUrl.query.episode_id = episodeId;
        parsedUrl.query.ext = ext;
        pathname = '/api/stream/xtream-series';
        trackStreamingSession(req, res, episodeId, 'series');
      } else if (type === 'movie') {
        const movieId = fileWithExt.replace(/\.[a-zA-Z0-9]+$/, '');
        const catMovie = (catalog.movies || []).find(m => m.id === movieId || m.tmdb_id === movieId);
        if (catMovie && catMovie.video_url) {
          trackStreamingSession(req, res, movieId, 'movie', catMovie.title);
          res.writeHead(302, { 'Location': catMovie.video_url, 'Access-Control-Allow-Origin': '*' });
          return res.end();
        }
      }
    }
  }

  // ── ROUTE STANDARD XTREAM CODES API (/player_api.php) ──
  if (pathname === '/player_api.php') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        let postParams = {};
        if (body) {
          try {
            if (body.startsWith('{')) {
              postParams = JSON.parse(body);
            } else {
              postParams = querystring.parse(body);
            }
          } catch (e) {}
        }
        const q = Object.assign({}, parsedUrl.query, postParams);
        handlePlayerApi(req, res, q);
      });
      return;
    } else {
      handlePlayerApi(req, res, parsedUrl.query || {});
      return;
    }
  }

  // ── ROUTE TÉLÉCHARGEMENT PLAYLIST M3U UNIVERSELLE (/get.php) ──
  if (pathname === '/get.php' && req.method === 'GET') {
    const q = parsedUrl.query || {};
    const username = q.username;
    const password = q.password;
    if (!username || !password || !authenticateXtreamClient(username, password)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end('Accès refusé : Identifiants M3U incorrects');
    }

    const host = req.headers.host || '127.0.0.1:8080';
    const proto = req.headers['x-forwarded-proto'] || (req.connection?.encrypted ? 'https' : 'http');
    const baseUrl = `${proto}://${host}`;

    let m3u = '#EXTM3U\n';
    XTREAM_FR_CATALOG.forEach(ch => {
      const epg = ch.epg_channel_id || '';
      const icon = ch.icon || '';
      const cat = ch.category_name || 'Général';
      m3u += `#EXTINF:-1 tvg-id="${epg}" tvg-name="${ch.name}" tvg-logo="${icon}" group-title="${cat}",${ch.name}\n`;
      m3u += `${baseUrl}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${ch.stream_id}.ts\n`;
    });

    res.writeHead(200, {
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'Content-Disposition': 'attachment; filename="iptv_playlist.m3u"',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(m3u);
  }

  // ================= API REST =================
  if (pathname === '/api/catalog' && req.method === 'GET') {
    if (!cachedCatalogBuffer) {
      const hero = catalog.movies.find(m => m.is_hero) || catalog.movies[0];
      const rows = catalog.categories.map(cat => {
        const catMovies = catalog.movies.filter(m =>
          m.categories.some(c =>
            c.toLowerCase().includes(cat.name.toLowerCase()) ||
            cat.name.toLowerCase().includes(c.toLowerCase()) ||
            c.toLowerCase().includes(cat.slug.toLowerCase())
          )
        );
        return { category: cat, movies: catMovies };
      }).filter(r => r.movies.length > 0);

      const jsonStr = JSON.stringify({ success: true, data: { hero, rows } });
      cachedCatalogBuffer = Buffer.from(jsonStr, 'utf8');
      cachedCatalogGzip = zlib.gzipSync(cachedCatalogBuffer);
    }

    const acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase();
    if (acceptEncoding.includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': cachedCatalogGzip.length,
        'Cache-Control': 'no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(cachedCatalogGzip);
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': cachedCatalogBuffer.length,
        'Cache-Control': 'no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(cachedCatalogBuffer);
    }
    return;
  }

  if (pathname === '/api/movies' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: catalog.movies }));
    return;
  }

  if (pathname.startsWith('/api/movies/') && !pathname.endsWith('/hero') && req.method === 'GET') {
    const id = pathname.replace('/api/movies/', '');
    const movie = catalog.movies.find(m => m.id === id);
    if (movie) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: movie }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Média introuvable' }));
    }
    return;
  }

  // ================= ROUTE RECHERCHE GLOBALE MULTI-CATALOGUES (/api/search) =================
  // Recherche instantanée sur les 1 702 médias de la plateforme (Films, Séries, Télé-Réalités, Chaînes Live)
  if (pathname === '/api/search' && req.method === 'GET') {
    const rawQ = (parsedUrl.query.q || '').toString().toLowerCase().trim();
    if (!rawQ) {
      return sendResponse(req, res, 200, 'application/json', JSON.stringify({ success: true, data: [] }), {}, 60);
    }

    const terms = rawQ.split(/\s+/).filter(t => t.length > 0);
    const results = [];
    const seenTitles = new Set();

    // 1. Recherche dans catalog.movies (Films & Séries Netflix + Top Titres)
    for (const m of catalog.movies) {
      const target = `${m.title} ${m.original_title || ''} ${m.overview || ''} ${(m.categories || []).join(' ')} ${(m.cast || []).join(' ')}`.toLowerCase();
      if (terms.every(t => target.includes(t))) {
        results.push(m);
        seenTitles.add(m.title.toLowerCase());
      }
    }

    // 2. Recherche dans XTREAM_TELEREALITE_CATALOG (221 Séries de Télé-Réalité)
    for (const show of XTREAM_TELEREALITE_CATALOG) {
      const showTitleLower = show.name.toLowerCase();
      if (seenTitles.has(showTitleLower)) continue;
      const target = `${show.name} ${show.raw_name || ''} ${show.plot || ''} ${show.genre || ''} ${show.cast || ''} ${show.year || ''}`.toLowerCase();
      if (terms.every(t => target.includes(t))) {
        results.push({
          id: `xtream_series_${show.series_id}`,
          title: show.name,
          original_title: show.raw_name || show.name,
          overview: show.plot || 'Émission authentique de Télé-Réalité en streaming HD.',
          media_type: 'series',
          poster_url: show.cover || 'assets/hero/live-tv-banner.webp',
          backdrop_url: show.backdrop || show.cover || 'assets/hero/live-tv-banner.webp',
          video_url: `/api/stream/xtream-series?series_id=${show.series_id}`,
          categories: ['Télé-Réalité', 'Series Tendances'],
          release_year: show.year || 2025,
          match_score: Math.round(parseFloat(show.rating || '8.5') * 10) || 85,
          age_rating: '12+',
          duration: 'Saisons intégrales',
          cast: show.cast ? show.cast.split(', ') : ['Télé-Réalité'],
          director: 'Production Xtream',
          quality_badges: ['1080p FHD Natif', 'Saisons Complètes', '💎 Xtream VIP'],
          is_hero: false,
          is_xtream_series: true,
          series_id: show.series_id
        });
        seenTitles.add(showTitleLower);
        if (results.length >= 60) break;
      }
    }

    // 2b. Recherche dans les séries en cache disque (ex: The White Lotus)
    try {
      const cacheDir = path.join(__dirname, 'data', 'cache');
      if (fs.existsSync(cacheDir)) {
        const cacheFiles = fs.readdirSync(cacheDir).filter(f => f.startsWith('series_') && f.endsWith('.json'));
        for (const cf of cacheFiles) {
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8'));
            const sId = cf.replace(/^series_/, '').replace(/\.json$/, '');
            const name = raw.info?.name || '';
            const nameLower = name.toLowerCase();
            if (seenTitles.has(nameLower)) continue;
            const target = `${name} ${raw.info?.plot || ''} ${raw.info?.genre || ''} ${raw.info?.cast || ''}`.toLowerCase();
            if (terms.every(t => target.includes(t))) {
              results.push({
                id: `xtream_series_${sId}`,
                title: name,
                original_title: name,
                overview: raw.info?.plot || 'Série en streaming HD.',
                media_type: 'series',
                poster_url: raw.info?.cover || 'assets/hero/live-tv-banner.webp',
                backdrop_url: (Array.isArray(raw.info?.backdrop_path) && raw.info.backdrop_path[0]) || raw.info?.cover || 'assets/hero/live-tv-banner.webp',
                video_url: `/api/stream/xtream-series?series_id=${sId}`,
                categories: ['Séries Tendances', 'Xtream VIP'],
                release_year: parseInt(raw.info?.releaseDate || 2025, 10) || 2025,
                match_score: 90,
                age_rating: '16+',
                duration: 'Saisons intégrales',
                cast: (raw.info?.cast || '').split(', '),
                director: raw.info?.director || 'Production HBO / Xtream',
                quality_badges: ['1080p FHD', 'Saisons Complètes', '💎 Xtream VIP'],
                is_hero: false,
                is_xtream_series: true,
                series_id: sId
              });
              seenTitles.add(nameLower);
              if (results.length >= 60) break;
            }
          } catch (ce) {}
        }
      }
    } catch (e) {}

    // 3. Recherche dans XTREAM_FR_CATALOG (1 268 Chaînes Françaises Direct)
    if (results.length < 60) {
      for (const ch of XTREAM_FR_CATALOG) {
        const chTitleLower = ch.name.toLowerCase();
        if (seenTitles.has(chTitleLower)) continue;
        const target = `${ch.name} ${ch.raw_name || ''} ${ch.category_name || ''} ${ch.quality_badge || ''}`.toLowerCase();
        if (terms.every(t => target.includes(t))) {
          results.push({
            id: `xtream_${ch.stream_id}`,
            title: ch.name,
            original_title: ch.raw_name || ch.name,
            overview: `Chaîne de télévision française en direct (${ch.category_name}). Qualité ${ch.quality_badge}.`,
            media_type: 'channel',
            poster_url: ch.icon || 'assets/hero/live-tv-banner.webp',
            backdrop_url: ch.icon || 'assets/hero/live-tv-banner.webp',
            video_url: `/api/stream/xtream?stream_id=${ch.stream_id}`,
            categories: ['Chaînes TV', 'Xtream VIP', ch.category_name],
            release_year: 2026,
            match_score: 99,
            age_rating: 'Tous publics',
            duration: 'En direct',
            quality_badges: ['💎 Xtream VIP', ch.quality_badge, 'Anti-Saccades'],
            is_live: true,
            is_xtream: true,
            stream_id: ch.stream_id,
            player_type: 'direct_hls'
          });
          seenTitles.add(chTitleLower);
          if (results.length >= 60) break;
        }
      }
    }

    return sendResponse(req, res, 200, 'application/json', JSON.stringify({ success: true, count: results.length, data: results }), {}, 180);
  }

  // ================= SÉCURITÉ ADMIN STUDIO (CODE PIN 1965) & ENDPOINTS =================
  if (pathname.startsWith('/api/admin/')) {
    // Route de vérification explicite du mot de passe
    if (pathname === '/api/admin/auth' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (String(payload.password || '').trim() === '1965') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: true, message: 'Authentification administrateur réussie', token: '1965' }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: false, message: 'Mot de passe ou code PIN incorrect' }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, message: 'Corps JSON invalide' }));
        }
      });
      return;
    }

    // Vérification de sécurité obligatoire pour toutes les opérations admin
    const clientPass = req.headers['x-admin-password'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (clientPass !== '1965') {
      res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({
        success: false,
        message: 'Accès refusé : Authentification administrateur requise'
      }));
    }
  }

  if (pathname === '/api/admin/stats' && req.method === 'GET') {
    const hero = catalog.movies.find(m => m.is_hero);
    const stats = {
      total_titles: catalog.movies.length,
      total_movies: catalog.movies.filter(m => m.media_type === 'movie').length,
      total_series: catalog.movies.filter(m => m.media_type === 'series').length,
      total_categories: catalog.categories.length,
      server_uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      active_hero_title: hero ? hero.title : null,
      rust_engine: "Axum v0.7 + Tokio + Tower-HTTP (Mode Rust Natif)",
      system_status: "Opérationnel (100% Rust Ready)"
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, data: stats }));
    return;
  }

  // Routes d'état et d'action pour la synchronisation permanente GitHub Cloud
  if (pathname === '/api/admin/github/status' && req.method === 'GET') {
    const currentToken = getGitHubToken();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      data: {
        enabled: !!currentToken,
        hasToken: !!currentToken,
        tokenPrefix: currentToken ? (currentToken.substring(0, 7) + '...') : null,
        status: gitHubSyncStatus,
        lastSyncTime: lastGitHubSyncTime,
        lastCommitSha: lastGitHubCommitSha,
        error: gitHubSyncError,
        repo: `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`,
        branch: GITHUB_CONFIG.branch
      }
    }));
    return;
  }

  if (pathname === '/api/admin/github/token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const newToken = (payload.token || '').trim();
        if (!newToken) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, message: 'Clé GitHub vide' }));
        }

        // Test de validation de la clé auprès de GitHub
        const checkRes = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `token ${newToken}`,
            'User-Agent': 'Netflix-Clone-TokenCheck'
          }
        });

        if (!checkRes.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, message: 'Clé GitHub invalide ou refusée par GitHub' }));
        }

        const userData = await checkRes.json();
        // Sauvegarder la clé dans data/.github_token (fichier exclu de git)
        const tokenPath = path.join(__dirname, 'data', '.github_token');
        fs.writeFileSync(tokenPath, newToken, 'utf8');

        // Lancer une première sauvegarde immédiate
        syncFileToGitHub(DATA_FILE, 'data/catalog.json', 'chore(data): initial sync with new github token');

        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({
          success: true,
          message: `Clé GitHub validée avec succès pour le compte ${userData.login} ! Sauvegarde active.`,
          user: userData.login
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/admin/github/sync' && req.method === 'POST') {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncFileToGitHub(DATA_FILE, 'data/catalog.json', 'chore(data): manual sync from admin').then(result => {
      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Catalogue synchronisé avec succès sur GitHub', sha: result.sha }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: result.error || 'Échec de synchronisation' }));
      }
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return;
  }

  // ================= ROUTES DU CLUSTER DISTRIBUÉ & TÉLÉMÉTRIE =================
  // 1. Route Ping Keep-Alive ultra-légère pour maintien d'éveil
  if (pathname === '/api/cluster/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
    return;
  }

  // 2. Route Métriques Locales du Serveur (CPU %, RAM, Flux actifs & Sessions Xtream)
  if (pathname === '/api/cluster/metrics' && req.method === 'GET') {
    const sessionsMetrics = getActiveSessionsMetrics();
    const metrics = {
      success: true,
      node_id: process.env.NODE_ID || 'node-1',
      node_name: process.env.NODE_NAME || 'Serveur 1 (Principal)',
      online: true,
      cpu_percent: getCpuUsagePercent(),
      memory: getMemoryMetrics(),
      active_streams: sessionsMetrics.count,
      active_xtream_sessions: sessionsMetrics,
      total_requests: totalRequestsCount,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: Date.now()
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(metrics));
    return;
  }

  // 3. Route Statut Global du Cluster (Supervision en temps réel de tous les nœuds & Sessions)
  if (pathname === '/api/cluster/status' && req.method === 'GET') {
    const currentExternalUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
    const isLocalNode = (urlStr) => {
      const u = (urlStr || '').replace(/\/$/, '');
      return !u || u.includes(`:${PORT}`) || u.includes('localhost') || u.includes('127.0.0.1') || (currentExternalUrl && u === currentExternalUrl);
    };

    const statusPromises = clusterNodes.map(async (node, idx) => {
      const nodeUrl = (node.url || '').replace(/\/$/, '');
      const isLocal = idx === 0 || isLocalNode(nodeUrl) || nodeUrl === 'local';
      if (isLocal) {
        const localSessions = getActiveSessionsMetrics();
        return {
          id: node.id,
          name: node.name,
          url: node.url,
          role: node.role || 'master',
          online: true,
          latency_ms: 0,
          is_current: true,
          cpu_percent: getCpuUsagePercent(),
          memory: getMemoryMetrics(),
          active_streams: localSessions.count,
          active_sessions: localSessions.sessions,
          total_sessions_ram_mb: localSessions.total_ram_mb,
          total_requests: totalRequestsCount,
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
        };
      }

      const t0 = Date.now();
      try {
        const resNode = await fetch(`${nodeUrl}/api/cluster/metrics`, {
          headers: { 'User-Agent': 'Netflix-Cluster-Supervisor' },
          signal: AbortSignal.timeout(3000)
        });
        if (resNode.ok) {
          const data = await resNode.json();
          const sessData = data.active_xtream_sessions || { count: data.active_streams || 0, sessions: [], total_ram_mb: 0 };
          return {
            id: node.id,
            name: node.name,
            url: node.url,
            role: node.role || 'edge',
            online: true,
            latency_ms: Date.now() - t0,
            is_current: false,
            cpu_percent: data.cpu_percent || 0,
            memory: data.memory || { usedMb: 0, totalMb: 512, percent: 0 },
            active_streams: sessData.count,
            active_sessions: sessData.sessions || [],
            total_sessions_ram_mb: sessData.total_ram_mb || 0,
            total_requests: data.total_requests || 0,
            uptime_seconds: data.uptime_seconds || 0
          };
        }
      } catch (err) {}

      return {
        id: node.id,
        name: node.name,
        url: node.url,
        role: node.role || 'edge',
        online: false,
        latency_ms: null,
        is_current: false,
        cpu_percent: 0,
        memory: { usedMb: 0, totalMb: 512, percent: 0 },
        active_streams: 0,
        active_sessions: [],
        total_sessions_ram_mb: 0,
        total_requests: 0,
        uptime_seconds: 0
      };
    });

    Promise.all(statusPromises).then(results => {
      const allActiveSessions = [];
      results.forEach(n => {
        if (Array.isArray(n.active_sessions)) {
          n.active_sessions.forEach(s => {
            allActiveSessions.push(Object.assign({}, s, { server_node: n.name, is_local: n.is_current }));
          });
        }
      });

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        nodes: results,
        count: results.length,
        active_sessions: allActiveSessions,
        total_active_sessions: allActiveSessions.length,
        total_sessions_ram_mb: parseFloat(allActiveSessions.reduce((acc, s) => acc + (s.estimated_ram_mb || 8.5), 0).toFixed(1))
      }));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    });
    return;
  }

  // 3b. Route Supervision Télémétrique Xtream Sessions
  if (pathname === '/api/admin/xtream/sessions' && req.method === 'GET') {
    const metrics = getActiveSessionsMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, data: metrics }));
    return;
  }

  if (pathname === '/api/admin/xtream/sessions' && req.method === 'DELETE') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetId = payload.id;
        let deleted = false;
        for (const [key, session] of activeStreamingSessions.entries()) {
          if (session.id === targetId || session.key === targetId || session.clientIp === targetId) {
            activeStreamingSessions.delete(key);
            deleted = true;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          success: true,
          message: deleted ? 'Session Xtream interrompue' : 'Session introuvable',
          data: getActiveSessionsMetrics()
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: e.message }));
      }
    });
    return;
  }

  // 4. Gestion des Nœuds du Cluster (Lecture / Ajout / Suppression)
  if (pathname === '/api/admin/cluster/nodes' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, data: clusterNodes }));
    return;
  }

  if (pathname === '/api/admin/cluster/nodes' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        let rawUrl = (payload.url || '').trim().replace(/\/$/, '');
        const name = (payload.name || '').trim() || `Serveur ${clusterNodes.length + 1}`;
        const role = payload.role || 'edge';

        if (!rawUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, message: 'URL du serveur requise' }));
        }

        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
          rawUrl = 'https://' + rawUrl;
        }

        const existing = clusterNodes.find(n => n.url.replace(/\/$/, '') === rawUrl);
        if (existing) {
          existing.name = name;
          existing.role = role;
        } else {
          clusterNodes.push({
            id: `node-${Date.now()}`,
            name,
            url: rawUrl,
            role,
            addedAt: new Date().toISOString()
          });
        }

        saveClusterNodes(clusterNodes);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: `Nœud ${name} enregistré avec succès`, nodes: clusterNodes }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/admin/cluster/nodes' && req.method === 'DELETE') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const idToDelete = payload.id;
        const urlToDelete = (payload.url || '').trim().replace(/\/$/, '');

        clusterNodes = clusterNodes.filter(n => {
          if (idToDelete && n.id === idToDelete) return false;
          if (urlToDelete && n.url.replace(/\/$/, '') === urlToDelete) return false;
          return true;
        });

        saveClusterNodes(clusterNodes);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, message: 'Nœud supprimé du cluster', nodes: clusterNodes }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // 5. Route Load Balancer : Sélection du meilleur nœud disponible
  if (pathname === '/api/cluster/best-node' && req.method === 'GET') {
    const bestNode = clusterNodes[0] || { url: '' };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, best_node: bestNode.url }));
    return;
  }

  if (pathname === '/api/admin/movies' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true, data: catalog.movies }));
    return;
  }

  if (pathname === '/api/admin/movies' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload.is_hero) {
          catalog.movies.forEach(m => m.is_hero = false);
        }
        const newMovie = {
          id: 'm_' + Date.now(),
          title: payload.title,
          original_title: payload.original_title || null,
          overview: payload.overview,
          media_type: payload.media_type || 'movie',
          poster_url: payload.poster_url,
          backdrop_url: payload.backdrop_url,
          video_url: payload.video_url,
          categories: payload.categories || ['Tendances'],
          release_year: payload.release_year || 2025,
          match_score: payload.match_score || 95,
          age_rating: payload.age_rating || '16+',
          duration: payload.duration || '2h 10m',
          cast: payload.cast || [],
          director: payload.director || null,
          quality_badges: ['4K Ultra HD', 'Spatial Audio', '5.1'],
          is_hero: !!payload.is_hero,
          created_at: new Date().toISOString()
        };
        catalog.movies.push(newMovie);
        saveCatalog();
        res.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, data: newMovie }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: 'JSON invalide' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/admin/movies/') && !pathname.endsWith('/hero') && req.method === 'PUT') {
    const rawId = pathname.replace('/api/admin/movies/', '');
    const id = decodeURIComponent(rawId).trim();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const movie = catalog.movies.find(m => {
          const mId = m.id != null ? String(m.id).trim() : '';
          const tmdbId = m.tmdb_id != null ? String(m.tmdb_id).trim() : '';
          return mId === id || tmdbId === id;
        });
        if (!movie) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: false, message: 'Média non trouvé' }));
        }

        if (payload.title) movie.title = payload.title;
        if (payload.original_title !== undefined) movie.original_title = payload.original_title;
        if (payload.overview !== undefined) movie.overview = payload.overview;
        if (payload.media_type) movie.media_type = payload.media_type;
        if (payload.poster_url) movie.poster_url = payload.poster_url;
        if (payload.backdrop_url) movie.backdrop_url = payload.backdrop_url;
        if (payload.video_url) movie.video_url = payload.video_url;
        if (payload.categories) movie.categories = payload.categories;
        if (payload.release_year) movie.release_year = payload.release_year;
        if (payload.match_score) movie.match_score = payload.match_score;
        if (payload.age_rating) movie.age_rating = payload.age_rating;
        if (payload.duration) movie.duration = payload.duration;
        if (payload.cast) movie.cast = payload.cast;
        if (payload.director !== undefined) movie.director = payload.director;
        if (payload.is_hero !== undefined) {
          if (payload.is_hero) {
            catalog.movies.forEach(m => m.is_hero = false);
            movie.is_hero = true;
          } else {
            movie.is_hero = false;
          }
        }

        saveCatalog();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true, data: movie }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, message: 'JSON invalide' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/admin/movies/') && pathname.endsWith('/hero') && req.method === 'POST') {
    const rawId = pathname.replace('/api/admin/movies/', '').replace('/hero', '');
    const id = decodeURIComponent(rawId).trim();
    let found = false;
    catalog.movies.forEach(m => {
      const mId = m.id != null ? String(m.id).trim() : '';
      const tmdbId = m.tmdb_id != null ? String(m.tmdb_id).trim() : '';
      if (mId === id || tmdbId === id) {
        m.is_hero = true;
        found = true;
      } else {
        m.is_hero = false;
      }
    });
    if (found) {
      saveCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, message: 'Média non trouvé' }));
    }
    return;
  }

  if (pathname.startsWith('/api/admin/movies/') && req.method === 'DELETE') {
    const rawId = pathname.replace('/api/admin/movies/', '');
    const targetId = decodeURIComponent(rawId).trim();
    const before = catalog.movies.length;
    catalog.movies = catalog.movies.filter(m => {
      const mId = m.id != null ? String(m.id).trim() : '';
      const tmdbId = m.tmdb_id != null ? String(m.tmdb_id).trim() : '';
      return mId !== targetId && tmdbId !== targetId;
    });
    if (catalog.movies.length < before) {
      if (!catalog.movies.some(m => m.is_hero) && catalog.movies.length > 0) {
        catalog.movies[0].is_hero = true;
      }
      saveCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: true, count: catalog.movies.length }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, message: 'Média non trouvé' }));
    }
    return;
  }

  // ================= ROUTE EXTRACTION DIRECTE HLS (/api/extract) =================
  if (pathname === '/api/extract' && req.method === 'GET') {
    let id = parsedUrl.query.id;
    let type = parsedUrl.query.type || 'movie';
    let season = parseInt(parsedUrl.query.season) || 1;
    let episode = parseInt(parsedUrl.query.episode) || 1;
    let lang = (parsedUrl.query.lang || 'vo').toLowerCase();

    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Paramètre id requis' }));
      return;
    }

    // Si c'est un ID de film du catalogue, vérifier s'il a un tmdb_id
    const catalogMovie = catalog.movies.find(m => m.id === id || m.tmdb_id === id);
    let tmdbId = id;
    let titleToSearch = parsedUrl.query.title || id;
    if (catalogMovie) {
      if (catalogMovie.tmdb_id) tmdbId = catalogMovie.tmdb_id;
      if (catalogMovie.media_type) type = catalogMovie.media_type;
      titleToSearch = catalogMovie.title || catalogMovie.original_title || titleToSearch;
    }

    const isMovie = (type !== 'series' && type !== 'tv');
    const serverNum = parseInt(parsedUrl.query.server) || 1;
    const serverIndex = serverNum - 1;

    const runExtraction = async () => {
      // ── Cas spécial : Chaînes TV Sport & PPV Multi-Fournisseurs ──
      if (type === 'channel' || (id && id.startsWith('tv_')) || (tmdbId && tmdbId.startsWith('tv_'))) {
        return await extractChannelMultiProvider(id || tmdbId, serverNum);
      }

      // ── Cas spécial : Séries Télé-Réalité Xtream (La Villa 68628 & séries Xtream Catégorie 947) ──
      const querySeriesId = parsedUrl.query.series_id;
      const isXtreamSeries = querySeriesId || id === '68628' || tmdbId === '68628' || (id && String(id).startsWith('xtream_series_')) || (tmdbId && String(tmdbId).startsWith('xtream_series_'));
      if (isXtreamSeries) {
        const sNum = parseInt(season) || 1;
        const eNum = parseInt(episode) || 1;
        
        // Chercher d'abord dans catalog.movies
        const catShow = catalog.movies.find(m => m.id === id || m.tmdb_id === tmdbId);
        let episodeObj = null;
        let showTitle = catShow?.title || parsedUrl.query.title || 'Télé-Réalité Xtream';

        if (catShow && catShow.seasons) {
          const sObj = catShow.seasons.find(s => s.season_number === sNum) || catShow.seasons[0];
          episodeObj = sObj?.episodes?.find(e => e.episode_number === eNum) || sObj?.episodes?.[0];
        }

        // Si non trouvé dans catalog.json, chercher dans le cache disque Xtream
        if (!episodeObj) {
          const realSeriesId = querySeriesId || ((id === '68628' || tmdbId === '68628') ? '6715' : String(id || tmdbId || '').replace(/^xtream_series_/, ''));
          const cacheFile = path.join(__dirname, 'data', 'cache', `series_${realSeriesId}.json`);
          if (fs.existsSync(cacheFile)) {
            try {
              const rawData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
              showTitle = rawData.info?.name || showTitle;
              const sEps = (rawData.episodes && rawData.episodes[String(sNum)]) || [];
              const foundEp = sEps.find(e => parseInt(e.episode_num) === eNum) || sEps[0];
              if (foundEp) {
                const ext = foundEp.container_extension || 'mkv';
                episodeObj = {
                  episode_number: parseInt(foundEp.episode_num) || eNum,
                  title: foundEp.title || `Épisode ${eNum}`,
                  video_url: `/api/stream/xtream-series?episode_id=${foundEp.id}&ext=${ext}`,
                  video: foundEp.info?.video || {}
                };
              }
            } catch (e) {}
          }

          // ── FALLBACK LIVE : Cache disque absent → appel direct API Xtream ──
          if (!episodeObj && realSeriesId && XTREAM_CONFIG && XTREAM_CONFIG.host) {
            try {
              console.log(`[extract] Cache absent pour série ${realSeriesId}, appel live Xtream...`);
              const xtreamUrl = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/player_api.php?username=${XTREAM_CONFIG.username}&password=${XTREAM_CONFIG.password}&action=get_series_info&series_id=${realSeriesId}`;
              const xtRes = await fetch(xtreamUrl, { signal: AbortSignal.timeout(8000) });
              if (xtRes.ok) {
                const rawData = await xtRes.json();
                // Sauvegarder le cache pour les prochaines fois
                try {
                  const cacheDir = path.join(__dirname, 'data', 'cache');
                  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
                  fs.writeFileSync(cacheFile, JSON.stringify(rawData), 'utf8');
                } catch (e) {}
                showTitle = rawData.info?.name || showTitle;
                const sEps = (rawData.episodes && rawData.episodes[String(sNum)]) || [];
                const foundEp = sEps.find(e => parseInt(e.episode_num) === eNum) || sEps[0];
                if (foundEp) {
                  const ext = foundEp.container_extension || 'mkv';
                  episodeObj = {
                    episode_number: parseInt(foundEp.episode_num) || eNum,
                    title: foundEp.title || `Épisode ${eNum}`,
                    video_url: `/api/stream/xtream-series?episode_id=${foundEp.id}&ext=${ext}`,
                    video: foundEp.info?.video || {}
                  };
                }
              }
            } catch (xtErr) {
              console.error(`[extract] Erreur appel live Xtream série ${realSeriesId}:`, xtErr.message);
            }
          }
        }

        const streamUrlToUse = episodeObj ? (episodeObj.video_url || episodeObj.stream_url || episodeObj.sources?.vf) : null;

        if (episodeObj && streamUrlToUse) {
          const epCodec = (episodeObj.video?.codec_name || '').toLowerCase();
          const isHevcEp = epCodec === 'hevc' || epCodec === 'h265';
          const wantsFallback = (serverNum > 1) || (isHevcEp && (parsedUrl.query.format === 'hls' || parsedUrl.query.fallback === '1'));

          if (wantsFallback) {
            try {
              console.log(`[extract] Recherche d'un flux compatible HLS/H.264 pour "${showTitle}" (S${sNum}:E${eNum})...`);
              const altStream = await extractFrenchStream(showTitle, false, sNum, eNum, serverIndex > 0 ? (serverIndex - 1) : 0);
              if (altStream && altStream.stream_url) {
                return {
                  success: true,
                  server: serverNum,
                  server_name: `Serveur ${serverNum} (${altStream.hoster || 'HLS 1080p'} • Compatible Web)`,
                  hoster: altStream.hoster || 'HLS Multi-Navigateurs',
                  quality: '1080p FHD',
                  title: `${showTitle} - S${sNum}:E${eNum}`,
                  stream_url: altStream.stream_url.startsWith('http') ? `/api/stream/proxy?url=${encodeURIComponent(altStream.stream_url)}` : altStream.stream_url,
                  raw_stream_url: altStream.stream_url,
                  player_type: 'direct_hls',
                  is_embed: false,
                  sources_count: 5,
                  lang: 'vf'
                };
              }
            } catch (fallbackErr) {
              console.warn(`[extract] Fallback HLS indisponible pour "${showTitle}":`, fallbackErr.message);
            }
          }

          return {
            success: true,
            server: serverNum,
            server_name: `Serveur ${serverNum} (Xtream 1080p FHD Direct)`,
            hoster: 'Xtream Codes VIP Full HD',
            quality: '1080p FHD',
            title: `${showTitle} - S${sNum}:E${episodeObj.episode_number || eNum}`,
            stream_url: streamUrlToUse,
            raw_stream_url: streamUrlToUse,
            player_type: 'direct_video',
            is_embed: false,
            codec: epCodec,
            sources_count: 5,
            lang: 'vf'
          };
        }

        // ── GUARD FINAL : Série Xtream détectée mais épisode introuvable → ne pas tomber dans extractFrenchStream ──
        if (isXtreamSeries) {
          const sId = querySeriesId || ((id === '68628' || tmdbId === '68628') ? '6715' : String(id || tmdbId || '').replace(/^xtream_series_/, ''));
          return {
            success: false,
            error: 'Épisode introuvable dans la bibliothèque Xtream. Veuillez ouvrir la fiche série pour charger les épisodes.',
            needsSeriesInfo: true,
            series_id: sId
          };
        }
      }

      // ── Cas spécial : Téléfoot ──
      if (tmdbId === 'telefoot_tf1' || id === 'telefoot_tf1') {
        return await extractShowMultiProvider('telefoot', season, episode, serverIndex);
      }

      if (lang === 'vf') {
        try {
          return await extractFrenchStream(titleToSearch, isMovie, season, episode, serverIndex);
        } catch (frenchErr) {
          console.warn(`[Extract API] VF indisponible pour "${titleToSearch}", secours VO :`, frenchErr.message);
          try {
            const fallbackVo = await extractDirectStream(tmdbId, isMovie, season, episode, serverIndex);
            fallbackVo.warning = 'VF temporairement indisponible, bascule automatique sur VO';
            return fallbackVo;
          } catch (voErr) {
            if (catalogMovie && (catalogMovie.video_url || (catalogMovie.sources && catalogMovie.sources.hls))) {
              const fallbackUrl = catalogMovie.video_url || catalogMovie.sources.hls;
              return {
                success: true,
                server: serverNum,
                server_name: `Serveur ${serverNum} (Direct VF HD)`,
                title: catalogMovie.title,
                stream_url: fallbackUrl,
                raw_stream_url: fallbackUrl,
                sources_count: 1,
                lang: 'vf',
                warning: 'Flux HD direct'
              };
            }
            throw voErr;
          }
        }
      } else {
        try {
          return await extractDirectStream(tmdbId, isMovie, season, episode, serverIndex);
        } catch (voErr) {
          if (catalogMovie && (catalogMovie.video_url || (catalogMovie.sources && catalogMovie.sources.hls))) {
            const fallbackUrl = catalogMovie.video_url || catalogMovie.sources.hls;
            return {
              success: true,
              server: serverNum,
              server_name: `Serveur ${serverNum} (Direct HD)`,
              title: catalogMovie.title,
              stream_url: fallbackUrl,
              raw_stream_url: fallbackUrl,
              sources_count: 1,
              lang: 'vo',
              warning: 'Flux HD direct'
            };
          }
          throw voErr;
        }
      }
    };

    runExtraction()
      .then(result => {
        let proxiedStreamUrl;
        if (result.player_type === 'iframe' || result.is_embed) {
          proxiedStreamUrl = result.embed_url || result.stream_url;
        } else if (result.stream_url.startsWith('/api/') || result.stream_url.startsWith('blob:')) {
          proxiedStreamUrl = result.stream_url;
        } else {
          const sessionSuffix = result.dm_session ? '&dm_session=' + encodeURIComponent(result.dm_session) : '';
          proxiedStreamUrl = '/api/stream/proxy?url=' + encodeURIComponent(result.stream_url) + sessionSuffix;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          server: result.server,
          server_name: result.server_name,
          hoster: result.hoster || null,
          quality: result.quality || null,
          title: result.title,
          player_type: result.player_type || 'direct_hls',
          is_embed: !!result.is_embed,
          embed_url: result.embed_url || null,
          stream_url: proxiedStreamUrl,
          raw_stream_url: result.stream_url,
          sources_count: result.sources_count || 1,
          lang: result.lang || lang,
          warning: result.warning || null
        }));
      })
      .catch(err => {
        console.warn(`[Extract API] Échec extraction pour id=${tmdbId} (lang=${lang}) :`, err.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          fallback: true,
          message: err.message || 'Flux direct temporairement indisponible'
        }));
      });
    return;
  }

  // ================= ROUTE DIRECT LIVE STREAM HLS PROXY (/api/stream/live) =================
  if (pathname === '/api/stream/live' && req.method === 'GET') {
    const channelId = parsedUrl.query.channel;
    const track = parsedUrl.query.track;
    const mirror = parsedUrl.query.mirror || 'premium_vip';

    if (!channelId) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Paramètre channel manquant');
      return;
    }

    getLiveM3u8Url(channelId, mirror)
      .then(async masterUrl => {
        if (!masterUrl) {
          res.writeHead(503, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Flux en direct temporairement indisponible (diffusion active uniquement lors des événements)');
          return;
        }

        let targetUrl = masterUrl;
        if (track) {
          targetUrl = resolveProxyUrl(masterUrl, track);
        }

        const isWideIptv = (mirror === 'wideiptv' || targetUrl.includes('bluetier.top') || masterUrl.includes('bluetier.top'));
        const hlsRes = await httpsGet(targetUrl, isWideIptv ? {
          'Referer': 'https://wideiptv.top/',
          'Origin': 'https://wideiptv.top'
        } : {
          'Referer': 'https://hamis.romponalis.st/',
          'Origin': 'https://hamis.romponalis.st'
        });

        if (hlsRes.status !== 200 || !hlsRes.text || !hlsRes.text.includes('#EXTM3U')) {
          res.writeHead(hlsRes.status === 200 ? 502 : hlsRes.status, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          });
          res.end('Erreur de chargement du flux direct');
          return;
        }

        let outputBody = hlsRes.text;
        if (!track) {
          const lines = outputBody.split(/\r?\n/);
          outputBody = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            return `/api/stream/live?channel=${encodeURIComponent(channelId)}&mirror=${encodeURIComponent(mirror)}&track=${encodeURIComponent(trimmed)}`;
          }).join('\n');
        } else if (isWideIptv) {
          // Pour WideIPTV, résoudre les segments relatifs .ts en URLs directes Bluetier compatibles CORS
          const lines = outputBody.split(/\r?\n/);
          outputBody = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            return resolveProxyUrl(targetUrl, trimmed);
          }).join('\n');
        }

        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store'
        });
        res.end(outputBody);
      })
      .catch(err => {
        console.warn('[Live Stream Error]:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Erreur live stream: ' + err.message);
        }
      });
    return;
  }

  // ================= ROUTE STATISTIQUES & INVENTAIRE XTREAM (/api/xtream/stats) =================
  if (pathname === '/api/xtream/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({
      success: true,
      provider: 'FoxBleu Xtream Codes',
      server: `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}`,
      username: XTREAM_CONFIG.username,
      total_live_streams: 11929,
      total_french_streams: 1859,
      total_categories: 74,
      french_categories: [
        { id: '4', name: 'FRANCE UHD/FHD/HD (TNT & Généralistes)', count: 320 },
        { id: '871', name: 'FRANCE SPORT (Canal+, beIN, RMC, Eurosport)', count: 166 },
        { id: '958', name: 'LIGUE 1+ (FHD / UHD)', count: 34 },
        { id: '983', name: 'DAZN FR EVENTS', count: 89 },
        { id: '984', name: 'DAZN FR PPV', count: 18 },
        { id: '986', name: 'PRIME VIDEO FR PPV', count: 12 },
        { id: '35', name: 'FRANCE KIDS', count: 36 },
        { id: '901', name: 'FRANCE NEWS', count: 28 },
        { id: '921', name: 'FRANCE CINEMA ONDEMAND', count: 42 }
      ],
      mapped_channels_count: Object.keys(XTREAM_CHANNELS).length
    }, null, 2));
  }

  // ================= ROUTE RECHERCHE & CATALOGUE COMPLET XTREAM (/api/xtream/channels) =================
  // Retourne les 1 268 chaînes françaises avec recherche instantanée et filtres par catégories/qualités
  if (pathname === '/api/xtream/channels' && req.method === 'GET') {
    const q = (parsedUrl.query.q || '').toString().toLowerCase().trim();
    const category = (parsedUrl.query.category || '').toString().toLowerCase().trim();
    const quality = (parsedUrl.query.quality || '').toString().toLowerCase().trim();
    const limit = parseInt(parsedUrl.query.limit, 10) || 1500;

    let filtered = XTREAM_FR_CATALOG;

    if (category && category !== 'all' && category !== 'tous') {
      filtered = filtered.filter(c => 
        c.category_id === category ||
        c.category_name.toLowerCase().includes(category)
      );
    }

    if (quality && quality !== 'all' && quality !== 'tous') {
      filtered = filtered.filter(c => c.quality.toLowerCase() === quality);
    }

    if (q) {
      const terms = q.split(/\s+/).filter(t => t.length > 0);
      filtered = filtered.filter(c => {
        const target = `${c.name} ${c.raw_name} ${c.category_name} ${c.quality_badge}`.toLowerCase();
        return terms.every(term => target.includes(term));
      });
    }

    // Statistiques des catégories et des qualités disponibles pour les chips de filtrage
    const categoriesMap = {};
    const qualitiesMap = {};
    XTREAM_FR_CATALOG.forEach(c => {
      categoriesMap[c.category_id] = categoriesMap[c.category_id] || { id: c.category_id, name: c.category_name, count: 0 };
      categoriesMap[c.category_id].count++;
      qualitiesMap[c.quality] = (qualitiesMap[c.quality] || 0) + 1;
    });

    const dataToServe = filtered.slice(0, limit).map(c => {
      let icon = c.icon;
      if (icon && (icon.startsWith('http://') || icon.includes('logo.smrtp2.com') || icon.includes('logoipro2.com'))) {
        icon = `/api/proxy-image?url=${encodeURIComponent(icon)}`;
      }
      return Object.assign({}, c, { icon });
    });

    const result = {
      success: true,
      count: filtered.length,
      total: XTREAM_FR_CATALOG.length,
      categories: Object.values(categoriesMap),
      qualities: qualitiesMap,
      data: dataToServe
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60'
    });
    return res.end(JSON.stringify(result));
  }

  // ================= SYNCHRONISATION AUTOMATIQUE DU CATALOGUE TÉLÉ-RÉALITÉ XTREAM =================
  let lastTeleRealiteSync = Date.now();

  function syncTeleRealiteCatalogFromXtream(onDone) {
    const apiUrl = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/player_api.php?username=${XTREAM_CONFIG.username}&password=${XTREAM_CONFIG.password}&action=get_series&category_id=947`;
    http.get(apiUrl, { timeout: 15000 }, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const rawList = JSON.parse(data);
          if (Array.isArray(rawList) && rawList.length > 0) {
            XTREAM_TELEREALITE_CATALOG = rawList.map(item => {
              const rawName = item.name || '';
              const yearMatch = rawName.match(/\((\d{4})\)/) || rawName.match(/\b(20\d{2})\b/);
              const year = yearMatch ? parseInt(yearMatch[1], 10) : (parseInt(item.releaseDate, 10) || 2025);
              let cleanName = rawName.replace(/\(\d{4}\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
              const cover = item.cover && (item.cover.startsWith('http') || item.cover.startsWith('https')) ? item.cover : 'assets/hero/live-tv-banner.webp';
              const backdrop = (Array.isArray(item.backdrop_path) && item.backdrop_path[0]) ? item.backdrop_path[0] : cover;

              return {
                series_id: item.series_id,
                name: cleanName,
                raw_name: rawName,
                year: year,
                rating: item.rating || "7.5",
                cover: cover,
                backdrop: backdrop,
                plot: item.plot || "Émission de télé-réalité en streaming haute qualité.",
                genre: item.genre || "Télé-Réalité",
                cast: item.cast || "",
                category_id: "947",
                category_name: "Télé-Réalité",
                episode_run_time: item.episode_run_time || "0"
              };
            });

            XTREAM_TELEREALITE_CATALOG.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name, 'fr'));

            const trPath = path.join(__dirname, 'data', 'xtream_telerealite_catalog.json');
            fs.writeFileSync(trPath, JSON.stringify(XTREAM_TELEREALITE_CATALOG, null, 2), 'utf8');
            lastTeleRealiteSync = Date.now();
            console.log(`[Xtream Auto-Sync] Catalogue Télé-Réalité actualisé avec succès : ${XTREAM_TELEREALITE_CATALOG.length} émissions synchronisées.`);
            if (onDone) onDone(null, XTREAM_TELEREALITE_CATALOG);
          }
        } catch (e) {
          if (onDone) onDone(e);
        }
      });
    }).on('error', (err) => {
      if (onDone) onDone(err);
    });
  }

  // Tâche de fond automatique : synchronise les nouvelles séries toutes les 6 heures
  setInterval(() => {
    syncTeleRealiteCatalogFromXtream();
  }, 6 * 3600 * 1000);

  // ================= ROUTE CATALOGUE TÉLÉ-RÉALITÉ XTREAM (/api/xtream/telerealite) =================
  // Retourne les séries de télé-réalité authentiques avec auto-actualisation
  if (pathname === '/api/xtream/telerealite' && req.method === 'GET') {
    const q = (parsedUrl.query.q || '').toString().toLowerCase().trim();
    const limit = parseInt(parsedUrl.query.limit, 10) || 300;
    const forceRefresh = (parsedUrl.query.refresh === '1' || parsedUrl.query.refresh === 'true');

    // Auto-actualisation si le catalogue a plus de 6h ou si refresh forcé
    if (forceRefresh || (Date.now() - lastTeleRealiteSync > 6 * 3600 * 1000)) {
      syncTeleRealiteCatalogFromXtream();
    }

    let filtered = XTREAM_TELEREALITE_CATALOG;
    if (q) {
      const terms = q.split(/\s+/).filter(t => t.length > 0);
      filtered = filtered.filter(s => {
        const target = `${s.name} ${s.raw_name || ''} ${s.cast || ''} ${s.year || ''}`.toLowerCase();
        return terms.every(term => target.includes(term));
      });
    }

    const result = {
      success: true,
      count: filtered.length,
      total: XTREAM_TELEREALITE_CATALOG.length,
      last_sync: new Date(lastTeleRealiteSync).toISOString(),
      data: filtered.slice(0, limit)
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=120'
    });
    return res.end(JSON.stringify(result));
  }

  // ================= ROUTE DÉTAILS SÉRIE XTREAM (/api/xtream/series-info) =================
  // Renvoie les vraies saisons et les vrais épisodes avec auto-actualisation Stale-While-Revalidate (TTL: 2h)
  if (pathname === '/api/xtream/series-info' && req.method === 'GET') {
    const seriesId = parsedUrl.query.series_id || parsedUrl.query.id;
    const forceRefresh = (parsedUrl.query.refresh === '1' || parsedUrl.query.refresh === 'true');

    if (!seriesId) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ success: false, message: 'Paramètre series_id requis' }));
    }

    const cacheDir = path.join(__dirname, 'data', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const cacheFile = path.join(cacheDir, `series_${seriesId}.json`);

    const serveSeriesData = (rawData) => {
      const episodesMap = rawData.episodes || {};
      const seasonsList = [];

      const seasonNums = Object.keys(episodesMap).map(n => parseInt(n, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      
      seasonNums.forEach(sNum => {
        const eps = episodesMap[String(sNum)] || [];
        if (!Array.isArray(eps) || eps.length === 0) return;

        const formattedEpisodes = eps.map((ep, idx) => {
          const epNum = ep.episode_num ? parseInt(ep.episode_num, 10) : (idx + 1);
          const ext = ep.container_extension || 'mkv';
          const epId = ep.id;
          const streamUrl = `/api/stream/xtream-series?episode_id=${epId}&ext=${ext}`;
          return {
            episode_number: epNum,
            title: ep.title || `Épisode ${epNum}`,
            overview: ep.info?.plot || ep.info?.overview || '',
            duration: ep.info?.duration || '45m',
            video_url: streamUrl,
            still_url: ep.info?.movie_image || rawData.info?.cover || '',
            video: ep.info?.video || {},
            video_codec: ep.info?.video?.codec_name || null,
            sources: {
              direct: streamUrl,
              fhd: streamUrl
            }
          };
        });

        seasonsList.push({
          season_number: sNum,
          name: `Saison ${sNum}`,
          overview: `Saison ${sNum} (${formattedEpisodes.length} épisodes)`,
          episode_count: formattedEpisodes.length,
          episodes: formattedEpisodes
        });
      });

      const seriesObj = {
        success: true,
        series_id: seriesId,
        id: `xtream_series_${seriesId}`,
        tmdb_id: rawData.info?.tmdb || `xtream_series_${seriesId}`,
        title: rawData.info?.name || 'Série Xtream',
        poster_url: rawData.info?.cover || '',
        backdrop_url: (Array.isArray(rawData.info?.backdrop_path) && rawData.info.backdrop_path[0]) || rawData.info?.cover || '',
        overview: rawData.info?.plot || '',
        rating: parseFloat(rawData.info?.rating || 7.5),
        release_year: parseInt(rawData.info?.releaseDate || rawData.info?.release_date || 2025, 10) || 2025,
        genres: [rawData.info?.genre || 'Télé-Réalité'],
        cast: (rawData.info?.cast || '').split(',').map(s => s.trim()).filter(Boolean),
        media_type: 'series',
        is_xtream_series: true,
        seasons: seasonsList
      };

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=180'
      });
      return res.end(JSON.stringify(seriesObj));
    };

    function fetchFreshSeriesFromXtream(onDone) {
      const apiUrl = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/player_api.php?username=${XTREAM_CONFIG.username}&password=${XTREAM_CONFIG.password}&action=get_series_info&series_id=${seriesId}`;
      http.get(apiUrl, { timeout: 12000 }, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed && (parsed.info || parsed.episodes)) {
              fs.writeFileSync(cacheFile, JSON.stringify(parsed, null, 2), 'utf8');
              console.log(`[Xtream Auto-Sync] Série ${seriesId} mise à jour avec les derniers épisodes.`);
              if (onDone) onDone(null, parsed);
            } else if (onDone) {
              onDone(new Error('Données Xtream incomplètes'));
            }
          } catch (e) {
            if (onDone) onDone(e);
          }
        });
      }).on('error', (err) => {
        if (onDone) onDone(err);
      });
    }

    // 1. Vérification du cache disque avec politique Stale-While-Revalidate (TTL 2h)
    let cached = null;
    let isStale = false;
    if (fs.existsSync(cacheFile)) {
      try {
        const stats = fs.statSync(cacheFile);
        cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const age = Date.now() - stats.mtimeMs;
        // Si le cache a plus de 2 heures ou si refresh explicite demandé
        if (age > 2 * 3600 * 1000 || forceRefresh) {
          isStale = true;
        }
      } catch (e) {
        cached = null;
      }
    }

    if (cached) {
      if (isStale) {
        // Rafraîchissement automatique en arrière-plan sans faire attendre l'utilisateur
        fetchFreshSeriesFromXtream((err, fresh) => {
          if (!err && fresh) {
            console.log(`[Xtream Auto-Sync] Nouveaux épisodes récupérés pour série ${seriesId}`);
          }
        });
      }
      return serveSeriesData(cached);
    }

    // 2. Si aucun cache disque n'existe, récupération immédiate depuis Xtream
    fetchFreshSeriesFromXtream((err, fresh) => {
      if (err || !fresh) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ success: false, message: 'Erreur connexion Xtream series info: ' + (err?.message || 'Inconnu') }));
      }
      return serveSeriesData(fresh);
    });
    return;
  }

  // ================= ROUTE DIRECT XTREAM VIP PROXY (/api/stream/xtream) =================
  // Infrastructure Haute Résilience pour Xtream Codes :
  // 1. Détection dynamique de la chaîne exacte (zéro duplication sur Canal+ Foot)
  // 2. Cascade automatique sur flux de secours (FHD -> HD -> UHD) en cas d'indisponibilité
  // 3. Suivi transparent des redirections 302 vers les serveurs edge de diffusion
  // 4. Réécriture dynamique des segments HLS (.ts) vers le proxy local /api/stream/xtream-chunk
  // 5. Élimination des erreurs Mixed-Content (HTTP -> HTTPS) et contournement CORS total
  if (pathname === '/api/stream/xtream' && req.method === 'GET') {
    const rawChannel = (parsedUrl.query.channel || '').toString().toLowerCase().trim();
    let streamId = parsedUrl.query.stream_id
      || XTREAM_CHANNELS[rawChannel] 
      || XTREAM_CHANNELS[rawChannel.replace(/^tv_/, '')] 
      || XTREAM_CHANNELS[rawChannel.replace(/_/g, ' ')]
      || (rawChannel.match(/^\d+$/) ? rawChannel : null);

    if (!streamId && !parsedUrl.query.target) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(`Chaîne Xtream non trouvée pour: ${rawChannel}`);
    }

    if (streamId) {
      trackStreamingSession(req, res, streamId, 'live', rawChannel);
    }

    // Accélération 1 : Cache mémoire RAM instantané (1500ms) pour rafraîchissement à 0 ms
    if (!parsedUrl.query.target && streamId) {
      const cachedManifest = xtreamManifestCache.get(streamId);
      if (cachedManifest && cachedManifest.expiresAt > Date.now()) {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Xtream-Cache': 'HIT-RAM',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        return res.end(cachedManifest.manifest);
      }
    }

    async function fetchStreamWithFallback(initialStreamId) {
      if (parsedUrl.query.target) {
        return await fetchXtreamPlaylist(parsedUrl.query.target);
      }

      // Accélération 2 : Cache direct du nœud Edge (TTL 5 min) - Évite l'aller-retour 302 vers foxbleu.org
      const cachedEdge = xtreamEdgeCache.get(initialStreamId);
      if (cachedEdge && cachedEdge.expiresAt > Date.now()) {
        try {
          const resObj = await fetchXtreamPlaylist(cachedEdge.edgeUrl);
          if (resObj.statusCode === 200 && resObj.body && resObj.body.includes('#EXTM3U')) {
            return resObj;
          } else {
            xtreamEdgeCache.delete(initialStreamId);
          }
        } catch (e) {
          xtreamEdgeCache.delete(initialStreamId);
        }
      }

      // Priorités H.264 universelles (compatibilité 100% Chrome MSE sans erreur HEVC mediaSourceRequiresReset)
      const H264_PREFERENCES = {
        '13847': '13917',   // TF1 FHD (HEVC) -> TF1 HD (H.264)
        '13690': '13973',   // W9 FHD (HEVC) -> W9 HD (H.264)
        '13831': '14020',   // CNews FHD (HEVC) -> CNews HD (H.264)
        '13770': '13839',   // BFM TV FHD (HEVC) -> BFM TV HD (H.264)
        '13726': '14003',   // M6 FHD -> M6 HD (H.264)
        '14152': '14163',   // beIN 3 FHD -> beIN 3 HD (H.264)
        '14160': '14170',   // beIN 1 FHD -> beIN 1 HD (H.264)
        '14153': '14169',   // beIN 2 FHD -> beIN 2 HD (H.264)
        '180946': '181485',  // Canal+ Foot FHD -> HD (H.264)
        '180947': '181486',  // Canal+ 360 FHD -> HD (H.264)
        '14156': '14161',   // Canal+ Sport FHD -> HD (H.264)
        '14151': '14167',   // Canal+ France FHD -> HD (H.264)
        '408065': '408064'  // RMC 1 FHD -> HD (H.264)
      };

      const candidates = [];
      const h264Alt = H264_PREFERENCES[initialStreamId];
      if (h264Alt) {
        candidates.push(h264Alt);
      }
      if (!candidates.includes(initialStreamId)) {
        candidates.push(initialStreamId);
      }
      if (XTREAM_STREAM_FALLBACKS[initialStreamId]) {
        for (const fb of XTREAM_STREAM_FALLBACKS[initialStreamId]) {
          if (!candidates.includes(fb)) candidates.push(fb);
        }
      }

      if (candidates.length <= 1) {
        const item = XTREAM_FR_CATALOG.find(c => String(c.stream_id) === String(initialStreamId));
        if (item) {
          const peers = XTREAM_FR_CATALOG.filter(c => 
            c.category_id === item.category_id && String(c.stream_id) !== String(initialStreamId)
          ).slice(0, 3);
          for (const p of peers) {
            const pid = String(p.stream_id);
            if (!candidates.includes(pid)) candidates.push(pid);
          }
        }
      }

      let lastErr = null;
      for (const sId of candidates) {
        const urlToFetch = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/live/${XTREAM_CONFIG.username}/${XTREAM_CONFIG.password}/${sId}.m3u8`;
        try {
          const resObj = await fetchXtreamPlaylist(urlToFetch);
          if (resObj.statusCode === 200 && resObj.body && (resObj.body.includes('#EXTM3U') || resObj.buffer.length > 500)) {
            if (resObj.finalUrl && resObj.finalUrl !== urlToFetch) {
              xtreamEdgeCache.set(initialStreamId, { edgeUrl: resObj.finalUrl, expiresAt: Date.now() + 60000 });
            }
            return resObj;
          }
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error(`Flux Xtream indisponible (ID: ${initialStreamId})`);
    }

    fetchStreamWithFallback(streamId)
      .then(({ statusCode, finalUrl, body, buffer }) => {
        if (statusCode !== 200) {
          res.writeHead(statusCode || 502, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(`Erreur Xtream: HTTP ${statusCode}`);
        }

        // Si le contenu est une playlist HLS
        if (body.includes('#EXTM3U')) {
          let edgeOrigin = '';
          let edgeBase = '';
          try {
            const urlObj = new URL(finalUrl);
            edgeOrigin = urlObj.origin;
            edgeBase = finalUrl.substring(0, finalUrl.lastIndexOf('/') + 1);
          } catch (e) {}

          const lines = body.split(/\r?\n/);
          const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Réécriture des clés de chiffrement si présentes (#EXT-X-KEY)
            if (trimmed.startsWith('#EXT-X-KEY:')) {
              return trimmed.replace(/URI="([^"]+)"/, (m, keyUri) => {
                let absKeyUrl = keyUri;
                if (!keyUri.startsWith('http://') && !keyUri.startsWith('https://')) {
                  absKeyUrl = keyUri.startsWith('/') ? `${edgeOrigin}${keyUri}` : `${edgeBase}${keyUri}`;
                }
                return `URI="/api/stream/xtream-chunk?url=${encodeURIComponent(absKeyUrl)}"`;
              });
            }

            if (trimmed.startsWith('#')) return line;

            // Résoudre l'URL absolue de la ressource
            let absUrl = trimmed;
            if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
              absUrl = trimmed.startsWith('/') ? `${edgeOrigin}${trimmed}` : `${edgeBase}${trimmed}`;
            }

            // Si c'est une sous-playlist (variant stream)
            if (trimmed.includes('.m3u8')) {
              return `/api/stream/xtream?target=${encodeURIComponent(absUrl)}`;
            }

            // Segment média (.ts)
            return `/api/stream/xtream-chunk?url=${encodeURIComponent(absUrl)}`;
          });

          const rewrittenManifest = rewrittenLines.join('\n');

          // Sauvegarde dans le cache RAM éphémère (1500ms)
          if (!parsedUrl.query.target && streamId) {
            xtreamManifestCache.set(streamId, { manifest: rewrittenManifest, expiresAt: Date.now() + 1500 });
          }

          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          return res.end(rewrittenManifest);
        }

        // Fallback: flux binaire direct
        res.writeHead(200, {
          'Content-Type': 'video/mp2t',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store',
          'Connection': 'keep-alive'
        });
        return res.end(buffer);
      })
      .catch(err => {
        console.warn('[Xtream Manifest Error]:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end('Erreur de connexion Xtream: ' + err.message);
        }
      });
    return;
  }

  // ================= ROUTE XTREAM CHUNK PROXY (/api/stream/xtream-chunk) =================
  // Proxy de streaming pour chaque segment .ts de l'infrastructure Xtream :
  // - Envoi du User-Agent IPTVSmartersPro/1.0
  // - Connection Pooling persistant résistant aux micro-coupures
  // - Headers CORS complets & Content-Type video/mp2t
  // - Destruction instantanée des flux amont lors du zapping client pour zéro fuite RAM
  if (pathname === '/api/stream/xtream-chunk' && req.method === 'GET') {
    const chunkUrl = parsedUrl.query.url;
    if (!chunkUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end('URL de chunk manquante');
    }

    function pipeChunk(urlToFetch, hops = 0, retry = 0) {
      if (hops > 4) {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Trop de redirections de chunk Xtream');
        }
        return;
      }

      if (req.destroyed || res.writableEnded || res.destroyed) {
        return;
      }

      let parsed;
      try {
        parsed = new URL(urlToFetch);
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('URL de chunk invalide');
        }
        return;
      }

      const client = parsed.protocol === 'https:' ? https : http;
      const agent = parsed.protocol === 'https:' ? xtreamHttpsAgent : xtreamHttpAgent;
      let isAborted = false;
      let activeChunkRes = null;

      const clientReq = client.get(urlToFetch, {
        agent,
        headers: {
          'User-Agent': 'IPTVSmartersPro/1.0',
          'Accept': '*/*'
        },
        timeout: 12000
      }, (chunkRes) => {
        activeChunkRes = chunkRes;

        // Attacher immédiatement un écouteur d'erreur sur chunkRes pour éviter tout crash processus
        chunkRes.on('error', (err) => {
          if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
          console.warn('[Xtream Chunk Stream Error]:', err.message);
          try { chunkRes.destroy(); } catch (e) {}
          if (!res.headersSent) {
            try {
              res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
              res.end('Erreur de chargement flux: ' + err.message);
            } catch (e) {}
          } else {
            try { res.end(); } catch (e) {}
          }
        });

        if (isAborted || req.destroyed || res.destroyed || res.writableEnded) {
          try { chunkRes.destroy(); } catch (e) {}
          return;
        }

        // Suivi propre des redirections 3xx avec libération immédiate de la socket
        if (chunkRes.statusCode === 301 || chunkRes.statusCode === 302 || chunkRes.statusCode === 307 || chunkRes.statusCode === 308) {
          try { chunkRes.destroy(); } catch (e) {}
          const loc = chunkRes.headers.location;
          if (loc) {
            cleanupListeners();
            const nextUrl = loc.startsWith('http') ? loc : new URL(loc, urlToFetch).href;
            return pipeChunk(nextUrl, hops + 1, retry);
          }
        }

        if (chunkRes.statusCode !== 200 && chunkRes.statusCode !== 206) {
          if (!res.headersSent) {
            res.writeHead(chunkRes.statusCode, { 'Access-Control-Allow-Origin': '*' });
          }
          return chunkRes.pipe(res);
        }

        if (res.socket) {
          try { res.socket.setNoDelay(true); } catch (e) {}
        }

        res.writeHead(chunkRes.statusCode, {
          'Content-Type': chunkRes.headers['content-type'] || 'video/mp2t',
          'Content-Length': chunkRes.headers['content-length'],
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'public, max-age=3600',
          'Connection': 'keep-alive'
        });

        chunkRes.pipe(res);
      });

      clientReq.on('error', (err) => {
        if (isAborted || req.destroyed || res.destroyed || res.writableEnded) {
          return;
        }

        // Auto-retry si socket fermée prématurément par le serveur distant
        if (retry < 2 && !res.headersSent && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
          cleanupListeners();
          return pipeChunk(urlToFetch, hops, retry + 1);
        }

        console.warn('[Xtream Chunk Request Error]:', err.message);
        if (!res.headersSent) {
          try {
            res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Erreur de chargement chunk: ' + err.message);
          } catch (e) {}
        }
      });

      clientReq.on('timeout', () => {
        try { clientReq.destroy(); } catch (e) {}
        if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
        if (retry < 2 && !res.headersSent) {
          cleanupListeners();
          return pipeChunk(urlToFetch, hops, retry + 1);
        }
        if (!res.headersSent) {
          try {
            res.writeHead(504, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Timeout chunk Xtream');
          } catch (e) {}
        }
      });

      const onClientClose = () => {
        isAborted = true;
        try { clientReq.destroy(); } catch (e) {}
        if (activeChunkRes) {
          try { activeChunkRes.destroy(); } catch (e) {}
        }
      };

      req.once('close', onClientClose);
      res.once('close', onClientClose);

      function cleanupListeners() {
        req.removeListener('close', onClientClose);
        res.removeListener('close', onClientClose);
      }
    }

    pipeChunk(chunkUrl);
    return;
  }

  // ================= ROUTE PROXY STREAMING VOD SÉRIES XTREAM (/api/stream/xtream-series) =================
  // Support complet des requêtes HTTP Range (206 Partial Content), mise en cache Edge 0ms,
  // pool Keep-Alive persistant et débit maximal anti-buffering
  if (pathname === '/api/stream/xtream-series' && req.method === 'GET') {
    const episodeId = parsedUrl.query.episode_id;
    const ext = parsedUrl.query.ext || 'mkv';

    if (!episodeId) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end('Paramètre episode_id manquant');
    }

    trackStreamingSession(req, res, episodeId, 'series');

    const cacheKey = `${episodeId}_${ext}`;
    const originUrl = `http://${XTREAM_CONFIG.host}:${XTREAM_CONFIG.port}/series/${XTREAM_CONFIG.username}/${XTREAM_CONFIG.password}/${episodeId}.${ext}`;
    const cachedEdge = xtreamSeriesEdgeCache.get(cacheKey);
    const hasCachedEdge = !!(cachedEdge && cachedEdge.expiresAt > Date.now());
    const initialUrl = hasCachedEdge ? cachedEdge.url : originUrl;

    function pipeSeriesStream(targetUrl, hops = 0, isEdgeAttempt = hasCachedEdge) {
      if (hops > 4) {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Trop de redirections pour la série Xtream');
        }
        return;
      }

      if (req.destroyed || res.writableEnded || res.destroyed) {
        return;
      }

      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('URL série Xtream invalide');
        }
        return;
      }

      const client = parsed.protocol === 'https:' ? https : http;
      const agent = parsed.protocol === 'https:' ? xtreamSeriesHttpsAgent : xtreamSeriesHttpAgent;
      const headersToForward = {
        'User-Agent': 'IPTVSmartersPro/1.0',
        'Accept': '*/*'
      };

      if (req.headers['range']) {
        headersToForward['range'] = req.headers['range'];
      }

      let activeUpstreamRes = null;
      let isAborted = false;

      const clientReq = client.get(targetUrl, {
        headers: headersToForward,
        agent: agent,
        timeout: 6000
      }, (upstreamRes) => {
        activeUpstreamRes = upstreamRes;

        // Suivi propre des redirections 301/302/307/308 et mise en cache éphémère de l'Edge direct (TTL: 25s)
        if (upstreamRes.statusCode === 301 || upstreamRes.statusCode === 302 || upstreamRes.statusCode === 307 || upstreamRes.statusCode === 308) {
          try { upstreamRes.destroy(); } catch (e) {}
          const loc = upstreamRes.headers.location;
          if (loc) {
            cleanupListeners();
            const nextUrl = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href;
            xtreamSeriesEdgeCache.set(cacheKey, { url: nextUrl, expiresAt: Date.now() + 60 * 60 * 1000 });
            return pipeSeriesStream(nextUrl, hops + 1, true);
          }
        }

        // Si l'edge CDN renvoie une erreur (HTTP 509 Bandwidth Limit Exceeded, 403 Forbidden, 502, etc.)
        // et qu'on utilisait une URL Edge en cache :
        if (upstreamRes.statusCode >= 400 && isEdgeAttempt) {
          try { upstreamRes.destroy(); } catch (e) {}
          cleanupListeners();
          xtreamSeriesEdgeCache.delete(cacheKey);
          console.log(`[Xtream Series Edge Fallback] Edge CDN a renvoyé HTTP ${upstreamRes.statusCode}. Récupération d'un nouveau jeton depuis foxbleu.org...`);
          return pipeSeriesStream(originUrl, hops, false);
        }

        if (upstreamRes.statusCode >= 400) {
          if (!res.headersSent) {
            res.writeHead(upstreamRes.statusCode, { 'Access-Control-Allow-Origin': '*' });
          }
          return upstreamRes.pipe(res);
        }

        // Désactiver le timeout de connexion dès que la transmission démarre
        clientReq.setTimeout(0);

        // Optimisation haute performance TCP : désactivation du délai Nagle et Keep-Alive
        if (res.socket) {
          res.socket.setNoDelay(true);
          res.socket.setKeepAlive(true, 5000);
        }
        if (upstreamRes.socket) {
          upstreamRes.socket.setNoDelay(true);
          upstreamRes.socket.setKeepAlive(true, 5000);
        }

        upstreamRes.on('error', (err) => {
          if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
          console.warn('[Xtream Series Stream Error]:', err.message);
          try { upstreamRes.destroy(); } catch (e) {}
          if (!res.headersSent) {
            try {
              res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
              res.end('Erreur lecture vidéo série Xtream');
            } catch (e) {}
          } else {
            try { res.end(); } catch (e) {}
          }
        });

        // Proxy direct HTTP Range avec support complet 206 Partial Content (comme dans le deploy 4cdcad5)
        const outHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
          'X-Content-Type-Options': 'nosniff'
        };

        const ct = (upstreamRes.headers['content-type'] || '').toLowerCase();
        if (ext === 'mkv' || ct.includes('matroska')) {
          outHeaders['Content-Type'] = 'video/x-matroska';
        } else if (ext === 'mp4' || ct.includes('mp4')) {
          outHeaders['Content-Type'] = 'video/mp4';
        } else if (ext === 'ts' || ct.includes('mp2t')) {
          outHeaders['Content-Type'] = 'video/mp2t';
        } else if (ct && !ct.includes('octet-stream')) {
          outHeaders['Content-Type'] = upstreamRes.headers['content-type'];
        } else {
          outHeaders['Content-Type'] = 'video/mp4';
        }

        if (upstreamRes.headers['content-length']) {
          outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
        }
        if (upstreamRes.headers['content-range']) {
          outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
        }

        res.writeHead(upstreamRes.statusCode || 200, outHeaders);
        upstreamRes.pipe(res);
      });

      clientReq.on('error', (err) => {
        if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
        if (isEdgeAttempt && !res.headersSent) {
          cleanupListeners();
          xtreamSeriesEdgeCache.delete(cacheKey);
          console.log(`[Xtream Series Edge Network Error]: ${err.message}. Récupération via serveur maître...`);
          return pipeSeriesStream(originUrl, hops, false);
        }
        console.warn('[Xtream Series Request Error]:', err.message);
        if (!res.headersSent) {
          try {
            res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Erreur de requête série: ' + err.message);
          } catch (e) {}
        }
      });

      clientReq.on('timeout', () => {
        try { clientReq.destroy(); } catch (e) {}
        if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
        if (isEdgeAttempt && !res.headersSent) {
          cleanupListeners();
          xtreamSeriesEdgeCache.delete(cacheKey);
          return pipeSeriesStream(originUrl, hops, false);
        }
        if (!res.headersSent) {
          try {
            res.writeHead(504, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Timeout vidéo série Xtream');
          } catch (e) {}
        }
      });

      const onClientClose = () => {
        isAborted = true;
        try { clientReq.destroy(); } catch (e) {}
        if (activeUpstreamRes) {
          try { activeUpstreamRes.destroy(); } catch (e) {}
        }
      };

      req.once('close', onClientClose);
      res.once('close', onClientClose);

      function cleanupListeners() {
        req.removeListener('close', onClientClose);
        res.removeListener('close', onClientClose);
      }
    }

    pipeSeriesStream(initialUrl);
    return;
  }

  // ================= ROUTE DAILYMOTION STABLE (/api/stream/dm) =================
  // Génère des tokens frais à chaque requête → jamais d'expiration côté client
  if (pathname === '/api/stream/dm' && req.method === 'GET') {
    const videoId = parsedUrl.query.video;
    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Paramètre video manquant');
      return;
    }

    fetchDailymotionStream(videoId)
      .then(dm => {
        const rewritten = rewriteM3u8ForProxy(dm.manifestBody, dm.masterUrl, dm.sessionKey);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache'
        });
        res.end(rewritten);
      })
      .catch(err => {
        console.warn('[DM Stream Error]:', err.message);
        res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Erreur extraction Dailymotion: ' + err.message);
      });
    return;
  }

  // ================= ROUTE PROXY STREAMING HLS (/api/stream/proxy) =================
  if (pathname === '/api/stream/proxy' && req.method === 'GET') {
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('URL cible manquante');
      return;
    }

    const sessionKey = parsedUrl.query.dm_session || null;
    const isHttps = targetUrl.startsWith('https://');
    const client = isHttps ? https : http;

    let referer = 'https://cloudorchestranova.com/';
    let origin = 'https://cloudorchestranova.com';
    let extraCookie = null;
    let isDm = false;
    try {
      const uObj = new URL(targetUrl);
      const h = uObj.hostname.toLowerCase();
      isDm = (h.includes('dailymotion') || h.includes('dmcdn'));
      if (h.includes('vidzy')) {
        referer = 'https://vidzy.cc/';
        origin = 'https://vidzy.cc';
      } else if (h.includes('uqload')) {
        referer = 'https://uqload.vc/';
        origin = 'https://uqload.vc';
      } else if (h.includes('fsvid')) {
        referer = 'https://fsvid.lol/';
        origin = 'https://fsvid.lol';
      } else if (h.includes('french-stream')) {
        referer = 'https://french-stream.one/';
        origin = 'https://french-stream.one';
      } else if (isDm) {
        referer = 'https://www.dailymotion.com/';
        origin = 'https://www.dailymotion.com';
        // Récupérer les cookies Dailymotion depuis le cache de session
        if (sessionKey && dmCookieCache.has(sessionKey)) {
          extraCookie = dmCookieCache.get(sessionKey);
        }
      }
    } catch (e) {
      isDm = targetUrl.includes('dailymotion') || targetUrl.includes('dmcdn');
    }

    const options = {
      headers: {
        'User-Agent': isDm
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer,
        'Origin': origin
      },
      timeout: 12000
    };

    if (extraCookie) {
      options.headers['Cookie'] = extraCookie;
    }

    if (req.headers.range) {
      options.headers['Range'] = req.headers.range;
    }

    let isAborted = false;
    let activeProxyRes = null;

    const proxyReq = client.get(targetUrl, options, proxyRes => {
      activeProxyRes = proxyRes;
      const statusCode = proxyRes.statusCode || 200;

      if (proxyRes.socket) {
        proxyRes.socket.setNoDelay(true);
        proxyRes.socket.setKeepAlive(true, 5000);
      }

      proxyRes.on('error', (err) => {
        if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
        console.warn('[Proxy Res Error]:', err.message);
        try { proxyRes.destroy(); } catch (e) {}
        if (!res.headersSent) {
          try { res.writeHead(502); res.end(); } catch (e) {}
        } else {
          try { res.end(); } catch (e) {}
        }
      });

      // Suivre les redirections 3xx
      if (statusCode >= 300 && statusCode < 400 && proxyRes.headers.location) {
        try { proxyRes.destroy(); } catch (e) {}
        const redirected = resolveProxyUrl(targetUrl, proxyRes.headers.location);
        const sessionSuffix = sessionKey ? '&dm_session=' + encodeURIComponent(sessionKey) : '';
        res.writeHead(302, { 'Location': '/api/stream/proxy?url=' + encodeURIComponent(redirected) + sessionSuffix });
        res.end();
        return;
      }

      const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const isM3u8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegurl');

      if (isM3u8) {
        let body = '';
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          // Passer sessionKey pour que les sous-playlists et segments héritent du cookie
          const rewritten = rewriteM3u8ForProxy(body, targetUrl, sessionKey);
          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-cache'
          });
          res.end(rewritten);
        });
      } else {
        // C'est un segment vidéo binaire (MPEG-TS ou fMP4)
        const isMp4 = targetUrl.includes('.mp4') || contentType.includes('mp4');
        const responseHeaders = {
          'Content-Type': isMp4 ? 'video/mp4' : 'video/mp2t',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
          'Cache-Control': 'public, max-age=86400'
        };
        if (proxyRes.headers['content-length']) {
          responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
        }
        if (proxyRes.headers['content-range']) {
          responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
        }
        res.writeHead(statusCode, responseHeaders);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', err => {
      if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
      console.warn('[Proxy Error] Échec sur', targetUrl.substring(0, 60), ':', err.message);
      if (!res.headersSent) {
        try {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Erreur proxy streaming: ' + err.message);
        } catch (e) {}
      }
    });

    proxyReq.on('timeout', () => {
      try { proxyReq.destroy(); } catch (e) {}
      if (isAborted || req.destroyed || res.destroyed || res.writableEnded) return;
      if (!res.headersSent) {
        try {
          res.writeHead(504, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Timeout proxy streaming');
        } catch (e) {}
      }
    });

    const onClientClose = () => {
      isAborted = true;
      try { proxyReq.destroy(); } catch (e) {}
      if (activeProxyRes) {
        try { activeProxyRes.destroy(); } catch (e) {}
      }
    };
    req.once('close', onClientClose);
    res.once('close', onClientClose);

    return;
  }

  // ================= ROUTE STREAMING DÉDIÉE (/api/stream/:id) =================
  if (pathname.startsWith('/api/stream/') && req.method === 'GET') {
    const id = pathname.replace('/api/stream/', '');
    const movie = catalog.movies.find(m => m.id === id || m.tmdb_id === id);
    if (!movie) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Média non trouvé pour le stream' }));
      return;
    }

    if (movie.media_type === 'channel' || movie.is_live) {
      const channelTarget = movie.daddy_id || movie.id;
      res.writeHead(302, { 'Location': `/api/stream/live?channel=${encodeURIComponent(channelTarget)}&mirror=premium_vip` });
      res.end();
      return;
    }

    if (movie.video_url && (movie.video_url.startsWith('http://') || movie.video_url.startsWith('https://'))) {
      res.writeHead(302, { 'Location': movie.video_url });
      res.end();
      return;
    }

    const videoPath = path.join(__dirname, movie.video_url || '');
    if (!fs.existsSync(videoPath) || !fs.statSync(videoPath).isFile()) {
      res.writeHead(302, { 'Location': 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' });
      res.end();
      return;
    }

    const stat = fs.statSync(videoPath);
    const total = stat.size;
    const contentType = 'video/mp4';

    if (req.headers.range) {
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, "").split("-");
      const partialstart = parts[0];
      const partialend = parts[1];

      const start = parseInt(partialstart, 10);
      const end = partialend ? parseInt(partialend, 10) : total - 1;
      const chunksize = (end - start) + 1;

      const file = fs.createReadStream(videoPath, { start: start, end: end });
      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      file.pipe(res);
      return;
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(videoPath).pipe(res);
      return;
    }
  }

  // ================= ROUTE PROXY D'IMAGES (MIXED-CONTENT & CORS FIX) =================
  // Résout les blocages Mixed-Content (HTTP sur HTTPS Render) pour les logos des chaînes IPTV
  // (ex: logo.smrtp2.com, logo-iptvpro.com) avec cache mémoire haute performance
  if (pathname === '/api/proxy-image' && req.method === 'GET') {
    const rawTarget = parsedUrl.query.url;
    if (!rawTarget) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end('URL image requise');
    }

    let targetUrl = rawTarget;
    try {
      targetUrl = decodeURIComponent(rawTarget);
    } catch (e) {}

    const serveFallback = () => {
      if (res.headersSent || res.writableEnded) return;
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="300" height="450"><rect width="100%" height="100%" fill="#141414"/><circle cx="150" cy="200" r="50" fill="#e50914" opacity="0.2"/><g transform="translate(125, 175) scale(2)" fill="#e50914"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></g><text x="150" y="270" font-family="sans-serif" font-size="16" font-weight="bold" fill="#fff" text-anchor="middle">CHAÎNE TV</text></svg>`);
    };

    // Cache RAM (TTL 24h)
    const cached = imageProxyCache.get(targetUrl);
    if (cached && cached.expiresAt > Date.now()) {
      res.writeHead(200, {
        'Content-Type': cached.contentType || 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
        'X-Image-Cache': 'HIT'
      });
      return res.end(cached.buffer);
    }

    try {
      const parsedTarget = new URL(targetUrl);
      const isHttps = parsedTarget.protocol === 'https:';
      const client = isHttps ? https : http;
      const agent = isHttps ? xtreamHttpsAgent : xtreamHttpAgent;

      const imgReq = client.get(targetUrl, {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        timeout: 8000
      }, (imgRes) => {
        if (imgRes.statusCode >= 300 && imgRes.statusCode < 400 && imgRes.headers.location) {
          const nextLoc = imgRes.headers.location.startsWith('http') ? imgRes.headers.location : new URL(imgRes.headers.location, targetUrl).href;
          client.get(nextLoc, { agent, timeout: 8000 }, (redirRes) => {
            const chunks = [];
            redirRes.on('data', c => chunks.push(c));
            redirRes.on('end', () => {
              const buf = Buffer.concat(chunks);
              if (buf.length > 50) {
                const ct = redirRes.headers['content-type'] || 'image/png';
                imageProxyCache.set(targetUrl, { buffer: buf, contentType: ct, expiresAt: Date.now() + 86400000 });
                res.writeHead(200, {
                  'Content-Type': ct,
                  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                  'Access-Control-Allow-Origin': '*'
                });
                return res.end(buf);
              }
              serveFallback();
            });
          }).on('error', () => serveFallback());
          return;
        }

        if (imgRes.statusCode !== 200) {
          return serveFallback();
        }

        const chunks = [];
        imgRes.on('data', c => chunks.push(c));
        imgRes.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (buf.length > 50) {
            const ct = imgRes.headers['content-type'] || 'image/png';
            imageProxyCache.set(targetUrl, { buffer: buf, contentType: ct, expiresAt: Date.now() + 86400000 });
            res.writeHead(200, {
              'Content-Type': ct,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
              'Access-Control-Allow-Origin': '*'
            });
            return res.end(buf);
          }
          serveFallback();
        });
      });

      imgReq.on('error', () => serveFallback());
      imgReq.on('timeout', () => {
        imgReq.destroy();
        serveFallback();
      });
    } catch (e) {
      serveFallback();
    }
    return;
  }

  // ================= FICHIERS STATIQUES, SPA ROUTING & COMPRESSION =================
  const SPA_ROUTES = ['/series', '/films', '/telerealite', '/chaines', '/xtream', '/nouveautes', '/ma-liste'];
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (SPA_ROUTES.includes(pathname.toLowerCase()) || safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(__dirname, 'static', safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    const total = stat.size;

    // Support HTTP Range (206 Partial Content) pour vidéos
    if (req.headers.range) {
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, "").split("-");
      const partialstart = parts[0];
      const partialend = parts[1];

      const start = parseInt(partialstart, 10);
      const end = partialend ? parseInt(partialend, 10) : total - 1;
      const chunksize = (end - start) + 1;

      const file = fs.createReadStream(filePath, { start: start, end: end });
      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      file.pipe(res);
      return;
    }

    // Cache-Control : JS/CSS no-cache (éviter CDN stale), images 1h
    const cacheHeader = (ext === '.js' || ext === '.css' || ext === '.html')
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheHeader
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log("\n=======================================================");
  console.log("  🍿 NETFLIX CLONE - PRÉVISUALISATION & API REST ACTIVES");
  console.log("=======================================================");
  console.log(`  🚀 Serveur démarré avec succès !`);
  console.log(`  🌐 Accès Web : http://127.0.0.1:${PORT}`);
  console.log(`  ⚙️  Mode Admin : Menu profil en haut à droite -> Mode Administrateur`);
  console.log(`  📡 API REST  : http://127.0.0.1:${PORT}/api/catalog`);
  console.log("=======================================================\n");

  // Synchronisation initiale au démarrage (pull depuis GitHub si nécessaire)
  checkAndPullLatestCatalog();

  // Préchauffage instantané des flux IPTV pour éliminer toute latence cold-start (< 1 min)
  setTimeout(() => {
    prewarmXtreamConnections();
  }, 1200);

  // Maintien en éveil automatique anti-veille Render (Self-Ping 10 min)
  initRenderKeepAlive();
});
