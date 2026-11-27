import type { ReactNode } from "react";

/* Types mirror lib/core/pet.ts (PetMood / PetPose); declared here so the sprite has no server-side dependency. */
import type { PetMood, PetPose } from "@/lib/core/pet";
export type { PetMood, PetPose };
type Cid = "dog" | "cat" | "hamster" | "dragon" | "snake";
type XY = [number, number];

type Spec = {
  eyes: [XY, XY];
  s: number; // eye glyph scale
  ink: string; // eye glyph colour
  pupil?: string;
  ball?: boolean; // white eyeball behind dot-style eyes (dragon)
  brow: string;
  mouth: XY; // anchor under nose
  k: number; // mouth scale
  line: string; // mouth line colour
  cheeks: [XY, XY];
  cheek: { rx: number; ry: number; fill: string; op: number };
  top: XY; // where z / hearts float
  shadow: [number, number]; // cy, rx
};

const SPEC: Record<Cid, Spec> = {
  dog: { eyes: [[95, 100], [145, 100]], s: 1.2, ink: "#1d1b1f", brow: "#6b6470", mouth: [120, 128], k: 1, line: "#1d1b1f", cheeks: [[80, 122], [160, 122]], cheek: { rx: 9, ry: 5, fill: "#f6b0bc", op: 0.45 }, top: [180, 40], shadow: [226, 70] },
  cat: { eyes: [[92, 107], [148, 107]], s: 1.6, ink: "#f6c42f", pupil: "#0d0c10", brow: "#9a93a6", mouth: [120, 134], k: 1, line: "#9a93a6", cheeks: [[74, 128], [166, 128]], cheek: { rx: 9, ry: 5, fill: "#f2a0b0", op: 0.35 }, top: [188, 36], shadow: [222, 70] },
  hamster: { eyes: [[96, 100], [144, 100]], s: 1.35, ink: "#1b1716", brow: "#7a4e3a", mouth: [120, 126], k: 0.9, line: "#7a4e3a", cheeks: [[74, 134], [166, 134]], cheek: { rx: 11, ry: 6, fill: "#f5a3ad", op: 0.55 }, top: [182, 46], shadow: [222, 64] },
  dragon: { eyes: [[90, 107], [150, 107]], s: 1.5, ink: "#a83214", pupil: "#1b1410", ball: true, brow: "#7a3f1c", mouth: [120, 141], k: 1.8, line: "#7a3f1c", cheeks: [[70, 130], [170, 130]], cheek: { rx: 9, ry: 5, fill: "#f19a7e", op: 0.45 }, top: [186, 50], shadow: [222, 74] },
  snake: { eyes: [[98, 86], [142, 86]], s: 1.4, ink: "#2a1a1f", brow: "#a8384f", mouth: [120, 109], k: 1, line: "#a8384f", cheeks: [[80, 102], [160, 102]], cheek: { rx: 9, ry: 5, fill: "#ff5f7a", op: 0.35 }, top: [172, 44], shadow: [222, 76] },
};

const HEART = "M0 7 C-12 -1 -8 -9 -3.5 -8 C-1.5 -7.5 0 -5.5 0 -4.5 C0 -5.5 1.5 -7.5 3.5 -8 C8 -9 12 -1 0 7 Z";
const SPARK = "M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z";
const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

/* ---------- bodies (no face) ---------- */

