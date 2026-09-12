const { Client } = require('ssh2');

const conn = new Client();

const cmds = [
  'cd /var/www/netflix-clone',
  'git status',
  'git pull origin main',
  'node --check server.js',
  'node --check static/js/app.js',
  'node --check static/js/player.js',
  'node --check static/js/admin.js',
  'pm2 reload netflix-clone --update-env',
  'sleep 2',
  'pm2 status',
  'echo "--- HEALTH CHECK ---"',
  'curl -s -o /dev/null -w "ROOT_HTTP: %{http_code}\n" http://127.0.0.1:8080/',
  'curl -s -o /dev/null -w "LOGO_HTTP: %{http_code}\n" http://127.0.0.1:8080/assets/logos/ziflix-logo.svg',
  'curl -s -o /dev/null -w "CATALOG_HTTP: %{http_code}\n" http://127.0.0.1:8080/api/catalog',
  'echo "--- PM2 LOGS (tail 25) ---"',
  'pm2 logs netflix-clone --lines 25 --nostream'
].join(' && ');

conn.on('ready', () => {
  console.log('SSH Connected to VPS (74.50.66.196)');
  conn.exec(cmds, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      process.exit(1);
    }
    stream.on('close', (code) => {
      console.log('Remote script exit code:', code);
      conn.end();
      process.exit(code);
    });
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
  });
}).on('error', err => {
  console.error('SSH connection error:', err);
  process.exit(1);
}).connect({
  host: '74.50.66.196',
  port: 22,
  username: 'root',
  password: 'ZiablosurYoutube132',
  readyTimeout: 30000
});
