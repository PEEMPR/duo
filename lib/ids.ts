export function newId(): string {
  return crypto.randomUUID();
}

/** โค้ดเชิญ 8 ตัว ไม่มีตัวที่สับสนง่าย (0/O, 1/I) */
export function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
