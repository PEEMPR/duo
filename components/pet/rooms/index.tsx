import type { ReactElement } from "react";
import { BedroomScene } from "./bedroom";
import { CafeScene } from "./cafe";
import { BalconyScene } from "./balcony";
import { GardenScene } from "./garden";
import { StargazeScene } from "./stargaze";

import type { RoomId } from "@/lib/core/pet";

export const ROOM_META: Record<RoomId, { label: string; swatch: [string, string] }> = {
  bedroom: { label: "ห้องนอนสีชมพู", swatch: ["#fbe4e8", "#f28da0"] },
  cafe: { label: "ห้องนั่งเล่นคาเฟ่", swatch: ["#f4e7d4", "#a8724c"] },
  balcony: { label: "ระเบียงยามเย็น", swatch: ["#ffcfa3", "#e8907a"] },
  garden: { label: "สวนลาเวนเดอร์", swatch: ["#eee8fc", "#9b7fd6"] },
  stargaze: { label: "ห้องดูดาว", swatch: ["#2f3a6b", "#1f1c2e"] },
};

const SCENES: Record<RoomId, () => ReactElement> = {
  bedroom: BedroomScene,
  cafe: CafeScene,
  balcony: BalconyScene,
  garden: GardenScene,
  stargaze: StargazeScene,
};

export function RoomScene({ room }: { room: RoomId }): ReactElement {
  const Scene = SCENES[room] ?? BedroomScene;
  return <Scene />;
}
