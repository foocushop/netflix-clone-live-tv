/**
 * Gestionnaire de Streaming Vidéo Sécurisé - Cloudflare Worker
 * 
 * Fonctionnalités critiques :
 * 1. Zéro credential exposé au client (construction dynamique des URLs amont).
 * 2. Suivi automatique des redirections HTTP 302 vers l'Edge CDN amont (port 8080).
 * 3. Transmission fidèle des en-têtes Range (HTTP 206 Partial Content) pour le seeking fluide.
 * 4. Propagation de request.signal via AbortController pour libérer instantanément la connexion amont dès que l'utilisateur quitte ou seek (respect de max_connections: 1).
 * 5. Zéro log contenant les secrets (sanitizeUrl).
 */

import { getCorsHeaders } from '../utils/cors.js';
import { sanitizeUrl, secureLog } from '../utils/security.js';

export async function handleStream(request, env, ctx) {
  const url = new URL(request.url);
  const cors = getCorsHeaders(request, env);

  // 1. Analyse de la route : /api/stream/:type/:id
  const pathParts = url.pathname.replace(/^\/api\/stream\/?/i, '').split('/');
  const streamType = (pathParts[0] || '').toLowerCase(); // 'movie', 'series', ou 'live'
  const rawId = pathParts[1] || '';

  if (!streamType || !rawId || !['movie', 'series', 'live'].includes(streamType)) {
    return new Response(JSON.stringify({
      error: 'Invalid Stream Request',
      message: "Format attendu: /api/stream/{movie|series|live}/{id}",
      statusCode: 400
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  // Extraction de l'ID numérique et de l'extension
  const match = rawId.match(/^(\d+)(?:\.([a-z0-9]+))?$/i);
  if (!match) {
    return new Response(JSON.stringify({
      error: 'Invalid Stream ID',
      message: "L'identifiant de flux doit être numérique.",
      statusCode: 400
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  const streamId = match[1];
  const extension = match[2] || (streamType === 'live' ? 'm3u8' : 'mkv');

  // 2. Vérification des identifiants amont configurés
  const host = env.XTREAM_HOST || 'foxbleu.org';
  const port = env.XTREAM_PORT || 80;
  const user = env.XTREAM_USER;
  const pass = env.XTREAM_PASS;

  if (!user || !pass) {
    secureLog.error('Configuration Xtream manquante dans les secrets Worker', null, env);
    return new Response(JSON.stringify({
      error: 'Server Configuration Error',
      message: 'Les accès de streaming amont ne sont pas configurés.',
      statusCode: 500
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }

  // 3. Construction de l'URL initiale Xtream Codes (inconnue du client)
  const isHttps = port == 443 || String(host).startsWith('https://');
  const cleanHost = String(host).replace(/^https?:\/\//, '');
  const portPart = (port == 80 || port == 443) ? '' : `:${port}`;
  const upstreamUrl = `${isHttps ? 'https' : 'http'}://${cleanHost}${portPart}/${streamType}/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${streamId}.${extension}`;

  // 4. Préparation des en-têtes à transmettre
  const upstreamHeaders = new Headers();
  upstreamHeaders.set('User-Agent', 'VLC/3.0.18 LibVLC/3.0.18');
  upstreamHeaders.set('Accept', '*/*');

  // Transmission transparente du Range s'il est fourni par le lecteur client
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    upstreamHeaders.set('Range', rangeHeader);
  }

  try {
    // 5. Première requête vers le serveur d'authentification Xtream Codes
    let upstreamRes = await fetch(upstreamUrl, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      redirect: 'manual',
      signal: request.signal
    });

    // 6. Gestion du suivi de la redirection 302 vers l'Edge CDN amont (port 8080)
    let currentUrl = upstreamUrl;
    let redirectCount = 0;
    const MAX_REDIRECTS = 3;

    while (
      [301, 302, 307, 308].includes(upstreamRes.status) &&
      redirectCount < MAX_REDIRECTS
    ) {
      redirectCount++;
      const redirectLocation = upstreamRes.headers.get('Location');
      if (!redirectLocation) break;

      const resolvedLocation = new URL(redirectLocation, currentUrl).toString();
      currentUrl = resolvedLocation;

      upstreamRes = await fetch(resolvedLocation, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        redirect: 'manual',
        signal: request.signal
      });
    }

    // 7. Vérification du statut de la réponse finale
    if (upstreamRes.status >= 400) {
      secureLog.warn(
        `Serveur amont code ${upstreamRes.status} pour flux ${streamType}/${streamId}`,
        currentUrl,
        env
      );
      return new Response(JSON.stringify({
        error: 'Upstream Stream Error',
        message: `Le flux vidéo amont a renvoyé le statut HTTP ${upstreamRes.status}.`,
        statusCode: upstreamRes.status
      }), {
        status: upstreamRes.status === 404 ? 404 : 502,
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    // 8. Construction des en-têtes de réponse pour le navigateur
    const responseHeaders = new Headers();

    for (const [key, value] of Object.entries(cors)) {
      responseHeaders.set(key, value);
    }

    const headersToForward = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified'
    ];

    for (const headerName of headersToForward) {
      const val = upstreamRes.headers.get(headerName);
      if (val) {
        responseHeaders.set(headerName, val);
      }
    }

    if (!responseHeaders.has('content-type')) {
      if (extension === 'm3u8') {
        responseHeaders.set('content-type', 'application/vnd.apple.mpegurl');
      } else if (extension === 'ts') {
        responseHeaders.set('content-type', 'video/mp2t');
      } else if (extension === 'mp4') {
        responseHeaders.set('content-type', 'video/mp4');
      } else {
        responseHeaders.set('content-type', 'video/x-matroska');
      }
    }

    if (!responseHeaders.has('accept-ranges')) {
      responseHeaders.set('accept-ranges', 'bytes');
    }

    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 9. Streaming direct sans mise en mémoire tampon
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return new Response(null, { status: 499, statusText: 'Client Closed Request' });
    }

    secureLog.error('Échec proxy streaming', err, env);
    return new Response(JSON.stringify({
      error: 'Proxy Streaming Failure',
      message: 'Impossible d’établir la liaison avec le flux vidéo amont.'
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
}
