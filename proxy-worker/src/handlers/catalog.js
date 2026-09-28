/**
 * Gestionnaire de Catalogue & Métadonnées - Cloudflare Worker
 * 
 * Rôle : Distribue le catalogue de films, séries et métadonnées d'épisodes avec
 * mise en cache Edge (Cloudflare KV & Headers Cache-Control).
 * Zéro secret exposé au client.
 */

import { getCorsHeaders } from '../utils/cors.js';
import { secureLog } from '../utils/security.js';

export async function handleCatalog(request, env, ctx) {
  const url = new URL(request.url);
  const cors = getCorsHeaders(request, env);

  const categoryFilter = url.searchParams.get('category');
  const typeFilter = url.searchParams.get('type'); // 'movie' ou 'series'
  const searchQuery = (url.searchParams.get('q') || '').trim().toLowerCase();

  try {
    let catalogData = null;

    // 1. Tentative de lecture depuis le namespace KV Cloudflare (Haute performance)
    if (env.CATALOG_KV) {
      catalogData = await env.CATALOG_KV.get('catalog', { type: 'json' });
    }

    // 2. Si non présent en KV, charger le catalogue statique intégré ou fallback
    if (!catalogData) {
      // Structure par défaut ou proxy vers l'origine
      catalogData = {
        categories: [
          { id: 'c_top_regardes', name: 'Nouveautés & Les Plus Regardés', slug: 'top-regardes' },
          { id: 'c_trends', name: 'Tendances actuelles', slug: 'tendances' },
          { id: 'c_series', name: 'Séries & Épisodes', slug: 'series' }
        ],
        movies: []
      };
    }

    let items = catalogData.movies || [];

    // 3. Filtrage côté Worker si demandé
    if (categoryFilter) {
      items = items.filter(item => Array.isArray(item.categories) && item.categories.includes(categoryFilter));
    }
    if (typeFilter) {
      items = items.filter(item => item.media_type === typeFilter);
    }
    if (searchQuery) {
      items = items.filter(item => 
        (item.title && item.title.toLowerCase().includes(searchQuery)) ||
        (item.original_title && item.original_title.toLowerCase().includes(searchQuery))
      );
    }

    const responsePayload = {
      categories: catalogData.categories || [],
      movies: items,
      total: items.length
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache Edge Cloudflare : 30 minutes, revalidation en arrière-plan pendant 24h
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=86400',
        ...cors
      }
    });

  } catch (err) {
    secureLog.error('Échec de distribution du catalogue', err, env);
    return new Response(JSON.stringify({
      error: 'Catalog Error',
      message: 'Impossible de charger le catalogue.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}

/**
 * Proxy de métadonnées pour les séries (saisons et épisodes) avec cache KV
 */
export async function handleSeriesInfo(request, env, ctx) {
  const url = new URL(request.url);
  const cors = getCorsHeaders(request, env);

  const seriesId = url.pathname.replace(/^\/api\/series-info\/?/i, '').replace(/[^0-9]/g, '');
  if (!seriesId) {
    return new Response(JSON.stringify({ error: 'Missing Series ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  const cacheKey = `series_${seriesId}`;

  // 1. Vérification dans le cache KV des séries
  if (env.SERIES_CACHE) {
    const cached = await env.SERIES_CACHE.get(cacheKey, { type: 'json' });
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=7200',
          ...cors
        }
      });
    }
  }

  // 2. Appel vers l'API amont Xtream Codes
  const host = env.XTREAM_HOST || 'foxbleu.org';
  const port = env.XTREAM_PORT || 80;
  const user = env.XTREAM_USER;
  const pass = env.XTREAM_PASS;

  const upstreamUrl = `http://${host}:${port}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=get_series_info&series_id=${seriesId}`;

  try {
    const upRes = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'IPTVSmartersPro/1.0' },
      signal: request.signal
    });

    if (!upRes.ok) {
      return new Response(JSON.stringify({ error: 'Upstream Error' }), {
        status: upRes.status,
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    const seriesData = await upRes.json();

    // 3. Sauvegarde dans le cache KV pour 2 heures (7200 secondes)
    if (env.SERIES_CACHE && seriesData) {
      ctx.waitUntil(env.SERIES_CACHE.put(cacheKey, JSON.stringify(seriesData), { expirationTtl: 7200 }));
    }

    return new Response(JSON.stringify(seriesData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=7200',
        ...cors
      }
    });

  } catch (err) {
    secureLog.error(`Échec récupération métadonnées série ${seriesId}`, err, env);
    return new Response(JSON.stringify({ error: 'Series Info Failure' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}
