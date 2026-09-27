/**
 * Whether a TCP peer address is this machine talking to itself.
 *
 * Shared by every place in the development profile that must confine an
 * unverified mechanism (the X-Witness-Dev-User header, the development
 * identity-provider double) to the machine running Witness, even though the
 * API itself may be bound to a LAN-reachable address for physical-device
 * participant testing (Phase 6, Track E). Development only sets
 * `app.set('trust proxy', ...)` outside this profile (see `main.ts`), so
 * `request.socket.remoteAddress` here is the real TCP peer, never a proxy.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
