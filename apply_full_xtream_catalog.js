const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== APPLICATION DU CATALOGUE COMPLET XTREAM VOD & SÉRIES ===');

const serverFile = '/var/www/netflix-clone/server.js';
let code = fs.readFileSync(serverFile, 'utf8');

// 1. Déclarer XTREAM_FR_VOD_CATEGORIES, XTREAM_FR_VOD_STREAMS, XTREAM_FR_SERIES_CATEGORIES, XTREAM_FR_SERIES
const initMarker = 'let XTREAM_TELEREALITE_CATALOG = [];';
const initBlock = `
// Catalogue complet des Films et Séries Françaises Xtream (FoxBleu)
let XTREAM_FR_VOD_CATEGORIES = [];
let XTREAM_FR_VOD_STREAMS = [];
let XTREAM_FR_SERIES_CATEGORIES = [];
let XTREAM_FR_SERIES = [];

try {
  const vodCatP = path.join(__dirname, 'data', 'cache', 'xtream_fr_vod_categories.json');
  if (fs.existsSync(vodCatP)) XTREAM_FR_VOD_CATEGORIES = JSON.parse(fs.readFileSync(vodCatP, 'utf8'));

  const vodStreamsP = path.join(__dirname, 'data', 'cache', 'xtream_fr_vod_streams.json');
  if (fs.existsSync(vodStreamsP)) XTREAM_FR_VOD_STREAMS = JSON.parse(fs.readFileSync(vodStreamsP, 'utf8'));

  const serCatP = path.join(__dirname, 'data', 'cache', 'xtream_fr_series_categories.json');
  if (fs.existsSync(serCatP)) XTREAM_FR_SERIES_CATEGORIES = JSON.parse(fs.readFileSync(serCatP, 'utf8'));

  const serStreamsP = path.join(__dirname, 'data', 'cache', 'xtream_fr_series.json');
  if (fs.existsSync(serStreamsP)) XTREAM_FR_SERIES = JSON.parse(fs.readFileSync(serStreamsP, 'utf8'));

  console.log('[Xtream VOD/Séries] Chargé en mémoire: ' + XTREAM_FR_VOD_CATEGORIES.length + ' catégories films, ' + XTREAM_FR_VOD_STREAMS.length + ' films, ' + XTREAM_FR_SERIES_CATEGORIES.length + ' catégories séries, ' + XTREAM_FR_SERIES.length + ' séries françaises.');
} catch (e) {
  console.warn('[Xtream VOD/Séries] Erreur chargement caches:', e.message);
}

function cleanTitleString(raw) {
  return (raw || '')
    .replace(/\\s*\\(\\d{4}\\)/g, '')
    .replace(/\\s*\\[.*?\\]/g, '')
    .replace(/\\s*\\(VFQ?\\)/gi, '')
    .replace(/\\s*\\(VOSTFR\\)/gi, '')
    .replace(/\\s*\\(MULTI\\)/gi, '')
    .replace(/\\s*\\(TRUEFRENCH\\)/gi, '')
    .replace(/\\s*\\(FRENCH\\)/gi, '')
    .replace(/\\s*\\|.*?\\|/g, '')
    .replace(/\\s*4K\\s*UHD/gi, '')
    .replace(/\\s*1080p/gi, '')
    .replace(/[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\u25A0-\\u27BF]|[ⓋⒹⓈⓇ║|•\\-]+/gu, '')
    .trim();
}

function extractYearFromTitle(raw, fallback = 2025) {
  const m = (raw || '').match(/\\b(19\\d{2}|20\\d{2})\\b/);
  return m ? parseInt(m[1]) : fallback;
}
`;

if (!code.includes('XTREAM_FR_VOD_CATEGORIES = [];')) {
  code = code.replace(initMarker, initBlock + '\n' + initMarker);
  console.log('1. Déclarations globales injectées.');
}

