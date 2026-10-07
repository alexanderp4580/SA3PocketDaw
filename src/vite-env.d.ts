/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
interface ImportMetaEnv {
  /** Absolute URL ending in '/' that model files are fetched from; unset means same-origin `models/`. */
  readonly VITE_MODELS_BASE_URL?: string;
}
