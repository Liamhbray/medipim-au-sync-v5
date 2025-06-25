-- Migration: Update products table schema to add new columns and remove price_cents
-- Date: 2025-06-25

-- Add new columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS organization TEXT,
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS "eanGtin13" TEXT,
ADD COLUMN IF NOT EXISTS "eanGtin14" TEXT,
ADD COLUMN IF NOT EXISTS "artgId" TEXT,
ADD COLUMN IF NOT EXISTS pbs TEXT,
ADD COLUMN IF NOT EXISTS "snomedMpp" TEXT,
ADD COLUMN IF NOT EXISTS "snomedTpp" TEXT,
ADD COLUMN IF NOT EXISTS "gs1Category" TEXT,
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "updatedSince" TIMESTAMPTZ;

-- Drop the price_cents column
ALTER TABLE public.products 
DROP COLUMN IF EXISTS price_cents;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_organization ON public.products(organization);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_eanGtin13 ON public.products("eanGtin13");
CREATE INDEX IF NOT EXISTS idx_products_artgId ON public.products("artgId");
CREATE INDEX IF NOT EXISTS idx_products_updatedSince ON public.products("updatedSince");

-- Update RLS policy to remain the same
-- Policy already exists: "Service role can manage products"