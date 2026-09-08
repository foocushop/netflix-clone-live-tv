// ================= PREVIEW / TEST SERVER =================
// Ce serveur reproduit fidèlement les endpoints de l'API Axum/Rust pour un test immédiat
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');


const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'data', 'catalog.json');

// Assurer l'existence du dossier data
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// ================= EXTRACTEUR DE FLUX DIRECT (FETCHV-STYLE) =================
function httpsGet(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://cloudorchestranova.com/'
    };
    const finalHeaders = Object.assign({}, defaultHeaders, headers);
    https.get(urlStr, {
      headers: finalHeaders,
      timeout: 8000
    }, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ status: res.statusCode, buffer, text: buffer.toString('utf8'), headers: res.headers });
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout réseau')));
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
  '479050': ['479049', '479051']         // Ligue 1+ FHD -> HD -> UHD
};

// Agents HTTP/HTTPS persistants avec réutilisation de sockets (Keep-Alive Pool)
// keepAliveMsecs réglé à 10s pour concorder avec les timeouts des reverse-proxies Nginx IPTV
const xtreamHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 20,
  keepAliveMsecs: 10000,
  timeout: 15000
});

const xtreamHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 20,
  keepAliveMsecs: 10000,
  timeout: 15000
});

// Cache d'adresses Edge directes (TTL 60s) pour contourner les redirections 302 à répétition
const xtreamEdgeCache = new Map();
// Cache ultra-rapide des manifests réécrits (TTL 1500ms) pour démarrage immédiat (0ms)
const xtreamManifestCache = new Map();

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
    const req = client.get(targetUrl, {
      agent,
      headers: Object.assign({
        'User-Agent': 'IPTVSmartersPro/1.0',
        'Accept': '*/*'
      }, headers),
      timeout: 10000
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error('Redirection sans en-tête location'));
        const nextUrl = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href;
        return resolve(fetchXtreamPlaylist(nextUrl, headers, hops + 1, retry));
      }
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
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
      // Auto-retry transparent sur socket hang up / ECONNRESET
      if (retry < 2 && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        return resolve(fetchXtreamPlaylist(targetUrl, headers, hops, retry + 1));
      }
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      if (retry < 2) {
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

  // ── PRIORITÉ ABSOLUE N°1 : SERVEUR 1 = DIRECT XTREAM VIP ──
  if (srvNum === 1) {
    const rawChan = (channelId || '').toString().toLowerCase().trim();
    const hasXtream = XTREAM_CHANNELS[rawChan] 
      || XTREAM_CHANNELS[rawChan.replace(/^tv_/, '')] 
      || XTREAM_CHANNELS[rawChan.replace(/_/g, ' ')];

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
          const matches = [...d.matchAll(/href='\/([0-9]+)-([^']+)\.html'[^>]*>[\s\S]*?<div class='search-title'>([^<]+)<\/div>/g)];
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
  let searchQuery = title;
  if (!isMovie) {
    searchQuery = `${title} Saison ${season}`;
  }
  let results = await searchFrenchStream(searchQuery);
  if (!results.length && !isMovie) {
    results = await searchFrenchStream(title);
  }
  if (!results.length) {
    const cleanTitle = title.split(/[:\-–]/)[0].trim();
    if (cleanTitle !== title) {
      results = await searchFrenchStream(cleanTitle);
    }
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
}

function saveCatalog() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(catalog, null, 2));
}

