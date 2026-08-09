/**
 * Build-time environment values, declared so they can be read with dot access.
 *
 * Next.js substitutes `process.env.SOME_NAME` textually at build time — both in
 * the client bundle and in the server render — but only for the dot form.
 * `process.env['SOME_NAME']` survives into the output and is read from the real
 * environment at runtime, which for a browser bundle means `undefined`. That
 * difference is not cosmetic: a value read one way on the server and the other
 * way in the browser produces two different renders of the same page and a
 * hydration mismatch.
 *
 * `noPropertyAccessFromIndexSignature` (tsconfig.base.json) otherwise forbids
 * dot access on `ProcessEnv`'s index signature. Declaring the names here makes
 * them real properties, so the form Next can substitute is also the form
 * TypeScript accepts.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    /** Mirrors the API's `WITNESS_DEPLOYMENT_PROFILE`; set in `next.config.mjs`. */
    readonly WITNESS_BUILD_PROFILE?: string;
  }
}
