/**
 * RFC 4122 v4 UUIDs from crypto.getRandomValues. crypto.randomUUID() only exists in secure
 * contexts, and phones on a LAN usually load the game over plain http://192.168.x.x.
 */
export function uuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** One ID per page load, kept across transport reconnects (see the spec's takeover rules). */
export const CLIENT_INSTANCE_ID = uuid();
