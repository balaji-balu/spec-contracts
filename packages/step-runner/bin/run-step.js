#!/usr/bin/env node
// Runs the TypeScript CLI through tsx (the runner loads pi extensions from source anyway).
import { register } from "tsx/esm/api";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

register();
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts")).href);
