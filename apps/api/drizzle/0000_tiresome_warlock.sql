CREATE TYPE "public"."auth_provider" AS ENUM('google', 'facebook', 'apple');--> statement-breakpoint
CREATE TYPE "public"."checkin_method" AS ENUM('message', 'call', 'sms');--> statement-breakpoint
CREATE TYPE "public"."checkin_response" AS ENUM('pending', 'confirmed_safe', 'no_response', 'concern_raised');--> statement-breakpoint
CREATE TYPE "public"."document_entity" AS ENUM('vehicle', 'driver', 'organization');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('vehicle_registration', 'vehicle_insurance', 'roadworthiness', 'drivers_license', 'company_cac_registration', 'other');--> statement-breakpoint
CREATE TYPE "public"."emergency_status" AS ENUM('active', 'acknowledged', 'escalated', 'resolved_false_alarm', 'resolved_incident');--> statement-breakpoint
CREATE TYPE "public"."escalation_status" AS ENUM('pending', 'acknowledged', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('kidnapping', 'armed_robbery', 'accident', 'roadblock', 'police_checkpoint', 'fake_checkpoint', 'bad_road', 'vehicle_breakdown', 'suspicious_activity');--> statement-breakpoint
CREATE TYPE "public"."marker_action" AS ENUM('confirm', 'dispute_not_there', 'reclassify_police', 'reclassify_suspicious');--> statement-breakpoint
CREATE TYPE "public"."marker_source" AS ENUM('user_report', 'admin_manual', 'news_archive', 'police_report', 'security_advisory', 'partner_data');--> statement-breakpoint
CREATE TYPE "public"."marker_type" AS ENUM('kidnapping_hotspot', 'checkpoint', 'high_risk_zone', 'recent_attack', 'safe_zone', 'admin_marker');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'check_in', 'alert', 'system');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('corporate', 'transport_partner');--> statement-breakpoint
CREATE TYPE "public"."org_verification" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('paystack', 'flutterwave', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'successful', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('trip', 'subscription', 'refund');--> statement-breakpoint
CREATE TYPE "public"."sender_role" AS ENUM('user', 'admin', 'monitoring_officer', 'system');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('starter', 'business', 'enterprise', 'standard', 'fleet', 'none');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('deposit', 'trip_charge', 'subscription_charge', 'refund', 'admin_adjustment', 'withdrawal');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('panic_button', 'auto_detect_crash', 'auto_detect_stop', 'auto_detect_deviation', 'admin_manual');--> statement-breakpoint
CREATE TYPE "public"."trip_mode" AS ENUM('driver', 'passenger');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('draft', 'active', 'delayed', 'emergency', 'escalated', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'corporate_admin', 'transport_partner', 'monitoring_officer', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('car', 'bus', 'suv', 'truck', 'motorcycle', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'partially_confirmed', 'verified', 'disputed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."wallet_owner_type" AS ENUM('user', 'organization');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"method" "checkin_method" NOT NULL,
	"response_status" "checkin_response" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" "document_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"file_url" text NOT NULL,
	"file_name" varchar(255),
	"verification_status" "org_verification" DEFAULT 'pending' NOT NULL,
	"verified_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"license_number" varchar(50) NOT NULL,
	"photo_url" text,
	"assigned_vehicle_id" uuid,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "emergency_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"trigger_type" "trigger_type" NOT NULL,
	"status" "emergency_status" NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"speed" double precision,
	"location_timestamp" timestamp with time zone NOT NULL,
	"audio_recording_urls" jsonb DEFAULT '[]'::jsonb,
	"video_recording_urls" jsonb DEFAULT '[]'::jsonb,
	"emergency_contact_notified" boolean DEFAULT false NOT NULL,
	"officer_id" uuid,
	"resolution_notes" text,
	"escalated_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"emergency_event_id" uuid,
	"escalated_by" uuid NOT NULL,
	"escalated_to" uuid,
	"reason" text NOT NULL,
	"notes" text,
	"status" "escalation_status" NOT NULL,
	"resolution_notes" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"trip_id" uuid,
	"incident_type" "incident_type" NOT NULL,
	"location" jsonb NOT NULL,
	"description" text NOT NULL,
	"photo_url" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verification_weight" integer DEFAULT 0 NOT NULL,
	"admin_notes" text,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_marker_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marker_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "marker_action" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid,
	"marker_type" "marker_type" NOT NULL,
	"category" varchar(100),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"severity" "severity" NOT NULL,
	"source" "marker_source" NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verification_weight" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_role" "sender_role" NOT NULL,
	"content" text NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "org_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"rc_number" varchar(50),
	"industry" varchar(100),
	"address" text,
	"contact_person" varchar(255) NOT NULL,
	"contact_phone" varchar(20) NOT NULL,
	"contact_email" varchar(255),
	"verification_status" "org_verification" DEFAULT 'pending' NOT NULL,
	"subscription_plan" "subscription_plan" DEFAULT 'none' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid,
	"organization_id" uuid,
	"amount" double precision NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"status" "payment_status" NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"gateway_reference" varchar(255),
	"gateway_response" jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transport_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plate_number" varchar(20) NOT NULL,
	"make" varchar(100),
	"model" varchar(100),
	"year" integer,
	"capacity" integer,
	"photo_url" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"qr_code_url" text,
	"qr_verification_token" varchar(50),
	"qr_generated_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"registered_by" uuid,
	"organization_id" uuid,
	"trip_mode" "trip_mode" DEFAULT 'passenger' NOT NULL,
	"user_vehicle_id" uuid,
	"origin" jsonb NOT NULL,
	"destination" jsonb NOT NULL,
	"status" "trip_status" DEFAULT 'draft' NOT NULL,
	"scheduled_departure" timestamp with time zone,
	"started_at" timestamp with time zone,
	"estimated_arrival" timestamp with time zone,
	"actual_arrival" timestamp with time zone,
	"vehicle_type" "vehicle_type",
	"vehicle_plate_number" varchar(20),
	"transport_company" varchar(255),
	"driver_name" varchar(255),
	"driver_phone" varchar(20),
	"passenger_count" integer DEFAULT 1,
	"route_polyline" text,
	"payment_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plate_number" varchar(20) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"make" varchar(100),
	"model" varchar(100),
	"colour" varchar(50),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider" "auth_provider" NOT NULL,
	"auth_provider_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"organization_id" uuid,
	"emergency_contacts" jsonb NOT NULL,
	"is_verified" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notification_preferences" jsonb DEFAULT '{"pushEnabled":true,"emailEnabled":true}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"amount" double precision NOT NULL,
	"balance_before" double precision NOT NULL,
	"balance_after" double precision NOT NULL,
	"payment_id" uuid,
	"trip_id" uuid,
	"description" text,
	"status" "transaction_status" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "wallet_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkins" ADD CONSTRAINT "checkins_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkins" ADD CONSTRAINT "checkins_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assigned_vehicle_id_transport_vehicles_id_fk" FOREIGN KEY ("assigned_vehicle_id") REFERENCES "public"."transport_vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_escalated_to_users_id_fk" FOREIGN KEY ("escalated_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escalations" ADD CONSTRAINT "escalations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escalations" ADD CONSTRAINT "escalations_emergency_event_id_emergency_events_id_fk" FOREIGN KEY ("emergency_event_id") REFERENCES "public"."emergency_events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escalations" ADD CONSTRAINT "escalations_escalated_by_users_id_fk" FOREIGN KEY ("escalated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escalations" ADD CONSTRAINT "escalations_escalated_to_users_id_fk" FOREIGN KEY ("escalated_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escalations" ADD CONSTRAINT "escalations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_marker_interactions" ADD CONSTRAINT "map_marker_interactions_marker_id_map_markers_id_fk" FOREIGN KEY ("marker_id") REFERENCES "public"."map_markers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_marker_interactions" ADD CONSTRAINT "map_marker_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_markers" ADD CONSTRAINT "map_markers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trips" ADD CONSTRAINT "trips_user_vehicle_id_user_vehicles_id_fk" FOREIGN KEY ("user_vehicle_id") REFERENCES "public"."user_vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkins_trip_idx" ON "checkins" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_org_idx" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drivers_org_idx" ON "drivers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drivers_vehicle_idx" ON "drivers" USING btree ("assigned_vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_trip_idx" ON "emergency_events" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emergency_status_idx" ON "emergency_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escalations_trip_idx" ON "escalations" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escalations_status_idx" ON "escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_reporter_idx" ON "incidents" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_type_idx" ON "incidents" USING btree ("incident_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_verification_idx" ON "incidents" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marker_interactions_marker_idx" ON "map_marker_interactions" USING btree ("marker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marker_interactions_user_idx" ON "map_marker_interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markers_type_idx" ON "map_markers" USING btree ("marker_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markers_status_idx" ON "map_markers" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markers_active_geo_idx" ON "map_markers" USING btree ("is_active","latitude","longitude");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_trip_idx" ON "messages" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orgs_name_idx" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orgs_type_idx" ON "organizations" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_trip_idx" ON "payments" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_gateway_ref_idx" ON "payments" USING btree ("gateway_reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transport_vehicles_org_idx" ON "transport_vehicles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transport_vehicles_qr_token_idx" ON "transport_vehicles" USING btree ("qr_verification_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_user_idx" ON "trips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_status_idx" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_org_idx" ON "trips" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_vehicles_user_idx" ON "user_vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_vehicles_default_idx" ON "user_vehicles" USING btree ("user_id","is_default") WHERE is_default = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_provider_id_idx" ON "users" USING btree ("auth_provider","auth_provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_tx_wallet_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_tx_trip_idx" ON "wallet_transactions" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_owner_idx" ON "wallets" USING btree ("owner_type","owner_id");