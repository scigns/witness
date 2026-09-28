import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  submitProductFeedbackRequestSchema,
  submitTestimonialConsentRequestSchema,
  type CustomerStoryView,
  type ProductFeedbackView,
} from '@witness/contracts';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { CustomerStoriesService } from '../customer-stories/customer-stories.service.js';
import { ProductFeedbackService } from './product-feedback.service.js';

@Controller('api/v1/workspaces/:workspaceId/product-feedback')
@UseGuards(AuthorizationGuard)
export class ProductFeedbackController {
  constructor(
    private readonly feedback: ProductFeedbackService,
    private readonly stories: CustomerStoriesService,
  ) {}

  @Get()
  @Requires('product_feedback:read')
  list(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ): Promise<ProductFeedbackView[]> {
    return this.feedback.list(workspaceId);
  }

  @Post()
  @Requires('product_feedback:create')
  submit(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ProductFeedbackView> {
    const parsed = submitProductFeedbackRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The feedback request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.feedback.submit(workspaceId, parsed.data, request.principal!);
  }

  @Post(':feedbackId/testimonial-consent')
  @Requires('customer_story:create')
  submitTestimonialConsent(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('feedbackId', new ParseUUIDPipe()) feedbackId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView | null> {
    const parsed = submitTestimonialConsentRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The testimonial consent request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.stories.proposeFromFeedback(
      workspaceId,
      feedbackId,
      parsed.data,
      request.principal!,
    );
  }
}
