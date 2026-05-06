#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import process from "node:process";

const target = ".env";
const source = ".env.example";

if (!existsSync(source)) {
  throw new Error(`${source} not found.`);
}

if (existsSync(target)) {
  process.stderr.write(`${target} already exists. Refusing to overwrite local secrets.\n`);
  process.stderr.write("Delete .env first if you intentionally want to regenerate it.\n");
  process.exit(1);
}

const values = new Map();
for (const line of readFileSync(source, "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) {
    continue;
  }

  const index = line.indexOf("=");
  values.set(line.slice(0, index), line.slice(index + 1));
}

const postgresPassword = secret();
set("POSTGRES_PASSWORD", postgresPassword);
set("DATABASE_URL", `postgres://openvoice:${postgresPassword}@postgres:5432/openvoice`);
set("SESSION_SECRET", secret());
set("CSRF_SECRET", secret());
set("PASSWORD_PEPPER", secret());
set("AUDIT_IP_HASH_SECRET", secret());
set("RATE_LIMITS_ENABLED", "false");
set("TURN_SHARED_SECRET", secret());
set("LIVEKIT_API_KEY", randomBytes(12).toString("hex"));
set("LIVEKIT_API_SECRET", secret());
set("GRAFANA_ADMIN_PASSWORD", secret());

const output = readFileSync(source, "utf8")
  .split(/\r?\n/)
  .map((line) => {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      return line;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index);
    return `${key}=${values.get(key) ?? line.slice(index + 1)}`;
  })
  .join("\n");

writeFileSync(target, output.endsWith("\n") ? output : `${output}\n`, { mode: 0o600 });
process.stdout.write(`Created ${target} with local random secrets.\n`);
process.stdout.write("Do not commit this file.\n");

function set(key, value) {
  values.set(key, value);
}

function secret() {
  return randomBytes(32).toString("base64url");
}
