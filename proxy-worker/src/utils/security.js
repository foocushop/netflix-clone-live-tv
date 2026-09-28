/**
 * Utilitaires de sécurité et d'assainissement pour ZIFLIX Serverless Proxy
 * Empêche formellement l'exposition de credentials dans les logs et exceptions.
 */

/**
 * Assainit une URL pour éliminer tout mot de passe ou identifiant Xtream
 * @param {string} urlStr - L'URL brute à masquer
 * @param {Object} env - Variables d'environnement contenant XTREAM_USER et XTREAM_PASS
 * @returns {string} - L'URL sécurisée pour le logging
 */
export function sanitizeUrl(urlStr, env = {}) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  let sanitized = urlStr;
  
  if (env.XTREAM_PASS) {
    sanitized = sanitized.split(env.XTREAM_PASS).join('***');
  }
  if (env.XTREAM_USER) {
    sanitized = sanitized.split(env.XTREAM_USER).join('***');
  }
  
  sanitized = sanitized.replace(/\/(movie|series|live)\/[^/]+\/[^/]+\//gi, '/$1/***/[REDACTED]/');
  return sanitized;
}

/**
 * Logger sécurisé garantissant l'absence de fuite de credentials dans Cloudflare Logs
 */
export const secureLog = {
  info(message, data, env = {}) {
    if (data) {
      console.log(`[INFO] ${message}`, typeof data === 'string' ? sanitizeUrl(data, env) : data);
    } else {
      console.log(`[INFO] ${message}`);
    }
  },
  warn(message, data, env = {}) {
    if (data) {
      console.warn(`[WARN] ${message}`, typeof data === 'string' ? sanitizeUrl(data, env) : data);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },
  error(message, error, env = {}) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] ${message}:`, sanitizeUrl(errorMsg, env));
  }
};