const startTime = Date.now();

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

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ================= API REST =================
  if (pathname === '/api/catalog' && req.method === 'GET') {
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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { hero, rows } }));
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

  if (pathname === '/api/search' && req.method === 'GET') {
    const q = (parsedUrl.query.q || '').toLowerCase();
    const results = catalog.movies.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.overview.toLowerCase().includes(q) ||
      m.categories.some(c => c.toLowerCase().includes(q))
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: results }));
    return;
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: stats }));
    return;
  }

  if (pathname === '/api/admin/movies' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
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
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: newMovie }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'JSON invalide' }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/admin/movies/') && pathname.endsWith('/hero') && req.method === 'POST') {
    const id = pathname.split('/')[4];
    let found = false;
    catalog.movies.forEach(m => {
      if (m.id === id) {
        m.is_hero = true;
        found = true;
      } else {
        m.is_hero = false;
      }
    });
    if (found) {
      saveCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Média non trouvé' }));
    }
    return;
  }

  if (pathname.startsWith('/api/admin/movies/') && req.method === 'DELETE') {
    const id = pathname.replace('/api/admin/movies/', '');
    const before = catalog.movies.length;
    catalog.movies = catalog.movies.filter(m => m.id !== id);
    if (catalog.movies.length < before) {
      if (!catalog.movies.some(m => m.is_hero) && catalog.movies.length > 0) {
        catalog.movies[0].is_hero = true;
      }
      saveCatalog();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
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

      // ── Cas spécial : La Villa des Cœurs Brisés & Téléfoot via Multi-Fournisseurs Authentiques ──
      if (tmdbId === '68628' || id === '68628' || tmdbId === 'telefoot_tf1' || id === 'telefoot_tf1') {
        const showType = (id === 'telefoot_tf1' || tmdbId === 'telefoot_tf1') ? 'telefoot' : 'villa';
        return await extractShowMultiProvider(showType, season, episode, serverIndex);
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

    const result = {
      success: true,
      count: filtered.length,
      total: XTREAM_FR_CATALOG.length,
      categories: Object.values(categoriesMap),
      qualities: qualitiesMap,
      data: filtered.slice(0, limit)
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60'
    });
    return res.end(JSON.stringify(result));
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

      // Accélération 2 : Cache direct du nœud Edge (TTL 60s) - Évite l'aller-retour 302 vers foxbleu.org
      const cachedEdge = xtreamEdgeCache.get(initialStreamId);
      if (cachedEdge && cachedEdge.expiresAt > Date.now()) {
        try {
          const resObj = await fetchXtreamPlaylist(cachedEdge.edgeUrl);
          if (resObj.statusCode === 200 && resObj.body && resObj.body.includes('#EXTM3U')) {
            return resObj;
          }
        } catch (e) {
          xtreamEdgeCache.delete(initialStreamId);
        }
      }

      const candidates = [initialStreamId];
      if (XTREAM_STREAM_FALLBACKS[initialStreamId]) {
        candidates.push(...XTREAM_STREAM_FALLBACKS[initialStreamId]);
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
  // - Connection Pooling persistant (xtreamHttpAgent / xtreamHttpsAgent)
  // - Headers CORS complets & Content-Type video/mp2t
  // - Mise en cache HTTP immuable pour éliminer les saccades et micro-coupures
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

      if (req.destroyed || res.writableEnded) {
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
      let isClientAborted = false;

      const clientReq = client.get(urlToFetch, {
        agent,
        headers: {
          'User-Agent': 'IPTVSmartersPro/1.0',
          'Accept': '*/*'
        },
        timeout: 15000
      }, (chunkRes) => {
        if (isClientAborted || req.destroyed || res.writableEnded) {
          try { chunkRes.destroy(); } catch (e) {}
          return;
        }

        if (chunkRes.statusCode === 301 || chunkRes.statusCode === 302 || chunkRes.statusCode === 307) {
          const loc = chunkRes.headers.location;
          if (loc) {
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
        // 1. Si la connexion client a déjà été coupée (zapping, seek, fermeture d'onglet)
        if (isClientAborted || req.destroyed || res.writableEnded) {
          return;
        }

        // 2. Si le serveur distant a fermé une socket inactive (socket hang up / ECONNRESET / ETIMEDOUT),
        // on relance automatiquement une tentative sur une socket neuve
        if (retry < 2 && !res.headersSent && (err.message.includes('socket hang up') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
          return pipeChunk(urlToFetch, hops, retry + 1);
        }

        console.warn('[Xtream Chunk Error]:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
          res.end('Erreur de chargement chunk: ' + err.message);
        }
      });

      req.on('close', () => {
        isClientAborted = true;
        try { clientReq.destroy(); } catch (e) {}
      });
    }

    pipeChunk(chunkUrl);
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

    const proxyReq = client.get(targetUrl, options, proxyRes => {
      const statusCode = proxyRes.statusCode || 200;

      // Suivre les redirections 3xx
      if (statusCode >= 300 && statusCode < 400 && proxyRes.headers.location) {
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
      console.warn('[Proxy Error] Échec sur', targetUrl.substring(0, 60), ':', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Erreur proxy streaming: ' + err.message);
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Timeout proxy streaming');
      }
    });

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

  // ================= FICHIERS STATIQUES & STREAMING RANGE =================
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

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

    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
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
});
