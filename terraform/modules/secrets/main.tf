# SafePass — Secrets Manager Module
#
# Per architecture.md Security Considerations: "AWS Secrets Manager for
# database credentials, API keys, and payment gateway secrets. Never in
# environment variables or code."
#
# This module only provisions the Secrets Manager SECRET CONTAINER
# (structure) — it does NOT hardcode real secret values. The secret's
# initial value is a placeholder JSON blob; the real values are populated
# out-of-band (manually via AWS Console/CLI, or via a separate secure
# process) after apply, and are never committed to source control or passed
# as Terraform variables in plaintext beyond the placeholder.
#
# SINGLE SECRET, NOT ONE PER INTEGRATION: Secrets Manager bills per secret
# (~$0.40/month each) regardless of how small its contents are, so instead
# of one secret per integration (jwt_secrets, firebase_admin,
# payment_gateways, external_services), everything lives in ONE secret
# named "<project>/<environment>", namespaced internally by top-level JSON
# keys. The RDS-managed master credentials secret is NOT part of this --
# AWS creates and rotates that one natively via manage_master_user_password
# (see terraform/modules/rds/main.tf) and it's wired into ECS directly as
# DB_SECRET_ARN in environments/production/main.tf.

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

locals {
  # Top-level keys namespace each integration's fields within the single
  # secret blob. apps/api/src/env.ts fetches this once (via APP_SECRET_ARN)
  # and destructures each group -- see resolveJwtSecrets/
  # resolveFirebaseCredentials/resolvePaymentGatewayKeys/
  # resolveExternalServices.
  placeholder = jsonencode({
    jwt_secrets = {
      access_secret  = "REPLACE_ME"
      refresh_secret = "REPLACE_ME"
    }
    firebase_admin = {
      project_id   = "REPLACE_ME"
      client_email = "REPLACE_ME"
      private_key  = "REPLACE_ME"
    }
    payment_gateways = {
      paystack_secret_key    = "REPLACE_ME"
      flutterwave_secret_key = "REPLACE_ME"
    }
    external_services = {
      upstash_redis_url   = "REPLACE_ME"
      upstash_redis_token = "REPLACE_ME"
      resend_api_key      = "REPLACE_ME"
      google_maps_api_key = "REPLACE_ME"
    }
  })
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.project}/${var.environment}"
  description = "SafePass ${var.environment} — all app secrets (jwt_secrets/firebase_admin/payment_gateways/external_services), populated out-of-band, not via Terraform"

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "placeholder" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = local.placeholder

  # Terraform only ever writes the placeholder value on first creation.
  # Real secret values are set manually afterward and Terraform must never
  # overwrite them on subsequent applies.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

output "secret_arn" {
  description = "ARN of the single consolidated app secret, consumed by the ECS module's environment_variables input (as APP_SECRET_ARN) and by the task role's runtime-access IAM policy."
  value       = aws_secretsmanager_secret.app.arn
}
