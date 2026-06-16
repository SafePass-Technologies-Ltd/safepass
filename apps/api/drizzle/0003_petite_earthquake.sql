ALTER TABLE "documents" ALTER COLUMN "entity_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "entity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "document_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "document_name" varchar(255);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "compliance_status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;