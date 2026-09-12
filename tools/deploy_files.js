const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const filesToUpload = [
  { local: path.join(__dirname, '..', 'server.js'), remote: '/var/www/netflix-clone/server.js' },
  { local: path.join(__dirname, '..', 'static', 'js', 'player.js'), remote: '/var/www/netflix-clone/static/js/player.js' },
  { local: path.join(__dirname, '..', 'static', 'index.html'), remote: '/var/www/netflix-clone/static/index.html' },
  { local: path.join(__dirname, '..', 'static', 'css', 'netflix.css'), remote: '/var/www/netflix-clone/static/css/netflix.css' },
  { local: path.join(__dirname, '..', 'static', 'js', 'app.js'), remote: '/var/www/netflix-clone/static/js/app.js' },
  { local: path.join(__dirname, '..', 'static', 'assets', 'logos', 'ziflix-logo.svg'), remote: '/var/www/netflix-clone/static/assets/logos/ziflix-logo.svg' }
];

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready.');
  conn.sftp((err, sftp) => {
    if (err) throw err;
    let pending = filesToUpload.length;
    filesToUpload.forEach(({ local, remote }) => {
      console.log(`Uploading ${local} -> ${remote}...`);
      sftp.fastPut(local, remote, (err) => {
        if (err) {
          console.error(`Error uploading ${local}:`, err);
          conn.end();
          process.exit(1);
        }
        console.log(`Uploaded ${remote} successfully.`);
        pending--;
        if (pending === 0) {
          console.log('All files uploaded! Reloading PM2...');
          conn.exec('pm2 reload netflix-clone', (err, stream) => {
            if (err) throw err;
            stream.on('close', (code) => {
              console.log('PM2 reload exited with code', code);
              conn.end();
            }).on('data', d => process.stdout.write(d));
          });
        }
      });
    });
  });
}).connect({
  host: '162.35.186.177',
  port: 22,
  username: 'root',
  password: 'ZiablosurYoutube132'
});
