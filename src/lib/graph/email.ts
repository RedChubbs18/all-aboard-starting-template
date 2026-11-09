/**
 * The welcome email a starter receives. Used for the admin preview (all modes) and, in hackathon mode,
 * as the body sent to the in-tenant demo mailbox only. Pure functions, no I/O.
 */
export interface WelcomeEmailInput {
  starterName: string;
  /** Redemption link. The preview passes a placeholder. */
  redeemUrl: string;
  /** Hackathon mode: shows the "In production this goes to ..." line. */
  productionRecipient?: string;
  startDate?: string;
}

export interface WelcomeEmail {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const PREVIEW_REDEEM_URL = "https://login.microsoftonline.com/redeem?rd=<your-personal-invitation-link>";

export function buildWelcomeEmail(i: WelcomeEmailInput): WelcomeEmail {
  const lines = [
    `Hello ${i.starterName},`,
    "Welcome to Lloyds Banking Group. We are looking forward to seeing you" + (i.startDate ? ` on ${i.startDate}.` : "."),
    "Your first step is to accept your invitation and sign in. This gives you access to your All Aboard onboarding journey.",
  ];
  const note = i.productionRecipient ? `In production this goes to ${i.productionRecipient}` : null;
  const text = [...lines, `Accept your invitation: ${i.redeemUrl}`, "If you were not expecting this email, ignore it.", ...(note ? [note] : [])].join("\n\n");
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px">` +
    `<h1 style="color:#006a4d;font-size:22px">Welcome aboard</h1>` +
    lines.map((l) => `<p>${esc(l)}</p>`).join("") +
    `<p><a href="${esc(i.redeemUrl)}" style="background:#006a4d;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Accept your invitation</a></p>` +
    `<p style="color:#555">If you were not expecting this email, ignore it.</p>` +
    (note ? `<hr><p style="color:#555"><em>${esc(note)}</em></p>` : "") +
    `</div>`;
  return { subject: "Welcome to Lloyds Banking Group: accept your invitation", text, html };
}
