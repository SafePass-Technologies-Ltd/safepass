/**
 * DynamoDB service — real-time state store (GPS positions today; the same
 * table/schema is documented to also carry WebSocket connection mappings
 * and trip status flags per architecture.md's Real-Time Data Flow).
 *
 * Backed by the single-table design Terraform provisions in
 * terraform/modules/dynamodb/main.tf (`<project>-<environment>-realtime-state`):
 *   PK (entity_id):   "trip:{tripId}" for GPS location records
 *   SK (record_type): "location"
 *   ttl:              Unix epoch seconds -- native DynamoDB TTL
 *
 * Uses DynamoDB Local in development (DYNAMODB_ENDPOINT env var), and real
 * AWS DynamoDB in production (no endpoint override needed) -- the table
 * name itself comes from DYNAMODB_TABLE_NAME (see env.ts), set by Terraform
 * in production so this service never hardcodes a table name that could
 * drift from what's actually provisioned.
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  UpdateTimeToLiveCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from '../env';

const TABLE_NAME = env.DYNAMODB_TABLE_NAME;

// Sort key value namespacing GPS location records within the shared
// entity_id/record_type table (see module-level doc comment above).
const RECORD_TYPE_LOCATION = 'location';

// GPS Data Privacy requirement (architecture.md Security Considerations):
// "Active trip location stored in DynamoDB with 60-second TTL." Matches the
// PutItem TTL called out in the Real-Time Data Flow sequence diagram.
const LOCATION_TTL_SECONDS = 60;

// Use dummy credentials for DynamoDB Local; real AWS credentials come from
// the environment / IAM role in production.
//
// requestTimeout + connectionTimeout prevent the SDK from hanging indefinitely
// when DynamoDB Local is not running. maxAttempts: 1 disables the built-in
// retry loop so a single timeout fails fast rather than retrying 3 times.
const client = new DynamoDBClient({
  region: env.DYNAMODB_REGION,
  maxAttempts: 1,
  requestHandler: { requestTimeout: 3000, connectionTimeout: 2000 },
  ...(env.DYNAMODB_ENDPOINT
    ? {
        endpoint: env.DYNAMODB_ENDPOINT,
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      }
    : {}),
});

const docClient = DynamoDBDocumentClient.from(client);

/** Builds the partition key value for a trip's GPS location record. */
function entityIdForTrip(tripId: string): string {
  return `trip:${tripId}`;
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface TripLocationRecord {
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  /** ISO 8601 timestamp of the GPS reading from the device. */
  timestamp: string;
}

// ────────────────────────────────────────────────────────────
// Table initialisation
// ────────────────────────────────────────────────────────────

/**
 * Ensure the realtime-state table exists -- but only in local development.
 *
 * In production, this table is provisioned by Terraform
 * (terraform/modules/dynamodb/main.tf) and the ECS task role is
 * deliberately scoped to item-level actions only (GetItem/PutItem/
 * UpdateItem/Query/DeleteItem) -- no CreateTable -- so table lifecycle
 * stays under infra control rather than the app self-provisioning
 * resources at boot. Attempting CreateTable there would just fail with an
 * AccessDenied that's safe to no-op past (see the catch below).
 *
 * Locally (DYNAMODB_ENDPOINT set, i.e. DynamoDB Local via docker-compose),
 * there's no Terraform run to provision the table, so this call creates it
 * on first boot for developer convenience. Idempotent -- ResourceInUseException
 * means the table already exists, which is fine.
 */
export async function initDynamoTable(): Promise<void> {
  if (!env.DYNAMODB_ENDPOINT) {
    // Production / any real AWS DynamoDB target -- table is Terraform-owned.
    console.log(`[DynamoDB] using Terraform-provisioned table "${TABLE_NAME}"`);
    return;
  }

  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'entity_id', KeyType: 'HASH' },
          { AttributeName: 'record_type', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'entity_id', AttributeType: 'S' },
          { AttributeName: 'record_type', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      })
    );

    // TTL cannot be set on CreateTableCommand -- it's a separate control-plane
    // call. DynamoDB removes items automatically after 'ttl' (Unix epoch
    // seconds) elapses.
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: TABLE_NAME,
        TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      })
    );

    console.log(`[DynamoDB] "${TABLE_NAME}" table created (local dev)`);
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      // Table already exists — nothing to do.
    } else {
      throw err;
    }
  }
}

// ────────────────────────────────────────────────────────────
// Read / write
// ────────────────────────────────────────────────────────────

/**
 * Persist a GPS reading for a trip.
 *
 * TTL is set to 60 seconds from now per architecture.md's GPS Data Privacy
 * requirement -- active trip location is short-lived in DynamoDB, distinct
 * from the durable, access-controlled history retained in PostgreSQL. The
 * item is overwritten on every call — only the latest fix per trip is
 * stored (record_type namespaces it from any other trip: state that may
 * later share this table, e.g. WebSocket connection mappings).
 */
export async function saveTripLocation(
  tripId: string,
  location: TripLocationRecord
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + LOCATION_TTL_SECONDS;
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        entity_id: entityIdForTrip(tripId),
        record_type: RECORD_TYPE_LOCATION,
        ...location,
        ttl,
      },
    })
  );
}

/**
 * Retrieve the last known GPS position for a trip.
 *
 * Returns null if no record exists or if it has already expired
 * (DynamoDB may return items for a short window after the TTL).
 */
export async function getTripLocation(
  tripId: string
): Promise<TripLocationRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { entity_id: entityIdForTrip(tripId), record_type: RECORD_TYPE_LOCATION },
    })
  );

  if (!result.Item) return null;

  // Strip DynamoDB-internal keys before returning.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { entity_id: _entityId, record_type: _recordType, ttl: _ttl, ...location } = result.Item;
  return location as TripLocationRecord;
}

/**
 * Batch-retrieve the last known GPS positions for multiple trips.
 *
 * Returns a Map of tripId → location. Trips with no stored location
 * are simply absent from the map. Handles the DynamoDB BatchGet limit
 * of 100 keys per request by chunking automatically.
 */
export async function getAllTripLocations(
  tripIds: string[]
): Promise<Map<string, TripLocationRecord>> {
  if (tripIds.length === 0) return new Map();

  // Chunk into batches of 100 (DynamoDB BatchGet maximum).
  const chunks: string[][] = [];
  for (let i = 0; i < tripIds.length; i += 100) {
    chunks.push(tripIds.slice(i, i + 100));
  }

  const result = new Map<string, TripLocationRecord>();

  for (const chunk of chunks) {
    const response = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: chunk.map((tripId) => ({
              entity_id: entityIdForTrip(tripId),
              record_type: RECORD_TYPE_LOCATION,
            })),
          },
        },
      })
    );

    const items = response.Responses?.[TABLE_NAME] ?? [];
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { entity_id: entityId, record_type: _recordType, ttl: _ttl, ...location } = item;
      const tripId = (entityId as string).slice('trip:'.length);
      result.set(tripId, location as TripLocationRecord);
    }
  }

  return result;
}
