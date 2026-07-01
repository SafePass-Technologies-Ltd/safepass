# SafePass — Networking Module
#
# DECISION: Provision a dedicated VPC (not the AWS account default VPC).
# Rationale: RDS Multi-AZ + ECS Fargate + an internet-facing ALB need
# predictable subnet CIDR layout (public subnets for ALB/NAT, private
# subnets for ECS tasks + RDS) that the account-default VPC does not
# guarantee (default VPCs vary by account history/region and are shared
# with anything else running in the account). A dedicated VPC keeps
# safety-critical infra (R-001: real-time emergency path) network-isolated
# and makes the security-group blast radius explicit and auditable — this
# matters given R-002 (data breach risk for GPS + emergency recordings).
#
# Layout: 2 Availability Zones (minimum for RDS Multi-AZ + ALB) each with one
# public subnet (ALB, NAT Gateway) and one private subnet (ECS Fargate tasks,
# RDS). Public subnets route to an Internet Gateway; private subnets route
# outbound via a single shared NAT Gateway (cost tradeoff — one NAT instead
# of one-per-AZ; acceptable for MVP scale, documented here for the future
# staging/scale-up decision).

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "azs" {
  description = "Exactly 2 Availability Zones for the MVP Multi-AZ setup."
  type        = list(string)
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.project}-${var.environment}-vpc"
    Environment = var.environment
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project}-${var.environment}-igw"
  }
}

# Public subnets — one per AZ. Host the ALB and the NAT Gateway.
resource "aws_subnet" "public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project}-${var.environment}-public-${var.azs[count.index]}"
    Tier = "public"
  }
}

# Private subnets — one per AZ. Host ECS Fargate tasks and RDS instances.
# No direct internet route; outbound traffic (e.g. to Google Maps API,
# payment gateways) goes through the NAT Gateway.
resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = var.azs[count.index]

  tags = {
    Name = "${var.project}-${var.environment}-private-${var.azs[count.index]}"
    Tier = "private"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.project}-${var.environment}-nat-eip"
  }
}

# Single shared NAT Gateway for cost efficiency at MVP scale. If uptime
# requirements tighten (e.g. beyond R-001's mitigation plan), consider one
# NAT Gateway per AZ to remove this as a single point of egress failure.
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.project}-${var.environment}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project}-${var.environment}-public-rt"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project}-${var.environment}-private-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}
