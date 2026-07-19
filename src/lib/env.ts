import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader for the processes Next doesn't boot for us: the worker,
 * the seed script, the verifier and the test suite. Existing environment
 * variables always win, so docker-compose's settings are never clobbered.
 */
export function loadEnv(file = ".env") {
  const p = path.resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
