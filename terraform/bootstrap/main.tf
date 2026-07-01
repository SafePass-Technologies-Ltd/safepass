# SafePass — Terraform State Backend Bootstrap
#
# CHICKEN-AND-EGG PROBLEM: Terraform's S3 remote backend must already exist
# before any other Terraform config (terraform/environments/production) can
# use it as its `backend "s3" {}` target. This config creates that S3 bucket
# using purely LOCAL state (no remote backend here, intentionally) and is
# applied exactly ONCE, manually, by a human with AWS admin credentials,
# before CI ever runs `terraform init` against
# terraform/environments/production.
#
# State locking uses the S3 backend's native lockfile support
# (`use_lockfile = true`, Terraform >= 1.10) rather than a separate DynamoDB
# table — Terraform performs conditional writes directly against the state
# bucket, so no DynamoDB table is provisioned or required here.
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
#   4. Note the output (state_bucket_name) — it feeds the `bucket` value in
#      terraform/environments/production/backend.tf
#   5. Commit the backend.tf value (bucket name is not secret) so CI can
#      `terraform init` against the now-existing backend.
#   6. From this point forward, terraform/environments/production is applied
#      via GitHub Actions (terraform-plan.yml / terraform-apply.yml) using
#      OIDC-assumed credentials — never local static keys. The OIDC provider
#      and deploy role are pre-existing, configured by the user directly in
#      AWS (outside any Terraform in this repo); its ARN is supplied to
#      workflows via the `AWS_ROLE_TO_ASSUME` GitHub secret. See
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
  description = "Project name prefix used for bucket naming."
  type        = string
  default     = "safepass"
}

# S3 bucket holding Terraform remote state for every environment. State keys
# are namespaced per environment inside this single bucket (e.g.
# "production/terraform.tfstate", later "staging/terraform.tfstate") rather
# than provisioning one bucket per environment — simpler to bootstrap once
# and scales fine via key prefixing when a staging env is added later.
#
# This bucket also holds Terraform's native S3-backend lockfiles (via
# `use_lockfile = true` in each environment's backend.tf) — no separate
# DynamoDB lock table is needed.
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

output "state_bucket_name" {
  value = aws_s3_bucket.tf_state.bucket
}
