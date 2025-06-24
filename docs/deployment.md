# Deployment Guide

## Deployment Options

### 1. Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 2. Systemd (Linux Production)

Install service files:
```bash
sudo cp deployment/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
```

Enable and start services:
```bash
# Enable services to start on boot
sudo systemctl enable medipim-services.service
sudo systemctl enable medipim-sync.timer

# Start services
sudo systemctl start medipim-services.service
sudo systemctl start medipim-sync.timer

# Check status
sudo systemctl status medipim-services
sudo systemctl status medipim-sync.timer
```

### 3. PM2 Process Manager

```bash
# Install PM2 globally
npm install -g pm2

# Start services
pm2 start services/fetcher/index.js --name fetcher
pm2 start services/maintainer/index.js --name maintainer
pm2 start services/orchestrator/index.js --name orchestrator

# Save configuration
pm2 save
pm2 startup
```

### 4. Fly.io (Cloud Platform)

Deploy to Fly.io for managed cloud hosting:
```bash
cd deployment/fly
./deploy.sh
```

See [Fly.io Deployment Guide](./fly-deployment.md) for detailed instructions.

### 5. Manual/Development

```bash
# Start all services
npm run start:all

# Or start individually
npm run start:fetcher
npm run start:maintainer
npm run start:orchestrator
```

## Scheduling Synchronization

### Option 1: Cron Job
```bash
# Edit crontab
crontab -e

# Add daily sync at 2 AM
0 2 * * * curl -s "http://localhost:3003/sync?key=your-admin-key" >> /var/log/medipim-sync.log 2>&1

# Every 6 hours
0 */6 * * * curl -s "http://localhost:3003/sync?key=your-admin-key" >> /var/log/medipim-sync.log 2>&1
```

### Option 2: Systemd Timer (Included)
The systemd deployment includes a timer that runs daily. Adjust in `medipim-sync.timer`:
```ini
[Timer]
OnCalendar=daily
OnCalendar=*-*-* 02:00:00
```

### Option 3: External Scheduler
Trigger sync via webhook:
```bash
POST http://your-server:3003/sync
Headers: X-ADMIN-KEY: your-admin-key
```

## Production Checklist

- [ ] Set strong `ADMIN_KEY` in environment
- [ ] Configure firewall to restrict service ports (3001-3003) to localhost only
- [ ] Set up reverse proxy (nginx/caddy) for external access if needed
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting
- [ ] Test backup and recovery procedures
- [ ] Document API credentials securely
- [ ] Set appropriate resource limits

## Resource Requirements

### Minimum
- CPU: 2 cores
- RAM: 2GB
- Disk: 10GB
- Network: Stable broadband

### Recommended
- CPU: 4 cores
- RAM: 4GB
- Disk: 20GB
- Network: Dedicated connection

## Scaling Considerations

1. **Single Instance**: The orchestrator prevents concurrent syncs
2. **Database**: Ensure Supabase connection pool can handle batch operations
3. **Storage**: Monitor available disk space for NDJSON downloads
4. **Memory**: Adjust Node.js heap size if needed: `--max-old-space-size=4096`