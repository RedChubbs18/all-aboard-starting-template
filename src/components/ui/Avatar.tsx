/* eslint-disable @next/next/no-img-element */
import { cn } from "./cn";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Photo when available, otherwise initials on brand-soft. */
export function Avatar({ name, photoUrl, size = 56, className }: { name: string; photoUrl?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: `${(size >= 80 ? 26 : Math.round(size / 2.6)) / 16}rem` };
  if (photoUrl) {
    return <img src={photoUrl} alt={name} width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={style} />;
  }
  return (
    <span
      role="img"
      aria-label={name}
      style={style}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand-strong", className)}
    >
      <span aria-hidden>{initialsOf(name)}</span>
    </span>
  );
}
