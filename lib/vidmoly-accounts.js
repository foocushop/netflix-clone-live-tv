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
        username: "primary_account",
        apiKey: "632462wra9u4c8qysgaj0o",
        requestsToday: 0,
        lastDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now()
      },
      {
        username: "ziflixtv_urrjko",
        apiKey: "6324751pc69yqng6coltvn",
        requestsToday: 0,
        lastDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now()
      },
      {
        username: "zflix_qjtgm3",
        apiKey: "6324760b2gcbqn6hvf2n7m",
        requestsToday: 0,
        lastDate: new Date().toISOString().split('T')[0],
        createdAt: Date.now()
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
  const rand = Math.random().toString(36).substring(2, 8);
  const username = `zflix_${rand}`;
  const email = `zflix_${rand}@mailnesia.com`;
  const password = `ZflixPass_${rand}99!`;

  console.log(`[Vidmoly Accounts] Création automatique d'un nouveau compte : ${username}...`);

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
    throw new Error('Échec inscription Vidmoly (aucun cookie reçu) : ' + regRes.slice(0, 200));
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
    createdAt: Date.now()
  };

  const accounts = getAccounts();
  accounts.push(newAccount);
  saveAccounts(accounts);
  console.log(`[Vidmoly Accounts] Nouveau compte actif créé avec succès ! Clé API: ${newAccount.apiKey}`);
  return newAccount;
}

function getActiveApiKey() {
  const accounts = getAccounts();
  const available = accounts.find(a => a.status !== 'invalid' && (a.requestsToday || 0) < 48);
  if (available) {
    return available.apiKey;
  }

  console.log('[Vidmoly Accounts] Tous les comptes existants ont atteint leur quota quotidien. Création d\'un nouveau compte...');
  try {
    const fresh = registerNewVidmolyAccount();
    return fresh.apiKey;
  } catch (err) {
    console.error('[Vidmoly Accounts] Impossible de créer un compte automatiquement:', err.message);
    return accounts[0]?.apiKey || '632462wra9u4c8qysgaj0o';
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

function getTotalQuota() {
  const accounts = getAccounts();
  const totalRemaining = accounts.reduce((acc, a) => acc + Math.max(0, 50 - (a.requestsToday || 0)), 0);
  return {
    accountsCount: accounts.length,
    totalRemainingRequests: totalRemaining,
    accounts: accounts.map(a => ({
      username: a.username,
      requestsToday: a.requestsToday || 0,
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
  registerNewVidmolyAccount,
  getTotalQuota
};