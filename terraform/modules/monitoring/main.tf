# SafePass — Monitoring Module (API readiness alerting)
#
# WHY THIS EXISTS (T-052)
#
# On 2026-11-13 every sign-in returned 500 for hours. The RDS instance behind
# DB_HOST had been deleted by the account closure, yet GET /health answered 200
# the whole time because it is a static liveness answer that never touches
# PostgreSQL. The ALB therefore kept database-less tasks in rotation, and
# nothing in the platform asked the only question that mattered.
#
# The DB-aware answer now exists: GET /health/ready (contract H-001) returns
# 200 with `{"database":{"ok":true,"latencyMs":N}}` and 503 with a fixed
# `database_unreachable` token when PostgreSQL cannot be reached. An endpoint
# that nothing polls is a monitor with no reader, so this module supplies the
# reader: an active probe, an alarm on its status, and an on-call subscription.
#
# WHAT IS PROBED, AND WHAT IS DELIBERATELY NOT CHANGED
#
# The probe hits /health/ready, NEVER /health. The ALB target group stays on
# /health (D-013, T-044) and must keep doing so: pointing target-group health
# checks at a database probe would mark every task unhealthy during a database
# fault, drain them all, and convert a partial outage into a total API outage
# on an emergency-response platform. Readiness is an alerting signal here, not
# a load-balancer signal. Do not "fix" modules/ecs's health_check block.
#
# WHY A ROUTE53 HEALTH CHECK AND NOT A SYNTHETICS CANARY
#
# A Route53 health check is created standalone, without being attached to any
# DNS record, and publishes AWS/Route53 HealthCheckStatus into CloudWatch --
# exactly the metric this alarm needs. Cost is one base health check
# (~USD 0.50-0.75/month) plus the optional HTTPS/SNI and string-matching
# features (~USD 1/month each) plus USD 0.10 for the alarm; the AWS/Route53
# metric itself carries no custom-metric charge. Budget roughly
# USD 1.50-2.75/month and confirm the current line items on the Route 53
# pricing page.
#
# The alternative, a CloudWatch Synthetics canary, bills USD 0.0012 per run:
# at a 5-minute interval that is 8,640 runs/month, i.e. ~USD 10.37/month
# before its Lambda, S3 artefact and metric charges. At a 1-minute interval it
# would be ~USD 52/month. The canary buys multi-step scripting and screenshots
# that a single readiness assertion does not need, so the health check is the
# right tool at roughly a fifth to a tenth of the price.
#
# TWO CONSECUTIVE FAILURES, NOT ONE
#
# failure_threshold = 2 below is what enforces "two strikes". Route53 counts
# consecutive failed probes and only then flips the consolidated
# HealthCheckStatus metric to 0, so a single dropped packet or a 30-second
# cold start does not page anyone. Detection is ~60 seconds worst case; the
# alarm adds at most one 60-second period, so a real database outage pages
# within roughly two minutes. Note that the two-strike rule lives HERE, in the
# health check, rather than in `evaluation_periods = 2`: Route53 publishes one
# consolidated datapoint per minute, so two evaluation periods would double
# the delay to four minutes without adding any additional noise protection.
#
# 503 IS UNHEALTHY, 200 IS HEALTHY
#
# A Route53 HTTPS health check treats 2xx/3xx as healthy and 4xx/5xx as
# unhealthy, so the endpoint's 503-on-database-fault maps to "unhealthy" with
# no extra work. The string match additionally requires the body to contain
# `"ok":true`, which catches the one case a status code cannot: an edge or
# proxy answering 200 with an error page instead of the H-001 body. That is
# worth the small extra charge on a check nothing else validates.
#
# REGION: THIS MODULE IS PINNED TO us-east-1 BY THE ENVIRONMENT ROOT
#
# Route53 health checks are global, but their CloudWatch metrics are published
# only in US East (N. Virginia), and a CloudWatch alarm action can only target
# an SNS topic in the alarm's own region. The environment root therefore passes
# the `aws.us_east_1` provider alias into this module (see
# terraform/environments/production/main.tf), so the health check, topic,
# subscription and alarm all live and bill in us-east-1. Creating the alarm in
# eu-west-2 with the default provider would leave it monitoring a metric that
# never arrives -- which, with treat_missing_data = "breaching", would page
# permanently for the wrong reason.

# Explicit provider declaration so the environment root's
# `providers = { aws = aws.us_east_1 }` mapping is unambiguous. No version
# constraint here: the root module's `~> 6.52` governs the single installed
# aws provider.
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "api_domain_name" {
  description = "Public hostname the readiness probe should call, e.g. \"api.safepass-tech.com\" (module.acm's api_domain_name output). The probe uses HTTPS on port 443."
  type        = string
}

variable "readiness_path" {
  description = "Path of the DB-aware readiness endpoint (contract H-001). Deliberately not /health: /health is static liveness and would stay green through a database outage, which is the exact failure this module exists to catch."
  type        = string
  default     = "/health/ready"
}

