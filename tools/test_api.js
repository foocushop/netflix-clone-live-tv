const https = require('https');

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://cloudorchestranova.com/',
        'Origin': 'https://cloudorchestranova.com',
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
  const apiUrl = 'https://data.vidsrcme.ru/api.php?type=movie&tmdb=1108427&stream_urls';
  const res = await fetch(apiUrl);
  console.log('Status:', res.status);
  console.log('Headers:', res.headers);
  console.log('Data:', res.data.substring(0, 500));
}

run().catch(console.error);
