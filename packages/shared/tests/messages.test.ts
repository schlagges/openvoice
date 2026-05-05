import { describe, expect, it } from "vitest";

import {
  encodeMessageCursor,
  MessageContentFormat,
  parseMessageCursor,
  sanitizeMessageContent,
} from "../src/index.js";

describe("message shared utilities", () => {
  it("encodes and parses opaque message cursors", () => {
    const cursor = {
      createdAt: "2026-05-05T00:00:00.000Z",
      id: "0180f76e-9d2d-4a9d-9d02-7eb1ffad7a02",
    };

    expect(parseMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor);
    expect(parseMessageCursor("not-a-cursor")).toBeNull();
    expect(parseMessageCursor("%|0180f76e-9d2d-4a9d-9d02-7eb1ffad7a02")).toBeNull();
  });

  it("escapes raw HTML while preserving safe markdown links", () => {
    const sanitized = sanitizeMessageContent(
      `**hi** <script>alert(1)</script> [ok](https://example.com/a?b=1)`,
      MessageContentFormat.MARKDOWN,
    );

    expect(sanitized.content).toContain("**hi**");
    expect(sanitized.content).toContain("&lt;script&gt;");
    expect(sanitized.content).toContain("[ok](https://example.com/a?b=1)");
  });

  it("drops unsafe markdown link targets and image syntax", () => {
    const sanitized = sanitizeMessageContent(
      `![alt](https://example.com/image.png) [bad](javascript:alert(1))`,
      MessageContentFormat.MARKDOWN,
    );

    expect(sanitized.content).toBe("alt bad");
  });

  it("strips markdown syntax for plain messages", () => {
    const sanitized = sanitizeMessageContent(
      "**plain** [link](https://example.com)",
      MessageContentFormat.PLAIN,
    );

    expect(sanitized.content).toBe("plain link");
  });
});
