import { describe, expect, it } from "vitest";

import { getApiRuntimeInfo } from "../src/index.js";

describe("api runtime foundation", () => {
  it("exposes phase 0 runtime metadata", () => {
    expect(getApiRuntimeInfo()).toEqual({
      app: "api",
      phase: 0,
    });
  });
});
