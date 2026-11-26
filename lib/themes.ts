/** ธีมสำเร็จรูปที่แต่ละคู่เลือกได้ในหน้าตั้งค่า (ค่าสีจริงอยู่ใน app/globals.css → .theme-<id>) */
export const THEMES = [
  { id: "rose", name: "ชมพูกุหลาบ", swatch: ["#fdf7f7", "#e0607e", "#f6dde3"] },
  { id: "cocoa", name: "ครีมโกโก้", swatch: ["#faf6ef", "#c8372f", "#2a2220"] },
  { id: "sunset", name: "ส้มซันเซ็ต", swatch: ["#fff7f1", "#ee5f2a", "#ffe1cf"] },
  { id: "lavender", name: "ลาเวนเดอร์", swatch: ["#f9f7fd", "#7c5cd6", "#ebe4fb"] },
  { id: "midnight", name: "กลางคืน", swatch: ["#16141f", "#f08aa3", "#332b45"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
