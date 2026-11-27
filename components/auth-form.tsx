"use client";

import { useActionState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import type { FormState } from "@/app/actions";

type Field = { name: string; label: string; type?: string; placeholder?: string; required?: boolean; autoComplete?: string; max?: string; hint?: string };

export function ActionForm({
  action,
  fields,
  submit,
  hidden,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.hardRedirect) window.location.assign(state.hardRedirect);
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-2">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required={f.required ?? true} autoComplete={f.autoComplete} max={f.max} />
          {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
        </div>
      ))}
      {state?.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      <SubmitButton className="w-full">{submit}</SubmitButton>
    </form>
  );
}
