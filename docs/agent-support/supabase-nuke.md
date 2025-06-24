# Supabase Database Reset Guide (Nuke)

This guide provides step-by-step instructions for completely resetting a Supabase database while preserving vault secrets. This is particularly useful for applications with sync mechanisms, queues, and scheduled jobs.

## Prerequisites
- Supabase project ID
- Access to execute SQL and migrations
- Supabase CLI installed (for edge function deletion)
- List of vault secrets to preserve

## Step 1: Document Current State

### 1.1 List all migrations
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

### 1.2 List all edge functions
```bash
# Using Supabase CLI
supabase functions list --project-ref YOUR_PROJECT_ID

# Or using MCP if available
# mcp__supabase__list_edge_functions
```

### 1.3 List all tables by schema
```sql
-- Get a comprehensive view of all tables grouped by schema
SELECT schemaname, COUNT(*) as table_count, string_agg(tablename, ', ') as tables
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
GROUP BY schemaname
ORDER BY schemaname;
```

### 1.4 List all storage buckets
```sql
SELECT id, name, created_at FROM storage.buckets ORDER BY created_at;
```

### 1.5 List all cron jobs
```sql
SELECT jobname, schedule, command FROM cron.job;
```

## Step 2: Preserve Vault Secrets

### 2.1 List current vault secrets
```sql
SELECT name, description, created_at FROM vault.secrets ORDER BY created_at;
```

