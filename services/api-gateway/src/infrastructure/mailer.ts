import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

import type { WitnessConfig } from '@witness/config';

import { WITNESS_CONFIG } from '../tokens.js';

export interface InvitationMail {
  readonly to: string;
  readonly organisationName: string;
  readonly invitedEmail: string;
  readonly role: string;
  readonly activationUrl: string;
}

export interface WorkspaceInvitationMail {
  readonly to: string;
  readonly organisationName: string;
  readonly workspaceName: string;
  readonly inviterDisplayName: string;
  readonly role: string;
  readonly invitationUrl: string;
  readonly expiresAt: Date;
  readonly message: string | null;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(WITNESS_CONFIG) private readonly config: WitnessConfig) {}

  async sendInvitation(mail: InvitationMail): Promise<{ readonly messageId: string | null }> {
    const smtp = this.config.smtp;
    if (smtp.from === '' || smtp.user === '' || smtp.password === '') {
      throw new Error('Invitation SMTP is not configured.');
    }

    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.ssl,
      requireTLS: smtp.starttls,
      auth: { user: smtp.user, pass: smtp.password },
    });

    try {
      const info = await transport.sendMail({
        from: { address: smtp.from, name: smtp.fromDisplayName || 'Witness' },
        to: mail.to,
        replyTo: smtp.replyTo || undefined,
        subject: `You have been invited to Witness — ${mail.organisationName}`,
        text: [
          'You have been invited to Witness.',
          '',
          `Organisation: ${mail.organisationName}`,
          `Invited email: ${mail.invitedEmail}`,
          `Role: ${mail.role}`,
          '',
          'Activate your account:',
          mail.activationUrl,
          '',
          `Use exactly ${mail.invitedEmail} when authenticating. Witness securely matches the ` +
            'verified identity email to the existing invitation; the invitation email itself is not authorization.',
          '',
          'Need help? Contact support@buildwithwitness.com',
        ].join('\n'),
      });
      this.logger.log(`Invitation notification accepted by SMTP for ${mail.invitedEmail}`);
      return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
    } finally {
      transport.close();
    }
  }

  /**
   * A genuinely different invitation from `sendInvitation` above: this one
   * carries a bearer link (the token identifies which invitation; the
   * accept endpoint still independently requires the signed-in principal's
   * verified email to match — see `workspace-invitation.ts`'s file header
   * and ADR-0028). Same SMTP transport and "no credential in the message"
   * discipline as the organisation-invitation email; distinct content
   * because what it grants and how it is redeemed are both different.
   */
  async sendWorkspaceInvitation(
    mail: WorkspaceInvitationMail,
  ): Promise<{ readonly messageId: string | null }> {
    const smtp = this.config.smtp;
    if (smtp.from === '' || smtp.user === '' || smtp.password === '') {
      throw new Error('Invitation SMTP is not configured.');
    }

    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.ssl,
      requireTLS: smtp.starttls,
      auth: { user: smtp.user, pass: smtp.password },
    });

    try {
      const info = await transport.sendMail({
        from: { address: smtp.from, name: smtp.fromDisplayName || 'Witness' },
        to: mail.to,
        replyTo: smtp.replyTo || undefined,
        subject: `${mail.organisationName} has invited you to ${mail.workspaceName}`,
        text: [
          `${mail.organisationName} has invited you to participate in ${mail.workspaceName} on Witness.`,
          '',
          `Invited by: ${mail.inviterDisplayName}`,
          `Role: ${mail.role}`,
          ...(mail.message !== null ? ['', mail.message] : []),
          '',
          'View and respond to this invitation:',
          mail.invitationUrl,
          '',
          `This invitation expires ${mail.expiresAt.toISOString()}.`,
          '',
          'Need help? Contact support@buildwithwitness.com',
        ].join('\n'),
      });
      this.logger.log(`Workspace invitation notification accepted by SMTP for ${mail.to}`);
      return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
    } finally {
      transport.close();
    }
  }
}
