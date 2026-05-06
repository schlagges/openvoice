import { describe, expect, it } from "vitest";

import { getApiRuntimeInfo } from "../src/index.js";
import { toOutgoingHeaders } from "../src/server.js";

describe("api runtime foundation", () => {
  it("exposes phase runtime metadata", () => {
    expect(getApiRuntimeInfo()).toEqual({
      app: "api",
      phase: 9,
    });
  });

  it("preserves multiple set-cookie headers for Node responses", () => {
    const headers = new Headers({ location: "/" });
    headers.append("set-cookie", "openvoice_session=one; Path=/; HttpOnly");
    headers.append("set-cookie", "openvoice_csrf=two; Path=/");

    expect(toOutgoingHeaders(headers)).toMatchObject({
      location: "/",
      "set-cookie": ["openvoice_session=one; Path=/; HttpOnly", "openvoice_csrf=two; Path=/"],
    });
  });
});
