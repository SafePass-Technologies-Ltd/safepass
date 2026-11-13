# SafePass — RDS PostgreSQL Module
#
# Per architecture.md: PostgreSQL 16, AWS RDS Multi-AZ, automated daily
# snapshots + point-in-time recovery (7-day retention).

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "app_security_group_id" {
  description = "Security group of the ECS service allowed to reach RDS on 5432."
  type        = string
}

variable "instance_class" {
  description = "RDS instance size. Kept as a variable so a smaller/larger class can be used per environment (e.g. db.t4g.micro for a future staging env vs. db.t4g.medium+ for production)."
  type        = string
  default     = "db.t4g.medium"
}

variable "allocated_storage_gb" {
  type    = number
  default = 50
}

variable "db_name" {
  type    = string
  default = "safepass"
}

variable "master_username" {
  type      = string
  default   = "safepass_admin"
  sensitive = true
}

variable "multi_az" {
  description = "Run the instance Multi-AZ (synchronous standby in a second AZ). Defaults to true per architecture.md's \"AWS RDS Multi-AZ with automatic failover\"; an environment may override it when single-AZ is a deliberate, temporary cost posture."
  type        = bool
  default     = true
}

variable "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret holding this instance's master credentials. Leave null for a normal AWS-managed-password instance: the ARN is then read off the instance's own master_user_secret attribute. It MUST be set for an instance restored from a snapshot, because a snapshot restore has no AWS-managed master secret to read the ARN from — see the SAFETY note on manage_master_user_password below. An ARN is an account-scoped identifier, not a credential."
  type        = string
  default     = null
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}-db-subnets"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.project}-${var.environment}-db-subnets"
  }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-${var.environment}-db-sg"
  description = "Allow PostgreSQL access only from the API ECS service security group"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from ECS API tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-db-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-${var.environment}-pg"
  engine         = "postgres"
  engine_version = "16"

  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.master_username

  # AWS RDS natively generates, stores, and can auto-rotate the master
  # password in a Secrets Manager secret it owns — no password ever passes
  # through Terraform vars, GitHub secrets, or state in plaintext. This
  # replaces the previous dual-source-of-truth setup (a GitHub Actions
  # secret AND a manually-populated Secrets Manager placeholder that could
  # drift out of sync with each other).
  #
  # SAFETY — read before changing: production's instance was rebuilt on
  # 2026-11-13 by `aws rds restore-db-instance-from-db-snapshot` after the AWS
  # account closure deleted it. RDS rejects ManageMasterUserPassword on a
  # postgres snapshot restore (and the CLI's restore call has no
  # MasterUserPassword either), so the restored instance reports
  # `MasterUserSecret: null` while the surviving secret
  # `rds!db-2b485055-...` still holds the live master password that every
  # running ECS task reads through DB_SECRET_ARN. Terraform still records
  # this flag as true from before the deletion, so a plan that *did* see the
  # drift would issue ModifyDBInstance(ManageMasterUserPassword=true), which
  # in one call mints a BRAND NEW Secrets Manager secret and rotates the
  # master password — instantly invalidating the credential in the secret the
  # running task definition points at, i.e. a second total production auth
  # outage. The `lifecycle.ignore_changes` at the bottom of this resource is
  # the guard that makes that impossible; re-establishing AWS-managed rotation
  # must instead be a deliberate, coordinated change: run it in a maintenance
  # window AND repoint DB_SECRET_ARN (see the environment's
  # rds_master_user_secret_arn variable) in the same apply.
  manage_master_user_password = true

  multi_az               = var.multi_az # architecture.md: "AWS RDS Multi-AZ with automatic failover"
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  backup_retention_period = 7             # per architecture.md Backup & Recovery: "7-day retention"
  backup_window           = "03:00-04:00" # low-traffic window (Nigeria time considerations deferred — UTC default)
  maintenance_window      = "mon:04:30-mon:05:30"

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-${var.environment}-pg-final"

  # Point-in-time recovery is implicit with automated backups enabled
  # (backup_retention_period > 0) — no separate flag needed for RDS Postgres.

  tags = {
    Name        = "${var.project}-${var.environment}-pg"
    Environment = var.environment
  }

  lifecycle {
    # See the SAFETY note on manage_master_user_password above: the only
    # realistic way a plan would decide that flag is out of date is a
    # restored/imported instance (whose MasterUserSecret is null) being
    # compared against this config, and acting on that decision means
    # ModifyDBInstance(ManageMasterUserPassword=true) — a new secret plus a
    # master-password rotation, breaking every running task that still reads
    # DB_SECRET_ARN from the old secret. Ignoring drift on the flag keeps
    # plan/apply from ever reaching for that; enabling AWS-managed rotation
    # again is an explicit, coordinated change instead (see the environment's
    # rds_master_user_secret_arn variable).
    ignore_changes = [manage_master_user_password]
  }
}

output "endpoint" {
  description = "host:port combined string."
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "DB host only (no port) — for wiring discrete DB_HOST into the ECS task, since AWS-managed master secret only contains username/password, not connection details."
  value       = aws_db_instance.main.address
}

output "port" {
  value = aws_db_instance.main.port
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "security_group_id" {
  value = aws_security_group.db.id
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the RDS master credentials (JSON: username + password only — host/port/dbname are NOT included, use the address/port/db_name outputs above for those). Consumed by the environment root as the container's DB_SECRET_ARN. For a snapshot-restored instance there is no AWS-managed secret to read off the instance attributes (master_user_secret comes back as an empty list, and indexing it blindly fails the whole plan with \"Invalid index\"), so var.master_user_secret_arn takes precedence when set; the instance attribute remains the fallback for a normal AWS-managed-password instance."
  value       = var.master_user_secret_arn != null ? var.master_user_secret_arn : aws_db_instance.main.master_user_secret[0].secret_arn
}
