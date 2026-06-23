/**
 * DynamoDB service — GPS location storage with 24-hour TTL.
 *
 * Uses DynamoDB Local in development (DYNAMODB_ENDPOINT env var), and
 * real AWS DynamoDB in production (no endpoint override needed).
 *
 * Table: trip_locations
 *   PK:    tripId   (String)
 *   Attrs: latitude, longitude, speed, heading, timestamp
 *          ttl (Number, Unix epoch seconds — DynamoDB auto-expires after 24h)
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from '../env';

const TABLE_NAME = 'trip_locations';

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
 * Ensure the trip_locations table exists.
 *
 * Call once during server startup. Idempotent — ResourceInUseException means
 * the table already exists, which is fine. Any other error is re-thrown so
 * the caller can decide whether it's fatal.
 */
export async function initDynamoTable(): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [{ AttributeName: 'tripId', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'tripId', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        // TTL attribute — DynamoDB removes items automatically after expiry.
        TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      })
    );
    console.log('[DynamoDB] trip_locations table created');
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
 * TTL is set to 24 hours from now so the last known position survives admin
 * dashboard refreshes and persists well beyond even the longest Nigerian
 * long-distance trips (typically 6–12 hours). The item is overwritten on
 * every call — only the latest fix per trip is stored.
 */
export async function saveTripLocation(
  tripId: string,
  location: TripLocationRecord
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 86_400; // 24 hours
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { tripId, ...location, ttl },
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
      Key: { tripId },
    })
  );

  if (!result.Item) return null;

  // Strip DynamoDB-internal keys before returning.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tripId: _id, ttl: _ttl, ...location } = result.Item;
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
            Keys: chunk.map((id) => ({ tripId: id })),
          },
        },
      })
    );

    const items = response.Responses?.[TABLE_NAME] ?? [];
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tripId, ttl: _ttl, ...location } = item;
      result.set(tripId as string, location as TripLocationRecord);
    }
  }

  return result;
}
