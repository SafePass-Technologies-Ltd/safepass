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

# Single-region (not Upstash's multi-region "Global" database type -- this
# app has one AWS region today per environments/production/variables.tf,
# so global read replicas would just add cost with no latency benefit).
# Matches the API's own AWS region (eu-west-2) to minimize the extra
# network hop on every WebSocket broadcast.
resource "upstash_redis_database" "app" {
  database_name  = "${var.project}-${var.environment}-realtime"
  platform       = "aws"
  primary_region = "eu-west-2"
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