variable "oncall_emails" {
  description = "Comma-separated on-call email recipients for the readiness alarm's SNS topic. Each address receives an AWS confirmation email and, until someone clicks that link, the subscription stays in PendingConfirmation and delivers nothing. A blank value produces a topic with no subscriber, which the check block at the bottom of this file warns about on every full plan/apply (targeted -target plans skip check evaluation)."
  type        = string
  default     = ""
}

locals {
  # Trim, drop empties, deduplicate -- a trailing comma in the repo variable
  # must not create a subscription with an empty endpoint.
  oncall_emails = distinct(compact([for address in split(",", var.oncall_emails) : trimspace(address)]))
}

# Standalone health check: NOT associated with the API's alias record, so it
# never participates in DNS failover. It exists only to publish
# AWS/Route53 HealthCheckStatus for the alarm below.
resource "aws_route53_health_check" "api_readiness" {
  type              = "HTTPS_STR_MATCH"
  fqdn              = var.api_domain_name
  port              = 443
  resource_path     = var.readiness_path
  request_interval  = 30            # the standard interval; 10s ("fast") is an optional paid feature
  failure_threshold = 2             # two consecutive failures before the status flips -- see header
  search_string     = "\"ok\":true" # H-001's ready body: {"status":"ready","checks":{"database":{"ok":true,...}}}
  enable_sni        = true          # the ALB serves a single ACM cert by SNI

  tags = {
    Name        = "${var.project}-${var.environment}-api-readiness"
    Environment = var.environment
    Purpose     = "alerting-only-not-a-target-group-probe"
  }
}

# On-call delivery. Standard (unencrypted) SNS topic: alarm payloads carry no
# patient/secret material, only the health-check ID and the alarm state.
resource "aws_sns_topic" "oncall" {
  name = "${var.project}-${var.environment}-oncall"

  tags = {
    Name        = "${var.project}-${var.environment}-oncall"
    Environment = var.environment
  }
}

# Email subscriptions are PENDING until the human on the other end clicks the
# "Confirm subscription" link AWS sends. Terraform reports the subscription as
# created -- the resource exists -- while AWS still refuses to deliver to it.
# That is the single manual step that makes this alerting path live; see the
# module header and the environment's oncall_emails variable.
resource "aws_sns_topic_subscription" "oncall_email" {
  for_each = toset(local.oncall_emails)

  topic_arn = aws_sns_topic.oncall.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "api_readiness" {
  alarm_name        = "${var.project}-${var.environment}-api-readiness"
  alarm_description = "GET https://${var.api_domain_name}${var.readiness_path} has failed two consecutive checks, so the API cannot reach its database. This is the 2026-11-13 condition: /health stays 200 while /health/ready returns 503. Do NOT pull the ALB target group onto /health/ready (D-013) -- that would drain every task and turn a partial outage into a total one."

  # Route53 health-check metrics live in us-east-1 only (see header); the
  # environment root maps this module's aws provider to that region.
  namespace   = "AWS/Route53"
  metric_name = "HealthCheckStatus"
  dimensions = {
    HealthCheckId = aws_route53_health_check.api_readiness.id
  }

  # HealthCheckStatus is 1 (healthy) or 0 (unhealthy). Minimum over the period
  # catches any unhealthy datapoint inside it. One period is enough because the
  # two-consecutive-failure rule is already applied by failure_threshold above.
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"

  # A monitor that stops reporting is exactly the failure this task is fixing,
  # so absent data is treated as a breach rather than as silence. Side effect:
  # the very first evaluation after creation, before the health check has
  # published its first datapoint, can raise one initial ALARM notification.
  treat_missing_data = "breaching"

  alarm_actions = [aws_sns_topic.oncall.arn]
  # Recovery notice too: the on-call needs to know when to stop investigating
  # as much as when to start.
  ok_actions = [aws_sns_topic.oncall.arn]

  tags = {
    Name        = "${var.project}-${var.environment}-api-readiness"
    Environment = var.environment
  }
}

# Non-fatal by design: an empty recipient list must not block an unrelated
# production apply, but every plan and apply prints the warning so the gap is
# never silent. This is the "monitor with no reader" check.
check "oncall_subscription_configured" {
  assert {
    condition     = length(local.oncall_emails) > 0
    error_message = "No on-call recipients are configured for the readiness alarm (TF_VAR_oncall_emails / repo variable ONCALL_EMAILS is empty). The alarm and topic still plan, but nothing will ever be notified: the 2026-11-13 outage would remain invisible."
  }
}

output "readiness_health_check_id" {
  description = "Route53 health check ID for GET https://<api>/health/ready (alerting only -- not attached to any DNS record)."
  value       = aws_route53_health_check.api_readiness.id
}

output "oncall_sns_topic_arn" {
  description = "SNS topic the readiness alarm publishes to. Email subscriptions remain PendingConfirmation until each recipient clicks the AWS confirmation link."
  value       = aws_sns_topic.oncall.arn
}

output "readiness_alarm_arn" {
  value = aws_cloudwatch_metric_alarm.api_readiness.arn
}
