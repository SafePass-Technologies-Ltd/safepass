# SafePass — Terraform State Backend Bootstrap
#
# CHICKEN-AND-EGG PROBLEM: Terraform's S3+DynamoDB remote backend must already
# exist before any other Terraform config (terraform/environments/production)
# can use it as its `backend "s3" {}` target. This config creates that S3
# bucket + DynamoDB lock table using purely LOCAL state (no remote backend
# here, intentionally) and is applied exactly ONCE, manually, by a human with
# AWS admin credentials, before CI ever runs `terraform init` against
# terraform/environments/production.
#
# After this is applied once, this directory is rarely touched again. Do NOT
# point CI at this directory — it has no remote backend, and using CI here
# would leave local state nowhere durable.
#
# MANUAL BOOTSTRAP STEPS (run once, by a human, with AWS credentials configured
# locally via `aws configure` or equivalent):
#   1. cd terraform/bootstrap
#   2. terraform init
#   3. terraform apply -var="aws_region=eu-west-2" -var="project=safepass"
#   4. Note the outputs (state_bucket_name, lock_table_name) — these feed the
#      `bucket`/`dynamodb_table` values in
#      terraform/environments/production/backend.tf
#   5. Commit the backend.tf values (bucket/table names are not secret) so CI
#      can `terraform init` against the now-existing backend.
#   6. From this point forward, terraform/environments/production is applied
#      via GitHub Actions (terraform-plan.yml / terraform-apply.yml) using
#      OIDC-assumed credentials — never local static keys. The OIDC provider
#      and deploy role are pre-existing, configured by the user directly in
#      AWS (outside any Terraform in this repo); its ARN is supplied to
#      workflows via the `AWS_ROLE_ARN` GitHub repo variable. See
#      terraform/modules/iam-ecs/main.tf's header comment for the minimum
#      permissions that pre-existing role needs.

terraform {
  required_version = ">= 1.15.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.52"
    }
  }

  # Intentionally NO backend block here — this bootstraps the backend itself.
  # State for this config stays local (terraform.tfstate in this directory).
  # Keep that local state file (e.g. in a password manager or encrypted
  # archive) in case the backend resources ever need to be re-imported.
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region to create the state backend resources in."
  type        = string
  default     = "eu-west-2"
}

variable "project" {
  description = "Project name prefix used for bucket/table naming."
  type        = string
  default     = "safepass"
}

# S3 bucket holding Terraform remote state for every environment. State keys
# are namespaced per environment inside this single bucket (e.g.
# "production/terraform.tfstate", later "staging/terraform.tfstate") rather
# than provisioning one bucket per environment — simpler to bootstrap once
# and scales fine via key prefixing when a staging env is added later.
resource "aws_s3_bucket" "tf_state" {
  bucket = "${var.project}-terraform-state"

  # Prevent accidental deletion of the bucket holding all environments' state.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB table for state locking (Terraform's S3 backend uses this to
# prevent concurrent `apply` runs from corrupting state). Single table shared
# across environments — the lock key is derived from the state file path, so
# per-environment isolation is automatic; no need for a table-per-env.
resource "aws_dynamodb_table" "tf_lock" {
  name         = "${var.project}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

output "state_bucket_name" {
  value = aws_s3_bucket.tf_state.bucket
}

output "lock_table_name" {
  value = aws_dynamodb_table.tf_lock.name
}
