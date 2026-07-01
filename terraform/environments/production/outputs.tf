# SafePass — Production Environment Outputs
#
# Consumed by GitHub Actions (deploy-api.yml reads ecr_repository_url,
# ecs_cluster_name, ecs_service_name via `terraform output -json` or by
# hardcoding the known naming convention) and useful for manual verification.

output "vpc_id" {
  value = module.networking.vpc_id
}

output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "ecs_service_name" {
  value = module.ecs.service_name
}

output "ecs_task_definition_family" {
  value = module.ecs.task_definition_family
}

output "alb_dns_name" {
  value = module.ecs.alb_dns_name
}

output "cloudfront_domain_name" {
  value = module.cloudfront.distribution_domain_name
}

output "rds_endpoint" {
  value     = module.rds.endpoint
  sensitive = true
}

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "evidence_bucket_name" {
  value = module.s3_evidence.bucket_name
}

output "github_actions_role_arn" {
  description = "ARN GitHub Actions workflows assume via OIDC — set as AWS_ROLE_ARN in each workflow's env or as a repo variable."
  value       = module.iam.github_actions_role_arn
}

output "ecs_task_execution_role_arn" {
  value = module.iam.ecs_task_execution_role_arn
}

output "ecs_task_role_arn" {
  value = module.iam.ecs_task_role_arn
}
