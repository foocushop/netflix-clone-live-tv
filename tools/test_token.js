const https = require('https');

function get(u, h = {}) {
  return new Promise((r, j) => {
    https.get(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        ...h
      },
      timeout: 8000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => r({ status: res.statusCode, data: d, headers: res.headers }));
    }).on('error', j);
  });
}

async function run() {
  // 1. VidSrc.me RU stream_urls count
  const vsRes = await get('https://data.vidsrcme.ru/api.php?type=movie&tmdb=1108427&stream_urls');
  const j = JSON.parse(vsRes.data);
  const wasmRes = await get(j.vs.wasm_url);
  const mod = await WebAssembly.compile(Buffer.from(wasmRes.data, 'binary'));
  const inst = await WebAssembly.instantiate(mod, {});
  const enc = Buffer.from(j.data.stream_urls, 'base64');
  const ptr = inst.exports.alloc(enc.length);
  new Uint8Array(inst.exports.memory.buffer, ptr, enc.length).set(enc);
  const len = inst.exports.decrypt(ptr, enc.length);
  const urls = new TextDecoder().decode(new Uint8Array(inst.exports.memory.buffer, ptr + 12, len)).split('\n').filter(Boolean);
  console.log('VidSrc Decrypted Sources count:', urls.length);
  urls.forEach((u, i) => console.log(` VidSrc Source ${i + 1}:`, u.substring(0, 70) + '...'));

  // 2. 2Embed check
  const res2 = await get('https://www.2embed.cc/embed/1108427', { 'Referer': 'https://www.2embed.cc/' });
  console.log('\n2Embed Status:', res2.status);
  const matches = res2.data.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|php)[^\s"'<>]*/g) || [];
  console.log('2Embed URLs found:', matches.slice(0, 5));

  // 3. Check MultiEmbed
  const resMulti = await get('https://multiembed.mov/?video_id=1108427&tmdb=1');
  console.log('\nMultiEmbed status:', resMulti.status, 'Location:', resMulti.headers.location);
}

run().catch(console.error);