### 2.2 Define secrets to keep
First, identify which secrets are critical for your application:
- API credentials (e.g., MEDIPIM_API_KEY, MEDIPIM_API_SECRET)
- Service keys (e.g., SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- Any other integration credentials

### 2.3 Remove unwanted secrets
```sql
-- Replace the list with your specific secrets to keep
DELETE FROM vault.secrets 
WHERE name NOT IN (
    -- Add your secrets to preserve here
    'YOUR_API_KEY',
    'YOUR_API_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
)
RETURNING name;
```

## Step 3: Main Database Reset

### 3.1 Create and apply the reset migration
Apply this migration to remove all user-created objects:

```sql
-- Step 1: Drop all cron jobs
DO $$
DECLARE
    job RECORD;
BEGIN
    FOR job IN SELECT jobname FROM cron.job LOOP
        EXECUTE format('SELECT cron.unschedule(%L)', job.jobname);
    END LOOP;
END $$;

-- Step 2: Drop all tables in public schema (except vault-related)
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT LIKE 'vault%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', tbl.tablename);
    END LOOP;
END $$;

-- Step 3: Drop all functions and procedures in public schema
DO $$
DECLARE
    func RECORD;
BEGIN
    FOR func IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', func.proname, func.args);
    END LOOP;
END $$;

-- Step 4: Drop all types in public schema
DO $$
DECLARE
    typ RECORD;
BEGIN
    FOR typ IN 
        SELECT typname 
        FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public' 
        AND t.typtype = 'e'
    LOOP
        EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', typ.typname);
    END LOOP;
END $$;

-- Step 5: Drop all views in public schema
DO $$
DECLARE
    v RECORD;
BEGIN
    FOR v IN 
        SELECT viewname 
        FROM pg_views 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', v.viewname);
    END LOOP;
END $$;

-- Step 6: Clear ALL storage buckets
DO $$
DECLARE
    bucket RECORD;
BEGIN
    FOR bucket IN SELECT id FROM storage.buckets LOOP
        -- Delete all objects in the bucket
        DELETE FROM storage.objects WHERE bucket_id = bucket.id;
        -- Delete the bucket itself
        DELETE FROM storage.buckets WHERE id = bucket.id;
    END LOOP;
END $$;

-- Step 7: Reset migrations table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' 
        AND table_name = 'schema_migrations'
    ) THEN
        DELETE FROM supabase_migrations.schema_migrations;
    END IF;
END $$;
```

## Step 4: Remove Queue Tables

### 4.1 Find all queue tables
```sql
-- Find queue-related tables (often in pgmq schema or with queue/dead_letter in name)
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'pgmq' 
   OR tablename LIKE '%queue%' 
   OR tablename LIKE '%dead_letter%'
ORDER BY schemaname, tablename;
```

### 4.2 Drop queue tables
```sql
-- Drop all queue tables found in previous step
DO $$
DECLARE
    tbl RECORD;
BEGIN
    -- Drop dead letter queues first (they might have dependencies)
    FOR tbl IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE tablename LIKE '%dead_letter%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', tbl.schemaname, tbl.tablename);
    END LOOP;
    
    -- Then drop other queue tables
    FOR tbl IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'pgmq' AND tablename LIKE 'q_%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', tbl.schemaname, tbl.tablename);
    END LOOP;
    
    -- Drop archive tables (usually prefixed with 'a_')
    FOR tbl IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'pgmq' AND tablename LIKE 'a_%'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', tbl.schemaname, tbl.tablename);
    END LOOP;
END $$;
```

## Step 5: Remove Storage Buckets

### 5.1 List all storage buckets
```sql
SELECT id, name, created_at FROM storage.buckets ORDER BY created_at;
```

### 5.2 Delete all storage buckets and contents
```sql
-- Delete all buckets and their contents in one operation
DO $$
DECLARE
    bucket RECORD;
BEGIN
    FOR bucket IN SELECT id FROM storage.buckets LOOP
        -- Delete all objects in the bucket
        DELETE FROM storage.objects WHERE bucket_id = bucket.id;
        -- Delete the bucket itself
        DELETE FROM storage.buckets WHERE id = bucket.id;
    END LOOP;
END $$;
```

## Step 6: Clean Custom Schemas

### 6.1 Find custom schemas
```sql
-- List all non-system schemas
SELECT nspname as schema_name,
       (SELECT COUNT(*) FROM pg_tables WHERE schemaname = n.nspname) as table_count,
       (SELECT COUNT(*) FROM pg_proc p WHERE p.pronamespace = n.oid) as function_count
FROM pg_namespace n
WHERE nspname NOT IN (
    -- System schemas to exclude
    'pg_catalog', 'information_schema', 'pg_toast', 'public', 'vault', 
    'auth', 'storage', 'extensions', 'graphql', 'graphql_public', 
    'pgbouncer', 'pgsodium', 'pgsodium_masks', 'realtime', 
    'supabase_functions', 'supabase_migrations', 'net', 'cron', 
    'pg_net', 'pgmq'
)
AND nspname NOT LIKE 'pg_%'
ORDER BY nspname;
```

### 6.2 Drop custom schemas
```sql
-- Drop all custom schemas found in previous step
DO $$
DECLARE
    schema_rec RECORD;
BEGIN
    FOR schema_rec IN 
        SELECT nspname 
        FROM pg_namespace 
        WHERE nspname NOT IN (
            'pg_catalog', 'information_schema', 'pg_toast', 'public', 'vault',
            'auth', 'storage', 'extensions', 'graphql', 'graphql_public',
            'pgbouncer', 'pgsodium', 'pgsodium_masks', 'realtime',
            'supabase_functions', 'supabase_migrations', 'net', 'cron',
            'pg_net', 'pgmq'
        )
        AND nspname NOT LIKE 'pg_%'
    LOOP
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_rec.nspname);
    END LOOP;
END $$;
```

## Step 7: Remove Edge Functions

### 7.1 List all edge functions
```bash
# Using Supabase CLI
supabase functions list --project-ref YOUR_PROJECT_ID
```

### 7.2 Delete each edge function
```bash
# Delete each function found in the previous step
supabase functions delete FUNCTION_NAME --project-ref YOUR_PROJECT_ID

# Example:
# supabase functions delete fetch_medipim_stream --project-ref aggmcawyfbmzrdmojhab
# supabase functions delete fetch_medipim_full --project-ref aggmcawyfbmzrdmojhab
# supabase functions delete fetch_medipim_stream_v2 --project-ref aggmcawyfbmzrdmojhab
```

## Step 8: Verify Reset

### 8.1 Run database verification query
```sql
SELECT 
    'Custom Schemas' as type,
    COUNT(*) as count
FROM pg_namespace 
WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'public', 'vault', 
'auth', 'storage', 'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'pgsodium', 
'pgsodium_masks', 'realtime', 'supabase_functions', 'supabase_migrations', 'net', 'cron', 'pg_net', 'pgmq')
AND nspname NOT LIKE 'pg_%'
UNION ALL
SELECT 
    'Public Tables' as type,
    COUNT(*)
FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 
    'Public Functions' as type,
    COUNT(*)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
UNION ALL
SELECT 
    'Cron Jobs' as type,
    COUNT(*)
FROM cron.job
UNION ALL
SELECT 
    'Storage Buckets' as type,
    COUNT(*)
FROM storage.buckets;
```

Expected result: All counts should be 0.

### 8.2 Verify edge functions are deleted
```bash
# Should return no functions
supabase functions list --project-ref YOUR_PROJECT_ID
```

### 8.3 Verify vault preservation
```sql
SELECT name, description FROM vault.secrets ORDER BY name;
```

Should only show the preserved secrets.

## Important Notes

1. **Vault Preservation**: This process preserves vault secrets. Always verify which secrets to keep before deletion.

2. **System Extensions**: Standard Supabase extensions (pg_net, pgmq, pg_cron, etc.) are preserved.

3. **Edge Functions**: Edge functions must be deleted separately using the Supabase CLI. They are not removed by SQL commands.

4. **Irreversible**: This process is destructive and cannot be undone. Always backup important data first.

5. **Order Matters**: Execute steps in order to avoid dependency issues.

6. **Application-Specific Items**: Common patterns to look for:
   - Custom schemas (e.g., 'medipim', 'sync', 'integration')
   - Queue tables (usually in 'pgmq' schema or containing 'queue'/'dead_letter')
   - Sync tracking tables (e.g., 'sync_runs', 'request_tracking')
   - Bootstrap or edge function tables
   - Storage buckets for file processing
   - Edge functions for API integrations

## Quick Command Summary

For agents executing this reset:

1. **Discovery Phase**:
   - List all migrations, tables, functions, cron jobs, and edge functions
   - Identify custom schemas and queue tables
   - Document vault secrets
   - List storage buckets

2. **Preservation Phase**:
   - Keep only required vault secrets (API keys, service credentials)
   
3. **Cleanup Phase** (in order):
   - Apply main reset migration (drops crons, tables, functions, views, storage)
   - Remove all queue tables (dead_letter, sync queues, etc.)
   - Drop all custom schemas
   - Delete all edge functions via CLI
   
4. **Verification Phase**:
   - Confirm all database counts are zero
   - Verify edge functions are deleted
   - Verify vault has only preserved secrets

## Common Patterns in Sync Applications

When resetting sync/integration applications, look for:
- **Sync tables**: products, sync_runs, tracking tables
- **Queue tables**: product_sync_queue, retry_queue, dead_letter
- **Processing functions**: bootstrap, incremental_sync, process_batch
- **Scheduled jobs**: hourly/daily syncs, cleanup tasks
- **Storage**: raw data buckets, processed file storage

The database should now be in a fresh state with only vault secrets preserved.