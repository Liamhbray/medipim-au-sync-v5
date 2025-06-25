# Configuration Guide

## Environment Variables

Create a `.env` file in the project root with the following configuration:

```env
# MediPim API Configuration
MEDIPIM_API_URL=https://api.au.medipim.com/v4/products/stream
MEDIPIM_API_KEY_ID=your-api-key-id
MEDIPIM_API_KEY_SECRET=your-api-key-secret

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Security
ADMIN_KEY=your-secure-admin-key-here

# Service Ports (optional - defaults shown)
FETCHER_PORT=3001
MAINTAINER_PORT=3002
ORCHESTRATOR_PORT=3003

# Processing Configuration (optional)
BATCH_SIZE=100          # Records per database batch
```

## Required Setup

### 1. MediPim API Access
- Obtain API credentials from MediPim
- Ensure your account has access to the AU product stream endpoint
- API uses Basic Authentication with `ApiKeyId:ApiKeySecret`

### 2. Supabase Project Setup

#### Database Table
```sql
CREATE TABLE public.products (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    organization TEXT,
    brand TEXT,
    "eanGtin13" TEXT,
    "eanGtin14" TEXT,
    "artgId" TEXT,
    pbs TEXT,
    "snomedMpp" TEXT,
    "snomedTpp" TEXT,
    "gs1Category" TEXT,
    "createdAt" TIMESTAMPTZ,
    "updatedSince" TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    raw JSONB
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create policy for service role
CREATE POLICY "Service role can manage products" ON public.products
    FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_organization ON public.products(organization);
CREATE INDEX idx_products_brand ON public.products(brand);
CREATE INDEX idx_products_eanGtin13 ON public.products("eanGtin13");
CREATE INDEX idx_products_artgId ON public.products("artgId");
CREATE INDEX idx_products_updatedSince ON public.products("updatedSince");
```

#### Storage Bucket
1. Create a bucket named `medipim-raw`
2. Set the bucket to private (no public access)
3. For files over 50MB, ensure your Supabase project is on Pro plan
4. Set file size limit to at least 1GB (MediPim data is ~600MB)

### 3. Security Configuration

#### Admin Key
- Generate a strong, random key for `ADMIN_KEY`
- This key protects all service endpoints
- Example generation: `openssl rand -hex 32`

#### Service Role Key
- Found in Supabase Dashboard → Settings → API
- Has full database access - keep secure
- Never expose in client-side code

## Service-Specific Configuration

See individual service documentation for additional configuration options:
- [Fetcher Service](../services/fetcher/README.md#configuration)
- [Maintainer Service](../services/maintainer/README.md#configuration)
- [Orchestrator Service](../services/orchestrator/README.md#configuration)