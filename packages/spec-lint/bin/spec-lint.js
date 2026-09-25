#!/usr/bin/env node
// Runs the built CLI when dist/ exists, otherwise the TypeScript source through tsx.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "..", "dist", "cli.js");
if (existsSync(built)) {
  await import(pathToFileURL(built).href);
} else {
  const { register } = await import("tsx/esm/api");
  register();
  await import(pathToFileURL(join(here, "..", "src", "cli.ts")).href);
}
