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

output "api_url" {
  description = "Public HTTPS URL of the backend API -- served directly off the ALB with an ACM cert (no CloudFront in front)."
  value       = "https://${module.acm.api_domain_name}"
}

output "api_certificate_arn" {
  value = module.acm.certificate_arn
}

output "dashboard_dns_records" {
  description = "Dashboard subdomains pointed at Vercel via CNAME -- confirm each is also added as a custom domain in the corresponding Vercel project."
  value       = module.dns.dashboard_fqdns
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

output "documents_bucket_name" {
  description = "Private bucket holding transport compliance documents (FEAT-017), wired into the API container as DOCUMENTS_BUCKET_NAME."
  value       = module.s3_evidence.documents_bucket_name
}

output "ecs_task_execution_role_arn" {
  value = module.iam.ecs_task_execution_role_arn
}

output "ecs_task_role_arn" {
  value = module.iam.ecs_task_role_arn
}

output "upstash_database_id" {
  description = "Upstash console database ID for module.upstash's Redis database (cross-task WebSocket broadcast relay)."
  value       = module.upstash.database_id
}

# --- Monitoring (T-052) ---
# The readiness health check is alerting-only and is intentionally NOT attached
# to the API's Route53 record.

output "readiness_health_check_id" {
  description = "Route53 health check ID probing GET https://<api>/health/ready. Useful for `aws route53 get-health-check-status` and for finding the AWS/Route53 HealthCheckStatus metric."
  value       = module.monitoring.readiness_health_check_id
}

output "oncall_sns_topic_arn" {
  description = "On-call SNS topic (us-east-1) the readiness alarm publishes to. Email subscriptions deliver nothing until each recipient confirms the AWS email."
  value       = module.monitoring.oncall_sns_topic_arn
}

output "readiness_alarm_arn" {
  description = "CloudWatch alarm (us-east-1) on the readiness health check. ALARM means the API cannot reach PostgreSQL."
  value       = module.monitoring.readiness_alarm_arn
}
