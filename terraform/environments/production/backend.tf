# SafePass — Production Remote State Backend
#
# Points at the S3 bucket + DynamoDB lock table created ONCE, manually, by
# terraform/bootstrap/ (see that directory's header comment for the exact
# manual steps — this is the classic Terraform chicken-and-egg problem:
# the backend that stores this config's state cannot itself be created by
# this config).
#
# State is namespaced by environment via the `key` path (`production/...`),
# so a future `staging` environment can reuse the SAME bucket/table with a
# different key (e.g. `staging/terraform.tfstate`) — no new bootstrap run
# needed to add environments later.
#
# Terraform's `backend` block cannot use variables/interpolation, so the
# bucket/table names below must be updated manually (or via `-backend-config`
# flags in CI) to match terraform/bootstrap's output values.

terraform {
  backend "s3" {
    bucket         = "safepass-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "eu-west-2"
    dynamodb_table = "safepass-terraform-locks"
    encrypt        = true
  }
}
