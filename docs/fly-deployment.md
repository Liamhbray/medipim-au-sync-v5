# Fly.io Deployment Documentation

## Overview

The MediPim AU Sync system is designed to run on Fly.io as three separate microservices:
- **Fetcher**: Downloads product data from MediPim API
- **Maintainer**: Processes NDJSON and updates database  
- **Orchestrator**: Coordinates sync workflow

## Architecture on Fly.io

```
┌─────────────────────────────────────────────────┐
│                   Internet                       │
└─────────────────┬───────────────┬───────────────┘
                  │               │
         HTTPS    │               │    Scheduled
         Trigger  │               │    Webhook
                  ▼               ▼
        ┌──────────────────────────────────┐
        │   medipim-orchestrator.fly.dev   │
        │        (Orchestrator)            │
        │         Port: 3003               │
        └────────┬──────────────┬──────────┘
                 │              │
    Internal     │              │    Internal
    Network      ▼              ▼    Network
        ┌────────────────┐  ┌──────────────────┐
        │ medipim-fetcher│  │medipim-maintainer│
        │   .internal    │  │   .internal      │
        │   Port: 3001   │  │   Port: 3002     │
        └────────┬───────┘  └────────┬─────────┘
                 │                   │
                 ▼                   ▼
        ┌─────────────────────────────────────┐
        │          External Services          │
        │  - MediPim API (AU)                 │
        │  - Supabase (Database & Storage)    │
        └─────────────────────────────────────┘
```

## Pre-Deployment Setup

### 1. Install Fly CLI
```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 2. Authenticate
```bash
flyctl auth login
```

### 3. Prepare Environment
Ensure `.env` file exists with all required values:
```env
MEDIPIM_API_URL=https://api.au.medipim.com/v4/products/stream
MEDIPIM_API_KEY_ID=your-key-id
MEDIPIM_API_KEY_SECRET=your-key-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
ADMIN_KEY=your-secure-admin-key
```

## Deployment Steps

### Quick Deploy
```bash
cd deployment/fly
./deploy.sh
```

### Manual Deploy Process

1. **Create Apps**
   ```bash
   flyctl apps create medipim-fetcher --org personal
   flyctl apps create medipim-maintainer --org personal  
   flyctl apps create medipim-orchestrator --org personal
   ```

2. **Deploy Services**
   ```bash
   # Deploy fetcher
   cd services/fetcher
   flyctl deploy --app medipim-fetcher
   
   # Deploy maintainer
   cd ../maintainer
   flyctl deploy --app medipim-maintainer
   
   # Deploy orchestrator
   cd ../orchestrator
   flyctl deploy --app medipim-orchestrator
   ```

3. **Set Secrets**
   See deployment/fly/deploy.sh for complete secret configuration

## Configuration Details

### Service Configuration

Each service has a `fly.toml` file with:
- **Region**: `syd` (Sydney) for low latency to MediPim AU
- **Auto-scaling**: Enabled with min 0 machines (except orchestrator)
- **Health checks**: HTTP endpoint monitoring
- **Metrics**: Prometheus-compatible metrics endpoint

### Resource Allocation

| Service | CPU | Memory | Min Machines |
|---------|-----|--------|--------------|
| Fetcher | Shared | 512MB | 0 |
| Maintainer | Shared-2x | 2GB | 0 |
| Orchestrator | Shared | 512MB | 1 |

### Networking

- Public endpoints use HTTPS with forced redirect
- Internal communication uses `.internal` domain
- All endpoints require `X-ADMIN-KEY` header

## Scheduled Sync Configuration

### Option 1: GitHub Actions (Recommended)

1. Add secret to repository:
   - Go to Settings → Secrets → Actions
   - Add `MEDIPIM_ADMIN_KEY` with your admin key value

2. Workflow is pre-configured:
   - `.github/workflows/sync.yml`: Automated and manual sync
     - Runs daily at 2 AM Sydney time
     - Manual trigger with sync modes: full, fetch-only, maintain-only
     - Configurable chunk size, offset, limit, and debug options

### Option 2: External Cron Services

Popular options:
- **cron-job.org** (Free)
- **EasyCron** (Paid, more reliable)
- **Uptime Robot** (Can also monitor)

Configuration:
- URL: `https://medipim-orchestrator.fly.dev/sync`
- Method: POST
- Headers: `X-ADMIN-KEY: your-admin-key`
- Schedule: `0 2 * * *` (2 AM daily)

