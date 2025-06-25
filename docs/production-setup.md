# Production Setup Guide

## Current Status

All services have been deployed to Fly.io with the following production optimizations:

### ✅ Completed Setup

1. **Increased Timeouts**
   - Orchestrator: 10-minute request timeout
   - Fetcher: 10-minute timeout with 2GB memory
   - Health checks: Relaxed to 60s intervals with 30s grace period

2. **Scaled Resources**
   - Fetcher: 2x shared CPU, 2GB RAM
   - Maintainer: 2x shared CPU, 4GB RAM
   - Orchestrator: Default resources (sufficient for coordination)

3. **Service URLs**
   - Fetcher: https://medipim-fetcher.fly.dev
   - Maintainer: https://medipim-maintainer.fly.dev
   - Orchestrator: https://medipim-orchestrator.fly.dev

## Known Issues & Solutions

### Large File Download Timeouts

The MediPim dataset is ~600MB and takes 10-15 minutes to download. During testing, we observed:
- Download progresses successfully (reached 310MB+ before timeout)
- Socket hang up errors due to health check interruptions

**Solutions implemented:**
- Increased health check intervals from 30s to 60s
- Extended grace periods from 5s to 30s
- Set 10-minute timeouts for HTTP requests

**Further optimizations if needed:**
1. Disable health checks during active sync:
   ```javascript
   app.get('/healthz', (req, res) => {
     if (global.isDownloading) {
       res.status(503).send('Sync in progress');
     } else {
       res.send('OK');
     }
   });
   ```

2. Use Fly.io volumes for temporary storage:
   ```toml
   [mounts]
     source = "medipim_data"
     destination = "/data"
   ```

## Scheduled Sync Setup

### GitHub Actions (Recommended)

1. **Add Secrets to Repository**
   - Go to: Settings → Secrets and variables → Actions
   - Add required secret:
     - Name: `MEDIPIM_ADMIN_KEY`
     - Value: `your-secure-admin-key-here`
   - For email notifications (optional), see [Email Notifications Setup](./email-notifications-setup.md)

2. **Workflow Configuration**
   - `.github/workflows/sync.yml` - Automated and manual sync workflow
     - Runs daily at 2 AM Sydney time automatically
     - Can be triggered manually with multiple options

3. **Manual Sync Options**
   - Go to Actions tab
   - Select "MediPim Product Sync"
   - Click "Run workflow"
   - Configure options:
     - **Sync mode**: 
       - `full`: Complete sync (fetch + maintain)
       - `fetch-only`: Only download from MediPim
       - `maintain-only`: Only process to database
       - `notification-only`: Test email notifications with mock data
     - **Chunk size**: Records per chunk (100-50000, default: 20000)
     - **Offset**: Starting offset for maintain-only mode
     - **Limit**: Max records to process (leave empty for all)
     - **Force refresh**: Re-download even if recent data exists
     - **Debug mode**: Enable verbose logging

### Alternative: Cron Service

If not using GitHub Actions, use a cron service:

1. **cron-job.org** (Free)
   ```
   URL: https://medipim-orchestrator.fly.dev/sync
   Method: POST
   Headers: X-ADMIN-KEY: your-secure-admin-key-here
   Schedule: 0 2 * * *
   ```

2. **UptimeRobot** (Also monitors)
   - Create HTTP(S) monitor
   - Advanced settings → HTTP Method: POST
   - Custom HTTP Headers: X-ADMIN-KEY: your-secure-admin-key-here

## Manual Sync Testing

```bash
# Trigger sync
curl -X POST https://medipim-orchestrator.fly.dev/sync \
  -H "X-ADMIN-KEY: your-secure-admin-key-here"

# Monitor progress
watch -n 30 'curl -s https://medipim-orchestrator.fly.dev/status \
  -H "X-ADMIN-KEY: your-secure-admin-key-here" | jq'

# Check specific service logs
flyctl logs --app medipim-fetcher
flyctl logs --app medipim-maintainer
flyctl logs --app medipim-orchestrator
```

## Production Monitoring

### Key Metrics to Track

1. **Sync Duration**: Should complete within 30-45 minutes
2. **Error Rate**: Check `.progress.errors` in status
3. **Records Processed**: Should be ~107,000+

### Alerts

Set up alerts for:
- Sync failures (GitHub Actions will create issues automatically)
- Extended downtime (use UptimeRobot or similar)
- Failed health checks

## Cost Estimates

With current configuration:
- **Base cost**: ~$10-15/month
- **During sync**: Additional ~$0.02-0.05 per sync
- **Total monthly**: ~$15-25 (with daily syncs)

## Next Steps

1. **Enable Production Sync**
   - Add `MEDIPIM_ADMIN_KEY` to GitHub secrets
   - Test manual workflow execution
   - Monitor first automated sync

2. **Optional Enhancements**
   - Add Sentry for error tracking
   - Implement progress webhooks
   - Set up Grafana dashboard

3. **Backup Strategy**
   - Supabase handles database backups
   - Consider exporting NDJSON periodically