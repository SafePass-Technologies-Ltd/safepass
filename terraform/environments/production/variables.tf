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

variable "admin_dashboard_url" {
  description = "Public URL of the admin dashboard (Next.js app, deployed separately from this Terraform stack) -- embedded in API-generated links/emails (e.g. role-upgrade approval notices) and in the API's CORS allowlist. Required (no default) so it can't silently fall back to the app's localhost dev default in production; supplied via TF_VAR_admin_dashboard_url in CI (see .github/workflows/terraform-*.yml)."
  type        = string
}

variable "corporate_dashboard_url" {
  description = "Public URL of the corporate dashboard (separate Next.js app) -- added to the API's CORS allowlist alongside admin_dashboard_url so its requests aren't rejected in production. Required (no default), same rationale as admin_dashboard_url; supplied via TF_VAR_corporate_dashboard_url in CI."
  type        = string
}

variable "transport_dashboard_url" {
  description = "Public URL of the transport partner dashboard (separate Next.js app) -- added to the API's CORS allowlist alongside admin_dashboard_url so its requests aren't rejected in production. Required (no default), same rationale as admin_dashboard_url; supplied via TF_VAR_transport_dashboard_url in CI."
  type        = string
}

variable "app_deep_link_base_url" {
  description = "Base URL for org invite deep links (C-02) -- apps/api appends /<token>. Defaulted here (unlike the *_dashboard_url vars) since apps/api/src/env.ts's own default already matches this stack's real domain; override only if it ever needs to differ from the deployed API domain."
  type        = string
  default     = "https://api.safepass-tech.com/join"
}

variable "upstash_email" {
  description = "Email address of the Upstash account provisioning module.upstash's Redis database -- NOT a secret itself, but grouped with upstash_api_key below since both configure the same provider block. Supplied via TF_VAR_upstash_email in CI."
  type        = string
}

variable "upstash_api_key" {
  description = "Upstash account API key (generate one at console.upstash.com > Account > API Keys). A real credential -- supply via a GitHub Actions *secret* (TF_VAR_upstash_api_key), never a plain repo variable."
  type        = string
  sensitive   = true
}

variable "root_domain" {
  description = "Root domain name, already registered and hosted in Route53 with an existing apex record serving a separate website (not managed by this Terraform stack). Used to derive the API and dashboard subdomains."
  type        = string
  default     = "safepass-tech.com"
}

variable "api_subdomain" {
  description = "Subdomain label for the backend API -- combined with root_domain to form api_subdomain.root_domain, e.g. \"api.safepass-tech.com\". The ALB gets a free ACM cert for this domain (module.acm) instead of relying on CloudFront."
  type        = string
  default     = "api"
}

# Per-dashboard CNAME target Vercel issued when the domain was added under
# each project's Settings > Domains (console = admin dashboard project).
# Vercel now commonly issues a unique per-domain target (e.g.
# "<hash>.vercel-dns-017.com") rather than the generic "cname.vercel-dns.com"
# -- always copy the exact value shown on that project's Domains screen.
#
# Kept as three separate plain string variables (rather than one
# object-typed variable built from an inline JSON blob in the GitHub Actions
# YAML) so a missing/empty value fails loudly at `terraform plan` with a
# normal "no value for required variable" error, instead of surfacing as an
# opaque Route53 "InvalidInput: ResourceRecords is not complete" XML error
# at apply time once an empty string silently made it into the record set.
variable "vercel_cname_target_console" {
  type = string
}

variable "vercel_cname_target_corporate" {
  type = string
}

variable "vercel_cname_target_transport" {
  type = string
}
