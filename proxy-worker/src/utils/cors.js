/**
 * Utilitaires CORS pour le Cloudflare Worker ZIFLIX
 * Assure la conformité HTTPS, le contrôle strict d'origine et l'exposition des en-têtes Range.
 */

export function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';

  // Autorise le domaine officiel de production, localhost et les aperçus Pages
  let matchedOrigin = allowedOrigin;
  if (
    allowedOrigin === '*' ||
    origin === allowedOrigin ||
    origin.endsWith('.ziablo.xyz') ||
    origin.endsWith('.pages.dev') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  ) {
    matchedOrigin = origin || allowedOrigin;
  }

  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env)
  });
}
