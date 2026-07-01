# SafePass — CloudFront Module
#
# Per architecture.md Deployment Architecture: CloudFront sits in front of
# the ALB for the backend API (separate from Vercel's own CDN/Edge, which
# fronts the 3 Next.js dashboards independently).

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

resource "aws_cloudfront_distribution" "api" {
  enabled = true
  comment = "${var.project}-${var.environment}-api"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # ALB listener is HTTP-only for MVP; HTTPS termination can be added at the ALB listener + ACM cert later
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-origin"
    viewer_protocol_policy = "redirect-to-https"

    # API responses (including WebSocket upgrade requests) are dynamic —
    # do not cache at the edge. Forward all headers/cookies/query strings
    # so auth and WebSocket upgrade headers pass through untouched.
    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true # swap for an ACM cert + custom domain once DNS is finalized
  }

  tags = {
    Name        = "${var.project}-${var.environment}-cf"
    Environment = var.environment
  }
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.api.domain_name
}
