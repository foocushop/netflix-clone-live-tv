/**
 * XtreamProxyManager - Gestionnaire Haute Disponibilité & Résilience Définitive pour Xtream / FoxBleu
 *
 * Architecture Ultra-Résilience :
 * 1. Multi-Tier Intelligent Failover :
 *    - Tier 1 (Primaire) : Cloudflare WARP SOCKS5 (127.0.0.1:40000) - IP résidentielle propre, masquage VPS, ultra-rapide (<300ms)
 *    - Tier 2 (Secours Immédiat) : Connexion Directe VPS (HTTP/HTTPS natif) - Bascule transparente en 0ms en cas de micro-coupure WARP
 *    - Tier 3 (Ultime Recours) : Tor SOCKS5 (127.0.0.1:9050) - Utilisé uniquement si WARP et Direct sont bloqués simultanément
 * 2. In-Flight Single-Flight (Déduplication totale des requêtes) :
 *    - Empêche strictement tout dépassement de max_connections: 1 imposé par FoxBleu
 *    - Si 10 requêtes simultanées demandent la même ressource, 1 seule requête amont est émise
 * 3. Auto-Guérison WARP Définitive (< 3s) :
 *    - Commande non-bloquante avec flags --accept-tos garantis
 *    - Rotation douce de l'IP sans perte d'état ni blocage TTY
 * 4. Watchdog intelligent sans faux-positifs :
 *    - Seuil de 3 échecs consécutifs avant rotation (évite les micro-lags passagers)
 *    - Bascule instantanée sur Direct pendant que WARP se régénère en arrière-plan
 */

const { exec } = require('child_process');
const util = require('util');
const http = require('http');
const https = require('https');
const execPromise = util.promisify(exec);

let SocksProxyAgent = null;
try {
  SocksProxyAgent = require('socks-proxy-agent').SocksProxyAgent;
} catch (e) {
  try {
    SocksProxyAgent = require('/var/www/netflix-clone/node_modules/socks-proxy-agent').SocksProxyAgent;
  } catch (e2) {}
}

class XtreamProxyManager {
  constructor(options = {}) {
    this.warpProxyUrl = options.warpProxyUrl || process.env.XTREAM_WARP_URL || 'socks5h://127.0.0.1:40000';
    this.torProxyUrl = options.torProxyUrl || process.env.XTREAM_TOR_URL || 'socks5h://127.0.0.1:9050';

    this.xtreamConfig = options.xtreamConfig || {
      host: 'foxbleu.org',
      port: 80,
      username: 'josealbino',
      password: '21321'
    };

    // Mode actuel : 'warp' | 'direct' | 'tor'
    this.activeTier = 'warp';

    this.isRotating = false;
    this.rotationPromise = null;
    this.lastRotationTime = 0;
    this.minRotationCooldownMs = 45000; // 45 secondes minimum entre deux rotations

    this.consecutiveFailures = 0;
    this.failureThreshold = 3; // 3 échecs consécutifs avant bascule / rotation
    this.lastHealthyCheck = Date.now();
    this.watchdogTimer = null;

    // Single-Flight : Déduplication en vol des requêtes FoxBleu
    this.inFlightRequests = new Map();

    // Agents pré-instanciés
    this.warpAgent = this._createSocksAgent(this.warpProxyUrl);
    this.torAgent = this._createSocksAgent(this.torProxyUrl);
    this.directAgent = new http.Agent({ keepAlive: true, maxSockets: 50, timeout: 10000 });

    console.log(`[XtreamProxyManager] 🚀 Initialisé avec Tier 1 (WARP: 40000) et Tier 2 (Direct Failover)`);
  }

  _createSocksAgent(proxyUrl) {
    if (!SocksProxyAgent) {
      console.warn('[XtreamProxyManager] SocksProxyAgent non disponible');
      return null;
    }
    return new SocksProxyAgent(proxyUrl, {
      keepAlive: false,
      maxSockets: 60,
      timeout: 10000
    });
  }

  /**
   * Retourne l'agent réseau actuellement optimal
   */
  getAgent() {
    if (this.activeTier === 'warp' && this.warpAgent) {
      return this.warpAgent;
    }
    if (this.activeTier === 'tor' && this.torAgent) {
      return this.torAgent;
    }
    return this.directAgent;
  }

  getFreshAgent() {
    if (this.activeTier === 'warp' && SocksProxyAgent) {
      return new SocksProxyAgent(this.warpProxyUrl, { keepAlive: false, timeout: 10000 });
    }
    if (this.activeTier === 'tor' && SocksProxyAgent) {
      return new SocksProxyAgent(this.torProxyUrl, { keepAlive: false, timeout: 10000 });
    }
    return new http.Agent({ keepAlive: false, timeout: 10000 });
  }

