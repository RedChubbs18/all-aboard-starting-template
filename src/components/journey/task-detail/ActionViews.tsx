"use client";

import { CheckCircle2, MapPin, PackageCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { HOME_ITEMS, HOME_PREFIX, PERIPHERAL_OPTIONS, type Detail, type EquipmentChoice, type TaskDetailResponse } from "../detail-types";
import { formatDateTime } from "../format";
import { parseYouTubeId, youTubeEmbedUrl, youTubeWatchUrl } from "@/lib/youtube";
import { usePost } from "./use-post";

interface Props {
  data: TaskDetailResponse;
  onChanged: () => void | Promise<void>;
  /** Marks this task done through the optimistic journey store. */
  onComplete: () => Promise<void>;
  completing: boolean;
}

/** FR-3.4: step-by-step checklist; the starter ticks each step and then marks the task complete. */
export function ChecklistView({ data, onComplete, completing }: Props) {
  const d = data.detail as Extract<Detail, { kind: "checklist" }>;
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const canAct = data.task.canAct && (data.task.status === "TODO" || data.task.status === "IN_PROGRESS" || data.task.status === "BLOCKED");
  const done = data.task.status === "DONE";
  const all = ticked.size === d.steps.length;
  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {d.steps.map((s, i) => {
          const checked = done || ticked.has(i);
          return (
            <li key={i}>
              <label className={cn("flex min-h-11 items-start gap-3 rounded-md border border-line bg-card p-3", canAct && "cursor-pointer hover:bg-brand-tint")}>
                <input
                  type="checkbox"
                  className="mt-0.5 size-6 shrink-0 accent-[var(--color-brand)]"
                  checked={checked}
                  disabled={!canAct}
                  onChange={() =>
                    setTicked((t) => {
                      const n = new Set(t);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <span>
                  <span className="font-semibold">Step {i + 1}. </span>
                  {s}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      {canAct && (
        <div>
          <Button size="lg" className="w-full" loading={completing} aria-disabled={!all} aria-describedby="checklist-help" onClick={() => all && void onComplete()}>
            Mark complete
          </Button>
          <p id="checklist-help" className="mt-1 text-sm text-muted">
            {all ? "All steps ticked. Mark the task complete." : `Tick every step to finish (${ticked.size} of ${d.steps.length}).`}
          </p>
        </div>
      )}
    </div>
  );
}

const YT_API_SRC = "https://www.youtube.com/iframe_api";
const YT_ENDED = 0;

interface YTPlayer {
  destroy: () => void;
}
interface YTApi {
  Player: new (el: HTMLIFrameElement, opts: { events: { onStateChange?: (e: { data: number }) => void; onError?: () => void } }) => YTPlayer;
}
type YTWindow = Window & { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };

let ytPromise: Promise<YTApi> | null = null;
/** Loads the IFrame Player API once, and only when a YouTube task page asks for it. Rejects if blocked or offline. */
function loadYouTubeApi(): Promise<YTApi> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytPromise ??= new Promise<YTApi>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT?.Player) resolve(w.YT);
      else reject(new Error("YT missing"));
    };
    const s = document.createElement("script");
    s.src = YT_API_SRC;
    s.async = true;
    s.onerror = () => {
      s.remove();
      ytPromise = null;
      reject(new Error("YouTube API failed to load"));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}

/** FR-4.6: YouTube (privacy-enhanced) embed. Playing to ENDED completes the task (D30: no prompt). */
function YouTubeEmbed({ id, title, onEnded, onFailed }: { id: string; title: string; onEnded: () => void; onFailed: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cb = useRef({ onEnded, onFailed });
  useEffect(() => {
    cb.current = { onEnded, onFailed };
  });
  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    // If the API never answers (blocked script, offline), fall back after a timeout.
    const timer = window.setTimeout(() => !cancelled && cb.current.onFailed(), 10000);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !frame.current) return;
        window.clearTimeout(timer);
        player = new YT.Player(frame.current, {
          events: {
            onStateChange: (e) => {
              if (e.data === YT_ENDED) cb.current.onEnded();
            },
            onError: () => cb.current.onFailed(),
          },
        });
      })
      .catch(() => {
        window.clearTimeout(timer);
        if (!cancelled) cb.current.onFailed();
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try {
        player?.destroy();
      } catch {
        /* iframe already gone */
      }
    };
  }, [id]);
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md bg-ink">
      <iframe
        ref={frame}
        title={title}
        src={youTubeEmbedUrl(id, typeof window === "undefined" ? undefined : window.location.origin)}
        className="size-full border-0"
        allow="encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        onError={onFailed}
      />
    </div>
  );
}

/** FR-4.6: embedded video, completes on ended. A keyboard-accessible "I've watched it" is always available. */
export function VideoView({ data, onComplete, completing }: Props) {
  const d = data.detail as Extract<Detail, { kind: "video" }>;
  const ytId = parseYouTubeId(d.url);
  const [failed, setFailed] = useState(!d.url);
  const [percent, setPercent] = useState(0);
  const fired = useRef(false);
  const canAct = data.task.canAct && data.task.status !== "DONE" && data.task.status !== "LOCKED";
  const finish = () => {
    if (fired.current || !canAct) return;
    fired.current = true;
    void onComplete();
  };
  return (
    <div className="space-y-3">
      {ytId && !failed ? (
        <YouTubeEmbed id={ytId} title="Group Executive welcome video" onEnded={finish} onFailed={() => setFailed(true)} />
      ) : d.url && !failed ? (
        <video
          controls
          preload="metadata"
          className="aspect-video w-full rounded-md bg-ink"
          aria-label={data.content?.title ?? data.task.title}
          onEnded={finish}
          onError={() => setFailed(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setPercent(Math.round((v.currentTime / v.duration) * 100));
          }}
        >
          <source src={d.url} />
          Your browser can&apos;t play this video.
        </video>
      ) : ytId ? (
        <Alert tone="info" title="The video can't be played here">
          <p>
            <a className="font-semibold underline" href={youTubeWatchUrl(ytId)} target="_blank" rel="noopener noreferrer">
              Watch on YouTube (opens in a new tab)
            </a>
            , then tell us when you&apos;ve watched it.
          </p>
        </Alert>
      ) : (
        <Alert tone="info" title="The video can't be played here">
          <p>This is a demo placeholder. Read the transcript below, then tell us when you&apos;ve watched it.</p>
        </Alert>
      )}
      {percent > 0 && !failed && <p className="tabular text-sm text-muted">Watched {percent}%</p>}
      {ytId ? (
        <>
          <p className="text-sm text-muted">This video is hosted on YouTube (privacy-enhanced mode).</p>
          <p className="text-sm text-muted">English captions are on by default and can be changed in the YouTube player. A short summary is below.</p>
        </>
      ) : (
        <p className="text-sm text-muted">English captions are available from the video controls where the video provides them. The transcript is also below.</p>
      )}
      {data.content && (
        <details className="rounded-md border border-line bg-card p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">{ytId ? "Summary" : "Transcript"}</summary>
          <p className="mt-2 whitespace-pre-line">{data.content.body.replace(/[#*`]/g, "").replace(/\*?\*?Video URL:.*\n?/i, "")}</p>
        </details>
      )}
      {canAct && (
        <Button variant={failed ? "primary" : "secondary"} size="lg" className="w-full" loading={completing} onClick={finish}>
          <CheckCircle2 aria-hidden className="size-5" />
          I&apos;ve watched it
        </Button>
      )}
    </div>
  );
}

/** FR-3.9 / FR-4.5: pick an induction session through BookingAdapter. */
export function BookingView({ data, onChanged }: Props) {
  const d = data.detail as Extract<Detail, { kind: "booking" }>;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { post, busy } = usePost();
  const toast = useToast();
  const group = useId();
  const booked = d.booking ? d.sessions.find((s) => s.id === d.booking?.sessionId) : null;
  const canAct = data.task.canAct && data.task.status !== "LOCKED";

  if (d.booking) {
    return (
      <Alert tone="success" title="Induction booked" live="status">
        <p>
          {booked ? `${formatDateTime(booked.startsAt)}, ${booked.location}.` : "Your place is confirmed."} We&apos;ll remind you before the day.
        </p>
      </Alert>
    );
  }
  async function book() {
    if (!sessionId) return;
    const r = await post("/api/starter/booking", { taskId: data.task.id, sessionId });
    if (r.ok) {
      toast.success("Induction booked");
      await onChanged();
    } else toast.error(r.error ?? "Couldn't book that session");
  }
  return (
    <div className="space-y-3">
      {data.task.key === "book-induction-fallback" && (
        <Alert tone="warning" title="You haven't booked your induction yet">
          <p>The Welcome to Lloyds induction is run by People &amp; Places. Please book a session below.</p>
        </Alert>
      )}
      <fieldset disabled={!canAct}>
        <legend className="font-semibold">Choose a session</legend>
        <div className="mt-2 space-y-2">
          {d.sessions.map((s) => {
            const full = s.remaining <= 0;
            return (
              <label
                key={s.id}
                className={cn(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 bg-card p-3",
                  sessionId === s.id ? "border-dark-green bg-brand-tint" : "border-line",
                  full && "cursor-not-allowed",
                )}
              >
                <input type="radio" name={group} className="size-5 accent-[var(--color-brand)]" disabled={full} checked={sessionId === s.id} onChange={() => setSessionId(s.id)} />
                <span>
                  <span className="block font-semibold">{formatDateTime(s.startsAt)}</span>
                  <span className="block text-sm text-muted">
                    {s.location} · {full ? "Full" : `${s.remaining} places left`}
                  </span>
                </span>
              </label>
            );
          })}
          {d.sessions.length === 0 && <p className="text-muted">No sessions are open yet. P&amp;P will add them soon.</p>}
        </div>
      </fieldset>
      {canAct && (
        <Button size="lg" className="w-full" loading={busy} aria-disabled={!sessionId} aria-describedby={!sessionId ? "booking-help" : undefined} onClick={() => void book()}>
          Confirm booking
        </Button>
      )}
      {canAct && !sessionId && <p id="booking-help" className="text-sm text-muted">Choose a session to continue.</p>}
    </div>
  );
}

/** The chosen model, or the Mac/Windows type for choices stored before models existed. */
const deviceName = (c: Pick<EquipmentChoice, "device" | "model">) => c.model ?? (c.device === "MAC" ? "Mac laptop" : "Windows laptop");
const visible = (xs: string[]) => xs.filter((x) => !x.startsWith(HOME_PREFIX));
const home = (xs: string[]) => xs.filter((x) => x.startsWith(HOME_PREFIX)).map((x) => x.slice(HOME_PREFIX.length));

/** FR-3.7 device choice and FR-4.1 home-working order, submitted via EquipmentAdapter with a confirm step. */
export function OrderView({ data, onChanged }: Props) {
  const d = data.detail as Extract<Detail, { kind: "order" }>;
  const isHome = d.mode === "home";
  const isPeripherals = d.mode === "peripherals";
  const [modelId, setModelId] = useState<string>(d.choice?.modelId ?? "");
  const chosen = d.models.find((m) => m.id === modelId);
  const [items, setItems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { post, busy } = usePost();
  const toast = useToast();
  const canAct = data.task.canAct && data.task.status !== "LOCKED" && data.task.status !== "DONE";
  // F12: the primary device task asks only for Mac or Windows; peripherals are their own optional task.
  const needDevice = d.mode === "device" || (isHome && !d.choice);
  const options: readonly string[] = isHome ? HOME_ITEMS : PERIPHERAL_OPTIONS;

  if (data.task.status === "DONE" && d.choice) {
    return (
      <Card className="space-y-2" aria-live="polite">
        <p className="flex items-center gap-2 font-semibold text-brand-strong">
          <PackageCheck aria-hidden className="size-5" /> {isHome ? "Home working order confirmed" : isPeripherals ? "Peripherals confirmed" : "Device choice confirmed"}
        </p>
        {!isPeripherals && (
          <p>
            Device: <strong>{deviceName(d.choice)}</strong>
          </p>
        )}
        {!isHome && !isPeripherals ? null : isHome ? (
          home(d.choice.peripherals).length > 0 && <p>Home working items: {home(d.choice.peripherals).join(", ")}</p>
        ) : (
          <p>Day 0 peripherals: {visible(d.choice.peripherals).length > 0 ? visible(d.choice.peripherals).join(", ") : "none"}</p>
        )}
        <p className="text-sm text-muted">Collect from: {d.choice.collectionPoint}. Reference {d.choice.ref}.</p>
      </Card>
    );
  }
  const toggle = (x: string) => setItems((l) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]));
  const ready = (!needDevice || !!chosen) && (!isHome || items.length > 0) && (!isPeripherals || !!d.choice);

  async function submit() {
    setError(null);
    const r = await post("/api/starter/equipment", { taskId: data.task.id, modelId: modelId || undefined, peripherals: d.mode === "device" ? undefined : items });
    if (r.ok) {
      setConfirm(false);
      toast.success(isHome ? "Home working order sent" : isPeripherals ? "Peripherals confirmed" : "Device choice confirmed");
      await onChanged();
    } else setError(r.error ?? "Couldn't send your order");
  }

  return (
    <div className="space-y-4">
      {needDevice && (
        <fieldset disabled={!canAct}>
          <legend className="font-semibold">Which laptop would you like?</legend>
          <p className="mt-1 text-sm text-muted">These are the two models for your job family.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {d.models.map((m) => (
              <label key={m.id} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 p-3 font-semibold", modelId === m.id ? "border-dark-green bg-brand-tint" : "border-line bg-card")}>
                <input type="radio" name="device" className="size-5 accent-[var(--color-brand)]" checked={modelId === m.id} onChange={() => setModelId(m.id)} />
                <span>
                  {m.label}
                  <span className="block text-sm font-normal text-muted">{m.device === "MAC" ? "Mac" : "Windows"}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {d.mode !== "device" && (
        <fieldset disabled={!canAct}>
          <legend className="font-semibold">{isHome ? "Which home working items do you need?" : "Which peripherals would you like on Day 0? (optional)"}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-card p-3 hover:bg-brand-tint">
                <input type="checkbox" className="size-5 accent-[var(--color-brand)]" checked={items.includes(o)} onChange={() => toggle(o)} />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {canAct && (
        <>
          <Button size="lg" className="w-full" aria-disabled={!ready} aria-describedby={!ready ? "order-help" : undefined} onClick={() => ready && setConfirm(true)}>
            Review and confirm
          </Button>
          {!ready && <p id="order-help" className="text-sm text-muted">{isHome ? "Choose at least one item." : isPeripherals ? "Choose your primary device first." : "Choose a laptop model to continue."}</p>}
        </>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Confirm your order" variant="dialog">
        <p>Please check this is right. You can&apos;t change it here once it is sent.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {needDevice && <li>Laptop: {chosen?.label}</li>}
          {d.mode !== "device" && (
            <li>
              {isHome ? "Home working items" : "Peripherals"}: {items.length ? items.join(", ") : "none"}
            </li>
          )}
        </ul>
        {error && (
          <div className="mt-3">
            <Alert tone="danger" live="alert">
              {error}
            </Alert>
          </div>
        )}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Go back
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Confirm order
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** FR-4.8: what to collect (the FR-3.7 choices) and where. */
export function CollectView({ data }: Props) {
  const d = data.detail as Extract<Detail, { kind: "collect" }>;
  if (!d.choice) {
    return (
      <Alert tone="info" title="No equipment order on record">
        <p>We couldn&apos;t find your device choice. Ask your line manager or the tech bar what is ready for you.</p>
      </Alert>
    );
  }
  const peripherals = visible(d.choice.peripherals);
  const homeItems = home(d.choice.peripherals);
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Collect from</h2>
        <p className="mt-1 flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-strong" />
          {d.choice.collectionPoint}
        </p>
      </div>
      <div>
        <h2 className="font-semibold">Your items</h2>
        <ul className="mt-1 list-disc pl-5">
          <li>{deviceName(d.choice)}</li>
          {peripherals.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      {homeItems.length > 0 && (
        <p className="text-sm text-muted">Delivered to your home, not collected: {homeItems.join(", ")}.</p>
      )}
      <p className="text-sm text-muted">Reference {d.choice.ref}.</p>
    </Card>
  );
}

/** FR-3.8 confirm, FR-4.4 wayfinding meeting point. The arrangement itself is the LM's proposal. */
export function Day0View({ data, onChanged }: Props) {
  const d = data.detail as Extract<Detail, { kind: "day0" }>;
  const { post, busy } = usePost();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const day0 = d.day0;
  const canConfirm = d.role === "confirm" && data.task.canAct && data.task.status !== "DONE" && data.task.status !== "LOCKED" && !!day0;
  async function confirm() {
    setError(null);
    const r = await post("/api/starter/day0/confirm", { taskId: data.task.id });
    if (r.ok) {
      toast.success("Day 0 confirmed");
      await onChanged();
    } else setError(r.error ?? "Couldn't confirm");
  }
  if (!day0) {
    return (
      <Alert tone="info" title="Waiting for your line manager">
        <p>{data.journey.lm.name} will suggest where, when and who to meet on Day 0. You&apos;ll be able to confirm it here.</p>
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <h2 className="font-semibold">{d.role === "wayfinding" ? "Your first-day meeting point" : "Your line manager's proposal"}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-semibold">Where</dt>
          <dd>{day0.where}</dd>
          <dt className="font-semibold">When</dt>
          <dd>{formatDateTime(day0.whenAt)}</dd>
          <dt className="font-semibold">Ask for</dt>
          <dd>{day0.who}</dd>
          {day0.notes && (
            <>
              <dt className="font-semibold">Notes</dt>
              <dd>{day0.notes}</dd>
            </>
          )}
        </dl>
        <p className="text-sm">{day0.confirmedAt ? <span className="font-semibold text-brand-strong">Confirmed {formatDateTime(day0.confirmedAt)}</span> : "Not confirmed yet."}</p>
      </Card>
      {error && (
        <Alert tone="danger" live="alert">
          {error}
        </Alert>
      )}
      {canConfirm && (
        <Button size="lg" className="w-full" loading={busy} onClick={() => void confirm()}>
          Confirm these arrangements
        </Button>
      )}
    </div>
  );
}
