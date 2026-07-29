-- Marketing lead capture from SafePassLanding (docs/SafePassLanding/, FEAT-012).
--
-- The landing site itself holds no database (its README carries the explicit
-- non-goal "It will never become the system of record for leads or user
-- data"); its Lead Intake Service validates and forwards to POST /v1/leads,
-- and this table is where a lead becomes durable. Persisting here rather than
-- only relaying to a CRM is the mitigation for risk_log.md R-004, which scores
-- a dropped lead at Impact 5.
--
-- Type-specific columns are nullable by design: the three lead types
-- (waitlist / demo request / partner inquiry) have partly-disjoint field sets,
-- and the per-type required-field rules are enforced by @safepass/shared's
-- LeadPayloadSchema at the API boundary. A NOT NULL constraint here could only
-- ever describe one of the three variants correctly.

DO $$ BEGIN
  CREATE TYPE "lead_type" AS ENUM ('waitlist', 'demo_request', 'partner_inquiry');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "lead_type" "lead_type" NOT NULL,
  "source_page" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "contact_name" text,
  "email" text,
  "phone" text,
  "company_name" text,
  "city_or_region" text,
  "team_size" text,
  "fleet_size" integer,
  "message" text,
  "status" "lead_status" DEFAULT 'new' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Unique, not merely indexed: a visitor who hits Retry after an ambiguous
-- timeout (a path user_flow.md's Submission Error state explicitly invites)
-- must reconcile onto the same row rather than create a duplicate lead for
-- sales to chase twice. POST /v1/leads relies on this for its
-- onConflictDoNothing idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS "leads_submission_id_idx" ON "leads" ("submission_id");

CREATE INDEX IF NOT EXISTS "leads_type_idx" ON "leads" ("lead_type");
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" ("status");
CREATE INDEX IF NOT EXISTS "leads_created_idx" ON "leads" ("created_at");
