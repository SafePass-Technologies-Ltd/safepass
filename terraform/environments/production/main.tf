# SafePass — Production Environment
#
# Wires together the reusable modules under terraform/modules/ into the
# concrete production stack described in docs/SafePass/architecture.md.
# A future staging environment can reuse every module below unchanged —
# only this file's variable values (and the environment name) would differ.

terraform {
  required_version = ">= 1.15.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.52"
    }
    upstash = {
      source  = "upstash/upstash"
      version = "~> 2.1"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Authenticates with an Upstash account email + API key (Upstash console >
# Account > API Keys) -- a separate managed service, not an AWS credential.
# See module "upstash" below.
provider "upstash" {
  email   = var.upstash_email
  api_key = var.upstash_api_key
}

# --- Networking ---
module "networking" {
  source = "../../modules/networking"

  project     = var.project
  environment = var.environment
  azs         = var.availability_zones
}

# --- ECR (API container images) ---
module "ecr" {
  source = "../../modules/ecr"

  project     = var.project
  environment = var.environment
}

# --- DynamoDB (real-time trip/session state) ---
module "dynamodb" {
  source = "../../modules/dynamodb"

  project     = var.project
  environment = var.environment
}

# --- S3 (evidence chain of custody) ---
module "s3_evidence" {
  source = "../../modules/s3"

  project     = var.project
  environment = var.environment
}

# --- Upstash Redis (cross-task WebSocket broadcast relay) ---
# See terraform/modules/upstash's header comment and apps/api/src/services/
# redis.service.ts. Declared before module.secrets below so its
# connection_url output can be folded straight into that module's
# placeholder secret blob at first creation.
module "upstash" {
  source = "../../modules/upstash"

  project     = var.project
  environment = var.environment
}

# --- Secrets Manager (structure only — most fields set out-of-band) ---
# upstash_connection_url is the one field Terraform actually knows a real
# value for up front (everything else in the blob -- jwt_secrets/
# firebase_admin/payment_gateways/resend/google_maps -- stays manually
# populated after creation, per this module's own header comment).
# `lifecycle.ignore_changes = [secret_string]` on the secret version means
# this only ever takes effect on the very first apply that creates the
# secret -- it will NOT track a later Upstash password rotation. Acceptable
# here: Upstash doesn't rotate this automatically, and re-running
# `terraform taint` on the secret version (or recreating the stack) is the
# escape hatch if it ever needs to be forced back in sync.
module "secrets" {
  source = "../../modules/secrets"

  project     = var.project
  environment = var.environment

  upstash_connection_url = module.upstash.connection_url
}

# --- IAM: ECS task roles only ---
# NOTE: CI authenticates to AWS via the user's pre-existing GitHub Actions
# OIDC provider + IAM deploy role, configured in AWS outside this repo's
# Terraform — its ARN is supplied to workflows via the `AWS_ROLE_TO_ASSUME` GitHub
# repo variable (see `role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}` in
# .github/workflows/*.yml). This module does not create or manage that
# provider/role; it only manages the ECS task execution role and ECS task
# role that the ECS service itself assumes at runtime. See
# terraform/modules/iam-ecs/main.tf's header comment for the minimum
# permissions the existing external CI role needs.
#
# Deliberately does NOT reference module.rds here (see the runtime secret
# access policy below) — module.rds depends on module.ecs's security group,
# and module.ecs depends on this module's role ARNs, so wiring the RDS
# secret ARN into this module's inputs would create iam -> rds -> ecs -> iam,
# a circular module dependency.
module "iam" {
  source = "../../modules/iam-ecs"

  project     = var.project
  environment = var.environment

  secret_arns         = [module.secrets.secret_arn]
  evidence_bucket_arn = module.s3_evidence.bucket_arn
  dynamodb_table_arn  = module.dynamodb.table_arn
}

# --- RDS PostgreSQL ---
module "rds" {
  source = "../../modules/rds"

  project     = var.project
  environment = var.environment

  vpc_id                = module.networking.vpc_id
  private_subnet_ids    = module.networking.private_subnet_ids
  app_security_group_id = module.ecs.service_security_group_id

  instance_class       = var.rds_instance_class
  allocated_storage_gb = var.rds_allocated_storage_gb
}

# Grants the ECS task role read access to the RDS-managed master credentials
# secret -- the running app fetches this itself at startup (see
# apps/api/src/env.ts's resolveDatabaseUrl) via DB_SECRET_ARN below, using
# this role's credentials through the AWS SDK. Declared here (not inside
# modules/iam-ecs) because it depends on module.rds, which itself depends on
# module.ecs's security group — routing it through the iam module's inputs
# would create a circular dependency (see the comment on module "iam"
# above). This resource only adds to an already-created role, so it
# introduces no cycle.
resource "aws_iam_role_policy" "ecs_task_rds_secret" {
  name = "rds-master-secret-access"
  role = module.iam.ecs_task_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ReadRdsMasterSecret"
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [module.rds.master_user_secret_arn]
    }]
  })
}

