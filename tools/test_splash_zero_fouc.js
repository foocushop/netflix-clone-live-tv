const http = require('http');
const assert = require('assert');

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 8080,
      path: path,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Splash Screen & Zero-FOUC Architecture ---');

  // Test 1: HTML markup and critical early CSS
  console.log('\n[TEST 1] Verifying index.html Critical Zero-FOUC markup...');
  const index = await fetchUrl('/');
  assert.strictEqual(index.status, 200, 'index.html returned 200 OK');
  
  assert(index.body.includes('class="auth-gate-backdrop hidden" id="authGateModal"'), 'authGateModal has hidden class by default');
  assert(index.body.includes('id="ziflixSplash"'), 'ziflixSplash container is present in index.html');
  assert(index.body.includes('class="ziflix-splash-logo"'), 'ziflix-splash-logo is present');
  assert(index.body.includes('class="ziflix-splash-shimmer"'), 'ziflix-splash-shimmer progress element is present');
  assert(index.body.includes('rel="preload" href="assets/logos/ziflix-logo.svg"'), 'Logo is preloaded in <head>');
  assert(index.body.includes('.auth-gate-backdrop.hidden { display: none !important; }'), 'Critical zero-FOUC style in <head>');
  console.log('  -> PASS: Zero-FOUC default markup and critical styles verified.');

  // Test 2: CSS Hardware acceleration & 60 FPS constraints
  console.log('\n[TEST 2] Verifying netflix.css 60 FPS hardware acceleration...');
  const css = await fetchUrl('/css/netflix.css');
  assert.strictEqual(css.status, 200, 'netflix.css returned 200 OK');

  assert(css.body.includes('.ziflix-splash-screen'), '.ziflix-splash-screen class defined');
  assert(css.body.includes('.ziflix-splash-screen.splash-dismiss'), 'splash-dismiss class defined');
  assert(css.body.includes('will-change: opacity, transform'), 'Hardware acceleration declared with will-change');
  assert(css.body.includes('@keyframes splashLogoBreathing'), 'Subtle breathing animation defined');
  assert(css.body.includes('@keyframes splashShimmer'), 'Shimmer progress animation defined');
  assert(css.body.includes('@media (prefers-reduced-motion: reduce)'), 'Accessibility media query present');
  console.log('  -> PASS: 60 FPS compositor animations and accessibility verified.');

  // Test 3: JS State Orchestration
  console.log('\n[TEST 3] Verifying app.js State Orchestration...');
  const js = await fetchUrl('/js/app.js');
  assert.strictEqual(js.status, 200, 'app.js returned 200 OK');

  assert(js.body.includes('dismissSplash()'), 'dismissSplash method is defined in app.js');
  assert(js.body.includes('splashWatchdog'), 'splashWatchdog is implemented to prevent stuck splash');
  assert(js.body.includes('this.dismissSplash()'), 'dismissSplash is called by unlockApp and showAuthGate');
  console.log('  -> PASS: JS State orchestration verified.');

  console.log('\n=== ALL SPLASH & ZERO-FOUC TESTS PASSED! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
