# SafePass — Secrets Manager Module
#
# Per architecture.md Security Considerations: "AWS Secrets Manager for
# database credentials, API keys, and payment gateway secrets. Never in
# environment variables or code."
#
# This module only provisions the Secrets Manager SECRET CONTAINERS
# (structure) — it does NOT hardcode real secret values. Each secret's
# initial value is a placeholder JSON blob; the real values are populated
# out-of-band (manually via AWS Console/CLI, or via a separate secure
# process) after apply, and are never committed to source control or passed
# as Terraform variables in plaintext beyond the placeholder.

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

locals {
  # Each entry becomes one Secrets Manager secret. `placeholder` is a JSON
  # string describing the expected shape — operators fill in real values via
  # `aws secretsmanager put-secret-value` after apply (see AGENTS.md
  # Infrastructure section for the exact command).
  secrets = {
    # NOTE: db_credentials intentionally lives here NO LONGER — RDS
    # natively manages and rotates its own master credentials secret via
    # manage_master_user_password (see terraform/modules/rds/main.tf). That
    # secret is created and owned by AWS, not this module, and is wired
    # into ECS directly as DB_CREDENTIALS in environments/production/main.tf.
    jwt_secrets = jsonencode({
      access_secret  = "REPLACE_ME"
      refresh_secret = "REPLACE_ME"
    })
    firebase_admin = jsonencode({
      project_id   = "REPLACE_ME"
      client_email = "REPLACE_ME"
      private_key  = "REPLACE_ME"
    })
    payment_gateways = jsonencode({
      paystack_secret_key    = "REPLACE_ME"
      flutterwave_secret_key = "REPLACE_ME"
    })
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secrets

  name        = "${var.project}/${var.environment}/${each.key}"
  description = "SafePass ${var.environment} — ${each.key} (populated out-of-band, not via Terraform)"

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "placeholder" {
  for_each = local.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = each.value

  # Terraform only ever writes the placeholder value on first creation.
  # Real secret values are set manually afterward and Terraform must never
  # overwrite them on subsequent applies.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

output "secret_arns" {
  description = "Map of secret key -> ARN, consumed by the ECS module's `secrets` input to inject values into the running container."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}