# --- ECS Fargate + ALB ---
module "ecs" {
  source = "../../modules/ecs"

  project     = var.project
  environment = var.environment

  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  private_subnet_ids = module.networking.private_subnet_ids

  container_image = var.container_image
  cpu             = var.ecs_cpu
  memory          = var.ecs_memory
  desired_count   = var.ecs_desired_count

  task_role_arn           = module.iam.ecs_task_role_arn
  task_execution_role_arn = module.iam.ecs_task_execution_role_arn

  # HTTPS listener cert -- see module "acm" below. Free ACM cert on the ALB
  # directly, replacing the old CloudFront-in-front-of-the-ALB setup.
  certificate_arn = module.acm.certificate_arn

  # Plain (non-secret) env vars -- every *_SECRET_ARN below is just an ARN,
  # not a credential. apps/api/src/env.ts fetches the actual secret material
  # itself at startup via the AWS SDK (using the task role's
  # secretsmanager:GetSecretValue grant above / in modules/iam-ecs), rather
  # than via ECS's native container-definition `secrets` injection. That
  # keeps secret material out of the task definition and container env var
  # metadata entirely -- only the app process (via its own task-role
  # identity) ever touches it, and every fetch is individually auditable in
  # CloudTrail. It also means the execution role no longer needs
  # secretsmanager permissions at all (only ECR/CloudWatch), and lets
  # DATABASE_URL be assembled from multiple secret fields, which ECS's
  # injection can't do.
  environment_variables = {
    NODE_ENV      = "production"
    AWS_REGION    = var.aws_region
    DB_HOST       = module.rds.address
    DB_PORT       = tostring(module.rds.port)
    DB_NAME       = module.rds.db_name
    DB_SECRET_ARN = module.rds.master_user_secret_arn
    # Single consolidated secret covering jwt_secrets/firebase_admin/
    # payment_gateways/external_services (see terraform/modules/secrets/
    # main.tf) -- one Secrets Manager secret instead of four to avoid
    # paying the per-secret charge four times over. apps/api/src/env.ts
    # fetches it once and destructures each group internally.
    APP_SECRET_ARN = module.secrets.secret_arn
    # Real-time state table (GPS positions today) -- apps/api/src/services/
    # dynamo.service.ts reads this instead of hardcoding a table name, so it
    # always targets whatever this module actually provisions.
    DYNAMODB_TABLE_NAME = module.dynamodb.table_name
    # Plain (non-secret) URL -- unlike the above, this isn't a credential,
    # so it's just a Terraform var rather than a Secrets Manager entry (see
    # variables.tf's admin_dashboard_url). Without this, the app's zod
    # schema default (http://localhost:3001) would silently leak into
    # production-built links/emails.
    ADMIN_DASHBOARD_URL = var.admin_dashboard_url
    # Corporate/transport dashboards are separate Next.js deployments with
    # their own origins -- both need to be in the API's CORS allowlist
    # alongside the admin dashboard (see apps/api/src/index.ts), not just
    # embedded in links/emails the way ADMIN_DASHBOARD_URL is.
    CORPORATE_DASHBOARD_URL = var.corporate_dashboard_url
    TRANSPORT_DASHBOARD_URL = var.transport_dashboard_url
    # Base URL for org invite deep links (C-02) -- apps/api/src/env.ts
    # already defaults to the correct production value
    # (https://api.safepass-tech.com/join), so this is just made explicit/
    # overridable in infra rather than left implicit.
    APP_DEEP_LINK_BASE_URL = var.app_deep_link_base_url
  }
}

# --- ACM (free cert for the API's custom domain) ---
# Replaces the old CloudFront-in-front-of-the-ALB setup: the ALB terminates
# TLS itself using this certificate (see module "ecs" above's
# certificate_arn input), so CloudFront is no longer needed for the API.
module "acm" {
  source = "../../modules/acm"

  project       = var.project
  environment   = var.environment
  root_domain   = var.root_domain
  api_subdomain = var.api_subdomain
}

# --- DNS records (API alias + dashboard CNAMEs) ---
# The safepass-tech.com hosted zone and its apex record (already serving a
# separate website) already exist and are managed outside this Terraform
# stack -- this module only adds the api/console/corporate/transport
# subdomain records, looked up via module.acm's zone_id data source.
module "dns" {
  source = "../../modules/dns"

  zone_id         = module.acm.zone_id
  api_domain_name = module.acm.api_domain_name
  alb_dns_name    = module.ecs.alb_dns_name
  alb_zone_id     = module.ecs.alb_zone_id

  dashboard_records = {
    "console.${var.root_domain}"   = var.vercel_cname_target_console
    "corporate.${var.root_domain}" = var.vercel_cname_target_corporate
    "transport.${var.root_domain}" = var.vercel_cname_target_transport
  }
}