function DogBody() {
  return (
    <>
<path d="M199.9 158.5 C207.8 154.3 217.1 161.6 218.2 171.0 C211.7 168.3 205.5 169.9 202.3 169.7 C209.9 172.9 208.6 183.8 203.9 189.9 C199.5 183.9 194.4 180.5 192.4 178.0 C195.0 187.6 183.9 195.4 176.3 196.0 C177.2 187.7 176.8 180.7 177.7 177.3 C172.8 183.8 161.4 180.9 157.6 178.7 C162.5 173.0 166.5 169.3 169.2 168.1 C159.6 168.6 154.6 157.9 156.8 154.6 C163.5 154.1 170.3 155.6 173.4 157.3 C167.6 150.5 174.0 140.3 180.8 138.4 C183.0 144.2 186.4 149.8 187.1 153.0 C188.7 145.2 200.7 143.4 206.5 148.2 C203.5 151.1 201.8 156.3 199.9 158.5 L186.0 166.0Z" fill="#e3d8cc" stroke="#e3d8cc" strokeWidth="5" strokeLinejoin="round"/><path d="M199.9 158.5 C207.8 154.3 217.1 161.6 218.2 171.0 C211.7 168.3 205.5 169.9 202.3 169.7 C209.9 172.9 208.6 183.8 203.9 189.9 C199.5 183.9 194.4 180.5 192.4 178.0 C195.0 187.6 183.9 195.4 176.3 196.0 C177.2 187.7 176.8 180.7 177.7 177.3 C172.8 183.8 161.4 180.9 157.6 178.7 C162.5 173.0 166.5 169.3 169.2 168.1 C159.6 168.6 154.6 157.9 156.8 154.6 C163.5 154.1 170.3 155.6 173.4 157.3 C167.6 150.5 174.0 140.3 180.8 138.4 C183.0 144.2 186.4 149.8 187.1 153.0 C188.7 145.2 200.7 143.4 206.5 148.2 C203.5 151.1 201.8 156.3 199.9 158.5 L186.0 166.0Z" fill="#ffffff"/><path d="M120.0 145.0 C121.4 135.6 135.7 130.8 143.5 133.9 C142.6 138.5 144.1 145.1 143.9 148.5 C149.7 139.4 165.2 139.0 171.8 147.8 C167.4 148.5 165.0 155.3 163.0 158.2 C171.6 152.8 184.2 157.7 188.1 169.6 C181.7 166.1 176.6 170.6 173.6 172.2 C184.4 170.8 192.8 180.0 193.2 193.9 C185.1 186.1 177.5 187.8 173.6 187.8 C183.8 191.2 185.7 203.0 182.5 215.5 C174.9 205.2 166.7 203.4 163.0 201.8 C168.9 208.0 163.2 218.6 157.3 225.7 C152.7 217.5 146.4 214.0 143.9 211.5 C146.3 219.6 135.4 227.8 127.8 230.1 C125.7 223.4 121.3 218.0 120.0 215.0 C118.5 226.6 103.5 233.0 95.1 235.1 C96.6 223.6 95.6 215.4 96.1 211.5 C90.7 219.6 76.0 219.6 69.5 221.2 C73.4 210.7 75.2 204.5 77.0 201.8 C68.8 206.9 56.5 201.9 52.8 203.4 C58.8 193.7 63.5 189.4 66.4 187.8 C54.2 189.5 44.6 180.0 44.1 182.8 C53.4 173.7 62.1 172.2 66.4 172.2 C56.7 168.9 55.2 157.5 58.4 158.3 C65.6 155.1 73.4 156.7 77.0 158.2 C68.9 150.1 73.7 137.5 79.9 137.8 C85.8 140.0 93.3 145.3 96.1 148.5 C93.0 138.8 104.0 129.3 111.8 128.3 C114.1 134.9 118.7 141.5 120.0 145.0 L120.0 180.0Z" fill="#e3d8cc" stroke="#e3d8cc" strokeWidth="5" strokeLinejoin="round"/><path d="M120.0 145.0 C121.4 135.6 135.7 130.8 143.5 133.9 C142.6 138.5 144.1 145.1 143.9 148.5 C149.7 139.4 165.2 139.0 171.8 147.8 C167.4 148.5 165.0 155.3 163.0 158.2 C171.6 152.8 184.2 157.7 188.1 169.6 C181.7 166.1 176.6 170.6 173.6 172.2 C184.4 170.8 192.8 180.0 193.2 193.9 C185.1 186.1 177.5 187.8 173.6 187.8 C183.8 191.2 185.7 203.0 182.5 215.5 C174.9 205.2 166.7 203.4 163.0 201.8 C168.9 208.0 163.2 218.6 157.3 225.7 C152.7 217.5 146.4 214.0 143.9 211.5 C146.3 219.6 135.4 227.8 127.8 230.1 C125.7 223.4 121.3 218.0 120.0 215.0 C118.5 226.6 103.5 233.0 95.1 235.1 C96.6 223.6 95.6 215.4 96.1 211.5 C90.7 219.6 76.0 219.6 69.5 221.2 C73.4 210.7 75.2 204.5 77.0 201.8 C68.8 206.9 56.5 201.9 52.8 203.4 C58.8 193.7 63.5 189.4 66.4 187.8 C54.2 189.5 44.6 180.0 44.1 182.8 C53.4 173.7 62.1 172.2 66.4 172.2 C56.7 168.9 55.2 157.5 58.4 158.3 C65.6 155.1 73.4 156.7 77.0 158.2 C68.9 150.1 73.7 137.5 79.9 137.8 C85.8 140.0 93.3 145.3 96.1 148.5 C93.0 138.8 104.0 129.3 111.8 128.3 C114.1 134.9 118.7 141.5 120.0 145.0 L120.0 180.0Z" fill="#ffffff"/><path d="M79.0 212.0 C75.3 211.7 73.5 210.0 74.0 208.0 C76.3 208.4 79.8 207.1 81.5 207.9 C78.7 205.4 78.7 202.9 80.8 201.4 C82.6 203.1 87.0 203.8 88.0 205.3 C87.3 201.5 89.0 199.0 92.0 198.6 C92.5 201.0 96.1 203.5 96.0 205.3 C97.7 201.9 100.5 200.7 103.1 201.5 C102.3 203.5 103.7 206.6 102.5 207.9 C105.9 206.0 108.7 206.2 110.1 208.0 C108.1 209.0 106.7 211.7 105.0 212.0 L92.0 212.0Z" fill="#e3d8cc" transform="translate(0 3)"/><path d="M79.0 212.0 C75.3 211.7 73.5 210.0 74.0 208.0 C76.3 208.4 79.8 207.1 81.5 207.9 C78.7 205.4 78.7 202.9 80.8 201.4 C82.6 203.1 87.0 203.8 88.0 205.3 C87.3 201.5 89.0 199.0 92.0 198.6 C92.5 201.0 96.1 203.5 96.0 205.3 C97.7 201.9 100.5 200.7 103.1 201.5 C102.3 203.5 103.7 206.6 102.5 207.9 C105.9 206.0 108.7 206.2 110.1 208.0 C108.1 209.0 106.7 211.7 105.0 212.0 L92.0 212.0Z" fill="#ffffff"/><path d="M135.0 212.0 C131.3 211.7 129.5 210.0 130.0 208.0 C132.3 208.4 135.8 207.1 137.5 207.9 C134.7 205.4 134.6 202.9 136.7 201.4 C138.5 203.0 143.0 203.7 144.0 205.3 C143.3 201.6 145.0 199.3 148.0 198.8 C148.5 201.2 152.1 203.6 152.0 205.3 C153.6 202.1 156.4 200.9 159.0 201.8 C158.1 203.7 159.6 206.7 158.5 207.9 C161.6 206.1 164.3 206.4 165.6 208.1 C163.8 209.1 162.7 211.7 161.0 212.0 L148.0 212.0Z" fill="#e3d8cc" transform="translate(0 3)"/><path d="M135.0 212.0 C131.3 211.7 129.5 210.0 130.0 208.0 C132.3 208.4 135.8 207.1 137.5 207.9 C134.7 205.4 134.6 202.9 136.7 201.4 C138.5 203.0 143.0 203.7 144.0 205.3 C143.3 201.6 145.0 199.3 148.0 198.8 C148.5 201.2 152.1 203.6 152.0 205.3 C153.6 202.1 156.4 200.9 159.0 201.8 C158.1 203.7 159.6 206.7 158.5 207.9 C161.6 206.1 164.3 206.4 165.6 208.1 C163.8 209.1 162.7 211.7 161.0 212.0 L148.0 212.0Z" fill="#ffffff"/><path d="M84 196 q3.6 -0.2 6 8" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M102 204 q3.5 0.6 4 9" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M138 204 q1.9 3.0 -4 9" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M156 196 q1.2 3.4 -6 8" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M70 110 q0.4 3.3 -7 6" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M170 110 q3.2 -0.9 7 6" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M66 84 Q62 50 72 22 Q94 42 108 64 Z" fill="#e3d8cc" stroke="#e3d8cc" strokeWidth="5" strokeLinejoin="round"/><path d="M66 84 Q62 50 72 22 Q94 42 108 64 Z" fill="#ffffff"/><path d="M174 84 Q178 50 168 22 Q146 42 132 64 Z" fill="#e3d8cc" stroke="#e3d8cc" strokeWidth="5" strokeLinejoin="round"/><path d="M174 84 Q178 50 168 22 Q146 42 132 64 Z" fill="#ffffff"/><path d="M77 66 Q75 50 78 36 Q90 50 97 60 Z" fill="#f6c3cb"/><path d="M163 66 Q165 50 162 36 Q150 50 143 60 Z" fill="#f6c3cb"/><path d="M120.0 57.0 C121.6 46.2 137.9 41.0 146.9 45.4 C145.6 50.6 146.9 58.8 146.5 62.6 C153.2 53.3 170.2 55.3 177.4 66.8 C172.2 67.1 169.2 75.0 166.9 78.2 C177.3 72.9 191.1 81.9 194.8 97.8 C186.8 93.0 180.2 98.4 176.6 100.1 C188.7 100.1 196.4 114.3 195.7 131.5 C186.6 122.0 177.5 123.6 173.3 123.4 C183.2 128.7 182.3 144.5 177.4 157.8 C170.0 147.0 161.4 144.7 157.8 142.7 C164.4 152.6 155.7 167.0 147.6 174.5 C142.9 163.5 136.0 157.1 133.6 153.6 C134.2 162.2 120.0 169.1 111.3 170.1 C110.5 163.0 107.0 156.8 106.4 153.6 C102.3 163.1 85.6 164.4 77.5 165.2 C80.5 153.9 81.0 146.1 82.2 142.7 C73.0 150.7 56.6 145.2 50.9 146.5 C58.1 133.0 63.5 126.0 66.7 123.4 C55.9 125.9 45.4 114.1 44.0 114.1 C52.1 104.6 59.6 100.9 63.4 100.1 C51.9 97.2 48.2 81.6 51.2 81.5 C59.8 76.4 69.0 77.0 73.1 78.2 C66.7 72.0 72.5 58.4 78.9 56.7 C83.9 57.6 90.8 60.4 93.5 62.6 C90.2 52.9 102.3 42.0 111.0 40.6 C113.5 47.0 118.5 53.5 120.0 57.0 L120.0 106.0Z" fill="#e3d8cc" stroke="#e3d8cc" strokeWidth="5" strokeLinejoin="round"/><path d="M120.0 57.0 C121.6 46.2 137.9 41.0 146.9 45.4 C145.6 50.6 146.9 58.8 146.5 62.6 C153.2 53.3 170.2 55.3 177.4 66.8 C172.2 67.1 169.2 75.0 166.9 78.2 C177.3 72.9 191.1 81.9 194.8 97.8 C186.8 93.0 180.2 98.4 176.6 100.1 C188.7 100.1 196.4 114.3 195.7 131.5 C186.6 122.0 177.5 123.6 173.3 123.4 C183.2 128.7 182.3 144.5 177.4 157.8 C170.0 147.0 161.4 144.7 157.8 142.7 C164.4 152.6 155.7 167.0 147.6 174.5 C142.9 163.5 136.0 157.1 133.6 153.6 C134.2 162.2 120.0 169.1 111.3 170.1 C110.5 163.0 107.0 156.8 106.4 153.6 C102.3 163.1 85.6 164.4 77.5 165.2 C80.5 153.9 81.0 146.1 82.2 142.7 C73.0 150.7 56.6 145.2 50.9 146.5 C58.1 133.0 63.5 126.0 66.7 123.4 C55.9 125.9 45.4 114.1 44.0 114.1 C52.1 104.6 59.6 100.9 63.4 100.1 C51.9 97.2 48.2 81.6 51.2 81.5 C59.8 76.4 69.0 77.0 73.1 78.2 C66.7 72.0 72.5 58.4 78.9 56.7 C83.9 57.6 90.8 60.4 93.5 62.6 C90.2 52.9 102.3 42.0 111.0 40.6 C113.5 47.0 118.5 53.5 120.0 57.0 L120.0 106.0Z" fill="#ffffff"/><path d="M105.9 60.9 C97.4 57.2 94.4 51.0 96.5 47.6 C102.2 51.6 109.1 54.2 111.4 56.6 C106.8 49.0 108.5 42.1 112.6 40.2 C114.9 46.4 119.4 51.8 120.0 55.0 C120.7 46.8 126.0 42.1 130.4 42.4 C129.0 48.1 129.8 54.0 128.6 56.6 C135.3 48.3 144.0 45.9 147.8 48.6 C141.7 53.5 137.3 59.3 134.1 60.9 L120.0 64.0Z" fill="#ffffff"/><path d="M92 70 q-2.7 -0.5 -3 -7" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/><path d="M148 70 q-1.5 -2.3 3 -7" fill="none" stroke="#ebe2d8" strokeWidth="2.4" strokeLinecap="round"/>
    </>
  );
}

