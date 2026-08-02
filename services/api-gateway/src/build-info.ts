/**
 * Build identity, surfaced by the API and shown in the UI footer.
 *
 * `buildId` is injected at build time from the git SHA. It falls back to
 * `development` rather than to a fabricated value — an identifier that looks
 * real but identifies nothing is worse than an obvious placeholder when someone
 * is trying to work out which build produced a defect.
 */

export interface BuildInfo {
  readonly version: string;
  readonly buildId: string;
  readonly releaseName: string;
}

export const BUILD_INFO: BuildInfo = Object.freeze({
  version: process.env['WITNESS_VERSION'] ?? '0.1.0',
  buildId: process.env['WITNESS_BUILD_ID'] ?? 'development',
  releaseName: 'Developer Preview',
});
