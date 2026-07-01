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
# Terraform — its ARN is supplied to workflows via the `AWS_ROLE_ARN` GitHub
# repo variable (see `role-to-assume: ${{ vars.AWS_ROLE_ARN }}` in
# .github/workflows/*.yml). This module does not create or manage that
# provider/role; it only manages the ECS task execution role and ECS task
# role that the ECS service itself assumes at runtime. See
# terraform/modules/iam-ecs/main.tf's header comment for the minimum
# permissions the existing external CI role needs.
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
  master_password      = var.db_master_password
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

  environment_variables = {
    NODE_ENV   = "production"
    AWS_REGION = var.aws_region
  }

  secrets = {
    for k, arn in module.secrets.secret_arns : upper(k) => arn
  }
}

# --- CloudFront (in front of the ALB) ---
module "cloudfront" {
  source = "../../modules/cloudfront"

  project      = var.project
  environment  = var.environment
  alb_dns_name = module.ecs.alb_dns_name
}