function CatBody() {
  return (
    <>
      <path d="M166 200 C214 202 222 160 198 146" stroke="#25222c" strokeWidth="15" fill="none" strokeLinecap="round" />
      <ellipse cx="120" cy="178" rx="56" ry="44" fill="#25222c" />
      <ellipse cx="96" cy="214" rx="17" ry="10" fill="#2f2b37" />
      <ellipse cx="144" cy="214" rx="17" ry="10" fill="#2f2b37" />
      <path d="M58 92 L54 30 L106 62 Z" fill="#25222c" stroke="#25222c" strokeWidth="8" strokeLinejoin="round" />
      <path d="M182 92 L186 30 L134 62 Z" fill="#25222c" stroke="#25222c" strokeWidth="8" strokeLinejoin="round" />
      <path d="M66 76 L64 44 L92 62 Z" fill="#f2a0b0" stroke="#f2a0b0" strokeWidth="4" strokeLinejoin="round" />
      <path d="M174 76 L176 44 L148 62 Z" fill="#f2a0b0" stroke="#f2a0b0" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="120" cy="110" rx="72" ry="58" fill="#25222c" />
    </>
  );
}

function HamsterBody() {
  return (
    <>
      <circle cx="76" cy="58" r="20" fill="#e9a45c" />
      <circle cx="164" cy="58" r="20" fill="#e9a45c" />
      <circle cx="76" cy="60" r="11" fill="#f5b5bd" />
      <circle cx="164" cy="60" r="11" fill="#f5b5bd" />
      <path d="M120 44 C186 44 200 112 196 160 C192 206 160 220 120 220 C80 220 48 206 44 160 C40 112 54 44 120 44 Z" fill="#efab62" />
      <path d="M120 112 C168 112 176 150 172 178 C168 208 150 216 120 216 C90 216 72 208 68 178 C64 150 72 112 120 112 Z" fill="#fff3df" />
      <ellipse cx="78" cy="130" rx="28" ry="24" fill="#fff3df" />
      <ellipse cx="162" cy="130" rx="28" ry="24" fill="#fff3df" />
      <ellipse cx="120" cy="160" rx="13" ry="17" fill="#c98a3c" />
      <path d="M120 145 L120 175" stroke="#a96f2b" strokeWidth="2" />
      <ellipse cx="104" cy="160" rx="9" ry="7" fill="#f6c0c6" />
      <ellipse cx="136" cy="160" rx="9" ry="7" fill="#f6c0c6" />
      <ellipse cx="96" cy="214" rx="13" ry="7" fill="#f6c0c6" />
      <ellipse cx="144" cy="214" rx="13" ry="7" fill="#f6c0c6" />
    </>
  );
}

