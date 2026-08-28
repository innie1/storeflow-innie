-- Migration: add_customer_uuid_to_profiles
-- Purpose: Add customer_uuid column to public.profiles table to support merging anonymous customer IDs with authenticated accounts.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS customer_uuid uuid;
