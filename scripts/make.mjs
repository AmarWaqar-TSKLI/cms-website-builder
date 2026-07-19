#!/usr/bin/env node
/**
 * Single implementation of every build command.
 * `make <target>` (POSIX) and `.\make.cmd <target>` (Windows) both land here,
 * so there is no chance of the two drifting apart.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function say(msg) {
  console.log(`${c.cyan}${c.bold}▸${c.reset} ${msg}`);
}
function ok(msg) {
  console.log(`${c.green}✓${c.reset} ${msg}`);
}
function die(msg) {
  console.error(`${c.red}✗ ${msg}${c.reset}`);
  process.exit(1);
}

/** Run to completion, inheriting stdio. Throws (exits) on failure unless allowFail. */
function run(cmd, args, { allowFail = false, env = {}, cwd = ROOT } = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd,
    shell: isWin,
    env: { ...process.env, ...env },
  });
  if (res.status !== 0 && !allowFail) {
    die(`\`${cmd} ${args.join(" ")}\` exited ${res.status}`);
  }
  return res.status ?? 1;
}

/** Run and capture stdout, never throws. */
function capture(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, shell: isWin, encoding: "utf8" });
  return (res.stdout || "") + (res.stderr || "");
}

function spawnBg(cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    shell: isWin,
    env: { ...process.env, ...env },
  });
  return child;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) {
    copyFileSync(path.join(ROOT, ".env.example"), envPath);
    ok("created .env from .env.example");
  }
}

function ensureDeps() {
  if (!existsSync(path.join(ROOT, "node_modules"))) {
    say("installing host dependencies (first run)");
    run("npm", ["install"]);
  }
}

function dockerUp(build = false) {
  const args = ["compose", "up", "-d"];
  if (build) args.push("--build");
  run("docker", args);
}

async function waitForDb(timeoutMs = 120_000) {
  say("waiting for postgres to accept connections");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const out = capture("docker", ["compose", "exec", "-T", "db", "pg_isready", "-U", "cms", "-d", "cms"]);
    if (out.includes("accepting connections")) {
      ok("postgres ready");
      return;
    }
    await sleep(1000);
  }
  die("postgres did not become ready in time");
}

async function waitForHttp(url, timeoutMs = 180_000, label = url) {
  say(`waiting for ${label}`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) {
        ok(`${label} responding (${res.status})`);
        return;
      }
    } catch {
      /* not up yet */
    }
    await sleep(1500);
  }
  die(`${label} did not respond within ${Math.round(timeoutMs / 1000)}s`);
}

