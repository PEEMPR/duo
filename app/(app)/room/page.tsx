import { RoomClient } from "@/components/pet/room-client";
import { getRoomState } from "@/lib/core";
import { db, requireActor } from "@/lib/server";
import { DEFAULT_TZ } from "@/lib/time";

export const metadata = { title: "ห้องของน้อง" };

export default async function RoomPage() {
  const { actor } = await requireActor();
  const state = await getRoomState(db(), actor);
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <h1 className="sr-only">ห้องของน้อง</h1>
      <RoomClient initial={state} tz={actor.tz || DEFAULT_TZ} />
    </div>
  );
}
