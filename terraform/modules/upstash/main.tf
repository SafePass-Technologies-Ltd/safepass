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

# Single-region (region set directly, NOT region = "global" + a separate
# primary_region/read_regions -- that combination is only for Upstash's
# multi-region "Global" database type, which this app has no use for: it
# runs in exactly one AWS region today per environments/production/
# variables.tf, so global read replicas would just add cost with no
# latency benefit). "eu-west-2" (the API's own AWS region) is NOT one of
# Upstash's supported region codes -- "eu-west-1" (Ireland) is the closest
# available, an acceptable few-ms trade-off versus provisioning a region
# Upstash doesn't offer.
resource "upstash_redis_database" "app" {
  database_name = "${var.project}-${var.environment}-realtime"
  region        = "eu-west-1"
  tls           = true
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
