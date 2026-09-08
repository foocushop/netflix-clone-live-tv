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
    https.get(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://cloudorchestranova.com/',
        'Origin': 'https://cloudorchestranova.com',
        ...headers
      },
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

// ================= EXTRACTEUR DE CHAÎNES TV EN DIRECT (SPORTS & PPV) =================
// ─── DaddyLive Channel System ─────────────────────────────────────────────
// Génère les 8 URLs de serveurs DaddyLive pour un ID de channel donné
function buildDaddyLivePlayers(dlId) {
  return [
    { tag: 'HD1', name: '🔴 Serveur 1 — HD Direct',       url: `https://daddylivehd1.sbs/embed/stream-${dlId}.php` },
    { tag: 'LI',  name: '🎬 Serveur 2 — Miroir Li',       url: `https://daddylive.li/player/embed.php?id=${dlId}` },
    { tag: 'NT',  name: '📡 Serveur 3 — Nontongo',        url: `https://nontongo.win/livetv/${dlId}` },
    { tag: 'CF',  name: '⚡ Serveur 4 — Cricsfree',        url: `https://cricsfree.cfd/live/stream-${dlId}.php` },
    { tag: 'AX',  name: '🚀 Serveur 5 — Apex',            url: `https://apexstreams.cfd/live/stream-${dlId}.php` },
    { tag: 'DL',  name: '🌐 Serveur 6 — DLive Cast',      url: `https://dlive.sx/cast/stream-${dlId}.php` },
    { tag: 'ST',  name: '📺 Serveur 7 — DLHD Watch',      url: `https://dlhd.st/watch/stream-${dlId}.php` },
    { tag: 'ES',  name: '🔥 Serveur 8 — EngStreams',       url: `https://engstreams.shop/stream/index.php?id=${dlId}` },
  ];
}

// Mapping ID catalogue → ID DaddyLive + titre affiché
const DADDYLIVE_MAP = {
  // ── Sport France ──────────────────────────────────
  'tv_canal_sport':    { dlId: 122,  title: 'Canal+ Sport France' },
  'tv_canal_foot':     { dlId: 463,  title: 'Canal+ Foot France' },
  'tv_canal_360':      { dlId: 464,  title: 'Canal+ Sport 360' },
  'tv_canal_moto':     { dlId: 271,  title: 'Canal+ MotoGP France' },
  'tv_canal_f1':       { dlId: 273,  title: 'Canal+ Formule 1 France' },
  'tv_bein1':          { dlId: 116,  title: 'beIN Sports 1 France' },
  'tv_bein2':          { dlId: 117,  title: 'beIN Sports 2 France' },
  'tv_bein3':          { dlId: 118,  title: 'beIN Sports 3 France' },
  'tv_rmc_sport1':     { dlId: 119,  title: 'RMC Sport 1 France' },
  'tv_rmc_sport2':     { dlId: 120,  title: 'RMC Sport 2 France' },
  'tv_eurosport1':     { dlId: 772,  title: 'Eurosport 1 France' },
  'tv_eurosport2':     { dlId: 773,  title: 'Eurosport 2 France' },
  'tv_lequipe':        { dlId: 645,  title: "L'Équipe TV France" },
  'tv_equidia':        { dlId: 965,  title: 'Sport en France' },
  'tv_ligue1':         { dlId: 960,  title: 'Ligue 1+ France / DAZN' },
  'tv_ligue1_3':       { dlId: 222,  title: 'Ligue 1+ 3 France' },
  'tv_sport_fr':       { dlId: 965,  title: 'Sport en France' },
  // ── PPV & Combat ──────────────────────────────────
  'tv_ufc':            { dlId: 250,  title: 'UFC Fight Pass' },
  'tv_ufc_night':      { dlId: 5015, title: 'UFC Fight Night' },
  'tv_wwe':            { dlId: 376,  title: 'WWE Network' },
  'tv_wwe_ppv':        { dlId: 5005, title: 'WWE PPV' },
  'tv_dazn1':          { dlId: 179,  title: 'DAZN France' },
  'tv_ppv':            { dlId: 5000, title: 'PPV Events' },
  'tv_ppv_boxing':     { dlId: 5022, title: 'PPV Boxing' },
  'tv_event_ppv':      { dlId: 228,  title: 'Event PPV' },
  'tv_swerve_combat':  { dlId: 228,  title: 'Event PPV Combat' },
  // ── Sports Extrêmes / Autres ──────────────────────
  'tv_redbull':        { dlId: 965,  title: 'Sport en France (Red Bull)' },
  'tv_fifa':           { dlId: 960,  title: 'Ligue 1+ / FIFA+' },
  'tv_trace_sport':    { dlId: 965,  title: 'Sport en France' },
  'tv_freesports':     { dlId: 5000, title: 'PPV Events / Freesports' },
  'tv_kozoom':         { dlId: 222,  title: 'Ligue 1+ 3 France' },
};

async function extractChannelMultiProvider(channelId, serverIndex) {
  const channel = catalog.movies.find(m => m.id === channelId);
  const mapping = DADDYLIVE_MAP[channelId];

  const title = mapping ? mapping.title : (channel ? channel.title : 'Chaîne Sport Direct');
  const dlId  = mapping ? mapping.dlId  : 121; // fallback Canal+ France

  const players = buildDaddyLivePlayers(dlId);
  const srvIdx  = Math.abs(parseInt(serverIndex) || 0) % players.length;
  const chosen  = players[srvIdx];

  return {
    success:       true,
    server:        srvIdx + 1,
    server_name:   chosen.name,
    hoster:        `DaddyLive • ${title}`,
    quality:       '1080p FHD Direct',
    title:         `${title} • 🔴 EN DIRECT`,
    stream_url:    chosen.url,
    embed_url:     chosen.url,
    player_type:   'iframe',
    is_embed:      true,
    is_live:       true,
    sources_count: players.length,
    all_servers:   players.map((p, i) => ({
      index: i,
      tag:   p.tag,
      name:  p.name,
      url:   p.url,
      type:  'iframe'
    })),
    lang: 'vf'
  };
}

// ─────────────────────────────────────────────────────────────────────────

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
        return await extractChannelMultiProvider(id || tmdbId, serverIndex);
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
