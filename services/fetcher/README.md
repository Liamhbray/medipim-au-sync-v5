# Fetcher Service

This service streams MediPim AU product data to Supabase Storage using resumable uploads.

## Overview

The Fetcher Service connects to the MediPim AU API, downloads the complete product catalog as NDJSON (newline-delimited JSON), and uploads it to Supabase Storage. The service handles large files (600MB+) efficiently using streaming and resumable uploads.

## Features

- **Streaming Download**: Downloads MediPim data without loading entire file into memory
- **Resumable Uploads**: Uses TUS protocol for crash-safe uploads that can resume after interruption
- **Progress Tracking**: Saves upload progress to `.upload-state.json` for monitoring and resume capability
- **Concurrency Protection**: Prevents multiple simultaneous uploads
- **Large File Support**: Handles files up to 5GB (requires Supabase Pro plan)
- **Health Monitoring**: Provides health check endpoint for service monitoring
- **Secure API Access**: Manual trigger endpoint protected by admin key authentication

## Prerequisites

- Node.js 18+ installed
- Supabase project with:
  - Storage bucket named `medipim-raw` created
  - File size limit set to 5GB (Pro plan required for files over 50MB)
- MediPim AU API credentials

## Setup

1. **Environment Configuration**
   
   Create or update `.env` file with required variables:
   ```env
   # Supabase Configuration
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # MediPim Configuration
   MEDIPIM_API_URL=https://api.au.medipim.com/v4/products/stream
   MEDIPIM_API_KEY_ID=your_api_key_id
   MEDIPIM_API_KEY_SECRET=your_api_key_secret
   
   # Service Configuration
   ADMIN_KEY=your-secure-admin-key-here
   PORT=3001  # Optional, defaults to 3001
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run the Service**
   ```bash
   npm run start:fetcher
   ```

## API Endpoints

### Health Check
```http
GET /healthz
```
Returns `200 OK` when service is running.

### Manual Sync Trigger
```http
POST /run
Headers:
  X-ADMIN-KEY: your-secure-admin-key-here
```

**Responses:**
- `200 OK` - Upload completed successfully
  ```json
  {
    "success": true,
    "message": "Stream completed successfully",
    "bytesUploaded": 601080741
  }
  ```
- `401 Unauthorized` - Invalid or missing admin key
- `409 Conflict` - Upload already in progress
- `500 Internal Server Error` - Upload failed with error details

## Usage Examples

### Check Service Health
```bash
curl http://localhost:3001/healthz
```

### Trigger Manual Sync
```bash
curl -X POST http://localhost:3001/run \
  -H "X-ADMIN-KEY: your-secure-admin-key-here"
```

### Monitor Upload Progress
```bash
# Watch progress in real-time
watch -n 2 'cat services/fetcher/.upload-state.json | jq "{progress: ((.bytesUploaded / .bytesTotal * 100) | tostring + \"%\"), mb_uploaded: (.bytesUploaded / 1024 / 1024 | round), mb_total: (.bytesTotal / 1024 / 1024 | round)}"'

# One-time progress check
cat services/fetcher/.upload-state.json | jq -r '"Progress: \((.bytesUploaded / .bytesTotal * 100) | round)% (\(.bytesUploaded / 1024 / 1024 | round)MB / \(.bytesTotal / 1024 / 1024 | round)MB)"'
```

## Upload Process

1. **Authentication**: Service authenticates with MediPim using Basic Auth (API Key ID:Secret)
2. **Data Request**: POSTs to MediPim API with filter for active products
3. **Download**: Streams NDJSON data, showing progress every 10MB
4. **Upload**: Uses TUS resumable upload to Supabase Storage
5. **Completion**: Clears upload state on success

## Error Handling

- **Network Interruptions**: Automatically resumes uploads using TUS protocol
- **File Size Limits**: Provides clear error message if Supabase plan limits are exceeded
- **Malformed Data**: Gracefully handles streaming errors
- **Concurrent Requests**: Returns 409 Conflict if upload already in progress

## Automation Options

### Cron Job (Linux/Mac)
```bash
# Add to crontab for daily sync at 2 AM
0 2 * * * curl -X POST http://localhost:3001/run -H "X-ADMIN-KEY: your-secure-admin-key-here"
```

### PM2 Process Manager
```bash
# Start with PM2
pm2 start services/fetcher/index.js --name medipim-fetcher

# Save PM2 configuration
pm2 save
pm2 startup
```

### systemd Service (Linux)
Create `/etc/systemd/system/medipim-fetcher.service`:
```ini
[Unit]
Description=MediPim Fetcher Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/medipim-au-sync-v5
ExecStart=/usr/bin/node services/fetcher/index.js
Restart=on-failure
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

## Testing

Run the test suite while the service is running:
```bash
node services/fetcher/test.js
```

The test script will:
- Verify health endpoint
- Test authentication security
- Optionally test actual MediPim sync (requires valid credentials)

## Troubleshooting

### Upload Fails with "Maximum size exceeded"
- Ensure your Supabase project is on Pro plan or higher
- Check storage settings in Supabase dashboard (Settings → Storage)
- Set file size limit to at least 1GB (MediPim data is ~600MB)

### Authentication Errors
- Verify MediPim API credentials are correct
- Ensure API key has access to products endpoint
- Check that Basic Auth header is properly formed

### Resume Not Working
- Check `.upload-state.json` exists and is readable
- Ensure service has write permissions in its directory
- Verify TUS endpoint URL is correct

### Service Crashes During Download
- Check available disk space
- Increase Node.js memory limit if needed: `node --max-old-space-size=2048`
- Monitor system resources during download

## File Structure

```
services/fetcher/
├── index.js           # Main service implementation
├── test.js           # Test suite
├── README.md         # This documentation
└── .upload-state.json # Upload progress tracking (git ignored)
```

## Security Considerations

- Admin key should be strong and kept secret
- Use HTTPS in production environments
- Consider IP whitelisting for additional security
- Regularly rotate API credentials
- Monitor access logs for unauthorized attempts