### Option 3: Fly Machines Schedule

```bash
flyctl m run alpine \
  --app medipim-orchestrator \
  --schedule daily \
  --region syd \
  --env ADMIN_KEY=your-admin-key \
  --command 'apk add curl && curl -X POST http://medipim-orchestrator.internal:3003/sync -H "X-ADMIN-KEY: $ADMIN_KEY"'
```

## Monitoring & Operations

### Health Checks
```bash
# Check all services
for app in fetcher maintainer orchestrator; do
  echo "medipim-$app: $(curl -s https://medipim-$app.fly.dev/healthz)"
done
```

### View Logs
```bash
# Real-time logs
flyctl logs --app medipim-orchestrator

# Historical logs
flyctl logs --app medipim-maintainer --since 1h
```

### Monitor Sync Progress
```bash
# One-time check
curl https://medipim-orchestrator.fly.dev/status \
  -H "X-ADMIN-KEY: your-admin-key" | jq

# Continuous monitoring
watch -n 10 'curl -s https://medipim-orchestrator.fly.dev/status \
  -H "X-ADMIN-KEY: your-admin-key" | jq ".progress"'
```

### SSH Access
```bash
flyctl ssh console --app medipim-orchestrator
```

## Troubleshooting

### Common Issues

1. **Deployment Fails**
   - Check Dockerfile syntax
   - Verify all required files are present
   - Review build logs: `flyctl logs --app appname`

2. **Services Can't Communicate**
   - Ensure using `.internal` domains
   - Check secrets are set correctly
   - Verify services are in same organization

3. **Sync Timeouts**
   - Increase timeout in orchestrator
   - Check Supabase connection limits
   - Monitor memory usage during processing

4. **Authentication Errors**
   - Verify ADMIN_KEY matches across services
   - Check MediPim credentials are correct
   - Ensure Supabase service role key is valid

### Debug Commands
```bash
# Check app status
flyctl status --app medipim-orchestrator

# View secrets (names only)
flyctl secrets list --app medipim-fetcher

# Scale information
flyctl scale show --app medipim-maintainer

# Recent deployments
flyctl releases --app medipim-orchestrator
```

## Cost Management

### Estimated Costs (USD/month)
- **Minimal usage** (1 sync/day): ~$5-10
- **Moderate usage** (4 syncs/day): ~$15-25
- **Heavy usage** (hourly syncs): ~$30-50

### Cost Optimization Tips
1. Use auto-stop machines (enabled by default)
2. Run in single region (Sydney)
3. Use shared CPU tier
4. Monitor usage: `flyctl billing`

## Security Best Practices

1. **Rotate Admin Key Regularly**
   ```bash
   flyctl secrets set ADMIN_KEY=new-secure-key --app medipim-orchestrator
   ```

2. **Restrict Access**
   - Use strong admin keys (32+ characters)
   - Monitor access logs
   - Set up alerts for failed auth attempts

3. **Keep Secrets Secure**
   - Never commit secrets to git
   - Use Fly secrets management
   - Audit secret access regularly

## Backup & Recovery

### Database Backup
Handled by Supabase - configure in Supabase dashboard

### Service State
Services are stateless - recovery involves:
1. Redeploy from git
2. Restore secrets
3. Trigger new sync

### Disaster Recovery
```bash
# Redeploy all services
cd deployment/fly
./deploy.sh

# Verify health
curl https://medipim-orchestrator.fly.dev/healthz
```