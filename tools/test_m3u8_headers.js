const https = require('https');

const m3u8Url = 'https://theorboofthorns.space/pl/H4sIAAAAAAAAAwXB3XaCIAAA4FcCTJc7pxumztbEofwodwiWSTlLd0yfft93boPGotaHGiEQBiEw4M2CxkNn3zd7b_euI4WpE5OqurKslLMR2U4gTNlAl1ImjyJ10ADyYa_zlUTqTsA812UYyAoXZY9HHqmyTfGvGL5Gyvcr97JF3qeFetlaAzWxPluz.OVrQUTmbrGWl0331iscQQRNLyvtoNNsYbE65mJ85gl_WpacClBgg.ZjHnffYotX4.backFyCacmob6GuOLusmNIscbrYlWphG0Wtg7WTZVQyW9_Bo4P9QnJDz0c_gG67cRZCQEAAA--/master.m3u8';

function check(headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(m3u8Url);
    https.get(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, len: data.length, snippet: data.substring(0, 200) }));
    }).on('error', e => resolve({ error: e.message }));
  });
}

async function run() {
  console.log('Testing direct request without referer...');
  const r1 = await check();
  console.log('No referer:', r1.status, r1.snippet);

  console.log('\nTesting with Referer: https://cloudorchestranova.com/...');
  const r2 = await check({ 'Referer': 'https://cloudorchestranova.com/' });
  console.log('With cloudorchestranova referer:', r2.status, r2.snippet);

  console.log('\nTesting with Origin: https://cloudorchestranova.com...');
  const r3 = await check({ 'Referer': 'https://cloudorchestranova.com/', 'Origin': 'https://cloudorchestranova.com' });
  console.log('With cloudorchestranova origin:', r3.status, r3.snippet);
}

run();