// 2. Fonction resolveXtreamMovieEdgeUrl
const movieEdgeFn = `
function resolveXtreamMovieEdgeUrl(streamId, ext = 'mp4') {
  const originUrl = 'http://' + XTREAM_CONFIG.host + ':' + XTREAM_CONFIG.port + '/movie/' + XTREAM_CONFIG.username + '/' + XTREAM_CONFIG.password + '/' + streamId + '.' + ext;
  return new Promise((resolve) => {
    const agent = getXtreamAgent(originUrl, true, true);
    const req = http.get(originUrl, {
      agent,
      headers: {
        'User-Agent': 'IPTVSmartersPro/1.0',
        'Range': 'bytes=0-100'
      },
      timeout: 10000
    }, (res) => {
      try { res.destroy(); } catch (e) {}
      const loc = res.headers.location;
      if (loc) {
        const nextUrl = loc.startsWith('http') ? loc : new URL(loc, originUrl).href;
        xtreamProxyManager.reportSuccess();
        return resolve(nextUrl);
      }
      resolve(originUrl);
    });
    req.on('error', (err) => {
      xtreamProxyManager.reportFailure(err.message);
      resolve(originUrl);
    });
    req.on('timeout', () => {
      req.destroy();
      xtreamProxyManager.reportFailure('Timeout');
      resolve(originUrl);
    });
  });
}
`;

if (!code.includes('function resolveXtreamMovieEdgeUrl(')) {
  code = code.replace('function resolveXtreamSeriesEdgeUrl(', movieEdgeFn + '\nfunction resolveXtreamSeriesEdgeUrl(');
  console.log('2. Fonction resolveXtreamMovieEdgeUrl injectée.');
}

// 3. Modifier handlePlayerApi pour get_vod_categories, get_vod_streams, get_series_categories, get_series
const targetVodCatIndex = code.indexOf("if (action === 'get_vod_categories') {");
const targetSeriesInfoIndex = code.indexOf("if (action === 'get_series_info') {");

if (targetVodCatIndex !== -1 && targetSeriesInfoIndex !== -1 && targetVodCatIndex < targetSeriesInfoIndex) {
  const prefix = code.slice(0, targetVodCatIndex);
  const suffix = code.slice(targetSeriesInfoIndex);

  const newPlayerApiBlock = `if (action === 'get_vod_categories') {
    const vodCats = (Array.isArray(XTREAM_FR_VOD_CATEGORIES) && XTREAM_FR_VOD_CATEGORIES.length > 0)
      ? XTREAM_FR_VOD_CATEGORIES
      : (catalog.categories || []).map((c, i) => ({ category_id: String(i + 10), category_name: c.name, parent_id: 0 }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(vodCats));
  }

  // CAS 5 : Films VOD (Catalogue complet français)
  if (action === 'get_vod_streams') {
    const catId = q.category_id ? String(q.category_id) : null;
    let list = (Array.isArray(XTREAM_FR_VOD_STREAMS) && XTREAM_FR_VOD_STREAMS.length > 0) ? XTREAM_FR_VOD_STREAMS : [];
    if (catId) {
      list = list.filter(m => String(m.category_id) === catId || (Array.isArray(m.category_ids) && m.category_ids.map(String).includes(catId)));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(list));
  }

  // CAS 6 : Catégories Séries
  if (action === 'get_series_categories') {
    const seriesCats = (Array.isArray(XTREAM_FR_SERIES_CATEGORIES) && XTREAM_FR_SERIES_CATEGORIES.length > 0)
      ? XTREAM_FR_SERIES_CATEGORIES
      : [
        { category_id: "947", category_name: "Télé-Réalité & Divertissement", parent_id: 0 },
        { category_id: "948", category_name: "Séries Tendances", parent_id: 0 }
      ];
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(seriesCats));
  }

  // CAS 7 : Liste des Séries (Catalogue complet français)
  if (action === 'get_series') {
    const catId = q.category_id ? String(q.category_id) : null;
    let list = (Array.isArray(XTREAM_FR_SERIES) && XTREAM_FR_SERIES.length > 0) ? XTREAM_FR_SERIES : XTREAM_TELEREALITE_CATALOG;
    if (catId) {
      list = list.filter(s => String(s.category_id) === catId || (Array.isArray(s.category_ids) && s.category_ids.map(String).includes(catId)));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(list));
  }

  // CAS 8 : Détails d'une Série
  `;

  code = prefix + newPlayerApiBlock + suffix;
  console.log('3. handlePlayerApi remplacé avec succès.');
}