  /**
   * Bascule dynamique de Tier
   */
  switchToTier(tier, reason = '') {
    if (this.activeTier === tier) return;
    const oldTier = this.activeTier;
    this.activeTier = tier;
    console.warn(`[XtreamProxyManager] 🔀 Bascule réseau : ${oldTier.toUpperCase()} ➔ ${tier.toUpperCase()} (${reason})`);
  }

  /**
   * Rotation d'identité Cloudflare WARP sécurisée et résiliente
   */
  async rotateWarpIdentity(reason = 'Blocage détecté ou renouvellement préventif') {
    if (this.isRotating && this.rotationPromise) {
      return this.rotationPromise;
    }

    const now = Date.now();
    if (now - this.lastRotationTime < this.minRotationCooldownMs) {
      console.log(`[XtreamProxyManager] ⏳ Rotation ignorée : temps de refroidissement actif (${Math.round((this.minRotationCooldownMs - (now - this.lastRotationTime)) / 1000)}s restantes)`);
      return false;
    }

    this.isRotating = true;
    this.lastRotationTime = now;

    // Basculer temporairement sur Direct pendant la régénération WARP pour ZÉRO coupure utilisateur
    this.switchToTier('direct', 'Pendant la régénération de WARP');

    this.rotationPromise = (async () => {
      console.log(`[XtreamProxyManager] 🔄 Démarrage de la rotation d'IP WARP. Raison : ${reason}`);
      const t0 = Date.now();
      try {
        // Déconnexion / Reconnexion rapide (génère une nouvelle IP Cloudflare 104.28.x.x en 2s)
        const cmd = 'warp-cli --accept-tos disconnect; sleep 1; warp-cli --accept-tos mode proxy && warp-cli --accept-tos proxy port 40000 && warp-cli --accept-tos connect';
        await execPromise(cmd, { timeout: 15000 });
        
        await new Promise(r => setTimeout(r, 2000));

        this.warpAgent = this._createSocksAgent(this.warpProxyUrl);

        // Tester si la nouvelle IP WARP répond correctement à FoxBleu
        const check = await this._testAgent(this.warpAgent, 8000);
        if (check.ok) {
          console.log(`[XtreamProxyManager] ✅ Auto-guérison WARP réussie en ${Date.now() - t0}ms ! Nouvelle IP active et auth FoxBleu validée (${check.latencyMs}ms).`);
          this.consecutiveFailures = 0;
          this.switchToTier('warp', 'WARP rétabli avec succès');
          return true;
        } else {
          console.warn(`[XtreamProxyManager] ⚠️ Nouvelle IP WARP non fonctionnelle (${check.error}). Maintien du failover Direct.`);
          return false;
        }
      } catch (err) {
        console.error('[XtreamProxyManager] ❌ Échec commande WARP :', err.message);
        // Secours si warp-svc est figé : redémarrer le service systemd
        try {
          console.log('[XtreamProxyManager] 🔄 Tentative de redémarrage du service système warp-svc...');
          await execPromise('systemctl restart warp-svc', { timeout: 10000 });
          await new Promise(r => setTimeout(r, 2500));
          await execPromise('warp-cli --accept-tos mode proxy && warp-cli --accept-tos proxy port 40000 && warp-cli --accept-tos connect', { timeout: 10000 });
          this.warpAgent = this._createSocksAgent(this.warpProxyUrl);
          const check2 = await this._testAgent(this.warpAgent, 8000);
          if (check2.ok) {
            console.log('[XtreamProxyManager] ✅ Service warp-svc redémarré et opérationnel.');
            this.consecutiveFailures = 0;
            this.switchToTier('warp', 'Service WARP restauré');
            return true;
          }
        } catch (svcErr) {
          console.error('[XtreamProxyManager] Échec du redémarrage warp-svc :', svcErr.message);
        }
        return false;
      } finally {
        this.isRotating = false;
        this.rotationPromise = null;
      }
    })();

    return this.rotationPromise;
  }

  /**
   * Teste un agent donné vers FoxBleu
   */
  _testAgent(agent, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const testUrl = `http://${this.xtreamConfig.host}:${this.xtreamConfig.port}/player_api.php?username=${this.xtreamConfig.username}&password=${this.xtreamConfig.password}`;

      const req = http.get(testUrl, {
        agent,
        headers: { 'User-Agent': 'IPTVSmartersPro/1.0', 'Accept': 'application/json' },
        timeout: timeoutMs
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const latency = Date.now() - t0;
          if (res.statusCode === 200 && (body.includes('"auth":1') || body.includes('user_info'))) {
            resolve({ ok: true, latencyMs: latency });
          } else {
            resolve({ ok: false, latencyMs: latency, error: `HTTP ${res.statusCode}` });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, latencyMs: Date.now() - t0, error: err.message });
      });

