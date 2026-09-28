/**
 * Gestionnaire d'Administration Serverless (Lecture Seule) - Cloudflare Worker
 * 
 * Rôle : Fournit les métriques système, l'état du catalogue et la santé de l'infrastructure
 * sans aucune dépendance d'écriture sur disque.
 * Sécurisé par ADMIN_TOKEN (Header 'X-Admin-Token' ou 'Authorization: Bearer <TOKEN>').
 */

import { getCorsHeaders } from '../utils/cors.js';
import { secureLog } from '../utils/security.js';

export async function handleAdminMetrics(request, env, ctx) {
  const cors = getCorsHeaders(request, env);

  // 1. Vérification de l'authentification Admin
  const adminToken = env.ADMIN_TOKEN;
  const authHeader = request.headers.get('Authorization') || '';
  const xAdminToken = request.headers.get('X-Admin-Token') || '';
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token') || '';

  const providedToken = authHeader.replace(/^Bearer\s+/i, '') || xAdminToken || queryToken;

  if (!adminToken || providedToken !== adminToken) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Jeton administrateur manquant ou invalide.',
      statusCode: 401
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  try {
    // 2. Récupération des métriques du catalogue depuis KV
    let catalogStats = { total_items: 0, movies: 0, series: 0 };
    if (env.CATALOG_KV) {
      const cat = await env.CATALOG_KV.get('catalog', { type: 'json' });
      if (cat) {
        catalogStats = {
          total_items: (cat.movies || []).length,
          categories_count: (cat.categories || []).length,
          version: cat.version || '2.0.0',
          generated_at: cat.generated_at || null
        };
      }
    }

    // 3. Synthèse des métriques en lecture seule
    const metrics = {
      status: 'operational',
      architecture: '100% Serverless Pure',
      runtime: 'Cloudflare Workers (Edge)',
      environment: env.ENVIRONMENT || 'production',
      upstream: {
        host: env.XTREAM_HOST || 'foxbleu.org',
        port: env.XTREAM_PORT || 80,
        configured: Boolean(env.XTREAM_USER && env.XTREAM_PASS)
      },
      catalog: catalogStats,
      features: {
        streaming_range_206: true,
        edge_cdn_302_redirect_follow: true,
        rate_limiting: '120 req/min/ip',
        client_side_search: '0ms instant in-memory',
        client_storage: 'localStorage (Serverless Favorites & History)'
      },
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(metrics, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors
      }
    });

  } catch (err) {
    secureLog.error('Échec de génération des métriques admin', err, env);
    return new Response(JSON.stringify({
      error: 'Admin Metrics Error',
      message: 'Erreur lors du calcul des métriques.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}
