/**
 * ZIFLIX Serverless Proxy - Cloudflare Worker Entrypoint
 * 
 * Rôle : Point d'entrée unique serverless pour le streaming, le catalogue, l'API et l'admin.
 * Zéro secret exposé côté client.
 */

import { getCorsHeaders, handleOptions } from './utils/cors.js';
import { checkRateLimit } from './utils/rate-limiter.js';
import { handleStream } from './handlers/stream.js';
import { handleCatalog, handleSeriesInfo } from './handlers/catalog.js';
import { handleAdminMetrics } from './handlers/admin.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = getCorsHeaders(request, env);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    // 2. Rate Limiting par IP (sauf métriques admin authentifiées)
    const clientIp = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For') || 
                     '127.0.0.1';
    
    const rateLimit = checkRateLimit(clientIp, 120, 60);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Too Many Requests',
        message: 'Limite de requêtes dépassée. Veuillez patienter quelques instants.',
        retryAfter: rateLimit.reset
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.reset),
          ...cors
        }
      });
    }

    try {
      // 3. Healthcheck
      if (url.pathname === '/health' || url.pathname === '/api/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'ziflix-serverless-proxy',
          environment: env.ENVIRONMENT || 'production',
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            ...cors
          }
        });
      }

      // 4. Proxy de streaming vidéo (Phase B)
      if (url.pathname.startsWith('/api/stream/')) {
        const streamResponse = await handleStream(request, env, ctx);
        streamResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
        return streamResponse;
      }

      // 5. Distribution du catalogue (Phase C)
      if (url.pathname === '/api/catalog') {
        const catalogResponse = await handleCatalog(request, env, ctx);
        catalogResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
        return catalogResponse;
      }

      // 6. Métadonnées détaillées des séries
      if (url.pathname.startsWith('/api/series-info/')) {
        const seriesResponse = await handleSeriesInfo(request, env, ctx);
        seriesResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
        return seriesResponse;
      }

      // 7. Admin Serverless en Lecture Seule (Phase D)
      if (url.pathname === '/api/admin/metrics' || url.pathname === '/api/admin/status') {
        return handleAdminMetrics(request, env, ctx);
      }

      // 8. 404
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: `Endpoint '${url.pathname}' inconnu sur le proxy serverless.`,
        statusCode: 404
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...cors
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: env.ENVIRONMENT === 'development' ? err.message : 'Une erreur inattendue est survenue.'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...cors
        }
      });
    }
  }
};
