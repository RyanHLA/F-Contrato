/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_R2_PUBLIC_URL: string
  readonly VITE_ZIP_WORKER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
