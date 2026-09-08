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
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ status: res.statusCode, buffer, text: buffer.toString('utf8'), headers: res.headers });
      });
    }).on('error', reject);
  });
}

function b64(s) {
  return Buffer.from(s, 'base64');
}

async function extractVidSrc(tmdbId, isMovie = true, season = 1, episode = 1) {
  console.log(`[Extractor] Résolution pour TMDb ${tmdbId}...`);
  const apiUrl = isMovie
    ? `https://data.vidsrcme.ru/api.php?type=movie&tmdb=${tmdbId}&stream_urls`
    : `https://data.vidsrcme.ru/api.php?type=tv&tmdb=${tmdbId}&season=${season}&episode=${episode}&stream_urls`;

  const res = await fetch(apiUrl);
  if (res.status !== 200) throw new Error('API status: ' + res.status);
  
  const j = JSON.parse(res.text);
  console.log('[Extractor] API Response metadata:', j.data ? j.data.title : 'None');

  if (!j.vs || !j.data || typeof j.data.stream_urls !== 'string') {
    return j.data ? j.data.stream_urls : [];
  }

  const vs = j.vs;
  console.log('[Extractor] WASM URL:', vs.wasm_url);

  let wasmBuffer;
  if (vs.wasm_url) {
    const wasmRes = await fetch(vs.wasm_url);
    wasmBuffer = wasmRes.buffer;
  } else if (vs.wasm) {
    wasmBuffer = b64(vs.wasm);
  }

  const wasmModule = await WebAssembly.compile(wasmBuffer);
  const inst = await WebAssembly.instantiate(wasmModule, {});
  const ex = inst.exports;

  const enc = b64(j.data.stream_urls);
  const ptr = ex.alloc(enc.length);
  new Uint8Array(ex.memory.buffer, ptr, enc.length).set(enc);
  const outLen = ex.decrypt(ptr, enc.length);
  const decrypted = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, ptr + 12, outLen));
  
  const streamUrls = decrypted.split('\n').filter(Boolean);
  return streamUrls;
}

async function run() {
  const urls = await extractVidSrc('1108427', true);
  console.log('\n[SUCCESS] Extracted Direct Video URLs:', urls);
}

run().catch(console.error);