function DragonBody() {
  return (
    <>
      <path d="M162 196 C214 200 226 168 210 150 C204 144 196 150 200 158 C206 172 190 184 160 182 Z" fill="#d94e1f" />
      <ellipse cx="120" cy="180" rx="54" ry="40" fill="#ee5f2a" />
      <ellipse cx="120" cy="188" rx="34" ry="28" fill="#ffc29c" />
      <path d="M96 190 l-4 6 M120 196 l0 6 M144 190 l4 6" stroke="#f7a27a" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="88" cy="214" rx="18" ry="9" fill="#d94e1f" />
      <ellipse cx="152" cy="214" rx="18" ry="9" fill="#d94e1f" />
      <path d="M74 216 l-4 4 M82 218 l-1 5 M158 218 l1 5 M166 216 l4 4" stroke="#2b2422" strokeWidth="3" strokeLinecap="round" />
      <g fill="#2b2422">
        <path d="M52 132 L36 140 L52 146 Z" />
        <path d="M56 148 L42 160 L60 160 Z" />
        <path d="M66 160 L58 176 L76 168 Z" />
        <path d="M188 132 L204 140 L188 146 Z" />
        <path d="M184 148 L198 160 L180 160 Z" />
        <path d="M174 160 L182 176 L164 168 Z" />
        <path d="M84 168 L80 184 L96 174 Z" />
        <path d="M104 172 L104 188 L116 176 Z" />
        <path d="M136 172 L136 188 L124 176 Z" />
        <path d="M156 168 L160 184 L144 174 Z" />
      </g>
      <path d="M120 50 C176 50 196 84 194 118 C192 152 160 170 120 170 C80 170 48 152 46 118 C44 84 64 50 120 50 Z" fill="#f26b30" />
      <g fill="#c9421a">
        <path d="M70 66 L60 50 L80 58 Z" />
        <path d="M170 66 L180 50 L160 58 Z" />
        <path d="M52 92 L38 86 L50 102 Z" />
        <path d="M188 92 L202 86 L190 102 Z" />
      </g>
      <path d="M120 58 C150 58 164 70 168 84 C150 76 90 76 72 84 C76 70 90 58 120 58 Z" fill="#e2582a" opacity=".7" />
    </>
  );
}

