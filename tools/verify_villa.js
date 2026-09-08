const http = require('http');

function get(path) {
  return new Promise(resolve => {
    http.get('http://127.0.0.1:8080' + path, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });
  });
}

(async () => {
  console.log('=== TEST 1: Fetch by ID 68628 ===');
  const m = await get('/api/movies/68628');
  console.log('Status:', m.status, 'Title:', m.data && m.data.data ? m.data.data.title : null);

  console.log('\n=== TEST 2: Search "villa" ===');
  const s = await get('/api/search?q=villa');
  console.log('Search matches:', s.data && s.data.data ? s.data.data.map(x => x.title) : null);

  console.log('\n=== TEST 3: Extract Stream for 68628 ===');
  const ext = await get('/api/extract?id=68628&type=series&season=1&episode=1&lang=vf');
  console.log('Extract result:', ext.data);

  console.log('\n=== TEST 4: Catalog Presence ===');
  const cat = await get('/api/catalog');
  const row = cat.data && cat.data.data && cat.data.data.rows ? cat.data.data.rows.find(r => r.category.slug === 'tendances') : null;
  const foundInTrends = row ? row.movies.some(x => x.id === '68628') : false;
  console.log('Present in "Tendances actuelles" row?', foundInTrends);
})();
