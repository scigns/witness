import type { CapacitorConfig } from '@capacitor/cli';

/**
 * HUMAN ACTION REQUIRED: `appId` below is a placeholder, not a registered
 * identifier. It follows `buildwithwitness.com`'s confirmed real domain
 * (`docs/brand/BRAND_BOOK.md`) in reverse-DNS form, but nobody has
 * registered it with Apple/Google yet, and a real Apple Developer / Google
 * Play Console account may need (or already hold) a different one. This
 * must be confirmed — and, if changed, changed here and in
 * `ios/App/App.xcodeproj` / `android/app/build.gradle` together, before any
 * TestFlight/Play Console upload — because a bundle ID is effectively
 * permanent once a store listing is created against it.
 */
const config: CapacitorConfig = {
  appId: 'com.buildwithwitness.participate',
  appName: 'Witness Participate',
  webDir: 'dist',
};

export default config;
