#!/usr/bin/env node
/**
 * Generate a CycloneDX software bill of materials.
 *
 * Every release ships an SBOM. Operators in regulated environments are often
 * required to produce one, and "ask the vendor" is not an option for software
 * they self-host — which is the whole point of Witness.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('pnpm-lock.yaml')) {
  console.log('No lockfile yet — SBOM generation skipped (pre-implementation).');
  process.exit(0);
}

try {
  execSync('npx --yes @cyclonedx/cyclonedx-npm --output-file sbom.json --output-format JSON', {
    stdio: 'inherit',
  });
  console.log('SBOM written to sbom.json');
} catch (error) {
  console.error('SBOM generation failed:', error.message);
  process.exit(1);
}
