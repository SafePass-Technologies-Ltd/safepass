# SafePass — ACM Certificate Module (API custom domain)
#
# Requests a free AWS Certificate Manager certificate for the backend API's
# custom domain (api.<root_domain>) and DNS-validates it against the
# existing Route53 hosted zone for the root domain. ACM certificates are
# free of charge when used with AWS resources (ALB here) — the only cost is
# the pre-existing Route53 hosted zone itself, which already exists for the
# root domain per architecture.md's Deployment Architecture.
#
# NOTE: The hosted zone for the root domain is looked up via a data source,
# not created here — the root domain already has a record serving a
# separate website, and that zone/record is managed outside this Terraform
# stack. This module only ever adds validation + api subdomain records
# scoped to api.<root_domain>, never touching the apex/root record.

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "root_domain" {
  description = "Root domain name already registered and hosted in Route53, e.g. \"safepass-tech.com\". Its hosted zone is looked up (not created) — the apex record already serves an existing website."
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain label for the backend API, prefixed to root_domain (e.g. \"api\" -> api.safepass-tech.com)."
  type        = string
  default     = "api"
}

# Looked up, not managed -- the zone (and its apex website record) already
# exists in this AWS account per the user's setup outside this repo.
data "aws_route53_zone" "root" {
  name = "${var.root_domain}."
}

resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.root_domain}"
  validation_method = "DNS"

  tags = {
    Name        = "${var.project}-${var.environment}-api-cert"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records -- one per domain_validation_options entry (just one
# here since this cert covers a single domain, but for_each keeps this
# correct if SANs are ever added).
resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.root.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Blocks until ACM confirms the DNS validation records above have propagated
# and the certificate is issued -- downstream consumers (the ALB HTTPS
# listener) depend on this output, not on aws_acm_certificate.api directly,
# so they never attach an unvalidated/pending certificate.
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

output "certificate_arn" {
  value = aws_acm_certificate_validation.api.certificate_arn
}

output "zone_id" {
  value = data.aws_route53_zone.root.zone_id
}

output "api_domain_name" {
  value = "${var.api_subdomain}.${var.root_domain}"
}
