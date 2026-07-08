/**
 * S3 Evidence Service — uploads and retrieval for emergency evidence
 * (audio/video recordings captured during a panic-button session).
 *
 * Backed by the Object-Lock (WORM) evidence bucket Terraform provisions in
 * terraform/modules/s3/main.tf (`<project>-<environment>-evidence`) — see
 * that file's header comment for the GOVERNANCE-mode retention rationale.
 * The bucket blocks all public access and encrypts objects with SSE-KMS, so
 * every object is only reachable via this service: either a direct
 * `PutObjectCommand` at upload time (using the ECS task role's scoped
 * `s3:PutObject`/`s3:PutObjectRetention` grant — see
 * terraform/modules/iam-ecs/main.tf), or a short-lived presigned GET URL for
 * playback (`getEvidencePlaybackUrl` below).
 *
 * Local development has no AWS credentials/bucket by default — callers
 * should check `isS3EvidenceConfigured()` first and fall back to local disk
 * storage when it's false (see emergency.routes.ts), so `pnpm dev` keeps
 * working without any AWS setup.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';

// ECS injects AWS_REGION directly (see terraform/environments/production/
// main.tf's environment_variables); DYNAMODB_REGION's default doubles as a
// sane fallback for local development, matching dynamo.service.ts's own
// region resolution.
const REGION = process.env.AWS_REGION ?? env.DYNAMODB_REGION;

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

/** Whether the evidence bucket is configured — false in local dev unless explicitly set. */
export function isS3EvidenceConfigured(): boolean {
  return Boolean(env.EVIDENCE_BUCKET_NAME);
}

/**
 * Uploads a single evidence file (audio/video) to the Object-Lock evidence
 * bucket under a per-emergency-event prefix, and returns the S3 object key
 * (NOT a public URL — the bucket blocks public access; use
 * `getEvidencePlaybackUrl` to generate a short-lived signed URL for
 * playback).
 */
export async function uploadEvidenceFile(
  emergencyEventId: string,
  fileName: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  if (!env.EVIDENCE_BUCKET_NAME) {
    throw new Error('EVIDENCE_BUCKET_NAME is not configured');
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `emergency-audio/${emergencyEventId}/${Date.now()}-${safeFileName}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.EVIDENCE_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Server-side encryption is already enforced by the bucket's default
      // encryption configuration (aws:kms — see modules/s3/main.tf), but
      // setting it explicitly here too costs nothing and keeps this call
      // self-describing.
      ServerSideEncryption: 'aws:kms',
    })
  );

  return key;
}

/**
 * Generates a short-lived (10 minute) presigned GET URL so an authorized
 * monitoring officer can play back a private evidence object without the
 * bucket ever needing to be public. Callers (see admin-emergency.routes.ts)
 * are responsible for checking the requester's role before calling this.
 */
export async function getEvidencePlaybackUrl(key: string): Promise<string> {
  if (!env.EVIDENCE_BUCKET_NAME) {
    throw new Error('EVIDENCE_BUCKET_NAME is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: env.EVIDENCE_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(getClient(), command, { expiresIn: 600 });
}
