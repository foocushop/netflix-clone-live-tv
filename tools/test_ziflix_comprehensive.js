const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 8189;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body), rawBody: body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, rawBody: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting ZIFLIX Comprehensive Integration Test Suite ---');
  
  // 1. Launch server instance on TEST_PORT
  const projectRoot = path.resolve(__dirname, '..');
  const env = Object.assign({}, process.env, { PORT: String(TEST_PORT), NODE_ENV: 'test', SKIP_GITHUB_PULL: '1' });
  const serverProcess = spawn('node', ['server.js'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  serverProcess.stdout.on('data', d => serverOutput += d.toString());
  serverProcess.stderr.on('data', d => serverOutput += d.toString());

  // Wait for server to listen
  await new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await request({ host: '127.0.0.1', port: TEST_PORT, path: '/api/ping', method: 'GET' });
        if (res.status === 200) {
          clearInterval(interval);
          resolve();
        }
      } catch (e) {
        if (attempts > 30) {
          clearInterval(interval);
          reject(new Error('Server failed to start in 15 seconds. Output: ' + serverOutput));
        }
      }
    }, 500);
  });

  console.log('Server running on port ' + TEST_PORT);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  [PASS]', message);
      passed++;
    } else {
      console.error('  [FAIL]', message);
      failed++;
    }
  }

  try {
    // TEST 1: Static rebranding in HTML & absence of VO/VF selectors
    console.log('\n[TEST 1] Testing index.html Rebranding & VO/VF removal');
    const indexRes = await request({ host: '127.0.0.1', port: TEST_PORT, path: '/', method: 'GET' });
    assert(indexRes.status === 200, 'index.html served with 200 OK');
    assert(indexRes.rawBody.includes('ZIFLIX'), 'index.html contains ZIFLIX brand');
    assert(indexRes.rawBody.includes('authGateModal'), 'index.html contains mandatory authGateModal');
    assert(indexRes.rawBody.includes('profileCustomModal'), 'index.html contains profileCustomModal');
    assert(!indexRes.rawBody.includes('btn-vovf'), 'btn-vovf removed from markup');
    assert(!indexRes.rawBody.includes('💎 Xtream VIP'), 'obsolete square badges removed');

    // TEST 2: Brand Logos & 10 Avatars
    console.log('\n[TEST 2] Testing Brand Logos & 10 Avatars');
    const logoRes = await request({ host: '127.0.0.1', port: TEST_PORT, path: '/assets/logos/ziflix-logo.svg', method: 'GET' });
    assert(logoRes.status === 200 && logoRes.rawBody.includes('<svg'), 'ziflix-logo.svg is valid 200 SVG');
    
    let allAvatarsOk = true;
    for (let i = 1; i <= 10; i++) {
      const avRes = await request({ host: '127.0.0.1', port: TEST_PORT, path: `/assets/avatars/avatar-${i}.svg`, method: 'GET' });
      if (avRes.status !== 200 || !avRes.rawBody.includes('<svg')) {
        allAvatarsOk = false;
        console.error(`  Avatar ${i} failed with status ${avRes.status}`);
      }
    }
    assert(allAvatarsOk, 'All 10 avatars (avatar-1.svg to avatar-10.svg) served with 200 SVG');

    // TEST 3: Admin Pre-Seeded Login (admin / 1965)
    console.log('\n[TEST 3] Testing Pre-seeded Admin Login (admin / 1965)');
    const adminLoginRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/login', method: 'POST'
    }, { username: 'admin', password: 'wrongpassword' });
    assert(adminLoginRes.status === 401, 'Wrong admin password returns 401');

    const adminLoginSuccess = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/login', method: 'POST'
    }, { username: 'admin', password: '1965' });
    assert(adminLoginSuccess.status === 200 && adminLoginSuccess.body.success, 'admin / 1965 logs in successfully');
    const adminToken = adminLoginSuccess.body.token;
    assert(!!adminToken, 'Admin receives session token');
    assert(adminLoginSuccess.body.user.role === 'admin', 'Admin user has role=admin');

    // TEST 4: User Registration (Pseudo + Password only, no email)
    console.log('\n[TEST 4] Testing User Registration & Profile');
    const testUsername = 'ZiflixFan_' + Math.floor(Math.random() * 10000);
    const regRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/register', method: 'POST'
    }, { username: testUsername, password: 'password123', avatar: 'assets/avatars/avatar-5.svg' });
    assert(regRes.status === 200 && regRes.body.success, 'User registration succeeds without email');
    const userToken = regRes.body.token;
    const testUserId = regRes.body.user.id;
    assert(regRes.body.user.username === testUsername, 'Registered username matches');
    assert(regRes.body.user.avatar === 'assets/avatars/avatar-5.svg', 'Avatar saved correctly');

    assert(regRes.body.user.role === 'user', 'New user defaults to role=user (not escalated to admin)');

    // TEST 5: Duplicate registration prevention
    const dupRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/register', method: 'POST'
    }, { username: testUsername, password: 'password123' });
    assert(dupRes.status === 409 || dupRes.status === 400, 'Duplicate username is rejected');

    // TEST 6: Session verification GET /api/auth/me
    console.log('\n[TEST 6] Testing Session Verification (/api/auth/me)');
    const meRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(meRes.status === 200 && meRes.body.user.username === testUsername, '/api/auth/me returns valid user');

    // TEST 7: Profile Customization (Change avatar & username)
    console.log('\n[TEST 7] Testing Profile Customization (/api/auth/profile)');
    const updatedName = testUsername + '_VIP';
    const profileRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/profile', method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` }
    }, { username: updatedName, avatar: 'assets/avatars/avatar-9.svg' });
    assert(profileRes.status === 200 && profileRes.body.user.username === updatedName, 'Profile updated successfully');

    // TEST 8: Comments API - Post, Fetch, Delete (via Body and Query)
    console.log('\n[TEST 8] Testing Comments API');
    const commentRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/comments', method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` }
    }, {
      mediaId: 'test_film_101',
      mediaTitle: 'Test Film Ziflix',
      text: 'Superbe qualité de streaming sur ZIFLIX !'
    });
    assert(commentRes.status === 200 && commentRes.body.success, 'Comment posted successfully');
    const commentId = commentRes.body.comment.id;
    assert(!!commentId, 'Comment receives an ID');

    // Post second comment to test deletion via body
    const commentRes2 = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/comments', method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` }
    }, {
      mediaId: 'test_film_101',
      mediaTitle: 'Test Film Ziflix 2',
      text: 'Deuxième avis de test'
    });
    const commentId2 = commentRes2.body.comment.id;

    // Fetch comments for media
    const getCommentsRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/comments?mediaId=test_film_101', method: 'GET'
    });
    assert(getCommentsRes.status === 200 && Array.isArray(getCommentsRes.body.comments), 'Comments fetched for media');
    assert(getCommentsRes.body.comments.some(c => c.id === commentId), 'Posted comment appears in media list');

    // Fetch recent comments
    const recentRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/comments?recent=true', method: 'GET'
    });
    assert(recentRes.status === 200 && recentRes.body.comments.some(c => c.id === commentId), 'Recent comments API works');

    // User can delete own comment via query param
    const delRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: `/api/comments?id=${commentId}`, method: 'DELETE',
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(delRes.status === 200 && delRes.body.success, 'Author can delete their own comment via query');

    // User can delete own comment via JSON body
    const delRes2 = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/comments', method: 'DELETE',
      headers: { 'Authorization': `Bearer ${userToken}` }
    }, { commentId: commentId2 });
    assert(delRes2.status === 200 && delRes2.body.success, 'Author can delete their own comment via JSON body');

    // TEST 9: Admin Studio - Users moderation (Ban, Role)
    console.log('\n[TEST 9] Testing Admin Community Moderation');
    const adminUsersRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/admin/users', method: 'GET',
      headers: { 'x-admin-password': '1965' }
    });
    assert(adminUsersRes.status === 200 && Array.isArray(adminUsersRes.body.users), 'Admin users list retrieved');
    assert(adminUsersRes.body.users.some(u => u.id === testUserId), 'Test user present in admin list');

    // Ban user
    const banRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/admin/users/ban', method: 'POST',
      headers: { 'x-admin-password': '1965' }
    }, { userId: testUserId, banned: true });
    assert(banRes.status === 200 && banRes.body.user.banned === true, 'Admin successfully bans user');

    // Banned user cannot make authenticated calls
    const bannedCall = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(bannedCall.status === 403, 'Banned user session is revoked immediately (403 Forbidden)');

    // Unban user
    const unbanRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/admin/users/ban', method: 'POST',
      headers: { 'x-admin-password': '1965' }
    }, { userId: testUserId, banned: false });
    assert(unbanRes.status === 200 && unbanRes.body.user.banned === false, 'Admin successfully unbans user');

    // Promote to admin
    const roleRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/admin/users/role', method: 'POST',
      headers: { 'x-admin-password': '1965' }
    }, { userId: testUserId, role: 'admin' });
    assert(roleRes.status === 200 && roleRes.body.user.role === 'admin', 'User role promoted to admin');

    // TEST 10: Catalog & Stream Auth Protection (Page Tampon Architecture)
    console.log('\n[TEST 10] Testing Page Tampon Auth Protection & Catalog API');
    const unauthCatRes = await request({ host: '127.0.0.1', port: TEST_PORT, path: '/api/catalog', method: 'GET' });
    assert(unauthCatRes.status === 401, 'Unauthenticated /api/catalog is blocked with 401 Unauthorized');

    const unauthStreamRes = await request({ host: '127.0.0.1', port: TEST_PORT, path: '/api/stream/xtream-series?episode_id=9999', method: 'GET' });
    assert(unauthStreamRes.status === 401, 'Unauthenticated stream endpoint is blocked with 401 Unauthorized');

    const catRes = await request({
      host: '127.0.0.1', port: TEST_PORT, path: '/api/catalog', method: 'GET',
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(catRes.status === 200 && catRes.body && catRes.body.success && catRes.body.data && Array.isArray(catRes.body.data.rows), 'Authenticated /api/catalog returns 200 OK with valid data and rows');
    const firstRow = catRes.body.data.rows[0];
    assert(firstRow && firstRow.category.slug === 'top-regardes', 'Row 1 is "🔥 Nouveautés & Les Plus Regardés"');
    assert(firstRow.movies.length > 0, `Row 1 contains ${firstRow.movies.length} top movies`);

    const hasNetflixInRows = JSON.stringify(catRes.body.data).includes('Netflix Originals');
    assert(!hasNetflixInRows, 'Catalog contains 0 references to "Netflix Originals"');

    console.log(`\n=== Integration Test Suite Completed: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error('Fatal test execution error:', err);
    failed++;
  } finally {
    serverProcess.kill('SIGKILL');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