// 4. Mettre à jour le routeur de streaming /movie/
const movieRouterMatch = code.indexOf("} else if (type === 'movie') {");
if (movieRouterMatch !== -1) {
  const movieBlockEnd = code.indexOf("}\n    }\n  }", movieRouterMatch);
  if (movieBlockEnd !== -1) {
    const newRouterMovie = `} else if (type === 'movie') {
        const extMatch = fileWithExt.match(/\\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1] : 'mp4';
        const movieId = fileWithExt.replace(/\\.[a-zA-Z0-9]+$/, '');
        const catMovie = (catalog.movies || []).find(m => m.id === movieId || m.tmdb_id === movieId || String(m.stream_id) === movieId);
        if (catMovie && catMovie.video_url && !catMovie.video_url.includes('/api/stream/xtream-movie')) {
          trackStreamingSession(req, res, movieId, 'movie', catMovie.title);
          res.writeHead(302, { 'Location': catMovie.video_url, 'Access-Control-Allow-Origin': '*' });
          return res.end();
        }
        resolveXtreamMovieEdgeUrl(movieId, ext).then(edgeUrl => {
          trackStreamingSession(req, res, movieId, 'movie', catMovie ? catMovie.title : ('Film #' + movieId));
          res.writeHead(302, { 'Location': edgeUrl, 'Access-Control-Allow-Origin': '*' });
          res.end();
        }).catch(() => {
          const directOrigin = 'http://' + XTREAM_CONFIG.host + ':' + XTREAM_CONFIG.port + '/movie/' + XTREAM_CONFIG.username + '/' + XTREAM_CONFIG.password + '/' + movieId + '.' + ext;
          res.writeHead(302, { 'Location': directOrigin, 'Access-Control-Allow-Origin': '*' });
          res.end();
        });
        return;
      `;
    code = code.slice(0, movieRouterMatch) + newRouterMovie + code.slice(movieBlockEnd);
    console.log('4. Routeur /movie/ remplacé.');
  }
}

