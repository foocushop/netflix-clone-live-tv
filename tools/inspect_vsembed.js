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
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const html = await fetch('https://vsembed.ru/embed/movie/1108427/', { 'Referer': 'https://vidsrc.to/' });
  
  // Look for any iframe inside vsembed
  const iframes = html.match(/<iframe[^>]+>/gi) || [];
  console.log('Iframes inside vsembed:', iframes);

  // Look for Script 2 content
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  if (scripts[2]) {
    console.log('Script 2 FULL:', scripts[2]);
  }
}

run().catch(console.error);
