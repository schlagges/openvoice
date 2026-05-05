import { MessageContentFormat, type MessageContentFormat as ContentFormat } from "./types.js";

export const MAX_MESSAGE_CONTENT_LENGTH = 4000;

export interface SanitizedMessageContent {
  readonly content: string;
  readonly contentFormat: ContentFormat;
  readonly wasModified: boolean;
}

export function sanitizeMessageContent(
  content: string,
  contentFormat: ContentFormat,
): SanitizedMessageContent {
  const normalized = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(/\0/g, "");
  const trimmed = normalized.trim();

  if (trimmed.length === 0) {
    throw new Error("Message content is required.");
  }

  if (trimmed.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new Error(`Message content must be at most ${MAX_MESSAGE_CONTENT_LENGTH} characters.`);
  }

  const escaped = escapeText(trimmed);
  const sanitized =
    contentFormat === MessageContentFormat.MARKDOWN
      ? sanitizeMarkdownSubset(escaped)
      : stripMarkdownSyntax(escaped);

  return {
    content: sanitized,
    contentFormat,
    wasModified: sanitized !== content,
  };
}

function sanitizeMarkdownSubset(content: string): string {
  const withoutImages = content.replace(
    /!\[([^\]\n]{0,120})\]\(([^()\s]+(?:\([^)\s]*\)[^()\s]*)*)\)/g,
    "$1",
  );

  return withoutImages.replace(
    /\[([^\]\n]{1,120})\]\(([^()\s]+(?:\([^)\s]*\)[^()\s]*)*)\)/g,
    (match, label, url) => {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) {
        return label;
      }

      return `[${label}](${safeUrl})`;
    },
  );
}

function stripMarkdownSyntax(content: string): string {
  return content
    .replace(/```([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/\[([^\]\n]{1,120})\]\(([^)\s]+)\)/g, "$1")
    .replace(/!\[([^\]\n]{0,120})\]\(([^)\s]+)\)/g, "$1");
}

function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    return escapeText(parsed.toString());
  } catch {
    return null;
  }
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
