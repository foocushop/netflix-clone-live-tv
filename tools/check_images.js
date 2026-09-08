const https = require('https');

const urls = [
  // Stranger Things
  { id: 'st_poster', url: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg' },
  { id: 'st_backdrop', url: 'https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg' },
  // Squid Game
  { id: 'sg_poster', url: 'https://image.tmdb.org/t/p/w500/dDlGgwXjB19p0p2aK275ZJ2GgqV.jpg' },
  { id: 'sg_backdrop', url: 'https://image.tmdb.org/t/p/original/y4a02U0qQc0q66UaX06Qo2t4q4F.jpg' },
  // Inception
  { id: 'inc_poster', url: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg' },
  { id: 'inc_backdrop', url: 'https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg' },
  // Breaking Bad
  { id: 'bb_poster', url: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg' },
  { id: 'bb_backdrop', url: 'https://image.tmdb.org/t/p/original/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg' },
  // Peaky Blinders
  { id: 'pb_poster', url: 'https://image.tmdb.org/t/p/w500/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg' },
  { id: 'pb_backdrop', url: 'https://image.tmdb.org/t/p/original/70NxPdGZp5K8p6K9X7x7x5R3J5.jpg' },
  // Arcane
  { id: 'arc_poster', url: 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn396FQEGvZY4.jpg' },
  { id: 'arc_backdrop', url: 'https://image.tmdb.org/t/p/original/8h1r62F7Yx0v7w62sJ8mYk5j7s2.jpg' },
  // La Casa de Papel
  { id: 'lcdp_poster', url: 'https://image.tmdb.org/t/p/w500/reEMJA1uzscCbk5r6rgAGHG24UW.jpg' },
  { id: 'lcdp_backdrop', url: 'https://image.tmdb.org/t/p/original/gFZri2YbFUBulAcPNGIRTeiqkqn.jpg' },
  // Interstellar
  { id: 'int_poster', url: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { id: 'int_backdrop', url: 'https://image.tmdb.org/t/p/original/rAiYTsqJJR0dHw9yQy2Zg4K0Q2F.jpg' }
];

async function checkUrl(item) {
  return new Promise((resolve) => {
    https.request(item.url, { method: 'HEAD', timeout: 5000 }, (res) => {
      resolve({ id: item.id, status: res.statusCode, ok: res.statusCode === 200 });
    }).on('error', (e) => {
      resolve({ id: item.id, status: 0, ok: false, err: e.message });
    }).end();
  });
}

async function run() {
  for (const item of urls) {
    const res = await checkUrl(item);
    console.log(`[${res.ok ? 'OK 200' : 'FAIL ' + res.status}] ${item.id} -> ${item.url}`);
  }
}

run();
