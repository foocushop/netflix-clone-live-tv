const https = require('https');

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

async function run() {
  const vsRes = await fetch('https://vsembed.ru/vs_src.php?type=movie&id=1108427', {
    'Referer': 'https://vsembed.ru/embed/movie/1108427/'
  });
  const src = JSON.parse(vsRes.data).src;
  const playerRes = await fetch(src, { 'Referer': 'https://vsembed.ru/' });
  const cfg = JSON.parse(playerRes.data.match(/window\.CFG\s*=\s*({[^;]+});/)[1]);

  const realPlayerUrl = 'https://cloudorchestranova.com' + cfg.playerUrl;
  const finalRes = await fetch(realPlayerUrl, { 'Referer': src });
  
  const scripts = finalRes.data.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach((s, idx) => {
    console.log(`\n--- SCRIPT ${idx} ---`);
    console.log(s);
  });
}

run().catch(console.error);
