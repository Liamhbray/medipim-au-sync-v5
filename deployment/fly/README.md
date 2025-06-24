# Fly.io Deployment Guide

This guide covers deploying the MediPim AU Sync services to Fly.io.

## Prerequisites

1. **Fly.io Account**: Sign up at [fly.io](https://fly.io)
2. **Fly CLI**: Install from [fly.io/docs/hands-on/install-flyctl](https://fly.io/docs/hands-on/install-flyctl)
3. **Environment File**: Ensure `.env` file exists in project root with all required values

## Quick Deploy

```bash
cd deployment/fly
./deploy.sh
```

This script will:
1. Create three Fly.io apps in Sydney region
2. Deploy each service
3. Set all required secrets
4. Provide URLs for accessing services

## Manual Deployment

### 1. Login to Fly.io
```bash
flyctl auth login
```

### 2. Deploy Each Service

#### Fetcher Service
```bash
cd services/fetcher
flyctl apps create medipim-fetcher --org personal
flyctl deploy
flyctl secrets set \
  MEDIPIM_API_URL="https://api.au.medipim.com/v4/products/stream" \
  MEDIPIM_API_KEY_ID="your-key-id" \
  MEDIPIM_API_KEY_SECRET="your-key-secret" \
  SUPABASE_URL="your-supabase-url" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-key" \
  ADMIN_KEY="your-admin-key"
```

#### Maintainer Service
```bash
cd services/maintainer
flyctl apps create medipim-maintainer --org personal
flyctl deploy
flyctl secrets set \
  SUPABASE_URL="your-supabase-url" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-key" \
  ADMIN_KEY="your-admin-key" \
  BATCH_SIZE="100"
```

#### Orchestrator Service
```bash
cd services/orchestrator
flyctl apps create medipim-orchestrator --org personal
flyctl deploy
flyctl secrets set \
  ADMIN_KEY="your-admin-key"
```

## Scheduled Sync Setup

### Option 1: External Cron Service
Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

- **URL**: `https://medipim-orchestrator.fly.dev/sync`
- **Method**: POST
- **Headers**: `X-ADMIN-KEY: your-admin-key`
- **Schedule**: Daily at 2 AM Sydney time

### Option 2: GitHub Actions
Create `.github/workflows/sync.yml`:

```yaml
name: MediPim Sync
on:
  schedule:
    # Daily at 2 AM Sydney time (4 PM UTC)
    - cron: '0 16 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Sync
        run: |
          curl -X POST https://medipim-orchestrator.fly.dev/sync \
            -H "X-ADMIN-KEY: ${{ secrets.MEDIPIM_ADMIN_KEY }}" \
            -f
```

Add `MEDIPIM_ADMIN_KEY` to your GitHub repository secrets.

### Option 3: Fly.io Machines (Advanced)
Create a scheduled machine that runs the sync:

```bash
flyctl m run alpine \
  --schedule daily \
  --command "apk add curl && curl -X POST http://medipim-orchestrator.internal:3003/sync -H 'X-ADMIN-KEY: $ADMIN_KEY'" \
  --env ADMIN_KEY=your-admin-key
```

## Monitoring

### Check Service Health
```bash
# All services
for app in medipim-fetcher medipim-maintainer medipim-orchestrator; do
  echo "$app: $(curl -s https://$app.fly.dev/healthz)"
done

# Individual service logs
flyctl logs --app medipim-orchestrator
flyctl logs --app medipim-fetcher
flyctl logs --app medipim-maintainer
```

### Monitor Sync Status
```bash
# Check if sync is running
curl https://medipim-orchestrator.fly.dev/status \
  -H "X-ADMIN-KEY: your-admin-key" | jq

# Watch progress
watch -n 10 'curl -s https://medipim-orchestrator.fly.dev/status \
  -H "X-ADMIN-KEY: your-admin-key" | jq .progress'
```

## Scaling

### Adjust Resources
```bash
# Scale maintainer for better performance
flyctl scale vm shared-cpu-2x --memory 4096 --app medipim-maintainer

# View current scale
flyctl scale show --app medipim-maintainer
```

### Auto-scaling
Services are configured with:
- `auto_stop_machines = true`: Stops when idle
- `auto_start_machines = true`: Starts on request
- `min_machines_running`: 0 for fetcher/maintainer, 1 for orchestrator

## Troubleshooting

### View Logs
```bash
flyctl logs --app medipim-orchestrator --tail
```

### SSH into Machine
```bash
flyctl ssh console --app medipim-orchestrator
```

### Check Secrets
```bash
flyctl secrets list --app medipim-orchestrator
```

### Restart Service
```bash
flyctl apps restart medipim-orchestrator
```

## Cost Optimization

1. **Use Shared CPUs**: Configured by default
2. **Auto-stop Machines**: Enabled for all services
3. **Sydney Region**: Minimizes latency to MediPim AU
4. **Minimal Resources**: 
   - Fetcher/Orchestrator: Default resources
   - Maintainer: 2GB RAM for processing

Estimated monthly cost: ~$5-10 USD for light usage

## Security Notes

1. All services use HTTPS with forced redirect
2. Admin key required for all operations
3. Internal communication uses private `.internal` network
4. Secrets are encrypted at rest
5. Health endpoints are public but reveal no sensitive data