const targets = {
  help() {
    console.log(`
${c.bold}CMS Website Builder — commands${c.reset}
  ${c.cyan}demo${c.reset}     ${c.dim}everything from a clean checkout: up, migrate, seed, verify${c.reset}
  ${c.cyan}up${c.reset}       ${c.dim}docker compose up -d (db + app + worker)${c.reset}
  ${c.cyan}down${c.reset}     ${c.dim}stop the stack${c.reset}
  ${c.cyan}migrate${c.reset}  ${c.dim}prisma migrate deploy${c.reset}
  ${c.cyan}seed${c.reset}     ${c.dim}1 org/user/site, 2 pages, theme, collection + 3 products${c.reset}
  ${c.cyan}dev${c.reset}      ${c.dim}run app + worker on the host against dockerised postgres${c.reset}
  ${c.cyan}worker${c.reset}   ${c.dim}run only the build worker on the host${c.reset}
  ${c.cyan}test${c.reset}     ${c.dim}vitest unit + integration${c.reset}
  ${c.cyan}e2e${c.reset}      ${c.dim}playwright end-to-end${c.reset}
  ${c.cyan}verify${c.reset}   ${c.dim}PASS/FAIL checklist over all 10 non-negotiables${c.reset}
  ${c.cyan}reset${c.reset}    ${c.dim}destroy volumes + artifacts, rebuild from scratch${c.reset}
  ${c.cyan}logs${c.reset}     ${c.dim}tail app + worker logs${c.reset}
  ${c.cyan}clean${c.reset}    ${c.dim}remove artifacts/ and exports/${c.reset}
`);
  },

  async up() {
    ensureEnv();
    dockerUp(true);
    await waitForDb();
    ok("stack up — app on http://localhost:3000");
  },

  down() {
    run("docker", ["compose", "down"], { allowFail: true });
  },

  migrate() {
    ensureEnv();
    ensureDeps();
    run("npx", ["prisma", "migrate", "deploy"]);
    run("npx", ["prisma", "generate"]);
  },

  seed() {
    ensureEnv();
    ensureDeps();
    run("npx", ["tsx", "prisma/seed.ts"]);
  },

  async dev() {
    ensureEnv();
    ensureDeps();
    say("starting app + worker on the host (postgres stays in docker)");
    dockerUp(false);
    await waitForDb();
    run("npx", ["prisma", "migrate", "deploy"]);
    const app = spawnBg("npx", ["next", "dev", "-p", "3000"]);
    const worker = spawnBg("npx", ["tsx", "watch", "src/worker/index.ts"]);
    const stop = () => {
      app.kill();
      worker.kill();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await new Promise(() => {});
  },

  worker() {
    ensureEnv();
    ensureDeps();
    run("npx", ["tsx", "watch", "src/worker/index.ts"]);
  },

  test() {
    ensureEnv();
    ensureDeps();
    run("npx", ["vitest", "run", "tests/unit", "tests/integration"]);
  },

  e2e() {
    ensureEnv();
    ensureDeps();
    run("npx", ["playwright", "test"]);
  },

  verify() {
    ensureEnv();
    ensureDeps();
    const code = run("npx", ["tsx", "scripts/verify.ts"], { allowFail: true });
    process.exit(code);
  },

  async reset() {
    say("tearing down volumes and artifacts");
    run("docker", ["compose", "down", "-v"], { allowFail: true });
    targets.clean();
    await targets.demo();
  },

  logs() {
    run("docker", ["compose", "logs", "-f", "app", "worker"], { allowFail: true });
  },

  clean() {
    for (const dir of ["artifacts", "exports"]) {
      rmSync(path.join(ROOT, dir), { recursive: true, force: true });
    }
    ok("removed artifacts/ and exports/");
  },

  /** The one command that takes a clean checkout all the way to a verified, live system. */
  async demo() {
    console.log(`\n${c.bold}CMS Website Builder — full bring-up${c.reset}\n`);
    ensureEnv();
    ensureDeps();

    say("building images and starting db + app + worker");
    dockerUp(true);
    await waitForDb();

    say("applying migrations");
    run("npx", ["prisma", "migrate", "deploy"]);
    run("npx", ["prisma", "generate"]);

    say("seeding");
    run("npx", ["tsx", "prisma/seed.ts"]);

    await waitForHttp("http://localhost:3000/api/health", 240_000, "app");

    say("running unit + integration tests");
    run("npx", ["vitest", "run", "tests/unit", "tests/integration"]);

    say("running verification gate");
    const code = run("npx", ["tsx", "scripts/verify.ts"], { allowFail: true });
    if (code !== 0) {
      die("verification FAILED — see checklist above");
    }

    console.log(`
${c.green}${c.bold}  Live now:${c.reset}
  ${c.bold}Landing film${c.reset}   http://localhost:3000/
  ${c.bold}Walkthrough${c.reset}    http://localhost:3000/walkthrough
  ${c.bold}Dashboard${c.reset}      http://localhost:3000/dashboard
  ${c.bold}Live site${c.reset}      http://localhost:3000/s/acme-store
`);
  },
};

const target = process.argv[2] || "help";
const fn = targets[target];
if (!fn) {
  console.error(`Unknown target: ${target}`);
  targets.help();
  process.exit(1);
}
await fn();
