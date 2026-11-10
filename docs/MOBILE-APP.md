# Putting MyJourney on a phone for the demo

The brief says web app only, with no native apps (§2), so treat any of these as **demo-only**. All three options reuse the existing web app; none is a rewrite.

## Options and confidence

| Option | What it is | Confidence it works for the demo | Effort | Notes |
| --- | --- | --- | --- | --- |
| **A. Installed PWA (recommended)** | Open MyJourney on the phone over HTTPS and use "Add to Home Screen". It gets its own icon, opens full-screen and looks like an app. | **High, about 90%** | 1–2 h | Already built (manifest, service worker, icons). It needs an **HTTPS URL**: a tunnel from the laptop. Entra sign-in works in the phone's real browser engine, so guest sign-in with Gmail (including Google sign-in or the email passcode) works normally. |
| **B. Android app wrapper (Capacitor)** | A thin native shell (an APK) that loads the MyJourney URL. Install it by USB or by sending the APK file. | **Medium, about 70%** | 3–5 h | Needs Android Studio and a phone with developer mode. Risk: Google blocks its sign-in inside embedded web views (`disallowed_useragent`), so a Gmail guest would have to use the email one-time passcode, or the sign-in would have to open in the system browser. |
| **C. iPhone app wrapper (Capacitor)** | The same as B, built with Xcode and installed with a free Apple ID. | **Low to medium, about 50%** | 4–6 h | Needs Xcode, a cable and the iPhone set to "trust" the developer. A free Apple ID app expires after 7 days (fine for a demo). It has the same embedded sign-in caveat as B. |

A full native app (React Native or Swift) isn't realistic in the time available.

## Recommended path: an installed PWA through a stable HTTPS tunnel

1. Create a **persistent tunnel**, so the URL doesn't change between rehearsal and demo. Microsoft Dev Tunnels: `brew install --cask devtunnel`, then `devtunnel user login`, `devtunnel create myjourney -a`, `devtunnel port create myjourney -p 3000`, and `devtunnel host myjourney`. This prints a fixed `https://…devtunnels.ms` URL.
2. Add that URL as an extra **SPA redirect URI** on `team05-onboarding`. Set `NEXT_PUBLIC_ENTRA_REDIRECT_URI` to it and add its host to `ALLOWED_DEV_ORIGINS`.
3. Run MyJourney as a production build for the demo (`npm run build && npm start`). The service worker and the offline shell only register in production. Do the same for mock Workday's candidate link (port 3001), either through a second tunnel port or by putting the candidate step on the laptop.
4. On the phone, open the URL:
   - **iPhone:** in Safari, Share → Add to Home Screen.
   - **Android:** in Chrome, ⋮ → Install app.
5. Rehearse: sign in once on the phone beforehand, so the MFA and guest set-up are done.

If you want option B as a stretch goal, ask and I'll scaffold a Capacitor Android project under `demo/mobile-shell/`. It points at the tunnel URL and opens sign-in in the system browser to avoid the embedded web-view block.
