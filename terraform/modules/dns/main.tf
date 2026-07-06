# SafePass — DNS Records Module
#
# Manages every DNS record this stack owns inside the pre-existing
# safepass-tech.com hosted zone: the API's alias record (pointing at the
# ALB) and the three dashboards' CNAME records (pointing at Vercel). The
# zone itself and its apex/root record (already serving a separate website)
# are NOT managed here -- only the subdomains listed below.

variable "zone_id" {
  description = "Route53 hosted zone ID for the root domain (from modules/acm's data lookup)."
  type        = string
}

variable "api_domain_name" {
  description = "Full API subdomain, e.g. \"api.safepass-tech.com\"."
  type        = string
}

variable "alb_dns_name" {
  type = string
}

variable "alb_zone_id" {
  description = "Hosted zone ID of the ALB itself (region-specific, required for an ALIAS record to an ALB)."
  type        = string
}

variable "dashboard_records" {
  description = "Map of dashboard subdomain (full FQDN, e.g. \"console.safepass-tech.com\") -> CNAME target (Vercel's DNS target for that custom domain)."
  type        = map(string)

  # Route53 rejects a CNAME record whose record set has zero/empty values
  # with an opaque "InvalidInput: ResourceRecords is not complete" XML error
  # at apply time -- this validation catches an empty-string target (e.g. a
  # GitHub Actions variable that resolved empty) at plan time instead, with
  # a message that actually names the problem.
  validation {
    condition     = alltrue([for fqdn, target in var.dashboard_records : length(trimspace(target)) > 0])
    error_message = "Every dashboard_records value must be a non-empty CNAME target -- check that VERCEL_CNAME_CONSOLE/CORPORATE/TRANSPORT (or equivalent TF_VARs) are actually set."
  }
}

# API — ALIAS (Route53's zone-apex-capable CNAME equivalent) straight to the
# ALB. No CloudFront in front: the ALB terminates TLS itself using the ACM
# cert from modules/acm, avoiding CloudFront's per-distribution cost and the
# account-verification blocker documented in the old cloudfront module.
resource "aws_route53_record" "api" {
  zone_id = var.zone_id
  name    = var.api_domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Dashboards -- plain CNAMEs to Vercel. Vercel terminates TLS for these
# domains on its own edge once the domain is added in the Vercel project
# settings; Terraform only owns the DNS pointer, not the certificate.
resource "aws_route53_record" "dashboards" {
  for_each = var.dashboard_records

  zone_id = var.zone_id
  name    = each.key
  type    = "CNAME"
  ttl     = 300
  records = [each.value]
}

output "api_fqdn" {
  value = aws_route53_record.api.name
}

output "dashboard_fqdns" {
  value = [for r in aws_route53_record.dashboards : r.name]
}
