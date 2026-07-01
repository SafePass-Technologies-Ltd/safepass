# SafePass — S3 Evidence Bucket Module
#
# Per architecture.md "Evidence Chain of Custody": emergency recordings are
# hashed on-device before upload; S3 Object Lock (WORM) preserves evidence
# integrity; AES-256/KMS encryption at rest.
#
# OBJECT LOCK MODE DECISION: GOVERNANCE mode (not COMPLIANCE).
# Rationale: Object Lock mode is set at bucket creation and CANNOT be
# downgraded later — COMPLIANCE mode would make it impossible for even the
# AWS account root/admin to delete or shorten retention on an object, which
# is unrecoverable if a retention period is ever mis-configured, if evidence
# needs to be redacted for a legitimate legal/privacy request (NDPR — see
# risk_log.md R-008), or if a bug ever locks the wrong objects. GOVERNANCE
# mode still provides tamper-evidence and WORM protection against ordinary
# application-level deletes (the API's IAM role does NOT get
# s3:BypassGovernanceRetention), while preserving a documented, audited
# emergency-override path for the AWS account owner. This is the safer
# default for an MVP where legal/retention requirements are still being
# finalized (see risk_log.md R-010: audio recording legal compliance —
# review pending).

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

resource "aws_s3_bucket" "evidence" {
  bucket = "${var.project}-${var.environment}-evidence"

  object_lock_enabled = true # must be set at creation time — cannot be added later

  tags = {
    Name        = "${var.project}-${var.environment}-evidence"
    Environment = var.environment
    Purpose     = "emergency-evidence-chain-of-custody"
  }
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration {
    status = "Enabled" # required for Object Lock to function
  }
}

# Default retention: 1 year, GOVERNANCE mode (see rationale above). The API
# can set a longer per-object retention at upload time via PutObjectRetention
# if a specific incident is escalated to a legal hold.
resource "aws_s3_bucket_object_lock_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 365
    }
  }

  depends_on = [aws_s3_bucket_versioning.evidence]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms" # per architecture.md: "AES-256 for S3-stored emergency recordings (server-side encryption with KMS)"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: transition older evidence to Glacier for cost-effective
# long-term archival, per architecture.md's Data Layer table
# ("AWS S3 (Standard + Glacier for archive)").
resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    id     = "archive-to-glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

output "bucket_name" {
  value = aws_s3_bucket.evidence.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.evidence.arn
}
