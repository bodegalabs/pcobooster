import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const exportedSite = path.resolve(root, "apps/marketing/out");
const destination = path.resolve(root, "apps/web/public/marketing");

// Only the generated marketing directory is replaced; product assets stay intact.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(exportedSite, destination, {
  recursive: true,
  filter: (source) => source !== path.resolve(exportedSite, "marketing"),
});
// Public assets already carry the prefix in the standalone marketing app.
await cp(path.resolve(exportedSite, "marketing"), destination, {
  recursive: true,
});
