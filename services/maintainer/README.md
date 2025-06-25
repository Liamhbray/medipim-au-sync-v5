# Maintainer Service

This service reads NDJSON data from Supabase Storage and performs idempotent upserts to the products table.

## Overview

The Maintainer Service downloads the `latest.ndjson` file uploaded by the Fetcher Service and processes it to populate the Supabase database. It extracts product information, handles various data formats, and performs efficient batch upserts.

## Features

- **Streaming Processing**: Processes large NDJSON files line-by-line without loading entire file into memory
- **Batch Operations**: Groups database operations for optimal performance
- **Idempotent Upserts**: Safe to run multiple times - only updates changed records
- **Smart Update Logic**: Only updates when data changes:
  - Uses MediPim's `meta.updatedAt` timestamp for efficient change detection
  - Simply compares timestamps - if MediPim's timestamp is newer, update the record
  - No need for field-by-field comparison or deep JSON checks
  - Extremely efficient for large datasets
- **Chunked Processing**: Support for processing data in chunks with offset/limit
- **Error Handling**: Gracefully handles malformed JSON and continues processing
- **Progress Tracking**: Logs detailed statistics during and after processing
- **Concurrency Protection**: Prevents multiple simultaneous processing jobs

## Prerequisites

- Node.js 18+ installed
- Supabase project with:
  - `products` table created with proper schema
  - `medipim-raw` storage bucket containing `latest.ndjson`
  - Service role key with read/write permissions

## Setup

1. **Environment Configuration**
   
   Ensure `.env` file contains:
   ```env
   # Supabase Configuration
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Service Configuration
   ADMIN_KEY=your-secure-admin-key-here
   PORT=3002  # Optional, defaults to 3002
   BATCH_SIZE=100  # Optional, defaults to 100
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run the Service**
   ```bash
   npm run start:maintainer
   ```

## API Endpoints

### Health Check
```http
GET /healthz
```
Returns `200 OK` when service is running.

### Manual Processing Trigger
```http
POST /run
Headers:
  X-ADMIN-KEY: your-secure-admin-key-here
  Content-Type: application/json  # Optional, for chunking

Body (optional):
{
  "offset": 0,     # Starting record position
  "limit": 10000   # Number of records to process
}
```

**Responses:**
- `200 OK` - Processing completed successfully
  ```json
  {
    "success": true,
    "message": "Maintenance completed successfully",
    "stats": {
      "totalRecords": 10000,
      "inserted": 500,
      "updated": 9500,
      "errors": 0,
      "duration": 45.23
    },
    "nextOffset": 10000,    # For chunked processing
    "hasMore": true         # More records available
  }
  ```
- `401 Unauthorized` - Invalid or missing admin key
- `409 Conflict` - Processing already in progress
- `500 Internal Server Error` - Processing failed with error details

## Data Processing

### MediPim Data Structure

MediPim returns NDJSON where each line contains:
```json
{
  "meta": { "total": 108022, "index": 0 },
  "result": {
    "id": "M34C3D3A5E",
    "name": { "en": "Product Name" },
    "publicPrice": 12.99,
    "pharmacistPrice": 10.50,
    "manufacturerPrice": 8.00,
    // ... many other fields
  }
}
```

### Product Field Mapping

The service extracts from the `result` object:

- **id**: Product identifier (required)
  - Source: `result.id`
- **name**: Product name (truncated to 255 characters)
  - Sources: `result.name.en` (or first available language)
  - Default: "Unknown Product"
- **price_cents**: Price in cents
  - Sources: `result.publicPrice`, `result.pharmacistPrice`, `result.manufacturerPrice`
  - Converted from dollars to cents
- **raw**: Complete result object (stored as JSONB)

### Database Operations

Uses PostgreSQL's `INSERT ... ON CONFLICT` for efficient upserts:
- Only updates records where data has actually changed
- Preserves `created_at` timestamp for existing records
- Updates `updated_at` only when data changes

## Usage Examples

### Check Service Health
```bash
curl http://localhost:3002/healthz
```

### Trigger Full Processing
```bash
curl -X POST http://localhost:3002/run \
  -H "X-ADMIN-KEY: your-secure-admin-key-here"
