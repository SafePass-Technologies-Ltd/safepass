-- Migration 0010: Add 'custom' subscription plan and custom_slot_count column.
--
-- Adds the 'custom' value to the subscription_plan_enum so orgs can activate
-- a wallet-billed custom slot plan via the self-serve billing endpoint (C-20, T-20).
-- Also adds the custom_slot_count column to store the admin-entered slot count
-- for custom plan activations.

--> statement-breakpoint
ALTER TYPE "subscription_plan" ADD VALUE IF NOT EXISTS 'custom';
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_slot_count" integer;