// 5. Ajouter /api/stream/xtream-movie et /api/xtream/vod et /api/xtream/series
const streamMovieEndpoint = `
  // ── ROUTE STREAMING FILM XTREAM (/api/stream/xtream-movie) ──
  if (pathname === '/api/stream/xtream-movie' && (req.method === 'GET' || req.method === 'HEAD')) {
    const authUser = getRequestAuth(req, parsedUrl);
    if (!authUser || authUser.is_banned) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end('Accès refusé : Session ZIFLIX requise');
    }
    const streamId = parsedUrl.query.stream_id;
    const ext = parsedUrl.query.ext || 'mp4';
    if (!streamId) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end('stream_id manquant');
    }
    trackStreamingSession(req, res, streamId, 'movie');

    resolveXtreamMovieEdgeUrl(streamId, ext).then(edgeUrl => {
      res.writeHead(302, {
        'Location': edgeUrl,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Authorization, x-auth-token',
        'Cache-Control': 'no-cache'
      });
      res.end();
    }).catch(err => {
      const originUrl = 'http://' + XTREAM_CONFIG.host + ':' + XTREAM_CONFIG.port + '/movie/' + XTREAM_CONFIG.username + '/' + XTREAM_CONFIG.password + '/' + streamId + '.' + ext;
      res.writeHead(302, { 'Location': originUrl, 'Access-Control-Allow-Origin': '*' });
      res.end();
    });
    return;
  }

  // ── ROUTE API EXPLORATEUR XTREAM VOD WEB (/api/xtream/vod) ──
  if (pathname === '/api/xtream/vod' && req.method === 'GET') {
    const authUser = getAuthUser(req);
    if (!authUser || authUser.is_banned) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Accès réservé aux membres.' }));
    }
    const catId = parsedUrl.query.category_id || 'all';
    const query = (parsedUrl.query.q || '').toLowerCase().trim();
    const page = parseInt(parsedUrl.query.page) || 1;
    const limit = Math.min(100, parseInt(parsedUrl.query.limit) || 60);

    let list = Array.isArray(XTREAM_FR_VOD_STREAMS) ? XTREAM_FR_VOD_STREAMS : [];
    if (catId && catId !== 'all') {
      list = list.filter(m => String(m.category_id) === catId || (Array.isArray(m.category_ids) && m.category_ids.map(String).includes(catId)));
    }
    if (query) {
      list = list.filter(m => m.name.toLowerCase().includes(query) || (m.plot && m.plot.toLowerCase().includes(query)));
    }
    const total = list.length;
    const paginated = list.slice((page - 1) * limit, page * limit).map(m => ({
      id: 'xtream_vod_' + m.stream_id,
      stream_id: m.stream_id,
      title: cleanTitleString(m.name),
      original_title: m.name,
      poster_url: m.stream_icon || '',
      backdrop_url: m.stream_icon || '',
      overview: m.plot || (cleanTitleString(m.name) + ' - Film disponible en 1080p FHD sur ZIFLIX.'),
      media_type: 'movie',
      is_xtream_movie: true,
      container_extension: m.container_extension || 'mp4',
      release_year: extractYearFromTitle(m.name, 2025),
      rating: m.rating ? String(m.rating).slice(0, 3) : '8.2',
      quality_badges: ['1080p FHD']
    }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      data: paginated,
      total,
      page,
      categories: XTREAM_FR_VOD_CATEGORIES
    }));
  }

  // ── ROUTE API EXPLORATEUR XTREAM SÉRIES WEB (/api/xtream/series) ──
  if (pathname === '/api/xtream/series' && req.method === 'GET') {
    const authUser = getAuthUser(req);
    if (!authUser || authUser.is_banned) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Accès réservé aux membres.' }));
    }
    const catId = parsedUrl.query.category_id || 'all';
    const query = (parsedUrl.query.q || '').toLowerCase().trim();
    const page = parseInt(parsedUrl.query.page) || 1;
    const limit = Math.min(100, parseInt(parsedUrl.query.limit) || 60);

    let list = Array.isArray(XTREAM_FR_SERIES) ? XTREAM_FR_SERIES : [];
    if (catId && catId !== 'all') {
      list = list.filter(s => String(s.category_id) === catId || (Array.isArray(s.category_ids) && s.category_ids.map(String).includes(catId)));
    }
    if (query) {
      list = list.filter(s => s.name.toLowerCase().includes(query) || (s.plot && s.plot.toLowerCase().includes(query)));
    }
    const total = list.length;
    const paginated = list.slice((page - 1) * limit, page * limit).map(s => ({
      id: 'xtream_series_' + s.series_id,
      series_id: s.series_id,
      title: cleanTitleString(s.name),
      original_title: s.name,
      poster_url: s.cover || '',
      backdrop_url: s.backdrop ? (Array.isArray(s.backdrop) ? s.backdrop[0] : s.backdrop) : s.cover,
      overview: s.plot || (cleanTitleString(s.name) + ' - Série complète en streaming HD sur ZIFLIX.'),
      media_type: 'series',
      is_xtream_series: true,
      release_year: extractYearFromTitle(s.name, parseInt(s.year || 2025)),
      rating: s.rating ? String(s.rating).slice(0, 3) : '8.5',
      quality_badges: ['1080p FHD', 'Multi-Saisons']
    }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      data: paginated,
      total,
      page,
      categories: XTREAM_FR_SERIES_CATEGORIES
    }));
  }
`;

const targetRouteMarker = "if (pathname === '/api/stream/xtream-series' && (req.method === 'GET' || req.method === 'HEAD')) {";
if (!code.includes("pathname === '/api/stream/xtream-movie'")) {
  code = code.replace(targetRouteMarker, streamMovieEndpoint + '\n  ' + targetRouteMarker);
  console.log('5. Endpoints /api/stream/xtream-movie, /api/xtream/vod et /api/xtream/series injectés.');
}

