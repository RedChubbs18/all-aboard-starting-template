"use client";

import { MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { callLink, chatLink } from "@/lib/teams";
import { Avatar } from "./Avatar";
import { buttonClass } from "./Button";
import { Card } from "./Card";
import { cn } from "./cn";

export interface ContactCardProps {
  name: string;
  /** e.g. "Line manager", "Buddy". */
  role: string;
  upn?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  variant?: "full" | "compact";
  /** Extra line under the role, e.g. job title. */
  subtitle?: string | null;
  className?: string;
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** FR-1.2: Teams chat and call deep links built from the contact's UPN (new tab, never Graph). */
export function ContactCard({ name, role, upn, photoUrl, bio, subtitle, variant = "full", className }: ContactCardProps) {
  const [open, setOpen] = useState(false);
  const hasBio = !!bio?.trim();
  const long = (bio?.length ?? 0) > 140;
  const chat = upn ? chatLink(upn) : null;
  const call = upn ? callLink(upn) : null;

  return (
    <Card as="article" aria-label={`${role}: ${name}`} className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3">
        <Avatar name={name} photoUrl={photoUrl} size={variant === "compact" ? 44 : 84} />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{name}</h3>
          <p className="text-sm font-bold text-brand-strong">{role}</p>
          {subtitle && variant === "full" && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
      </div>

      {variant === "full" &&
        (hasBio ? (
          <div>
            <p className={cn("text-ink", !open && "line-clamp-3")}>{bio}</p>
            {long && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="mt-1 min-h-11 font-semibold text-brand-strong underline underline-offset-2"
              >
                {open ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{firstName(name)} hasn&apos;t added a bio yet. Say hello on Teams.</p>
        ))}

      {chat && call ? (
        <div className="flex gap-2">
          <a
            href={chat}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Chat with ${name} in Teams (opens in a new tab)`}
            className={buttonClass("secondary", "md", "flex-1")}
          >
            <MessageCircle aria-hidden className="size-5" />
            Chat on Teams
          </a>
          <a
            href={call}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Call ${name} in Teams (opens in a new tab)`}
            className={buttonClass("secondary", "md", "flex-1")}
          >
            <Phone aria-hidden className="size-5" />
            Call
          </a>
        </div>
      ) : (
        <p className="text-sm text-muted">Teams link unavailable.</p>
      )}
    </Card>
  );
}
