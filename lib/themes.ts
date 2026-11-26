/** ธีมสำเร็จรูปที่แต่ละคู่เลือกได้ในหน้าตั้งค่า (ค่าสีจริงอยู่ใน app/globals.css → .theme-<id>; themeColor = สี status bar บนมือถือ ตรงกับ --background) */
export const THEMES = [
  { id: "rose", themeColor: "#fdf7f7", name: "ชมพูกุหลาบ", swatch: ["#fdf7f7", "#e0607e", "#f6dde3"] },
  { id: "cocoa", themeColor: "#faf6ef", name: "ครีมโกโก้", swatch: ["#faf6ef", "#c8372f", "#2a2220"] },
  { id: "sunset", themeColor: "#fff7f1", name: "ส้มซันเซ็ต", swatch: ["#fff7f1", "#ee5f2a", "#ffe1cf"] },
  { id: "lavender", themeColor: "#f9f7fd", name: "ลาเวนเดอร์", swatch: ["#f9f7fd", "#7c5cd6", "#ebe4fb"] },
  { id: "midnight", themeColor: "#16141f", name: "กลางคืน", swatch: ["#16141f", "#f08aa3", "#332b45"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
