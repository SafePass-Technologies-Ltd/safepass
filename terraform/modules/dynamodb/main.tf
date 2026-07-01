# SafePass — DynamoDB Module
#
# Per architecture.md: "DynamoDB — high-throughput, low-latency real-time
# state: active trip GPS positions, WebSocket connection mappings, trip
# status flags, session tokens."
#
# SCHEMA DESIGN ASSUMPTION (docs did not specify an exact table schema — this
# is a reasonable single-table design, documented here so it can be revised
# once the API's actual DynamoDB access patterns are finalized):
#
#   Table: realtime_state
#     PK (partition key):  entity_id   (String) — e.g. "trip:{tripId}" or
#                                                  "conn:{connectionId}"
#     SK (sort key):       record_type (String) — e.g. "location",
#                                                  "status", "session"
#     ttl:                 Number (epoch seconds) — DynamoDB native TTL
#                                                    attribute, used for the
#                                                    60-second GPS TTL
#                                                    mentioned in
#                                                    architecture.md's
#                                                    Real-Time Data Flow
#                                                    ("PutItem: trip:{id}:
#                                                    location (TTL 60s)")
#
# Using a composite PK+SK single-table lets one table serve GPS positions,
# WebSocket connection→user mappings, and trip status flags without
# provisioning three separate tables — each record_type namespaces its own
# item shape. On-demand billing mode avoids needing to guess capacity ahead
# of real traffic data (MVP scale, per risk_log.md R-007 "< 200 concurrent").

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

resource "aws_dynamodb_table" "realtime_state" {
  name         = "${var.project}-${var.environment}-realtime-state"
  billing_mode = "PAY_PER_REQUEST" # on-demand — no capacity planning needed at MVP scale
  hash_key     = "entity_id"
  range_key    = "record_type"

  attribute {
    name = "entity_id"
    type = "S"
  }

  attribute {
    name = "record_type"
    type = "S"
  }

  # Native DynamoDB TTL — the API sets this attribute to now()+60s when
  # writing a GPS position record, satisfying the "GPS Data Privacy" /
  # 60-second TTL requirement in architecture.md's Security Considerations.
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true # per architecture.md Backup & Recovery: "DynamoDB: point-in-time recovery enabled"
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${var.project}-${var.environment}-realtime-state"
    Environment = var.environment
  }
}

output "table_name" {
  value = aws_dynamodb_table.realtime_state.name
}

output "table_arn" {
  value = aws_dynamodb_table.realtime_state.arn
}
