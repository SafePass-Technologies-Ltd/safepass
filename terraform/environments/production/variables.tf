# SafePass — Production Environment Variables
#
# Structured so that a `terraform/environments/staging/` directory can be
# added later by copying this environment folder, changing `environment`
# to "staging", pointing backend.tf's `key` at "staging/terraform.tfstate",
# and adjusting sizing variables (instance_class, cpu/memory, desired_count)
# down for a cheaper non-prod footprint — the module set itself does not
# need to change.

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "eu-west-2"
}

variable "project" {
  description = "Project name prefix used across all resource names."
  type        = string
  default     = "safepass"
}

variable "environment" {
  description = "Environment name — namespaces resource names and the Terraform state key. Production only for now; \"staging\" can be added later by duplicating this environment directory with this value changed."
  type        = string
  default     = "production"
}

variable "availability_zones" {
  description = "Exactly 2 AZs for Multi-AZ RDS + ECS spread."
  type        = list(string)
  default     = ["eu-west-2a", "eu-west-2b"]
}

# --- Sizing (kept as variables so a future staging env can override cheaply) ---
variable "rds_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "rds_allocated_storage_gb" {
  type    = number
  default = 50
}

variable "ecs_cpu" {
  type    = number
  default = 512
}

variable "ecs_memory" {
  type    = number
  default = 1024
}

variable "ecs_desired_count" {
  type    = number
  default = 2
}

variable "container_image" {
  description = "Full ECR image URI:tag for the API container, e.g. <account>.dkr.ecr.<region>.amazonaws.com/safepass-production-api:<git-sha>. Updated on each deploy by GitHub Actions via a new task definition revision — Terraform's own applies do not need to touch this after first apply (see the ECS module's `ignore_changes = [task_definition]`)."
  type        = string
}

# --- Secrets (never hardcoded — supplied via TF_VAR_* env vars in CI, sourced
# from GitHub Actions OIDC-authenticated Secrets Manager reads or from a
# CI-level secret store, never checked into source control) ---
variable "db_master_password" {
  description = "RDS master password. Supply via TF_VAR_db_master_password at apply time."
  type        = string
  sensitive   = true
}
