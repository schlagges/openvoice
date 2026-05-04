import { describe, expect, it } from "vitest";

import { Argon2idPasswordHasher } from "../src/security/password.js";

describe("Argon2idPasswordHasher", () => {
  it("hashes passwords with Argon2id and verifies them with the configured pepper", async () => {
    const hasher = new Argon2idPasswordHasher("test-pepper");
    const hash = await hasher.hashPassword("correct horse battery staple");

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse battery staple");
    await expect(hasher.verifyPassword(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(hasher.verifyPassword(hash, "wrong horse battery staple")).resolves.toBe(false);
  });
});
