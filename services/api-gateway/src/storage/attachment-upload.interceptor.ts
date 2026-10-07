import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { WitnessConfig } from '@witness/config';
import { WITNESS_CONFIG } from '../tokens.js';

@Injectable()
export class AttachmentUploadInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;
  constructor(@Inject(WITNESS_CONFIG) config: WitnessConfig) {
    const Interceptor = FileInterceptor('file', {
      limits: {
        fileSize: config.maxEvidenceAttachmentMb * 1024 * 1024,
        files: 1,
        fields: 0,
        parts: 1,
      },
    });
    this.delegate = new Interceptor();
  }
  intercept(context: ExecutionContext, next: CallHandler) {
    return this.delegate.intercept(context, next);
  }
}
