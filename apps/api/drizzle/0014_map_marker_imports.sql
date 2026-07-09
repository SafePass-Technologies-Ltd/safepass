-- Migration: add map_marker_imports table (A-09 CSV bulk import audit log)
CREATE TABLE IF NOT EXISTS "map_marker_imports" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "uploaded_by"            uuid NOT NULL REFERENCES "users"("id"),
  "file_name"              varchar(255) NOT NULL,
  "row_count"              integer NOT NULL,
  "created_count"          integer NOT NULL,
  "skipped_duplicate_count" integer NOT NULL DEFAULT 0,
  "created_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "marker_imports_uploaded_by_idx" ON "map_marker_imports" ("uploaded_by");
