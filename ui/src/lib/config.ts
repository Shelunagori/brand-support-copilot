/** Build-time configuration. Kept dependency-free so every lib module can import it. */

/** API base URL: `/api` (dev/nginx proxy) or a full cross-origin URL such as the Render service. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

/**
 * Optional API key, sent as `X-API-Key` only when non-empty. Set in `.env.development` for
 * local dev against a non-demo backend. Public (demo) builds must leave it empty: the read
 * endpoints are public in demo mode and chat uses a per-visitor access code instead.
 */
export const API_KEY = import.meta.env.VITE_API_KEY ?? '';

/** Static snapshot of read endpoints, served from the UI origin. */
export const SNAPSHOT_URL = `${import.meta.env.BASE_URL}demo-snapshot.json`;
