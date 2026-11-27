"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  MAX_CUSTOM_DAYS,
  defaultRemindBefore,
  isAllDayEvent,
  remindBeforeLabel,
  reminderOptions,
  type RemindBefore,
  type ReminderOption,
} from "@/lib/reminders";

const CUSTOM = "custom";

/**
 * ช่อง "เตือนล่วงหน้า" ของฟอร์มเพิ่มนัด
 * อ่านค่า input name="date" และ name="time" ของฟอร์มเดียวกัน (ฟัง input/change ที่ระดับ form)
 * แล้วคำนวณตัวเลือกใหม่แบบสด ค่าที่ส่งจริงอยู่ใน hidden input name="remindBefore"
 */
export function ReminderSelect({ tz, defaultDate }: { tz: string; defaultDate?: string }) {
  const anchor = React.useRef<HTMLDivElement>(null);
  const [ev, setEv] = React.useState<{ date: string; time: string }>({ date: defaultDate ?? "", time: "" });
  const [now, setNow] = React.useState<Date | null>(null);
  const [choice, setChoice] = React.useState<string>("d1"); // ค่าใน select หรือ "custom"
  const [touched, setTouched] = React.useState(false);
  const [days, setDays] = React.useState("");

  React.useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const read = () => {
      const g = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
      setEv((p) => {
        const next = { date: g("date"), time: g("time") };
        return p.date === next.date && p.time === next.time ? p : next;
      });
      setNow(new Date());
    };
    const onField = (e: Event) => {
      const name = (e.target as HTMLInputElement | null)?.name;
      if (name === "date" || name === "time") read();
    };
    // หลัง reset หรือ submit: ล้างสถานะ แล้วอ่านค่าฟิลด์ใหม่หลังฟอร์มรีเซ็ตเสร็จ
    const onResetOrSubmit = () => {
      setTimeout(() => {
        setTouched(false);
        setChoice("d1");
        setDays("");
        read();
      }, 0);
    };
    read();
    const timer = setInterval(() => setNow(new Date()), 60_000);
    form.addEventListener("input", onField);
    form.addEventListener("change", onField);
    form.addEventListener("reset", onResetOrSubmit);
    form.addEventListener("submit", onResetOrSubmit);
    return () => {
      clearInterval(timer);
      form.removeEventListener("input", onField);
      form.removeEventListener("change", onField);
      form.removeEventListener("reset", onResetOrSubmit);
      form.removeEventListener("submit", onResetOrSubmit);
    };
  }, []);

  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(ev.date);
  const options: ReminderOption[] = React.useMemo(() => {
    if (!hasDate || !now) return [{ value: "d1", label: remindBeforeLabel("d1"), at: null }, { value: "none", label: remindBeforeLabel("none"), at: null }];
    return reminderOptions(ev, tz, now);
  }, [ev, tz, now, hasDate]);
  const def: RemindBefore = React.useMemo(
    () => (hasDate && now ? defaultRemindBefore(ev, tz, now) : "d1"),
    [ev, tz, now, hasDate],
  );

  // ตัวเลือกที่เลือกไว้หายไป → กลับไปใช้ค่าเริ่มต้นใหม่
  React.useEffect(() => {
    if (choice === CUSTOM) return;
    if (!touched || !options.some((o) => o.value === choice)) setChoice(def);
  }, [options, def, choice, touched]);

  const n = Number(days);
  const nValid = Number.isInteger(n) && n >= 1 && n <= MAX_CUSTOM_DAYS;
  const customValue = `d${n}` as RemindBefore;
  const customOk = React.useMemo(
    () => nValid && hasDate && !!now && reminderOptions(ev, tz, now, customValue).some((o) => o.value === customValue),
    [nValid, hasDate, ev, tz, now, customValue],
  );
  const customBad = choice === CUSTOM && days !== "" && !customOk && hasDate && !!now;

  // ค่าเริ่มต้นที่ผู้ใช้ไม่ได้แตะ ส่งเป็น "" ให้เซิร์ฟเวอร์คำนวณ ณ เวลาบันทึก
  let submit: string;
  if (choice === CUSTOM) submit = customOk ? customValue : "";
  else if (!touched && choice === def) submit = "";
  else submit = options.some((o) => o.value === choice) ? choice : "";

  const timed = hasDate && !isAllDayEvent(ev);

  return (
    <div ref={anchor} className="flex flex-col gap-2">
      <Label htmlFor="remindBeforeSelect">เตือนล่วงหน้า</Label>
      <input type="hidden" name="remindBefore" value={submit} />
      <NativeSelect
        id="remindBeforeSelect"
        value={choice}
        onChange={(e) => {
          setTouched(true);
          setChoice(e.target.value);
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={CUSTOM}>กำหนดเอง…</option>
      </NativeSelect>
      {choice === CUSTOM && (
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CUSTOM_DAYS}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="จำนวนวันที่เตือนล่วงหน้า"
            className="w-24"
            placeholder="1–30"
          />
          <span className="text-muted-foreground">วันก่อน (เวลา 09:00)</span>
        </div>
      )}
      {choice === CUSTOM && (days === "" || !nValid) && (
        <p className="text-xs text-muted-foreground">ใส่จำนวนวัน 1–{MAX_CUSTOM_DAYS} (ยังไม่ใส่ จะใช้ค่าเริ่มต้น)</p>
      )}
      {customBad && nValid && (
        <p className="text-xs text-destructive">เวลาเตือนนี้ผ่านไปแล้ว จะใช้ค่าเริ่มต้นแทน</p>
      )}
      {timed && <p className="text-xs text-muted-foreground">นัดที่มีเวลาจะเตือนก่อน 1 ชั่วโมงให้อัตโนมัติด้วย</p>}
    </div>
  );
}
