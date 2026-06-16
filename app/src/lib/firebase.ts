// Firebase has been replaced by a local SQLite-backed store. This module is
// kept only so existing `import { db, isConfigured } from "./firebase"` lines
// keep resolving; everything now comes from the local-db shim.
export { db, isConfigured } from "./local-db";

// Auth is local/single-user now — no external provider.
export const auth = null;
export const googleProvider = null;
