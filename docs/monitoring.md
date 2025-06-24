# Monitoring Guide

## Health Checks

All services provide health endpoints:

```bash
# Check individual services
curl http://localhost:3001/healthz  # Fetcher
curl http://localhost:3002/healthz  # Maintainer
curl http://localhost:3003/healthz  # Orchestrator

# Check all at once
for port in 3001 3002 3003; do
  echo "Port $port: $(curl -s http://localhost:$port/healthz)"
done
```

## Sync Status Monitoring

### Check Current Status
```bash
curl http://localhost:3003/status \
  -H "X-ADMIN-KEY: your-key" | jq
```

Response includes:
- `isRunning`: Whether sync is active
- `currentPhase`: fetching/processing/completed/failed
- `progress`: Detailed progress metrics
- `errors`: Any errors encountered

### Watch Progress
```bash
# Real-time monitoring
watch -n 5 'curl -s http://localhost:3003/status \
  -H "X-ADMIN-KEY: your-key" | jq .progress'
```

## Logging

### Docker Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f orchestrator
docker-compose logs -f fetcher
docker-compose logs -f maintainer
```

### Systemd Logs
```bash
# View logs
journalctl -u medipim-services -f
journalctl -u medipim-sync -f

# Last 100 lines
journalctl -u medipim-services -n 100

# Since specific time
journalctl -u medipim-services --since "2024-01-15 00:00:00"
```

### PM2 Logs
```bash
# All services
pm2 logs

# Specific service
pm2 logs fetcher
pm2 logs maintainer
pm2 logs orchestrator
```

## Performance Monitoring

### Database Metrics
```bash
# Check product count
node services/maintainer/check-count.js

# Monitor during sync
watch -n 10 'node services/maintainer/check-count.js | grep "Total products"'
```

### System Resources
```bash
# Monitor service resources
htop
# or
docker stats

# PM2 monitoring
pm2 monit
```

## Common Issues and Troubleshooting

### Sync Not Starting
1. Check if previous sync is running:
   ```bash
   curl http://localhost:3003/status -H "X-ADMIN-KEY: your-key"
   ```
2. Verify all services are healthy
3. Check logs for authentication errors

### Slow Performance
1. Monitor chunk processing time in logs
2. Check database connection pool usage
3. Verify network bandwidth availability
4. Consider adjusting `BATCH_SIZE`

### High Error Rate
1. Check maintainer logs for specific errors:
   ```bash
   docker-compose logs maintainer | grep -i error
   ```
2. Verify MediPim data format hasn't changed
3. Check database constraints and permissions

### Memory Issues
1. Monitor Node.js heap usage
2. Reduce `BATCH_SIZE` if needed
3. Increase memory allocation:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run start:maintainer
   ```

## Alerting Setup

### Basic Email Alerts (Cron)
```bash
# Add to crontab
0 2 * * * /path/to/sync-with-alert.sh

# sync-with-alert.sh:
#!/bin/bash
if ! curl -s "http://localhost:3003/sync?key=your-key"; then
  echo "MediPim sync failed at $(date)" | mail -s "Sync Failure" admin@example.com
fi
```

### Webhook Notifications
Configure external monitoring services to check:
- Health endpoints every 5 minutes
- Sync completion webhook after expected duration

## Metrics to Track

1. **Sync Duration**: Total time from start to completion
2. **Records Processed**: Total, inserted, updated per sync
3. **Error Rate**: Errors per sync, error types
4. **Resource Usage**: CPU, memory, disk I/O during sync
5. **API Response Times**: MediPim download speed
6. **Database Performance**: Insert/update rates