import { describe, expect, it } from "vitest";

import { createPackageInfo, OPENVOICE_PHASE } from "../src/index.js";

describe("shared package foundation", () => {
  it("creates package metadata without product features", () => {
    expect(createPackageInfo("shared")).toEqual({
      name: "shared",
      phase: OPENVOICE_PHASE,
    });
  });
});
