# SafePass — Production Remote State Backend
#
# Points at the S3 bucket created ONCE, manually, by terraform/bootstrap/ (see
# that directory's header comment for the exact manual steps — this is the
# classic Terraform chicken-and-egg problem: the backend that stores this
# config's state cannot itself be created by this config).
#
# Locking uses the S3 backend's native lockfile mechanism (`use_lockfile`,
# Terraform >= 1.10) instead of a separate DynamoDB table — `dynamodb_table`
# is deprecated as of Terraform 1.10 now that S3 supports conditional writes
# for locking directly. No DynamoDB table is provisioned or required.
#
# State is namespaced by environment via the `key` path (`production/...`),
# so a future `staging` environment can reuse the SAME bucket with a
# different key (e.g. `staging/terraform.tfstate`) — no new bootstrap run
# needed to add environments later.
#
# Terraform's `backend` block cannot use variables/interpolation, so the
# bucket name below must be updated manually (or via `-backend-config` flags
# in CI) to match terraform/bootstrap's output value.

terraform {
  backend "s3" {
    bucket       = "safepass-terraform-state"
    key          = "production/terraform.tfstate"
    region       = "eu-west-2"
    use_lockfile = true
    encrypt      = true
  }
}
