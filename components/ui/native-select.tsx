import * as React from "react";
import { cn } from "@/lib/utils";

/** select แบบ native: ใช้ได้ใน server form โดยไม่ต้องมี JS และเป็นมิตรกับมือถือ */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