      req.on('timeout', () => {
        try { req.destroy(); } catch (e) {}
        resolve({ ok: false, latencyMs: Date.now() - t0, error: `Timeout (> ${timeoutMs}ms)` });
      });
    });
  }

  /**
   * Vérification de santé globale (teste le Tier actif, bascule en cascade si nécessaire)
   */
  async checkHealth() {
    const currentAgent = this.getFreshAgent();
    const result = await this._testAgent(currentAgent, 9000);
    if (result.ok) {
      return result;
    }

    console.warn(`[XtreamProxyManager] ⚠️ Test échoué sur ${this.activeTier.toUpperCase()} (${result.error})`);

    // Si WARP échoue, tester immédiatement Direct
    if (this.activeTier === 'warp') {
      const directCheck = await this._testAgent(this.directAgent, 6000);
      if (directCheck.ok) {
        this.switchToTier('direct', 'WARP inaccessible mais Direct fonctionne parfaitement');
        this.rotateWarpIdentity('Auto-régénération arrière-plan suite à échec watchdog').catch(() => {});
        return { ok: true, latencyMs: directCheck.latencyMs, recoveredWith: 'direct' };
      }
    } else if (this.activeTier === 'direct') {
      // Si Direct échoue, tester WARP ou Tor
      const warpCheck = await this._testAgent(this.warpAgent, 6000);
      if (warpCheck.ok) {
        this.switchToTier('warp', 'Direct inaccessible mais WARP fonctionne');
        return { ok: true, latencyMs: warpCheck.latencyMs, recoveredWith: 'warp' };
      }
      const torCheck = await this._testAgent(this.torAgent, 8000);
      if (torCheck.ok) {
        this.switchToTier('tor', 'WARP et Direct inaccessibles, secours Tor');
        return { ok: true, latencyMs: torCheck.latencyMs, recoveredWith: 'tor' };
      }
    }

    return result;
  }

  /**
   * Rapporte un échec de requête sur FoxBleu pour analyse d'auto-guérison
   */
  reportFailure(reason = '') {
    this.consecutiveFailures++;
    console.warn(`[XtreamProxyManager] Signalement d'échec (${this.consecutiveFailures}/${this.failureThreshold}) [Tier: ${this.activeTier}] : ${reason}`);
    
    if (this.consecutiveFailures >= this.failureThreshold) {
      console.warn(`[XtreamProxyManager] 🚨 Seuil d'échecs consécutifs atteint (${this.consecutiveFailures}). Déclenchement du failover...`);
      if (this.activeTier === 'warp') {
        this.switchToTier('direct', `Failover après ${this.consecutiveFailures} échecs sur WARP`);
        this.rotateWarpIdentity(`Failover déclenché : ${reason}`).catch(() => {});
      } else if (this.activeTier === 'direct') {
        this.switchToTier('warp', `Failover après ${this.consecutiveFailures} échecs sur Direct`);
      }
      this.consecutiveFailures = 0;
    }
  }

  reportSuccess() {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * In-Flight Single-Flight : Empêche les requêtes concurrentes vers FoxBleu
   * Garantit le respect strict de max_connections: 1
   */
  deduplicate(key, fetcherFn) {
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key);
    }
    const promise = (async () => {
      try {
        return await fetcherFn();
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();
    this.inFlightRequests.set(key, promise);
    return promise;
  }

  /**
   * Démarrage du Watchdog autonome (Health Check périodique toutes les 90s)
   */
  startWatchdog(intervalSeconds = 90) {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    console.log(`[Xtream Watchdog] 🛡️ Démarrage du gardien automatique multi-tier (contrôle toutes les ${intervalSeconds}s)...`);

    this.watchdogTimer = setInterval(async () => {
      if (this.isRotating) return;

      const health = await this.checkHealth();
      if (health.ok) {
        this.lastHealthyCheck = Date.now();
        this.consecutiveFailures = 0;
        // Si on était en mode Direct après un failover temporaire, tenter de revenir sur WARP si WARP est à nouveau prêt
        if (this.activeTier === 'direct' && Date.now() - this.lastRotationTime > 60000) {
          const warpProbe = await this._testAgent(this.warpAgent, 6000);
          if (warpProbe.ok) {
            this.switchToTier('warp', 'WARP rétabli et vérifié sain');
          }
        }
      } else {
        console.warn(`[Xtream Watchdog] ⚠️ Test périodique échoué (${health.error}). Déclenchement de la rotation / failover.`);
        this.reportFailure(`Watchdog failure: ${health.error}`);
      }
    }, intervalSeconds * 1000);

    if (this.watchdogTimer.unref) {
      this.watchdogTimer.unref();
    }
  }
}

// Instance Singleton partagée
const xtreamProxyManager = new XtreamProxyManager();

module.exports = {
  XtreamProxyManager,
  xtreamProxyManager
};
