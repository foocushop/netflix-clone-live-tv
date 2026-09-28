const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'vidmoly_accounts.json');

function getAccounts() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    const initial = [
      {
        username: "ziflixtv_urrjko",
        apiKey: "6324751pc69yqng6coltvn",
        requestsToday: 0,
        lastDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now(),
        status: "active",
        uploadRestricted: false
      }
    ];
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  try {
    const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    const today = new Date().toISOString().split('T')[0];
    let changed = false;
    for (const acc of accounts) {
      if (acc.lastDate !== today) {
        acc.lastDate = today;
        acc.requestsToday = 0;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
    }
    return accounts;
  } catch (e) {
    return [];
  }
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
}

function registerNewVidmolyAccount() {
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    const rand = Math.random().toString(36).substring(2, 8);
    const username = `zflix_${rand}`;
    const email = `zflix_${rand}@mailnesia.com`;
    const password = `ZflixPass_${rand}99!`;

    console.log(`[Vidmoly Accounts] Inscription d'un nouveau compte (${attempts}/3) : ${username}...`);

    try {
      const regPayload = JSON.stringify({
        username,
        email,
        password,
        confirmPassword: password
      });

      const curlReg = `curl -s -i -x socks5h://127.0.0.1:40000 -X POST -H "Content-Type: application/json" -H "Referer: https://vidmoly.me/auth/register" -d '${regPayload}' "https://vidmoly.me/api/auth/register"`;
      const regRes = execSync(curlReg, { timeout: 15000 }).toString();

      const cookieMatch = regRes.match(/set-cookie:\s*(vidmoly_session=[^;]+)/i);
      if (!cookieMatch) {
        throw new Error('Échec inscription Vidmoly (aucun cookie session reçu) : ' + regRes.slice(0, 200));
      }
      const sessionCookie = cookieMatch[1];

      const curlKey = `curl -s -i -x socks5h://127.0.0.1:40000 -X POST -H "Cookie: ${sessionCookie}" -H "Content-Type: application/json" -H "Referer: https://vidmoly.me/user/settings?tab=api" "https://vidmoly.me/api/user/api-key"`;
      const keyRes = execSync(curlKey, { timeout: 15000 }).toString();

      const keyBody = keyRes.split('\r\n\r\n')[1] || keyRes.split('\n\n')[1] || '{}';
      const keyJson = JSON.parse(keyBody);
      if (!keyJson.apiKey) {
        throw new Error('Échec obtention clé API Vidmoly : ' + keyRes.slice(0, 200));
      }

      const newAccount = {
        username,
        email,
        password,
        apiKey: keyJson.apiKey,
        requestsToday: 0,
        lastDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now(),
        status: "active",
        uploadRestricted: false
      };

      const accounts = getAccounts();
      accounts.push(newAccount);
      saveAccounts(accounts);
      console.log(`[Vidmoly Accounts] ✅ Nouveau compte actif créé avec succès ! Login: ${newAccount.username}, Clé API: ${newAccount.apiKey}`);
      return newAccount;
    } catch (err) {
      console.warn(`[Vidmoly Accounts] Tentative ${attempts} échouée :`, err.message);
      if (attempts >= 3) throw err;
    }
  }
}

function getActiveApiKey() {
  const accounts = getAccounts();
  const available = accounts.find(a => 
    !a.uploadRestricted && 
    a.status !== 'upload_restricted' && 
    a.status !== 'invalid' && 
    a.status !== 'full_today' && 
    (a.requestsToday || 0) < 48
  );

  if (available) {
    return available.apiKey;
  }

  console.log('[Vidmoly Accounts] Aucun compte disponible pour nouveaux uploads (tous saturés ou restreints). Création automatique d\'un nouveau compte...');
  try {
    const fresh = registerNewVidmolyAccount();
    return fresh.apiKey;
  } catch (err) {
    console.error('[Vidmoly Accounts] Impossible de créer un compte automatiquement:', err.message);
    const fallback = accounts.find(a => !a.uploadRestricted && a.status !== 'upload_restricted');
    return fallback?.apiKey || accounts[0]?.apiKey || '632462wra9u4c8qysgaj0o';
  }
}

function incrementAccountQuota(apiKey) {
  const accounts = getAccounts();
  const acc = accounts.find(a => a.apiKey === apiKey);
  if (acc) {
    acc.requestsToday = (acc.requestsToday || 0) + 1;
    saveAccounts(accounts);
  }
}

function markAccountInvalid(apiKey) {
  const accounts = getAccounts();
  const acc = accounts.find(a => a.apiKey === apiKey);
  if (acc) {
    acc.status = 'invalid';
    saveAccounts(accounts);
    console.warn(`[Vidmoly Accounts] Clé ${apiKey} marquée comme INVALIDE (Wrong auth).`);
  }
}

function markAccountFull(apiKey) {
  const accounts = getAccounts();
  const acc = accounts.find(a => a.apiKey === apiKey);
  if (acc) {
    acc.requestsToday = 50;
    saveAccounts(accounts);
    console.warn(`[Vidmoly Accounts] Clé ${apiKey} marquée comme saturée (50/50).`);
  }
}

function markAccountUploadRestricted(apiKey) {
  const accounts = getAccounts();
  const acc = accounts.find(a => a.apiKey === apiKey);
  if (acc) {
    acc.uploadRestricted = true;
    acc.status = 'upload_restricted';
    acc.uploadRestrictedAt = Date.now();
    saveAccounts(accounts);
    console.warn(`[Vidmoly Accounts] ⚠️ Compte ${acc.username} (clé ${apiKey.slice(0, 8)}...) marqué comme RESTREINT D'UPLOAD (conservé pour visionnage).`);
  }
}

function getTotalQuota() {
  const accounts = getAccounts();
  const activeAccounts = accounts.filter(a => !a.uploadRestricted && a.status !== 'upload_restricted' && a.status !== 'invalid');
  const totalRemaining = activeAccounts.reduce((acc, a) => acc + Math.max(0, 50 - (a.requestsToday || 0)), 0);
  return {
    accountsCount: accounts.length,
    activeAccountsCount: activeAccounts.length,
    totalRemainingRequests: totalRemaining,
    accounts: accounts.map(a => ({
      username: a.username,
      requestsToday: a.requestsToday || 0,
      status: a.uploadRestricted || a.status === 'upload_restricted' ? 'upload_restricted' : (a.status || 'active'),
      remaining: Math.max(0, 50 - (a.requestsToday || 0))
    }))
  };
}

module.exports = {
  getAccounts,
  getActiveApiKey,
  incrementAccountQuota,
  markAccountFull,
  markAccountInvalid,
  markAccountUploadRestricted,
  registerNewVidmolyAccount,
  getTotalQuota
};