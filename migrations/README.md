# Database Migrations

This directory contains SQL migration files for updating the database schema.

## Current Migrations

### update_products_schema.sql
Updates the products table to include additional MediPim fields and removes the price_cents column.

**New columns added:**
- `status` - Product status (active, inactive, etc.)
- `organization` - Organization identifier
- `brand` - Brand name
- `eanGtin13` - EAN/GTIN-13 barcode
- `eanGtin14` - EAN/GTIN-14 barcode
- `artgId` - Australian Register of Therapeutic Goods ID
- `pbs` - Pharmaceutical Benefits Scheme info
- `snomedMpp` - SNOMED Medicinal Product Pack code
- `snomedTpp` - SNOMED Trade Product Pack code
- `gs1Category` - GS1 category classification
- `createdAt` - Product creation timestamp
- `updatedSince` - Last update timestamp

**Column removed:**
- `price_cents` - No longer needed

## Running Migrations

### Option 1: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the migration SQL
4. Run the query

### Option 2: Using Supabase CLI
```bash
supabase db push migrations/update_products_schema.sql
```

### Option 3: Direct SQL Connection
```bash
psql -h your-project.supabase.co -U postgres -d postgres -f migrations/update_products_schema.sql
```

## Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Run migrations on a test/development environment first
3. **Smart Updates**: The maintainer service will automatically detect changed fields and only update when necessary
4. **Existing Data**: The migration preserves existing data - only adds new columns and removes price_cents
5. **Indexes**: New indexes are created for commonly queried fields to maintain performance

## Rollback

If you need to rollback this migration:

```sql
-- Rollback: Restore original schema
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS price_cents INTEGER;

ALTER TABLE public.products 
DROP COLUMN IF EXISTS status,
DROP COLUMN IF EXISTS organization,
DROP COLUMN IF EXISTS brand,
DROP COLUMN IF EXISTS "eanGtin13",
DROP COLUMN IF EXISTS "eanGtin14",
DROP COLUMN IF EXISTS "artgId",
DROP COLUMN IF EXISTS pbs,
DROP COLUMN IF EXISTS "snomedMpp",
DROP COLUMN IF EXISTS "snomedTpp",
DROP COLUMN IF EXISTS "gs1Category",
DROP COLUMN IF EXISTS "createdAt",
DROP COLUMN IF EXISTS "updatedSince";

-- Drop the new indexes
DROP INDEX IF EXISTS idx_products_status;
DROP INDEX IF EXISTS idx_products_organization;
DROP INDEX IF EXISTS idx_products_brand;
DROP INDEX IF EXISTS idx_products_eanGtin13;
DROP INDEX IF EXISTS idx_products_artgId;
DROP INDEX IF EXISTS idx_products_updatedSince;
```