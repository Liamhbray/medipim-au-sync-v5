-- Migration: Fix timestamp columns - remove updatedSince which is a query parameter, not a data field
-- Date: 2025-06-25

-- Drop the updatedSince column as it's a query parameter, not a data field
ALTER TABLE public.products 
DROP COLUMN IF EXISTS "updatedSince";

-- Add comments to clarify the purpose of each timestamp
COMMENT ON COLUMN public.products."createdAt" IS 'When the product was first added to MediPim (from meta.createdAt)';
COMMENT ON COLUMN public.products."metaUpdatedAt" IS 'When the product was last modified in MediPim (from meta.updatedAt)';
COMMENT ON COLUMN public.products.updated_at IS 'When this record was last modified in our database';