ALTER TABLE "transport_vehicles" ADD COLUMN "vehicle_type" varchar(50);--> statement-breakpoint
ALTER TABLE "transport_vehicles" ADD COLUMN "status" varchar(20) DEFAULT 'active' NOT NULL;