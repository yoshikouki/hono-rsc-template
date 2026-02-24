/**
 * Cloudflare Workers bindings (KV, D1, R2, etc.)
 *
 * Add your bindings here and declare them in wrangler.toml.
 *
 * Example:
 *   MY_KV: KVNamespace;
 *   MY_DB: D1Database;
 *   MY_BUCKET: R2Bucket;
 */
export interface Env {
  // Plain env vars (wrangler.toml [vars])
  GREETING: string;

  // Add KV / D1 / R2 bindings here, e.g.:
  // MY_KV: KVNamespace;
  // MY_DB: D1Database;
  // MY_BUCKET: R2Bucket;
}
