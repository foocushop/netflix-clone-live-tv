module.exports = {
  apps: [{
    name: 'netflix-clone',
    script: '/var/www/netflix-clone/server.js',
    cwd: '/var/www/netflix-clone',
    exec_mode: 'fork',
    instances: 1,
    max_memory_restart: '1200M',
    node_args: '--max-old-space-size=900 --gc-interval=100 --optimize-for-size',
    env: {
      NODE_ENV: 'production',
      PORT: '8080'
    },
    error_file: '/var/log/pm2/netflix-clone-error.log',
    out_file: '/var/log/pm2/netflix-clone-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 2000,
    min_uptime: '5s',
    max_restarts: 10
  }]
};
