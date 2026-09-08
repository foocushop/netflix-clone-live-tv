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
  console.log('Fetching vidsrc...');
  const vidsrc = await fetch('https://vidsrc.to/embed/movie/1108427', { 'Referer': 'https://vidsrc.to/' });

  const iframes = vidsrc.data.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
  console.log('Iframes in VidSrc:', iframes);

  for (const iframeTag of iframes) {
    const srcMatch = iframeTag.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      const u = srcMatch[1];
      console.log('\nInspecting iframe:', u);
      const res = await fetch(u, { 'Referer': 'https://vidsrc.to/' });
      console.log('Status:', res.status, 'Length:', res.data.length);
      
      // Let's search inside res.data for scripts, websocket, or source endpoints
      const scriptMatches = res.data.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
      console.log('Script count in iframe:', scriptMatches.length);
      for (let i = 0; i < scriptMatches.length; i++) {
        const s = scriptMatches[i];
        if (s.includes('.m3u8') || s.includes('player') || s.includes('source') || s.includes('stream') || s.includes('token')) {
          console.log(`Script ${i} relevant snippet:`, s.substring(0, 300));
        }
      }
    }
  }
}

run().catch(console.error);
