module.exports = {
  apps: [
    {
      name: 'algorithm-polar-api',
      script: './server/index.js',
      cwd: __dirname,
      interpreter: 'node',
      // Use the nvm-managed Node.js 24 binary if available
      // interpreter_args: '--experimental-vm-modules',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      max_memory_restart: '500M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