// 6. Mettre à jour /api/movies/:id pour supporter xtream_vod_
const movieByIdMarker = "if (!movie && id.startsWith('xtream_series_')) {";
const movieByIdInsert = `
    if (!movie && id.startsWith('xtream_vod_')) {
      const vId = parseInt(id.replace('xtream_vod_', ''), 10);
      const vMovie = Array.isArray(XTREAM_FR_VOD_STREAMS) ? XTREAM_FR_VOD_STREAMS.find(m => m.stream_id === vId) : null;
      if (vMovie) {
        const cleanT = cleanTitleString(vMovie.name);
        const y = extractYearFromTitle(vMovie.name, 2025);
        movie = {
          id: 'xtream_vod_' + vId,
          stream_id: vId,
          title: cleanT || vMovie.name,
          original_title: vMovie.name,
          poster_url: vMovie.stream_icon || '',
          backdrop_url: vMovie.stream_icon || '',
          overview: vMovie.plot || (cleanT + ' - Film complet disponible en 1080p FHD sur ZIFLIX.'),
          media_type: 'movie',
          is_xtream_movie: true,
          container_extension: vMovie.container_extension || 'mp4',
          video_url: '/api/stream/xtream-movie?stream_id=' + vId + '&ext=' + (vMovie.container_extension || 'mp4'),
          release_year: y,
          duration: '1h 50m',
          age_rating: '12+',
          rating: vMovie.rating ? String(vMovie.rating).slice(0, 3) : '8.2',
          match_score: Math.min(99, Math.max(75, Math.round(parseFloat(vMovie.rating || '8.2') * 10))),
          quality_badges: ['1080p FHD', 'Son 5.1'],
          categories: ['Films', 'Nouveautés & Les Plus Regardés']
        };
      }
    }
`;

if (!code.includes("id.startsWith('xtream_vod_')")) {
  code = code.replace(movieByIdMarker, movieByIdInsert + '\n    ' + movieByIdMarker);
  console.log('6. /api/movies/:id mis à jour pour xtream_vod_.');
}

// 7. Dans /api/movies/:id pour séries, fallback sur XTREAM_FR_SERIES
const seriesFindMarker = "if (!sShow && Array.isArray(XTREAM_ANIME_CATALOG)) {\n        sShow = XTREAM_ANIME_CATALOG.find(s => s.series_id === sId);\n      }";
const seriesFindReplacement = "if (!sShow && Array.isArray(XTREAM_ANIME_CATALOG)) {\n        sShow = XTREAM_ANIME_CATALOG.find(s => s.series_id === sId);\n      }\n      if (!sShow && Array.isArray(XTREAM_FR_SERIES)) {\n        sShow = XTREAM_FR_SERIES.find(s => s.series_id === sId);\n      }";

if (code.includes(seriesFindMarker)) {
  code = code.replace(seriesFindMarker, seriesFindReplacement);
  console.log('7. /api/movies/:id séries mis à jour avec XTREAM_FR_SERIES.');
}

// 8. Mettre à jour /api/extract pour les films Xtream VOD
const extractVodCheck = `
      // ── Cas spécial : Films Xtream VOD ──
      const queryStreamId = parsedUrl.query.stream_id;
      const isXtreamMovie = queryStreamId || (id && String(id).startsWith('xtream_vod_')) || (catalogMovie && catalogMovie.is_xtream_movie);
      if (isXtreamMovie && isMovie) {
        const sId = queryStreamId || (catalogMovie ? catalogMovie.stream_id : null) || String(id).replace('xtream_vod_', '');
        const vMovie = Array.isArray(XTREAM_FR_VOD_STREAMS) ? XTREAM_FR_VOD_STREAMS.find(m => String(m.stream_id) === String(sId)) : null;
        const ext = (vMovie ? vMovie.container_extension : (catalogMovie ? catalogMovie.container_extension : 'mp4')) || 'mp4';
        const movieTitle = catalogMovie ? catalogMovie.title : (vMovie ? cleanTitleString(vMovie.name) : ('Film #' + sId));
        const streamUrl = '/api/stream/xtream-movie?stream_id=' + sId + '&ext=' + ext;
        return {
          success: true,
          server: serverNum,
          server_name: 'Serveur ' + serverNum + ' (Xtream 1080p FHD Direct)',
          hoster: 'Xtream Cloud VOD',
          quality: '1080p FHD',
          title: movieTitle,
          stream_url: streamUrl,
          raw_stream_url: streamUrl,
          player_type: 'direct_video',
          is_embed: false,
          sources_count: 3,
          lang: 'vf'
        };
      }
`;

const extractAnchor = "// ── Priorité absolue : Épisode Vidmoly (vidmoly_episodes.json lookup) ──";
if (!code.includes("const isXtreamMovie = queryStreamId")) {
  code = code.replace(extractAnchor, extractVodCheck + '\n      ' + extractAnchor);
  console.log('8. /api/extract mis à jour pour les films Xtream VOD.');
}

