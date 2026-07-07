# SafePass — Upstash Redis Module
#
# Provisions the real Upstash Redis database used by apps/api's
# redis.service.ts (cross-task WebSocket broadcast relay -- see that
# module's header comment) via Upstash's official Terraform provider
# (upstash/upstash), authenticated with an Upstash account email + API key
# (generated in the Upstash console under Account > API Keys) rather than
# any AWS credentials -- Upstash is a separate managed service, not an AWS
# resource, per architecture.md's Deployment Architecture ("Redis (Upstash)
# -- serverless Redis with global edge replication").

terraform {
  required_providers {
    upstash = {
      source  = "upstash/upstash"
      version = "~> 2.1"
    }
  }
}

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

# NOTE: plain single-region creation (region = "<code>" directly) is
# deprecated on Upstash's own API as of this writing -- confirmed via the
# live "Create Redis Database failed ... regional db creation is
# deprecated" error creating this resource with that form. Every new
# database must now go through the region = "global" + primary_region path
# below, even when (as here) only one region is actually wanted --
# omitting read_regions entirely keeps this functionally single-region (no
# extra read replicas, no extra cost) while still satisfying the API's
# current requirements. "eu-west-2" (the API's own AWS region) is NOT one
# of Upstash's supported primary_region codes -- "eu-west-1" (Ireland) is
# the closest available, an acceptable few-ms trade-off.
resource "upstash_redis_database" "app" {
  database_name  = "${var.project}-${var.environment}-realtime"
  region         = "global"
  primary_region = "eu-west-1"
  tls            = true
}

output "database_id" {
  value = upstash_redis_database.app.database_id
}

# rediss:// TCP connection string ioredis needs (see apps/api/src/services/
# redis.service.ts's header comment on why this must be the native-protocol
# URL, not Upstash's separate REST endpoint/token). Assembled here rather
# than left to the consumer, since `password` is only ever available as a
# resource attribute -- there's no separate "give me the full connection
# string" output on this resource.
output "connection_url" {
  value     = "rediss://default:${upstash_redis_database.app.password}@${upstash_redis_database.app.endpoint}:${upstash_redis_database.app.port}"
  sensitive = true
}
