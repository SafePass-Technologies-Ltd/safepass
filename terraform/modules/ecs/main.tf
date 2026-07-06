# SafePass — ECS Fargate + ALB Module
#
# Per architecture.md: "Backend (Hono) — AWS ECS Fargate ... ALB health
# checks on /health ... ECS tasks spread across Availability Zones."
#
# DEPLOYMENT STRATEGY: deployment_minimum_healthy_percent=100 /
# deployment_maximum_percent=200 gives a true rolling deploy that always
# keeps 100% of desired capacity healthy and briefly doubles capacity during
# rollout, so there is never a moment with fewer healthy tasks than before
# the deploy started. This matters because risk_log.md R-001 (Real-Time
# System Failure During Emergency) calls out the WebSocket/panic-alert path
# as safety-critical — a naive "kill old task, then start new one" strategy
# would create a window with zero or reduced capacity for active WebSocket
# connections and in-flight emergency events. GitHub Actions
# (deploy-api.yml) triggers a new task definition revision + forces a new
# deployment; ECS then performs this rolling replacement automatically.

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "container_image" {
  description = "Full ECR image URI (repo:tag) for the API container. Updated by GitHub Actions on each deploy."
  type        = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 512 # 0.5 vCPU — adjust per environment via variable
}

variable "memory" {
  type    = number
  default = 1024 # 1 GB
}

variable "desired_count" {
  type    = number
  default = 2 # matches architecture.md deployment diagram: API1 + API2
}

variable "task_role_arn" {
  description = "IAM role ARN granting the running container access to Secrets Manager, DynamoDB, S3 evidence bucket."
  type        = string
}

variable "task_execution_role_arn" {
  description = "IAM role ARN ECS uses to pull the image and write logs (distinct from the task role, which is the app's own runtime permissions)."
  type        = string
}

variable "environment_variables" {
  description = "Non-secret environment variables passed to the container (e.g. NODE_ENV, AWS_REGION)."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Map of container env var name -> Secrets Manager ARN, injected securely by ECS at container start (never baked into the image or task def in plaintext)."
  type        = map(string)
  default     = {}
}

variable "certificate_arn" {
  description = "ACM certificate ARN (from modules/acm) for the ALB's HTTPS listener, e.g. covering api.safepass-tech.com. Required -- module.acm must be applied first so this is always a real cert ARN; see the note on aws_lb_listener.http for why this can't be made optional/conditional."
  type        = string
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  # ECS Exec (aws ecs execute-command) needs this cluster-level config to
  # actually stream a shell session -- without it, `execute-command` fails
  # with "The execute command failed ... execute command logging
  # configuration". Routes exec session I/O to the same CloudWatch log
  # group the app itself logs to, so admin actions run this way (e.g.
  # db/promote-admin.ts, db/bootstrap-super-admin.ts -- there is no
  # self-service path to admin/super_admin, per architecture.md's Role
  # Upgrade Service) leave an audit trail rather than vanishing once the
  # session ends.
  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.api.name
      }
    }
  }
}

# ALB security group — public HTTP/HTTPS ingress from the internet. The ALB
# terminates TLS itself (see the HTTPS listener + certificate_arn below) --
# there is no CDN/CloudFront in front of the API.
resource "aws_security_group" "alb" {
  name        = "${var.project}-${var.environment}-alb-sg"
  description = "Allow inbound HTTP/HTTPS from CloudFront/internet to the ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-alb-sg"
  }
}

# ECS service security group — only accepts traffic from the ALB, on the
# container port. This is also the SG referenced by the RDS module's
# app_security_group_id input, restricting DB access to only these tasks.
resource "aws_security_group" "service" {
  name        = "${var.project}-${var.environment}-svc-sg"
  description = "Allow inbound traffic from the ALB only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-svc-sg"
  }
}

resource "aws_lb" "main" {
  name               = "${var.project}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  # Spans multiple AZs (one ALB node per public subnet/AZ) automatically.
  tags = {
    Name = "${var.project}-${var.environment}-alb"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-${var.environment}-api-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # required for Fargate awsvpc networking mode

  health_check {
    path                = "/health" # per architecture.md: "ALB health checks on /health endpoint"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  # Deregistration delay tuned down from the 300s default so that during a
  # rolling deploy, in-flight WebSocket connections get a bounded grace
  # period to drain/reconnect without holding capacity indefinitely — still
  # long enough to avoid abruptly severing active panic-alert sessions.
  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # HTTP always redirects to HTTPS -- no CloudFront in front to do this for
  # us anymore, the ALB terminates TLS itself (see the https listener
  # below). NOTE: this (and the https listener's count) must NOT be gated on
  # `var.certificate_arn != null` -- that value comes from
  # module.acm.certificate_arn, which is an aws_acm_certificate_validation
  # output unknown until apply time on a fresh stack, and Terraform cannot
  # evaluate a `count`/`for_each` condition against an apply-time-only value
  # ("Invalid count argument"). certificate_arn is therefore a required
  # (non-null) input -- module.acm must exist and be applied first.
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener. Terminates TLS at the ALB directly (per the user's
# decision to drop CloudFront for the API and rely on a free ACM cert on
# the ALB instead). Always created -- see the note on aws_lb_listener.http
# above for why this can't be conditionally counted on certificate_arn.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        for k, v in var.environment_variables : { name = k, value = v }
      ]
      secrets = [
        for k, arn in var.secrets : { name = k, valueFrom = arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = data.aws_region.current.region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

data "aws_region" "current" {}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-${var.environment}-api"
  retention_in_days = 30
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Lets an operator with `ecs:ExecuteCommand` on their own IAM identity
  # (that permission lives on whoever's running the CLI, not on this task's
  # roles) run `aws ecs execute-command ... --interactive --command "sh"`
  # to get a shell in a running container -- needed for one-off admin
  # scripts like apps/api/src/db/promote-admin.ts and
  # bootstrap-super-admin.ts (there is no self-service path to admin/
  # super_admin, per architecture.md's Role Upgrade Service, so someone has
  # to run these from inside the container against the real DATABASE_URL).
  # Requires the task role to have the ssmmessages:* permissions granted in
  # modules/iam-ecs, and the cluster's execute_command_configuration above.
  enable_execute_command = true

  # Rolling deployment tuned for zero-downtime on the safety-critical
  # WebSocket path (risk_log.md R-001) — see module header comment.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  # NOTE: ordered_placement_strategy is NOT supported with launch_type =
  # "FARGATE" (AWS API rejects it: "Placement strategies are not supported
  # with FARGATE launch type") -- that's an EC2-launch-type-only feature.
  # AZ spread on Fargate is automatic and implicit: the scheduler distributes
  # tasks across every AZ present in network_configuration.subnets (which
  # already spans both private subnets/AZs from the networking module), so
  # architecture.md's Multi-AZ reliability requirement is satisfied without
  # an explicit placement strategy.

  depends_on = [aws_lb_listener.http, aws_lb_listener.https]

  lifecycle {
    # The task definition's container image tag changes on every deploy via
    # GitHub Actions (register-task-definition + update-service); Terraform
    # should not fight that out-of-band update on subsequent plans.
    ignore_changes = [task_definition]
  }
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.api.name
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB's own Route53 hosted zone ID -- required (alongside alb_dns_name) for an ALIAS record in modules/dns."
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  value = aws_lb.main.arn
}

output "service_security_group_id" {
  value = aws_security_group.service.id
}

output "task_definition_family" {
  value = aws_ecs_task_definition.api.family
}
