const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://cloudorchestranova.com/'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const code = await fetch('https://cloudorchestranova.com/embed/iframe_player/assets/player.js');
  
  const tokenIdx = code.indexOf('function originOf(u)');
  if (tokenIdx !== -1) {
    console.log(code.substring(tokenIdx, tokenIdx + 1200));
  }
}

run().catch(console.error);
