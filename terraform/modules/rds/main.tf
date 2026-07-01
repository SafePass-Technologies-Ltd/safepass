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
  manage_master_user_password = true

  multi_az               = true # per architecture.md: "AWS RDS Multi-AZ with automatic failover"
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
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "security_group_id" {
  value = aws_security_group.db.id
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret AWS created to hold the RDS master credentials (JSON: username/password/host/port/dbname/engine). Consumed by the ECS module to inject DB credentials into the running container."
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}
