# Orchestrator Service

Coordinates the complete MediPim synchronization process, managing both Fetcher and Maintainer services for automated data synchronization.

## Overview

The Orchestrator Service automates the entire sync workflow:
1. Triggers Fetcher to download latest data
2. Manages Maintainer to process data in chunks
3. Provides status monitoring
4. Handles errors and retries

## Quick Start

```bash
# Start the service
npm run start:orchestrator

# Trigger a sync
curl -X POST http://localhost:3003/sync \
  -H "X-ADMIN-KEY: your-secure-admin-key-here"

# Check status
curl http://localhost:3003/status \
  -H "X-ADMIN-KEY: your-secure-admin-key-here"
```

## API Endpoints

### `GET /healthz`
Health check endpoint.

**Response:**
```
200 OK
```

### `POST /sync`
Starts a full synchronization process.

**Headers:**
- `X-ADMIN-KEY`: Admin authentication key

**Response:**
```json
{
  "message": "Sync started",
  "status": {
    "isRunning": true,
    "startTime": "2024-01-15T02:00:00.000Z",
    "currentPhase": "starting",
    "progress": {
      "fetched": false,
      "chunksProcessed": 0,
      "totalRecords": 0,
      "errors": []
    }
  }
}
```

### `GET /sync?key={admin-key}`
Alternative sync trigger for cron jobs.

**Query Parameters:**
- `key`: Admin authentication key

### `GET /status`
Returns current sync status.

**Headers:**
- `X-ADMIN-KEY`: Admin authentication key

**Response:**
```json
{
  "isRunning": true,
  "currentPhase": "processing",
  "startTime": "2024-01-15T02:00:00.000Z",
  "progress": {
    "fetched": true,
    "chunksProcessed": 5,
    "totalRecords": 25000,
    "errors": []
  },
  "uptime": 3600
}
```

## Configuration

### Environment Variables

```env
# Port (optional, defaults to 3003)
ORCHESTRATOR_PORT=3003

# Service dependencies
FETCHER_PORT=3001
MAINTAINER_PORT=3002

# Authentication
ADMIN_KEY=your-secure-admin-key-here

# Supabase (for monitoring)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Processing Configuration

- **Chunk Size**: 20,000 records (optimized for 300k+ products)
- **Max Retries**: 3 attempts per chunk
- **Retry Delay**: 5 seconds
- **Request Timeout**: 30 minutes (for large file downloads)

## Deployment

### Local Development
```bash
node services/orchestrator/index.js
```

### Production - PM2
```bash
pm2 start services/orchestrator/index.js --name medipim-orchestrator
```

### Production - Docker
```bash
docker-compose up orchestrator
```

### Production - Systemd
See `deployment/systemd/medipim-services.service`

## Scheduling

### Cron Example
```bash
# Daily at 2 AM
0 2 * * * curl -s "http://localhost:3003/sync?key=your-key" >> /var/log/medipim-sync.log 2>&1
```

### Systemd Timer
Use `medipim-sync.timer` for more reliable scheduling.

## How It Works

1. **Sync Triggered** - Via API endpoint or scheduler
2. **Phase 1: Fetch** - Calls Fetcher Service to download data
3. **Phase 2: Process** - Calls Maintainer Service in chunks:
   - Processes 5,000 records at a time
   - Retries failed chunks up to 3 times
   - Tracks progress and errors
4. **Completion** - Updates status and logs results

## Error Handling

- **Concurrent Sync Prevention**: Returns 409 if sync already running
- **Fetch Failures**: Stops sync and logs error
- **Chunk Failures**: Retries with exponential backoff
- **Timeout Protection**: 10-minute limit per chunk

## Monitoring

### Check Service Health
```bash
curl http://localhost:3003/healthz
```

### Monitor Sync Progress
```bash
# One-time check
curl http://localhost:3003/status \
  -H "X-ADMIN-KEY: your-key" | jq

# Watch progress
watch -n 5 'curl -s http://localhost:3003/status \
  -H "X-ADMIN-KEY: your-key" | jq .progress'
```

### View Logs
```bash
# If using PM2
pm2 logs medipim-orchestrator

# If using systemd
journalctl -u medipim-services -f

# If using Docker
docker-compose logs -f orchestrator
```

## Troubleshooting

### Sync Won't Start
- Check if previous sync is running: `GET /status`
- Verify Fetcher and Maintainer services are healthy
- Check ADMIN_KEY is correct

### Sync Stuck
- Check individual service logs
- Look for specific errors in status response
- Restart services if necessary

### Performance Issues
- Reduce CHUNK_SIZE in code if memory constrained
- Increase delays between chunks
- Monitor system resources during sync

## Testing

```bash
# Test health check
curl http://localhost:3003/healthz

# Test authentication
curl http://localhost:3003/status \
  -H "X-ADMIN-KEY: wrong-key"
# Should return 401

# Test sync start
curl -X POST http://localhost:3003/sync \
  -H "X-ADMIN-KEY: your-key"

# Test concurrent sync prevention
curl -X POST http://localhost:3003/sync \
  -H "X-ADMIN-KEY: your-key"
# Should return 409 if already running
```

## Related Services

- [Fetcher Service](../fetcher/README.md) - Downloads data from MediPim
- [Maintainer Service](../maintainer/README.md) - Processes data to database

## Files

- `index.js` - Main service implementation
- `README.md` - This documentation