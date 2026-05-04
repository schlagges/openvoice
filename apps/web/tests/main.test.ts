import { describe, expect, it } from "vitest";

import { formatWebTitle } from "../src/main";

describe("web foundation", () => {
  it("formats the phase title", () => {
    expect(formatWebTitle(0)).toBe("OpenVoice Phase 0");
  });
});
