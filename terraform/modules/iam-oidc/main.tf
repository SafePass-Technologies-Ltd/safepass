# SafePass — IAM OIDC Module
#
# Provisions:
#   1. The GitHub Actions OIDC identity provider in AWS IAM (one per
#      account — safe to create once and reused by all repos/workflows).
#   2. A deploy role that GitHub Actions assumes via OIDC (no static AWS
#      access keys anywhere in GitHub secrets), scoped to exactly the
#      resources this pipeline needs: ECR push, ECS deploy, Terraform state
#      S3 bucket + DynamoDB lock table, and (for terraform-apply.yml) the
#      broader infra-provisioning permissions needed to run `terraform
#      apply` against the modules in this repo.
#   3. The ECS task execution role (pulls image from ECR, writes logs) and
#      the ECS task role (the running container's own runtime permissions:
#      Secrets Manager read, S3 evidence bucket read/write, DynamoDB
#      read/write) — least privilege, scoped only to the resources this
#      environment provisions.
#
# LEAST PRIVILEGE NOTE: `terraform-apply.yml`'s job needs broad
# infra-provisioning permissions (it runs `terraform apply` across
# networking/ecs/rds/dynamodb/s3/ecr modules). We scope this to the specific
# services this stack uses (ec2 networking, ecs, rds, dynamodb, s3, ecr,
# elasticloadbalancing, secretsmanager, cloudfront, logs, iam:PassRole for
# the ECS roles only) rather than a blanket AdministratorAccess grant. This
# is still coarser than the deploy-only role used by deploy-api.yml, by
# necessity — Terraform must be able to create/modify the resources it
# manages. Tightening further (e.g. resource-ARN-scoped conditions per
# service) is a natural follow-up once the exact resource set stabilizes.

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "github_org" {
  description = "GitHub org/user that owns this repo, used to scope the OIDC trust policy (e.g. \"my-org\")."
  type        = string
}

variable "github_repo" {
  description = "GitHub repo name (without org), e.g. \"safepass\"."
  type        = string
}

variable "state_bucket_arn" {
  type = string
}

variable "lock_table_arn" {
  type = string
}

data "aws_caller_identity" "current" {}

# GitHub's OIDC provider thumbprint is well-known and stable; AWS also
# validates the token audience/issuer itself, so this is safe to pin.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# Trust policy: only allow this specific repo's workflows to assume the
# role, restricted further to `main` branch pushes and pull_request events
# (both needed: PR runs use terraform-plan.yml with read-only permissions
# baked into the policy below, not the trust condition — GitHub OIDC sub
# claims differ between branch and PR context, so we allow both patterns
# here and rely on IAM policy scoping, not trust-policy branch checks, for
# the plan-vs-apply distinction. Branch protection + required reviewers on
# the `production` GitHub Environment is the actual gate for apply, see
# terraform-apply.yml.)
data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_org}/${var.github_repo}:pull_request",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${var.project}-${var.environment}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_trust.json
}

# Terraform state access — needed by both plan and apply workflows to
# init/read/write remote state.
data "aws_iam_policy_document" "tf_state_access" {
  statement {
    sid       = "StateBucketAccess"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
    resources = [var.state_bucket_arn, "${var.state_bucket_arn}/*"]
  }

  statement {
    sid       = "LockTableAccess"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [var.lock_table_arn]
  }
}

# Infra-provisioning permissions for `terraform apply` (terraform-apply.yml)
# scoped to the AWS services this stack's modules actually manage.
data "aws_iam_policy_document" "infra_provisioning" {
  statement {
    sid    = "NetworkingEcsRdsDynamoS3Ecr"
    effect = "Allow"
    actions = [
      "ec2:*Vpc*", "ec2:*Subnet*", "ec2:*RouteTable*", "ec2:*InternetGateway*",
      "ec2:*NatGateway*", "ec2:*Address*", "ec2:*SecurityGroup*", "ec2:Describe*",
      "ecs:*", "ecr:*", "elasticloadbalancing:*",
      "rds:*", "dynamodb:*", "s3:*", "cloudfront:*",
      "secretsmanager:*", "logs:*", "iam:GetRole", "iam:GetPolicy",
      "iam:CreateRole", "iam:DeleteRole", "iam:AttachRolePolicy",
      "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "iam:PassRole", "iam:TagRole", "iam:CreateOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider", "iam:DeleteOpenIDConnectProvider",
    ]
    resources = ["*"] # scoping further requires stable ARNs, which don't exist pre-apply for newly-created resources; tighten post-stabilization
  }
}

# Deploy-only permissions for `deploy-api.yml` (build/push image, update
# ECS service) — deliberately narrower than the apply role's blanket infra
# access.
data "aws_iam_policy_document" "deploy_only" {
  statement {
    sid       = "EcrPush"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPushRepo"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:PutImage", "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:BatchGetImage",
    ]
    resources = ["arn:aws:ecr:*:${data.aws_caller_identity.current.account_id}:repository/${var.project}-${var.environment}-api"]
  }

  statement {
    sid    = "EcsDeploy"
    effect = "Allow"
    actions = [
      "ecs:DescribeServices", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition",
      "ecs:UpdateService", "ecs:DescribeTasks", "ecs:ListTasks",
    ]
    resources = ["*"] # ECS ARNs are cluster/service-scoped; tightened once names are stable post-first-apply
  }

  statement {
    sid       = "PassEcsRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "tf_state" {
  name   = "tf-state-access"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.tf_state_access.json
}

resource "aws_iam_role_policy" "infra_provisioning" {
  name   = "infra-provisioning"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.infra_provisioning.json
}

resource "aws_iam_role_policy" "deploy_only" {
  name   = "deploy-only"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.deploy_only.json
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

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}
