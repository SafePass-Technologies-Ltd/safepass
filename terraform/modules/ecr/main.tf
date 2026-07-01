# SafePass — ECR Module
#
# Not explicitly listed as a resource in architecture.md, but required as the
# container registry that GitHub Actions (deploy-api.yml) pushes the built
# Hono API image to, and that the ECS task definition pulls from.

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

resource "aws_ecr_repository" "api" {
  name                 = "${var.project}-${var.environment}-api"
  image_tag_mutability = "IMMUTABLE" # every deploy gets a unique tag (git SHA) — never overwrite a pushed tag

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Keep the registry lean — retain the last 20 images (protects rollback
# capability without unbounded storage growth).
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

output "repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "repository_arn" {
  value = aws_ecr_repository.api.arn
}

output "repository_name" {
  value = aws_ecr_repository.api.name
}
