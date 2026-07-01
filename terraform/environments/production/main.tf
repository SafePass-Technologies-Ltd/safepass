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
  }
}

provider "aws" {
  region = var.aws_region
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

# --- Secrets Manager (structure only — real values set out-of-band) ---
module "secrets" {
  source = "../../modules/secrets"

  project     = var.project
  environment = var.environment
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

  secret_arns         = values(module.secrets.secret_arns)
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
    NODE_ENV            = "production"
    AWS_REGION          = var.aws_region
    DB_HOST             = module.rds.address
    DB_PORT             = tostring(module.rds.port)
    DB_NAME             = module.rds.db_name
    DB_SECRET_ARN       = module.rds.master_user_secret_arn
    JWT_SECRET_ARN      = module.secrets.secret_arns["jwt_secrets"]
    FIREBASE_SECRET_ARN = module.secrets.secret_arns["firebase_admin"]
    PAYMENT_SECRET_ARN  = module.secrets.secret_arns["payment_gateways"]
  }
}

# --- CloudFront (in front of the ALB) ---
# count-gated by enable_cloudfront: AWS blocks CloudFront creation on
# unverified accounts (see AccessDenied error referenced in variables.tf's
# enable_cloudfront description) -- set to false to apply everything else
# in the meantime, then flip back to true once AWS Support verifies the
# account and re-apply.
module "cloudfront" {
  count  = var.enable_cloudfront ? 1 : 0
  source = "../../modules/cloudfront"

  project      = var.project
  environment  = var.environment
  alb_dns_name = module.ecs.alb_dns_name
}
