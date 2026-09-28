/**
 * Rate Limiter en mémoire pour Cloudflare Worker
 * Algorithme : Fenêtre glissante par IP
 * Protège les flux amont contre le flooding et l'épuisement de connexions Xtream (max_connections: 1).
 */

const ipStore = new Map();
const CLEANUP_INTERVAL_MS = 60000;
let lastCleanup = Date.now();

function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [ip, record] of ipStore.entries()) {
    if (now > record.resetTime) {
      ipStore.delete(ip);
    }
  }
}

/**
 * Vérifie et met à jour le quota de requêtes pour une adresse IP
 * @param {string} clientIp - Adresse IP cliente
 * @param {number} maxRequests - Nombre max de requêtes autorisées par fenêtre (défaut : 120/min)
 * @param {number} windowSeconds - Durée de la fenêtre en secondes (défaut : 60s)
 * @returns {{ allowed: boolean, remaining: number, reset: number }}
 */
export function checkRateLimit(clientIp, maxRequests = 120, windowSeconds = 60) {
  cleanupExpired();

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const key = clientIp || 'global';

  let record = ipStore.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs
    };
    ipStore.set(key, record);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      reset: Math.ceil((record.resetTime - now) / 1000)
    };
  }

  record.count += 1;

  if (record.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      reset: Math.ceil((record.resetTime - now) / 1000)
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    reset: Math.ceil((record.resetTime - now) / 1000)
  };
}