// 9. Mettre à jour /api/search pour inclure XTREAM_FR_VOD_STREAMS et XTREAM_FR_SERIES
const searchVodSeriesBlock = `
    // 3. Recherche dans XTREAM_FR_VOD_STREAMS (Films Français)
    if (Array.isArray(XTREAM_FR_VOD_STREAMS)) {
      for (const m of XTREAM_FR_VOD_STREAMS) {
        if (results.length >= 36) break;
        const t = (m.name + ' ' + (m.plot || '')).toLowerCase();
        if (terms.every(term => t.includes(term))) {
          const sTitle = cleanTitleString(m.name);
          if (seenTitles.has(sTitle.toLowerCase())) continue;
          seenTitles.add(sTitle.toLowerCase());
          results.push({
            id: 'xtream_vod_' + m.stream_id,
            stream_id: m.stream_id,
            title: sTitle,
            original_title: m.name,
            overview: m.plot || (sTitle + ' - Film disponible en 1080p FHD.'),
            media_type: 'movie',
            is_xtream_movie: true,
            poster_url: m.stream_icon || '',
            backdrop_url: m.stream_icon || '',
            video_url: '/api/stream/xtream-movie?stream_id=' + m.stream_id + '&ext=' + (m.container_extension || 'mp4'),
            release_year: extractYearFromTitle(m.name, 2025),
            match_score: Math.min(99, Math.max(75, Math.round(parseFloat(m.rating || '8.2') * 10))),
            quality_badges: ['1080p FHD']
          });
        }
      }
    }

    // 4. Recherche dans XTREAM_FR_SERIES (Séries Françaises)
    if (Array.isArray(XTREAM_FR_SERIES)) {
      for (const s of XTREAM_FR_SERIES) {
        if (results.length >= 48) break;
        const t = (s.name + ' ' + (s.plot || '') + ' ' + (s.genre || '')).toLowerCase();
        if (terms.every(term => t.includes(term))) {
          const sTitle = cleanTitleString(s.name);
          if (seenTitles.has(sTitle.toLowerCase())) continue;
          seenTitles.add(sTitle.toLowerCase());
          results.push({
            id: 'xtream_series_' + s.series_id,
            series_id: s.series_id,
            title: sTitle,
            original_title: s.name,
            overview: s.plot || (sTitle + ' - Série complète en streaming HD.'),
            media_type: 'series',
            is_xtream_series: true,
            poster_url: s.cover || '',
            backdrop_url: s.backdrop ? (Array.isArray(s.backdrop) ? s.backdrop[0] : s.backdrop) : s.cover,
            video_url: '/api/stream/xtream-series?series_id=' + s.series_id,
            release_year: extractYearFromTitle(s.name, parseInt(s.year || 2025)),
            match_score: Math.min(99, Math.max(75, Math.round(parseFloat(s.rating || '8.5') * 10))),
            quality_badges: ['1080p FHD', 'Multi-Saisons']
          });
        }
      }
    }
`;

const searchAnchor = "// 3. Recherche dans XTREAM_FR_CATALOG (1 268 Chaînes Françaises Direct)";
if (!code.includes("Recherche dans XTREAM_FR_VOD_STREAMS")) {
  code = code.replace(searchAnchor, searchVodSeriesBlock + '\n    ' + searchAnchor);
  console.log('9. /api/search mis à jour avec la recherche multi-catalogues VOD et Séries.');
}

// Validation de syntaxe
fs.writeFileSync('/var/www/netflix-clone/server_test.js', code, 'utf8');
try {
  execSync('node -c /var/www/netflix-clone/server_test.js');
  console.log('SYNTAX CHECK PASSED ! Application du nouveau server.js...');
  fs.copyFileSync('/var/www/netflix-clone/server_test.js', '/var/www/netflix-clone/server.js');
  fs.unlinkSync('/var/www/netflix-clone/server_test.js');
  console.log('server.js mis à jour avec succès.');
} catch (e) {
  console.error('SYNTAX CHECK FAILED:', e.message);
  process.exit(1);
}