```

### Process with Chunking
```bash
# Process first 10,000 records
curl -X POST http://localhost:3002/run \
  -H "X-ADMIN-KEY: your-secure-admin-key-here" \
  -H "Content-Type: application/json" \
  -d '{"offset": 0, "limit": 10000}'

# Process next chunk
curl -X POST http://localhost:3002/run \
  -H "X-ADMIN-KEY: your-secure-admin-key-here" \
  -H "Content-Type: application/json" \
  -d '{"offset": 10000, "limit": 10000}'
```

### Monitor Processing
The service logs detailed progress during processing:
```
Downloading latest.ndjson from Supabase Storage...
Downloaded file size: 573.24 MB
Processing NDJSON file...
Batch 1: 500 records (45 new, 55 updated, 400 unchanged, 0 errors)
Batch 2: 500 records (0 new, 23 updated, 477 unchanged, 0 errors)
...
=== Processing Complete ===
Total records processed: 300000
Records inserted: 5000
Records updated: 15000
Records skipped (unchanged): 280000
Errors: 0
Processing time: 45.23 seconds
Average speed: 6635.32 records/second
```

### Intelligent Updates
The maintainer service only updates products that have actually changed:
- Uses MediPim's `meta.updatedAt` timestamp for change detection
- Compares stored timestamp with incoming timestamp
- Updates only when MediPim's timestamp is newer
- Skips unchanged products to reduce database load
- Provides detailed statistics on inserts, updates, and skips

## Performance Tuning

### Batch Size
Adjust `BATCH_SIZE` environment variable:
- Smaller batches (50-100): Better for memory-constrained environments
- Larger batches (500-1000): Faster processing with more memory usage

### Database Connection
For large datasets, ensure Supabase connection pool is properly configured.

## Automation

### Sequential Processing with Fetcher
```bash
# Run fetcher first
curl -X POST http://localhost:3001/run -H "X-ADMIN-KEY: $ADMIN_KEY"

# Wait for completion, then run maintainer
sleep 300  # Adjust based on typical download time
curl -X POST http://localhost:3002/run -H "X-ADMIN-KEY: $ADMIN_KEY"
```

### Automated Chunked Processing
For production reliability with large datasets, use the included script:
```bash
# Process entire file in 5,000 record chunks
node services/maintainer/run-full-sync.js

# Resume from specific offset if interrupted
node services/maintainer/run-full-sync.js --resume-from=50000
```

### Cron Job
```bash
# Run daily at 3 AM (1 hour after fetcher)
0 3 * * * curl -X POST http://localhost:3002/run -H "X-ADMIN-KEY: your-key"
```

### With Orchestrator (Recommended)
Use the Orchestrator Service for fully automated processing:
```bash
# Handles both fetching and chunked processing
curl -X POST http://localhost:3003/sync -H "X-ADMIN-KEY: your-key"
```

## Error Handling

- **Missing Required Fields**: Records without IDs are skipped and counted as errors
- **Malformed JSON**: Individual lines are skipped, processing continues
- **Database Errors**: Batch is retried, then skipped if persistent
- **Network Issues**: Service can be safely restarted and run again

## Troubleshooting

### "File not found" Error
- Ensure Fetcher service has run successfully first
- Check that `latest.ndjson` exists in `medipim-raw` bucket

### Slow Processing
- Increase `BATCH_SIZE` for better throughput
- Check database indexes on `products.id`
- Monitor Supabase connection pool usage

### High Error Count
- Check service logs for specific JSON parsing errors
- Verify MediPim data format hasn't changed
- Review field extraction logic for edge cases

### Memory Issues
- Reduce `BATCH_SIZE`
- Increase Node.js memory: `node --max-old-space-size=4096`

## Testing

```bash
# Create a test NDJSON file
echo '{"id":"TEST001","name":"Test Product","price":9.99}
{"id":"TEST002","name":"Another Product","retailPrice":19.99}
{"id":"TEST003","title":"Third Product","price":{"cents":2999}}' > test.ndjson

# Upload to Supabase (requires Supabase CLI)
supabase storage cp test.ndjson medipim-raw/latest.ndjson

# Run maintainer
curl -X POST http://localhost:3002/run -H "X-ADMIN-KEY: your-key"
```

## Security Considerations

- Admin key required for triggering processing
- Service role key should have minimal required permissions
- Consider network isolation in production
- Monitor for unusual processing patterns
- Implement rate limiting for API endpoints