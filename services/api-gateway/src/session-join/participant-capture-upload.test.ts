import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Module, UnauthorizedException, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ParticipantCaptureController,
  CaptureAttachmentGuard,
} from './participant-capture.controller.js';
import { ParticipantCaptureService } from './participant-capture.service.js';
import { WITNESS_CONFIG } from '../tokens.js';

const EVIDENCE = '11111111-1111-4111-8111-111111111111';
const capture = {
  authorizeAttachment: vi.fn(async (token: string) => {
    if (token !== 'valid') throw new UnauthorizedException();
  }),
  uploadAttachment: vi.fn(async () => ({ id: 'attachment' })),
};
@Module({
  controllers: [ParticipantCaptureController],
  providers: [
    CaptureAttachmentGuard,
    { provide: ParticipantCaptureService, useValue: capture },
    { provide: WITNESS_CONFIG, useValue: { maxEvidenceAttachmentMb: 1 } },
  ],
})
class UploadTestModule {}

describe('capture multipart authorization and limits', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    app = await NestFactory.create(UploadTestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/participant-capture/evidence/${EVIDENCE}/attachment`;
  });
  afterAll(async () => {
    await app?.close();
  });
  it('rejects missing credentials before consuming an oversized multipart body', async () => {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(2 * 1024 * 1024)]), 'large.pdf');
    const response = await fetch(url, { method: 'POST', body: form });
    expect(response.status).toBe(401);
    expect(capture.authorizeAttachment).not.toHaveBeenCalled();
    expect(capture.uploadAttachment).not.toHaveBeenCalled();
  });
  it('rejects invalid credentials before multipart processing', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-witness-capture-token': 'invalid', 'content-type': 'multipart/form-data' },
      body: 'malformed multipart',
    });
    expect(response.status).toBe(401);
    expect(capture.uploadAttachment).not.toHaveBeenCalled();
  });
  it('enforces the configured byte ceiling before the upload handler', async () => {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(2 * 1024 * 1024)]), 'large.pdf');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-witness-capture-token': 'valid' },
      body: form,
    });
    expect(response.status).toBe(413);
    expect(capture.uploadAttachment).not.toHaveBeenCalled();
  });
});
