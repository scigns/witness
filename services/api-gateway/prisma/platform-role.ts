/**
 * Supported operator CLI for platform authority.
 *
 * list/grant/revoke call the authenticated API, so normal mutation is subject
 * to the same platform-only policy as every other request. recover is the one
 * deliberate break-glass operation: it uses Prisma, requires an existing
 * active OIDC-linked user, refuses while any usable platform admin exists and
 * writes a hash-chained recovery audit event.
 */
import { PrismaClient } from '@prisma/client';
import { recoverPlatformRole } from '../src/platform-roles/platform-role-recovery.js';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const command = args[0];

function option(name: string, required = true): string {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1]?.trim() : undefined;
  if (required && !value) throw new Error(`--${name} is required.`);
  return value ?? '';
}

function requireReason(): string {
  const reason = option('reason');
  if (reason.length < 10 || reason.length > 500) {
    throw new Error('--reason must contain between 10 and 500 characters.');
  }
  return reason;
}

async function apiRequest(path: string, init: RequestInit = {}) {
  const baseUrl = (process.env['WITNESS_API_URL'] ?? '').replace(/\/$/, '');
  const token = process.env['WITNESS_SESSION_TOKEN'] ?? '';
  if (!baseUrl) throw new Error('WITNESS_API_URL is required for list/grant/revoke.');
  if (!token) throw new Error('WITNESS_SESSION_TOKEN is required for list/grant/revoke.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Platform role API returned ${response.status}: ${body.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined;
  return response.json();
}

async function recover() {
  const email = option('email').toLowerCase();
  const role = option('role');
  const reason = requireReason();
  const confirmation = option('confirm');
  if (role !== 'admin') throw new Error("The only supported platform role is 'admin'.");
  if (confirmation !== 'RECOVER_PLATFORM_ADMIN') {
    throw new Error('--confirm RECOVER_PLATFORM_ADMIN is required.');
  }

  const prisma = new PrismaClient();
  try {
    const result = await recoverPlatformRole(prisma as never, {
      email,
      role: 'admin',
      reason,
      confirmation,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  switch (command) {
    case 'list':
      process.stdout.write(
        `${JSON.stringify(await apiRequest('/api/v1/platform/role-assignments'), null, 2)}\n`,
      );
      return;
    case 'grant':
      process.stdout.write(
        `${JSON.stringify(
          await apiRequest('/api/v1/platform/role-assignments', {
            method: 'POST',
            body: JSON.stringify({
              email: option('email'),
              role: option('role'),
              reason: requireReason(),
            }),
          }),
          null,
          2,
        )}\n`,
      );
      return;
    case 'revoke':
      await apiRequest(`/api/v1/platform/role-assignments/${option('user-id')}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: requireReason() }),
      });
      process.stdout.write('Platform role revoked.\n');
      return;
    case 'recover':
      await recover();
      return;
    default:
      throw new Error('Usage: platform-role <list|grant|revoke|recover> [options]');
  }
}

main().catch((error: unknown) => {
  // Never print environment values or request headers. Domain/API messages are safe.
  const message = error instanceof Error ? error.message : 'Unknown platform-role failure.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
