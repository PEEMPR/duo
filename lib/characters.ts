/** ตัวละครที่ผู้ใช้เลือกเป็นตัวแทนของตัวเอง (รูปอยู่ที่ public/characters/<id>.svg|png) */
export const CHARACTERS = [
  { id: "dog", name: "หมาขาว", emoji: "🐶" },
  { id: "cat", name: "แมวดำ", emoji: "🐈‍⬛" },
  { id: "hamster", name: "แฮมสเตอร์", emoji: "🐹" },
  { id: "dragon", name: "เบียร์ดดราก้อน", emoji: "🦎" },
  { id: "snake", name: "งูคอรอล", emoji: "🐍" },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]["id"];

export const isCharacterId = (v: unknown): v is CharacterId => CHARACTERS.some((c) => c.id === v);

export function characterOf(id: string | null | undefined) {
  return CHARACTERS.find((c) => c.id === id) ?? null;
}
