# System Overview

The MediPim AU Sync system synchronizes product data from MediPim's Australian catalog to a Supabase database using a microservices architecture.

## Architecture

```
┌─────────────────┐
│    MediPim AU   │
│   Product API   │
└────────┬────────┘
         │ HTTPS POST
         │ Basic Auth
         ▼
┌─────────────────┐     ┌──────────────┐
│     Fetcher     │────▶│   Supabase   │
│    Service      │     │   Storage    │
│   (Port 3001)   │     │ (latest.ndjson)
└─────────────────┘     └──────┬───────┘
                               │
┌─────────────────┐            │
│  Orchestrator   │            │
│    Service      │            │
│   (Port 3003)   │            │
└─────────────────┘            │
         │                     │
         ▼                     ▼
┌─────────────────┐     ┌──────────────┐
│   Maintainer    │────▶│   Supabase   │
│    Service      │     │   Database   │
│   (Port 3002)   │     │  (products)  │
└─────────────────┘     └──────────────┘
```

## Data Flow

1. **Trigger**: Scheduled job or manual API call initiates sync via Orchestrator
2. **Fetch Phase**: 
   - Orchestrator triggers Fetcher Service
   - Fetcher authenticates with MediPim using Basic Auth
   - Downloads complete product catalog as NDJSON stream
   - Uploads to Supabase Storage using TUS resumable protocol
3. **Process Phase**:
   - Orchestrator triggers Maintainer Service
   - Maintainer downloads NDJSON from Storage
   - Processes data in configurable chunks (default: 5,000 records)
   - Performs idempotent upserts to products table
4. **Completion**: Orchestrator reports final statistics

## Services

### Fetcher Service
- Downloads product data from MediPim API
- Handles 500MB+ files via streaming
- Implements resumable uploads
- [Full Documentation](../services/fetcher/README.md)

### Maintainer Service  
- Processes NDJSON to database
- Supports chunked processing
- Performs intelligent upserts (only updates changed products)
- Tracks inserted, updated, and skipped records
- [Full Documentation](../services/maintainer/README.md)

### Orchestrator Service
- Coordinates the complete sync workflow
- Provides progress monitoring
- Handles retry logic
- [Full Documentation](../services/orchestrator/README.md)

## Key Features

- **Reliability**: Automatic retries, resumable uploads, chunked processing
- **Scalability**: Handles 100k+ products and 500MB+ files
- **Monitoring**: Real-time progress tracking and health checks
- **Idempotency**: Safe to run multiple times
- **Production Ready**: Multiple deployment options

## Technology Stack

- **Runtime**: Node.js 18+
- **Database**: PostgreSQL (via Supabase)
- **Storage**: Supabase Storage (S3-compatible)
- **Protocols**: HTTP/REST, TUS (resumable uploads)
- **Authentication**: Basic Auth (MediPim), API Keys (internal)

## Performance Characteristics

- **Total Sync Time**: ~15-25 minutes for full catalog (with optimized resources)
- **Data Volume**: ~300,000+ products, ~600MB NDJSON
- **Processing Rate**: ~12,000-20,000 products/minute
- **Memory Usage**: <512MB per service (8GB for maintainer with performance CPUs)
- **Network**: Requires stable broadband connection
- **Database Efficiency**: Only updates products with actual changes, skips unchanged records