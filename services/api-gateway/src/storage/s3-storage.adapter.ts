/**
 * S3StorageAdapter — `StoragePort` over any S3-compatible object store.
 * Cloudflare R2 in production (its S3-compatible API is the documented,
 * supported way to talk to it — there is no R2-specific SDK to prefer
 * instead); MinIO in the `full` local dev profile. One bucket per kind
 * (`S3_BUCKET_MEDIA` for audio, `S3_BUCKET_DOCUMENTS` for everything else),
 * matching `.env.example`'s existing convention — that split exists so a
 * future operator can apply different lifecycle/retention rules to
 * recordings versus documents without touching application code.
 *
 * Server-side encryption is opt-in via `S3_SERVER_SIDE_ENCRYPTION` (R2
 * supports it; MinIO in dev typically does not, hence optional rather than
 * always-on).
 */

import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';

import {
  StoragePort,
  type StoredObject,
  type StoredObjectMetadata,
  type StorageInventoryPage,
} from './storage.port.js';

export interface S3StorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucketMedia: string;
  readonly bucketDocuments: string;
  readonly forcePathStyle: boolean;
  readonly serverSideEncryption: string;
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class S3StorageAdapter extends StoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    super();
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Every key this adapter writes carries its kind as a path segment (see objectKey()). */
  private bucketFor(key: string): string {
    return key.includes('/evidence-attachment/')
      ? this.config.bucketMedia
      : this.config.bucketDocuments;
  }

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(key),
        Key: key,
        Body: content,
        ContentType: contentType,
        ...(this.config.serverSideEncryption !== ''
          ? { ServerSideEncryption: this.config.serverSideEncryption as ServerSideEncryption }
          : {}),
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key }),
      );
      if (response.Body === undefined) return null;
      const content = await streamToBuffer(response.Body);
      return { content, contentType: response.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) return null;
      throw error;
    }
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketFor(key), Key: key }),
      );
      if (result.ContentLength === undefined)
        throw new Error('Storage did not return an object size.');
      return { key, sizeBytes: result.ContentLength };
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) return null;
      throw error;
    }
  }

  async list(prefix: string, cursor?: string): Promise<StorageInventoryPage> {
    if (!/^[0-9a-f-]{36}\/$/i.test(prefix))
      throw new Error('Storage inventory requires an organisation prefix.');
    const buckets = [...new Set([this.config.bucketMedia, this.config.bucketDocuments])];
    const position =
      cursor === undefined
        ? { bucket: 0, token: undefined as string | undefined }
        : (JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
            bucket: number;
            token?: string;
          });
    if (
      !Number.isInteger(position.bucket) ||
      position.bucket < 0 ||
      position.bucket >= buckets.length ||
      (position.token !== undefined && typeof position.token !== 'string')
    )
      throw new Error('Invalid storage inventory cursor.');
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: buckets[position.bucket],
        Prefix: prefix,
        MaxKeys: 1000,
        ...(position.token === undefined ? {} : { ContinuationToken: position.token }),
      }),
    );
    const objects = (result.Contents ?? []).map((object) => {
      if (object.Key === undefined || object.Size === undefined || !object.Key.startsWith(prefix))
        throw new Error('Storage returned an invalid inventory item.');
      return { key: object.Key, sizeBytes: object.Size };
    });
    const next = result.IsTruncated
      ? { bucket: position.bucket, token: result.NextContinuationToken }
      : position.bucket + 1 < buckets.length
        ? { bucket: position.bucket + 1 }
        : null;
    if (result.IsTruncated && !result.NextContinuationToken)
      throw new Error('Storage inventory was truncated without a continuation token.');
    return {
      objects,
      cursor: next === null ? null : Buffer.from(JSON.stringify(next)).toString('base64url'),
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketFor(key), Key: key }));
  }
}
