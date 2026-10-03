/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` przełącza odczyty API na fixture'y z `src/api/fixtures` (mutacje zawsze idą do API). */
  readonly VITE_USE_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
