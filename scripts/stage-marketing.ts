import { cp, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// Prerendered pages and their `/marketing/`-based assets; `dist/server` only serves the prerender.
const prerenderedSite = path.resolve(root, "apps/marketing/dist/client");
const destination = path.resolve(root, "apps/web/public/marketing");

// Only the generated marketing directory is replaced; product assets stay intact.
await rm(destination, { recursive: true, force: true });
await cp(prerenderedSite, destination, { recursive: true });