const SNAKE_PINK = "#ff8f9e";
const SNAKE_CREAM = "#fff4f2";

function SnakeCoils() {
  return (
    <g fill="none">
      <path d="M176 206 C204 206 212 194 206 180" stroke={SNAKE_PINK} strokeWidth="13" strokeLinecap="round" />
      <ellipse cx="120" cy="196" rx="62" ry="17" stroke={SNAKE_PINK} strokeWidth="28" />
      <ellipse cx="120" cy="196" rx="62" ry="17" stroke={SNAKE_CREAM} strokeWidth="28" strokeDasharray="9 27" />
      <ellipse cx="120" cy="164" rx="44" ry="13" stroke={SNAKE_PINK} strokeWidth="26" />
      <ellipse cx="120" cy="164" rx="44" ry="13" stroke={SNAKE_CREAM} strokeWidth="26" strokeDasharray="8 24" strokeDashoffset="14" />
    </g>
  );
}

function SnakeNeck() {
  return (
    <g fill="none">
      <path d="M150 160 C156 142 134 132 124 116" stroke={SNAKE_PINK} strokeWidth="24" strokeLinecap="round" />
      <path d="M150 160 C156 142 134 132 124 116" stroke={SNAKE_CREAM} strokeWidth="24" strokeDasharray="7 20" strokeDashoffset="2" />
    </g>
  );
}

