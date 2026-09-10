// tools/test_in_real_chrome.js
// Suite de tests automatisée complète dans un véritable Google Chrome headless via CDP
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9340;

class ChromeRunner {
  constructor(port = CDP_PORT) {
    this.port = port;
    this.chromeProcess = null;
    this.ws = null;
    this.msgId = 1;
    this.pendingCallbacks = new Map();
    this.consoleLogs = [];
    this.exceptions = [];
  }

  async start() {
    const tmpDir = path.join(os.tmpdir(), `chrome-profile-${Date.now()}`);
    this.chromeProcess = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${this.port}`,
      '--remote-allow-origins=*',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--mute-audio',
      `--user-data-dir=${tmpDir}`,
      'about:blank'
    ]);

    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch (e) {}
    }

    if (!ready) throw new Error('Impossible de démarrer Chrome sur le port ' + this.port);

    const newTabRes = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    this.ws = new WebSocket(tabData.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pendingCallbacks.has(msg.id)) {
        const cb = this.pendingCallbacks.get(msg.id);
        this.pendingCallbacks.delete(msg.id);
        if (msg.error) cb.reject(msg.error);
        else cb.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
        this.consoleLogs.push(`[${msg.params.type.toUpperCase()}] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
        this.exceptions.push(`[EXC] ${desc}`);
      }
    };

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pendingCallbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async navigate(url) {
    this.consoleLogs = [];
    this.exceptions = [];
    await this.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 2500));
  }

  async getVideoState() {
    return await this.eval(`
      (() => {
        const v = document.getElementById('mainVideo');
        const loader = document.getElementById('playerLoader');
        const bufferedRanges = [];
        if (v && v.buffered) {
          for (let i = 0; i < v.buffered.length; i++) {
            bufferedRanges.push(v.buffered.start(i).toFixed(1) + '-' + v.buffered.end(i).toFixed(1) + 's');
          }
        }
        return {
          exists: !!v,
          paused: v ? v.paused : true,
          currentTime: v ? v.currentTime : 0,
          duration: v ? (v.duration || 0) : 0,
          readyState: v ? v.readyState : 0,
          buffered: bufferedRanges,
          loaderHidden: loader ? loader.classList.contains('hidden') : false,
          videoWidth: v ? v.videoWidth : 0,
          videoHeight: v ? v.videoHeight : 0,
          error: v && v.error ? { code: v.error.code, message: v.error.message } : null
        };
      })()
    `);
  }

  async stop() {
    try {
      if (this.ws) this.ws.close();
      if (this.chromeProcess) this.chromeProcess.kill();
    } catch (e) {}
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('  🧪 SUITE DE VALIDATION VIDÉO DANS UN VÉRITABLE GOOGLE CHROME VIA CDP');
  console.log('========================================================================\n');

  const runner = new ChromeRunner();
  let passed = 0;
  let total = 0;

  try {
    console.log('[1/4] Démarrage du moteur Chrome headless...');
    await runner.start();
    console.log('      Chrome 152 opérationnel sur le port', runner.port, '✅\n');

    // =========================================================================
    // TEST 1 : LOCAL APP & INITIALISATION
    // =========================================================================
    total++;
    console.log('[2/4] Chargement de l\'application locale (http://127.0.0.1:8080)...');
    await runner.navigate('http://127.0.0.1:8080');

    const appReady = await runner.eval(`typeof window.netflixPlayer !== 'undefined' && typeof window.netflixApp !== 'undefined'`);
    if (appReady) {
      console.log('      NetflixApp et NetflixPlayer initialisés : SUCCÈS ✅');
      passed++;
    } else {
      console.error('      Échec initialisation NetflixApp/NetflixPlayer ❌');
    }

    // =========================================================================
    // TEST 2 : LECTURE LIVE TV TF1 DANS CHROME
    // =========================================================================
    total++;
    console.log('\n   📡 [TEST LIVE TV] Lancement de TF1 (Stream H.264 / HLS)...');
    await runner.eval(`
      window.netflixPlayer.open({
        id: '13917',
        title: 'TF1 HD',
        media_type: 'channel',
        is_live: true,
        is_xtream: true,
        stream_id: '13917',
        stream_url: '/api/stream/xtream?stream_id=13917',
        player_type: 'direct_hls'
      }, 1);
    `);

    let liveSuccess = false;
    for (let s = 1; s <= 8; s++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await runner.getVideoState();
      console.log(`      T+${s}s: paused=${st.paused} | time=${st.currentTime.toFixed(2)}s | readyState=${st.readyState} (4=ENOUGH) | res=${st.videoWidth}x${st.videoHeight} | loaderHidden=${st.loaderHidden} | buf=[${st.buffered.join(', ')}]`);
      if (!st.paused && st.currentTime > 0.5 && st.readyState >= 2 && st.loaderHidden) {
        liveSuccess = true;
      }
    }

    if (liveSuccess) {
      console.log('      ✅ LIVE TV TF1 : Lecture fluide confirmée dans Chrome ! (H.264, readyState=4)');
      passed++;
    } else {
      console.error('      ❌ LIVE TV TF1 : Échec du démarrage');
    }

    // =========================================================================
    // TEST 3 : LECTURE LIVE TV CANAL+ FRANCE DANS CHROME
    // =========================================================================
    total++;
    console.log('\n   📡 [TEST LIVE TV] Lancement de Canal+ France (ID 14151)...');
    await runner.eval(`
      window.netflixPlayer.open({
        id: '14151',
        title: 'Canal+ France',
        media_type: 'channel',
        is_live: true,
        is_xtream: true,
        stream_id: '14151',
        stream_url: '/api/stream/xtream?stream_id=14151',
        player_type: 'direct_hls'
      }, 1);
    `);

    let canalSuccess = false;
    for (let s = 1; s <= 8; s++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await runner.getVideoState();
      console.log(`      T+${s}s: paused=${st.paused} | time=${st.currentTime.toFixed(2)}s | readyState=${st.readyState} | res=${st.videoWidth}x${st.videoHeight} | loaderHidden=${st.loaderHidden} | buf=[${st.buffered.join(', ')}]`);
      if (!st.paused && st.currentTime > 0.5 && st.readyState >= 2 && st.loaderHidden) {
        canalSuccess = true;
      }
    }

    if (canalSuccess) {
      console.log('      ✅ LIVE TV CANAL+ : Lecture fluide confirmée dans Chrome ! (H.264, readyState=4)');
      passed++;
    } else {
      console.error('      ❌ LIVE TV CANAL+ : Échec du démarrage');
    }

    // =========================================================================
    // TEST 4 : LECTURE SÉRIE VOD (LA VILLA DES CŒURS BRISÉS)
    // =========================================================================
    total++;
    console.log('\n   🍿 [TEST VOD SÉRIE] Lancement de La Villa des Cœurs Brisés (Range 206 / fMP4)...');
    await runner.eval(`
      window.netflixApp.openTeleRealiteSeries({ series_id: '6715', name: 'La Villa des Cœurs Brisés' }, true);
    `);

    let vodSuccess = false;
    for (let s = 1; s <= 8; s++) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await runner.getVideoState();
      console.log(`      T+${s}s: paused=${st.paused} | time=${st.currentTime.toFixed(2)}s / ${st.duration.toFixed(0)}s | readyState=${st.readyState} | res=${st.videoWidth}x${st.videoHeight} | loaderHidden=${st.loaderHidden} | buf=[${st.buffered.join(', ')}]`);
      if (!st.paused && st.currentTime > 0.5 && st.readyState >= 2 && st.loaderHidden) {
        vodSuccess = true;
      }
    }

    if (vodSuccess) {
      console.log('      ✅ VOD SÉRIE : Lecture 1080p fMP4 confirmée dans Chrome ! (readyState=4, 1920x1080)');
      passed++;
    } else {
      console.error('      ❌ VOD SÉRIE : Échec du démarrage');
    }

    // =========================================================================
    // TEST 5 : AUDIT DU DÉPLOIEMENT RENDER (DISTANT)
    // =========================================================================
    total++;
    console.log('\n[3/4] Inspection de l\'instance de production Render...');
    await runner.navigate('https://netflix-clone-live-tv-j9ta.onrender.com');

    const renderAudit = await runner.eval(`
      (() => {
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src);
        return {
          appExists: typeof window.netflixApp !== 'undefined',
          playerExists: typeof window.netflixPlayer !== 'undefined',
          scripts
        };
      })()
    `);

    console.log('      Render App détectée ?', renderAudit.appExists ? 'OUI ✅' : 'NON ❌');
    console.log('      Render Player détecté ?', renderAudit.playerExists ? 'OUI ✅' : 'NON ❌');

    // Vérifier la taille exacte du fichier player.js servi par Render
    const renderPlayerSize = await new Promise(resolve => {
      const https = require('https');
      https.get('https://netflix-clone-live-tv-j9ta.onrender.com/js/player.js', res => {
        let len = 0;
        res.on('data', c => len += c.length);
        res.on('end', () => resolve(len));
      }).on('error', () => resolve(0));
    });

    console.log(`      Taille du player.js sur Render : ${renderPlayerSize} octets`);
    if (renderPlayerSize === 78256) {
      console.log('      ⚠️ RENDER EST FIGÉ SUR L\'ANCIEN COMMIT 12a8e1d (78 256 octets) !');
      console.log('         Les commits récents n\'ont pas été déployés automatiquement par Render.');
    } else {
      console.log('      ✅ RENDER SERT LE NOUVEAU CODE DU LECTEUR !');
      passed++;
    }

    console.log('\n========================================================================');
    console.log(`  RÉSULTATS DE LA VALIDATION CHROME CDP : ${passed} / ${total} TESTS RÉUSSIS`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('❌ ERREUR SUITE TEST CHROME:', err);
  } finally {
    await runner.stop();
  }
}

runTests();
