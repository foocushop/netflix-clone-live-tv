/**
 * lib/vidmoly-keepalive.js - Vidmoly Keep-Alive Sentinel
 * 
 * Maintien automatique de l'activité sur Vidmoly :
 * 1. Ping régulier (tous les 45 jours) de chaque vidéo enregistrée sur Vidmoly.
 * 2. Résolution du flux via vidmoly.resolveVidmolyStream() et téléchargement du premier segment (~200 Ko).
 * 3. Réinitialise le compteur d'inactivité de 365 jours de Vidmoly à vie.
 * 4. Détecte les vidéos supprimées / DMCA (status: 'dead').
 * 5. Cadence douce : 1 vidéo toutes les 15 secondes.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EPISODES_FILE = path.join(DATA_DIR, 'vidmoly_episodes.json');

const vidmoly = require('./vidmoly');

const RETENTION_REFRESH_INTERVAL_MS = 45 * 24 * 3600 * 1000; // 45 jours
const PING_DELAY_MS = 15000; // 15 secondes entre chaque ping

let isBatchRunning = false;
let lastBatchStats = {
  lastRunAt: null,
  processedCount: 0,
  successCount: 0,
  deadCount: 0,
  isRunning: false
};

// Requête HTTP(S) légère via WARP pour simuler la lecture d'un segment
function pingStreamChunk(url) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const client = u.protocol === 'https:' ? https : http;
      const agent = vidmoly.warpAgent || undefined;

      const req = client.get(url, {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Referer': 'https://vidmoly.org/',
          'Range': 'bytes=0-204800'
        },
        timeout: 10000
      }, (res) => {
        let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes >= 204800) {
            req.destroy();
            resolve(true);
          }
        });
        res.on('end', () => resolve(true));
      });

      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Ping d'une vidéo spécifique par son fileCode
 */
async function pingVideo(fileCode) {
  if (!fileCode) throw new Error('fileCode manquant');

  const resolved = await vidmoly.resolveVidmolyStream(fileCode);

  if (!resolved) {
    return { success: false, message: 'Réponse vide' };
  }

  if (resolved.status === 'deleted') {
    return { success: false, isDead: true, message: 'Fichier supprimé de Vidmoly' };
  }

  if (resolved.status === 'ready' && resolved.streamUrl) {
    // Ping réel du premier segment de la vidéo pour enregistrer l'activité
    await pingStreamChunk(resolved.streamUrl);
    return {
      success: true,
      fileCode,
      streamUrl: resolved.streamUrl,
      timestamp: Date.now()
    };
  }

  if (resolved.status === 'converting') {
    return { success: true, isConverting: true, message: 'Vidéo en cours d encodage', timestamp: Date.now() };
  }

  return { success: false, message: resolved.message || 'Inconnu' };
}

/**
 * Exécute un cycle de maintien en vie
 */
async function runKeepAliveBatch(forceAll = false) {
  if (isBatchRunning) {
    return { alreadyRunning: true, stats: lastBatchStats };
  }

  isBatchRunning = true;
  lastBatchStats.isRunning = true;
  lastBatchStats.lastRunAt = Date.now();
  lastBatchStats.processedCount = 0;
  lastBatchStats.successCount = 0;
  lastBatchStats.deadCount = 0;

  console.log(`[Keep-Alive Sentinel] 🛡️ Démarrage du cycle Keep-Alive (forceAll=${forceAll})...`);

  (async () => {
    try {
      const episodesMap = vidmoly.getEpisodesMap();
      const allReady = Object.values(episodesMap).filter(e => e.fileCode && e.status === 'ready');

      const now = Date.now();
      const toPing = allReady.filter(e => {
        if (forceAll) return true;
        if (!e.lastKeepAliveAt) return true;
        return (now - e.lastKeepAliveAt) >= RETENTION_REFRESH_INTERVAL_MS;
      });

      console.log(`[Keep-Alive Sentinel] ${toPing.length}/${allReady.length} vidéos nécessitent un rafraîchissement Keep-Alive.`);

      for (let i = 0; i < toPing.length; i++) {
        const item = toPing[i];
        lastBatchStats.processedCount++;

        try {
          console.log(`[Keep-Alive Sentinel] [${i + 1}/${toPing.length}] Ping de ${item.title || item.episodeId} (${item.fileCode})...`);
          const result = await pingVideo(item.fileCode);

          if (result.success) {
            item.lastKeepAliveAt = Date.now();
            if (item.status === 'dead') item.status = 'ready';
            lastBatchStats.successCount++;
            console.log(`[Keep-Alive Sentinel] ✅ ${item.fileCode} maintenu en vie avec succès.`);
          } else if (result.isDead) {
            item.status = 'dead';
            item.statusMessage = 'Supprimé de Vidmoly (404 / DMCA)';
            lastBatchStats.deadCount++;
            console.warn(`[Keep-Alive Sentinel] ⚠️ ${item.fileCode} est mort (404).`);
          }

          vidmoly.saveEpisodeEntry(item.episodeId, item);
        } catch (err) {
          console.error(`[Keep-Alive Sentinel] Erreur sur ${item.fileCode}:`, err.message);
        }

        // Pause douce entre les vidéos
        if (i < toPing.length - 1) {
          await new Promise(r => setTimeout(r, PING_DELAY_MS));
        }
      }

      console.log(`[Keep-Alive Sentinel] 🏁 Cycle terminé : ${lastBatchStats.successCount} succès, ${lastBatchStats.deadCount} supprimés.`);
    } catch (globalErr) {
      console.error('[Keep-Alive Sentinel] Erreur globale du cycle:', globalErr.message);
    } finally {
      isBatchRunning = false;
      lastBatchStats.isRunning = false;
    }
  })();

  return { started: true, stats: lastBatchStats };
}

function getKeepAliveStats() {
  const episodesMap = vidmoly.getEpisodesMap();
  const allWithCode = Object.values(episodesMap).filter(e => e.fileCode);
  const now = Date.now();

  let aliveCount = 0;
  let needRefreshCount = 0;
  let deadCount = 0;

  allWithCode.forEach(e => {
    if (e.status === 'dead') {
      deadCount++;
    } else if (e.lastKeepAliveAt && (now - e.lastKeepAliveAt) < RETENTION_REFRESH_INTERVAL_MS) {
      aliveCount++;
    } else {
      needRefreshCount++;
    }
  });

  return {
    totalVideos: allWithCode.length,
    aliveCount,
    needRefreshCount,
    deadCount,
    isRunning: isBatchRunning,
    lastBatchStats
  };
}

function initSentinel() {
  console.log('[Keep-Alive Sentinel] Sentinel activé. Vérification périodique toutes les 12h.');
  setTimeout(() => {
    runKeepAliveBatch(false);
  }, 120000);

  setInterval(() => {
    runKeepAliveBatch(false);
  }, 12 * 3600 * 1000);
}

module.exports = {
  pingVideo,
  runKeepAliveBatch,
  getKeepAliveStats,
  initSentinel
};