function SnakeHead() {
  return (
    <>
      <ellipse cx="120" cy="88" rx="52" ry="40" fill={SNAKE_PINK} />
      <ellipse cx="120" cy="70" rx="26" ry="9" fill="#ffb3be" opacity=".7" />
    </>
  );
}

/* ---------- face parts ---------- */

function Heart({ x, y, k = 1, fill = "#ff6b95", op = 1 }: { x: number; y: number; k?: number; fill?: string; op?: number }) {
  return <path d={HEART} fill={fill} opacity={op} transform={`translate(${x} ${y}) scale(${k})`} />;
}

function Zed({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <path d="M0 0 H9 L0 11 H9" fill="none" stroke="#7d8fd6" strokeWidth={2.8 / k} {...round} transform={`translate(${x} ${y}) scale(${k})`} />
  );
}

type EyeKind = "happy" | "closed" | "love" | "sleepy" | "sad" | "wide";

function Eye({ id, kind, at, side }: { id: Cid; kind: EyeKind; at: XY; side: -1 | 1 }) {
  const sp = SPEC[id];
  const [x, y] = at;
  const dot = kind === "sad" || kind === "wide";
  const ball = sp.ball && (dot || kind === "happy");
  let g: ReactNode = null;

  if (kind === "happy") {
    if (id === "dog") g = <path d="M-7 2 Q0 -4 7 2" stroke={sp.ink} strokeWidth="4.2" fill="none" {...round} />;
    else if (id === "cat") {
      return (
        <>
          <ellipse cx={x} cy={y - 1} rx="18" ry="19" fill="#f6c42f" />
          <circle cx={x} cy={y} r="9.5" fill="#0d0c10" />
          <circle cx={x + 4} cy={y - 5} r="4" fill="#fff" />
        </>
      );
    } else if (id === "dragon") {
      return (
        <>
          <circle cx={x} cy={y - 1} r="15" fill="#fff" />
          <circle cx={x + side * -0} cy={y} r="10" fill="#a83214" />
          <circle cx={x} cy={y} r="5.5" fill="#1b1410" />
          <circle cx={x + 3} cy={y - 4} r="3" fill="#fff" />
        </>
      );
    } else if (id === "hamster") {
      return (
        <>
          <circle cx={x} cy={y} r="9" fill="#1b1716" />
          <circle cx={x + 3} cy={y - 3} r="3.2" fill="#fff" />
        </>
      );
    } else {
      return (
        <>
          <circle cx={x} cy={y} r="13" fill="#2a1a1f" />
          <circle cx={x + 4} cy={y - 5} r="4.5" fill="#fff" />
          <circle cx={x - 3} cy={y + 5} r="2" fill="#fff" opacity=".8" />
        </>
      );
    }
  } else if (kind === "closed") {
    g = <path d="M-7 -1 Q0 6 7 -1" stroke={sp.ink === "#a83214" ? "#7a3f1c" : sp.ink} strokeWidth="2.6" fill="none" {...round} />;
  } else if (kind === "love") {
    g = (
      <>
        <path d={HEART} fill="#ff4f86" transform="scale(1.15)" />
        <circle cx="-3.4" cy="-4" r="1.6" fill="#fff" opacity=".9" />
      </>
    );
  } else if (kind === "sleepy") {
    const c = sp.ink === "#a83214" ? "#7a3f1c" : sp.ink;
    g = (
      <>
        <path d="M-7 0 A7 7 0 0 0 7 0 Z" fill={c} />
        <path d="M-8 0 H8" stroke={c} strokeWidth="2.4" {...round} />
      </>
    );
  } else if (kind === "sad") {
    g = (
      <>
        <circle r="7" fill={sp.ink} />
        {sp.pupil && <circle r="4" fill={sp.pupil} />}
        <circle cx="-2.2" cy="-2.6" r="2.4" fill="#fff" />
        <circle cx="2.6" cy="2.6" r="1.2" fill="#fff" opacity=".85" />
        <path d="M-6 -15 L9 -10" stroke={sp.brow} strokeWidth="2.2" {...round} transform={`scale(${side} 1)`} fill="none" />
      </>
    );
  } else {
    g = (
      <>
        <circle r="8.6" fill={sp.ink} />
        {sp.pupil && <circle r="5.6" fill={sp.pupil} />}
        <circle cx="-2.6" cy="-3" r="3.1" fill="#fff" />
        <circle cx="3" cy="3" r="1.5" fill="#fff" opacity=".9" />
        <path d={SPARK} fill="#ffd54a" transform={`translate(${side * 10} -11) scale(.9)`} />
      </>
    );
  }
  return (
    <>
      {ball && dot && <circle cx={x} cy={y - 1} r="15" fill="#fff" />}
      <g transform={`translate(${x} ${y}) scale(${sp.s})`}>{g}</g>
    </>
  );
}

