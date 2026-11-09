"use client";
import { AlertTriangle } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/** Inputs and selects: 10px radius, 1px #767d79 border (STYLE A.12), 12px 14px padding, white (STYLE section 4). */
export const controlClass =
  "min-h-12 w-full rounded-sm border border-line-strong bg-card px-3.5 py-3 text-base text-ink placeholder:text-muted " +
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-blocked disabled:bg-page disabled:text-muted";

export function Label({ htmlFor, children, className }: { htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-semibold text-ink", className)}>
      {children}
    </label>
  );
}

interface FieldShell {
  label: string;
  error?: string;
  hint?: string;
}

function Shell({
  label,
  error,
  hint,
  htmlFor,
  errId,
  hintId,
  children,
}: FieldShell & { htmlFor: string; errId: string; hintId: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <p id={hintId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-blocked">
          <AlertTriangle aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const describe = (error: string | undefined, hint: string | undefined, errId: string, hintId: string) =>
  [error ? errId : "", hint ? hintId : ""].filter(Boolean).join(" ") || undefined;

export function TextField({ label, error, hint, className, ...rest }: FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const id = useId();
  return (
    <Shell label={label} error={error} hint={hint} htmlFor={id} errId={`${id}-e`} hintId={`${id}-h`}>
      <input id={id} {...rest} aria-invalid={!!error} aria-describedby={describe(error, hint, `${id}-e`, `${id}-h`)} className={cn(controlClass, className)} />
    </Shell>
  );
}

export function TextArea({ label, error, hint, className, ...rest }: FieldShell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  const id = useId();
  return (
    <Shell label={label} error={error} hint={hint} htmlFor={id} errId={`${id}-e`} hintId={`${id}-h`}>
      <textarea id={id} rows={3} {...rest} aria-invalid={!!error} aria-describedby={describe(error, hint, `${id}-e`, `${id}-h`)} className={cn(controlClass, className)} />
    </Shell>
  );
}

export function SelectField({ label, error, hint, children, className, ...rest }: FieldShell & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const id = useId();
  return (
    <Shell label={label} error={error} hint={hint} htmlFor={id} errId={`${id}-e`} hintId={`${id}-h`}>
      <select id={id} {...rest} aria-invalid={!!error} aria-describedby={describe(error, hint, `${id}-e`, `${id}-h`)} className={cn(controlClass, className)}>
        {children}
      </select>
    </Shell>
  );
}
