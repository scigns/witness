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
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption,
} from '@aws-sdk/client-s3';

import { StoragePort, type StoredObject } from './storage.port.js';

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

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketFor(key), Key: key }));
  }
}