type MouthKind = "happy" | "smile" | "tiny" | "o" | "frown" | "open";

function Mouth({ id, kind }: { id: Cid; kind: MouthKind }) {
  const sp = SPEC[id];
  const [x, y] = sp.mouth;
  if (kind === "happy") {
    if (id === "dog")
      return (
        <>
          <path d="M120 125 Q114 134 106 130 M120 125 Q126 134 134 130" stroke="#1d1b1f" strokeWidth="3" fill="none" {...round} />
          <path d="M112 132 Q112 150 120 150 Q128 150 128 132 Q120 136 112 132 Z" fill="#f08a9c" />
          <path d="M120 135 L120 146" stroke="#d96a7e" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    if (id === "cat")
      return <path d="M120 132 Q118 140 110 139 M120 132 Q122 140 130 139" stroke="#6b6474" strokeWidth="2.5" fill="none" strokeLinecap="round" />;
    if (id === "hamster")
      return (
        <>
          <path d="M120 120 Q116 127 110 124 M120 120 Q124 127 130 124" stroke="#7a4e3a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M116 124 h8 v6 q-4 2 -8 0 z" fill="#fff" stroke="#e8d6c2" strokeWidth="1" />
        </>
      );
    if (id === "dragon") return <path d="M86 136 Q120 154 154 136" stroke="#7a3f1c" strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    return (
      <>
        <path d="M110 107 Q120 113 130 107" stroke="#a8384f" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M120 111 L120 124 M120 124 L114 130 M120 124 L126 130" stroke="#e23b4e" strokeWidth="3" fill="none" {...round} />
      </>
    );
  }
  const t = `translate(${x} ${y}) scale(${sp.k})`;
  const w = 2.4 / sp.k;
  if (kind === "smile") return <path d="M-7 0 Q0 8 7 0" stroke={sp.line} strokeWidth={w * 1.1} fill="none" {...round} transform={t} />;
  if (kind === "tiny") return <path d="M-5 1 Q0 5 5 1" stroke={sp.line} strokeWidth={w} fill="none" {...round} transform={t} />;
  if (kind === "o") return <ellipse rx="2.8" ry="3.4" cy="3" fill="none" stroke={sp.line} strokeWidth={w} transform={t} />;
  if (kind === "frown") return <path d="M-6 5 Q0 -2 6 5" stroke={sp.line} strokeWidth={w * 1.1} fill="none" {...round} transform={t} />;
  return (
    <g transform={t}>
      <path d="M-8.5 -1 Q0 15 8.5 -1 Q0 2 -8.5 -1 Z" fill="#c93d5c" {...round} stroke="#c93d5c" strokeWidth="1.2" />
      <path d="M-4.6 5.2 Q0 1.8 4.6 5.2 Q0 10.6 -4.6 5.2 Z" fill="#ff9fb2" />
    </g>
  );
}

function Nose({ id }: { id: Cid }) {
  if (id === "dog")
    return (
      <>
        <ellipse cx="120" cy="118" rx="10" ry="7" fill="#1d1b1f" />
        <circle cx="117" cy="116" r="2.2" fill="#fff" opacity=".7" />
      </>
    );
  if (id === "cat") return <path d="M113 124 Q120 120 127 124 Q124 131 120 132 Q116 131 113 124 Z" fill="#f2a0b0" />;
  if (id === "hamster") return <ellipse cx="120" cy="116" rx="6" ry="4.5" fill="#e77f8e" />;
  if (id === "dragon")
    return (
      <>
        <circle cx="112" cy="124" r="2.2" fill="#7a3f1c" />
        <circle cx="128" cy="124" r="2.2" fill="#7a3f1c" />
      </>
    );
  return (
    <>
      <circle cx="114" cy="99" r="1.6" fill="#a8384f" />
      <circle cx="126" cy="99" r="1.6" fill="#a8384f" />
    </>
  );
}

function Face({ id, mood, pose }: { id: Cid; mood: PetMood; pose: PetPose }) {
  const sp = SPEC[id];
  let ek: EyeKind;
  let mk: MouthKind;
  if (pose !== "stand") {
    ek = "closed";
    mk = "tiny";
  } else if (mood === "love") {
    ek = "love";
    mk = "smile";
  } else if (mood === "sleepy") {
    ek = "sleepy";
    mk = "o";
  } else if (mood === "sad") {
    ek = "sad";
    mk = "frown";
  } else if (mood === "excited") {
    ek = "wide";
    mk = "open";
  } else {
    ek = "happy";
    mk = "happy";
  }
  const strong = pose === "stand" && mood === "love";
  const c = sp.cheek;
  return (
    <>
      <Eye id={id} kind={ek} at={sp.eyes[0]} side={-1} />
      <Eye id={id} kind={ek} at={sp.eyes[1]} side={1} />
      <Nose id={id} />
      <Mouth id={id} kind={mk} />
      {sp.cheeks.map(([cx, cy], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={strong ? c.rx * 1.2 : c.rx} ry={strong ? c.ry * 1.2 : c.ry} fill={strong ? "#ff7fa0" : c.fill} opacity={strong ? 0.7 : c.op} />
      ))}
    </>
  );
}

function Extras({ id, mood, pose }: { id: Cid; mood: PetMood; pose: PetPose }) {
  const [x, y] = SPEC[id].top;
  if (pose === "sleep") return (<><Zed x={x - 6} y={y + 12} k={1} /><Zed x={x + 12} y={y - 12} k={1.4} /></>);
  if (pose === "curl") return <Zed x={x - 2} y={y + 22} k={1} />;
  if (mood === "sleepy") return <Zed x={x} y={y} k={1.2} />;
  if (mood === "love")
    return (
      <>
        <Heart x={x} y={y} k={1.5} />
        <Heart x={x - 150} y={y + 14} k={1} op={0.8} />
      </>
    );
  return null;
}

/* ---------- main ---------- */

const POSE_T: Record<PetPose, string | undefined> = {
  stand: undefined,
  sleep: "translate(120 222) scale(1.05 .88) translate(-120 -222)",
  curl: "translate(120 222) scale(1.16 .72) translate(-120 -222)",
};

function Figure({ id, mood, pose }: { id: Cid; mood: PetMood; pose: PetPose }) {
  const face = <Face id={id} mood={mood} pose={pose} />;
  if (id === "snake") {
    const tucked = pose !== "stand";
    return (
      <g transform={pose === "curl" ? "translate(120 222) scale(1.04 .88) translate(-120 -222)" : undefined}>
        <SnakeCoils />
        {!tucked && <SnakeNeck />}
        <g transform={tucked ? `translate(120 ${pose === "curl" ? 122 : 118}) scale(.84) translate(-120 -88) rotate(${pose === "curl" ? 5 : 0} 120 88)` : undefined}>
          <SnakeHead />
          {face}
        </g>
      </g>
    );
  }
  const Body = { dog: DogBody, cat: CatBody, hamster: HamsterBody, dragon: DragonBody }[id];
  return (
    <g transform={POSE_T[pose]}>
      <Body />
      {face}
    </g>
  );
}

function asCid(c: string | null | undefined): Cid {
  return c === "cat" || c === "hamster" || c === "dragon" || c === "snake" ? c : "dog";
}

export function PetSprite({
  character,
  mood,
  pose,
  size = 160,
  flip,
  className,
  title,
}: {
  character: string | null;
  mood: PetMood;
  pose: PetPose;
  size?: number;
  flip?: boolean;
  className?: string;
  title?: string;
}) {
  const id = asCid(character);
  const [sy, srx] = SPEC[id].shadow;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 240"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <g transform={flip ? "translate(240 0) scale(-1 1)" : undefined}>
        <ellipse cx="120" cy={sy} rx={pose === "stand" ? srx : srx + 6} ry="8" fill="#000" opacity=".12" />
        <Figure id={id} mood={mood} pose={pose} />
        <Extras id={id} mood={mood} pose={pose} />
      </g>
    </svg>
  );
}
