-- Migration: sync_compat
-- Purpose: Add compatibility fields to stores table for JSON-sync compatibility.

ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS access_code text UNIQUE,
ADD COLUMN IF NOT EXISTS owner_password text,
ADD COLUMN IF NOT EXISTS data jsonb;
