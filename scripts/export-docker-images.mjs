#!/usr/bin/env node
/* global console, process */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const version = process.argv[2] ?? "0.1.0-rc1";
const output = resolve(process.argv[3] ?? `dist/openvoice-images-${version}.tar.gz`);
const apiImage = `openvoice-api:${version}`;
const webImage = `openvoice-web:${version}`;

run("docker", ["build", "--target", "api", "-t", apiImage, "."]);
run("docker", ["build", "--target", "web", "-t", webImage, "."]);

mkdirSync(dirname(output), { recursive: true });
await streamSave(output, [apiImage, webImage]);
console.log(`Exported ${apiImage} and ${webImage} to ${output}`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function streamSave(target, images) {
  return new Promise((resolveSave, rejectSave) => {
    const save = spawn("docker", ["save", ...images], { stdio: ["ignore", "pipe", "inherit"] });
    const gzip = spawn("gzip", ["-c"], { stdio: ["pipe", "pipe", "inherit"] });
    const outputStream = createWriteStream(target, { mode: 0o644 });

    save.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(outputStream);

    let failed = false;
    const fail = (error) => {
      if (failed) {
        return;
      }
      failed = true;
      save.kill();
      gzip.kill();
      rejectSave(error);
    };

    save.on("error", fail);
    gzip.on("error", fail);
    outputStream.on("error", fail);

    save.on("close", (code) => {
      if (code !== 0) {
        fail(new Error(`docker save failed with ${code}.`));
      }
    });

    gzip.on("close", (code) => {
      if (code !== 0) {
        fail(new Error(`gzip failed with ${code}.`));
      }
    });

    outputStream.on("finish", () => {
      if (!failed) {
        resolveSave();
      }
    });
  });
}
