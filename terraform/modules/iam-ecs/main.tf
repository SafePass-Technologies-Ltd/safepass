# SafePass — IAM ECS Module
#
# Provisions ONLY:
#   1. The ECS task execution role (pulls image from ECR, writes logs).
#   2. The ECS task role (the running container's own runtime permissions:
#      Secrets Manager read, S3 evidence bucket read/write, DynamoDB
#      read/write) — least privilege, scoped only to the resources this
#      environment provisions.
#
# DELIBERATELY NOT MANAGED HERE: GitHub Actions OIDC.
#
# The user already has a pre-existing GitHub Actions OIDC identity provider
# and IAM deploy role configured in AWS, entirely outside this repo's
# Terraform. This module must NOT create an `aws_iam_openid_connect_provider`
# resource or a "github_actions"-style IAM role — AWS allows only ONE OIDC
# provider per URL per account, so a second `aws_iam_openid_connect_provider`
# for "https://token.actions.githubusercontent.com" would conflict with (or
# fail to import cleanly against) the one that already exists. The existing
# role's ARN is supplied to CI workflows via the `AWS_ROLE_TO_ASSUME` GitHub repo
# variable (see `role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}` in
# .github/workflows/*.yml) — Terraform never touches it.
#
# MINIMUM PERMISSIONS THE EXISTING EXTERNAL ROLE NEEDS (for reference/audit
# by whoever owns that pre-existing role — not enforced or created here):
#   - Terraform state access (all workflows that run `terraform plan/apply`):
#       s3:GetObject, s3:PutObject, s3:ListBucket on the TF state bucket
#       (locking uses S3 conditional writes via `use_lockfile` — no separate
#       DynamoDB lock table permissions needed)
#   - Infra-provisioning (terraform-apply.yml's `terraform apply` path),
#     scoped to the services this stack's modules manage:
#       ecs:*, ecr:*, rds:*, dynamodb:*, s3:*, cloudfront:*,
#       secretsmanager:*, elasticloadbalancing:*, ec2 networking actions
#       (vpc/subnet/route-table/internet-gateway/nat-gateway/security-group/
#       describe*), and iam:PassRole for the two roles this module creates
#       (ecs_task_execution and ecs_task) so ECS can assume them.
#   - Deploy-only (the narrower path used by deploy-api.yml — build/push
#     image, update the ECS service, no broader infra access):
#       ecr push actions (ecr:GetAuthorizationToken,
#       ecr:BatchCheckLayerAvailability, ecr:PutImage,
#       ecr:InitiateLayerUpload, ecr:UploadLayerPart,
#       ecr:CompleteLayerUpload, ecr:BatchGetImage) plus ecr:DescribeImages
#       (deploy-api.yml probes for an existing SHA tag before building, since
#       the repo is immutable and re-running the workflow for an
#       already-deployed commit must skip the push rather than fail) plus
#       ecs:RegisterTaskDefinition and ecs:UpdateService (with
#       iam:PassRole scoped to iam:PassedToService = ecs-tasks.amazonaws.com).

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

# --- ECS task execution role (pulls from ECR, writes CloudWatch logs) ---
data "aws_iam_policy_document" "ecs_task_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project}-${var.environment}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_trust.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# NOTE: the execution role deliberately has NO Secrets Manager permissions.
# All secrets (DB, JWT, Firebase, payment gateways) are fetched by the app
# itself at runtime via the TASK role (see ecs_task_runtime below and
# apps/api/src/env.ts) -- not injected by ECS's container-definition
# `secrets` mechanism, which would require the execution role to read them
# instead and would leave resolved values sitting in the task's env var
# metadata.

# --- ECS task role (the running API container's own runtime permissions) ---
# Least privilege: Secrets Manager read (for DB/JWT/Firebase/payment
# secrets) + S3 evidence bucket read/write + DynamoDB read/write on the
# realtime-state table only. No blanket access to other AWS resources.
resource "aws_iam_role" "ecs_task" {
  name               = "${var.project}-${var.environment}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_trust.json
}

variable "secret_arns" {
  description = "List of Secrets Manager ARNs the running API container is allowed to read."
  type        = list(string)
  default     = []
}

variable "evidence_bucket_arn" {
  type    = string
  default = ""
}

variable "dynamodb_table_arn" {
  type    = string
  default = ""
}

data "aws_iam_policy_document" "ecs_task_runtime" {
  dynamic "statement" {
    for_each = length(var.secret_arns) > 0 ? [1] : []
    content {
      sid       = "ReadSecrets"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = var.secret_arns
    }
  }

  dynamic "statement" {
    for_each = var.evidence_bucket_arn != "" ? [1] : []
    content {
      sid       = "EvidenceBucketAccess"
      actions   = ["s3:GetObject", "s3:PutObject", "s3:PutObjectRetention"]
      resources = ["${var.evidence_bucket_arn}/*"]
    }
  }

  dynamic "statement" {
    for_each = var.dynamodb_table_arn != "" ? [1] : []
    content {
      sid       = "RealtimeStateAccess"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:DeleteItem"]
      resources = [var.dynamodb_table_arn]
    }
  }
}

resource "aws_iam_role_policy" "ecs_task_runtime" {
  count  = length(var.secret_arns) > 0 || var.evidence_bucket_arn != "" || var.dynamodb_table_arn != "" ? 1 : 0
  name   = "runtime-access"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_runtime.json
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}

output "ecs_task_role_name" {
  description = "Role name (not ARN) — used by the environment root to attach additional inline policies for resources created after this module (e.g. the RDS-managed master credentials secret), without creating a module dependency cycle."
  value       = aws_iam_role.ecs_task.name
}
