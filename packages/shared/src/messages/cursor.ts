export interface MessageCursor {
  readonly createdAt: string;
  readonly id: string;
}

const CURSOR_SEPARATOR = "|";

export function encodeMessageCursor(cursor: MessageCursor): string {
  return `${encodeURIComponent(cursor.createdAt)}${CURSOR_SEPARATOR}${cursor.id}`;
}

export function parseMessageCursor(value: string): MessageCursor | null {
  const separatorIndex = value.indexOf(CURSOR_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  let createdAt: string;
  try {
    createdAt = decodeURIComponent(value.slice(0, separatorIndex));
  } catch {
    return null;
  }
  const id = value.slice(separatorIndex + 1);
  if (Number.isNaN(Date.parse(createdAt)) || !isUuid(id)) {
    return null;
  }

  return { createdAt, id };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
