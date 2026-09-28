/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WITNESS_BUILD_PROFILE?: string;
  readonly VITE_WITNESS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
