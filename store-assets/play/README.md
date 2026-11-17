# Play Store assets

Source-of-truth files for the Google Play listing. Everything here is
derived from the app itself or the brand mark — nothing is invented.

## Contents

| File | Play requirement | Status |
|---|---|---|
| `icon-512.png` | 512×512, 32-bit PNG, ≤1 MB | Done |
| `screenshots/` | 2–8 phone screenshots, 320–3840 px, max dimension ≤ 2× min | Done — 7 |
| `feature-graphic.png` | 1024×500 PNG | **Not produced** |

## Screenshots

Captured 2026-11-17 from the release APK running on a 1080×1920 emulator,
signed in as the reviewer account against the production API.

| File | Screen | Why it's in the set |
|---|---|---|
| `01-home.png` | Home | The live safety map is the product; leads the set |
| `02-active-journey.png` | Active journey | The core promise: route, live position, panic path |
| `03-new-journey.png` | New journey | Shows the paid action and its price up front |
| `04-report-incident.png` | Report incident | The safety-intelligence layer, in nine real categories |
| `05-wallet.png` | Wallet | Prepaid model, Paystack top-up |
| `06-journey-history.png` | Journey history | Assurance after the fact |
| `07-sign-in.png` | Sign in | Brand, tagline, consent line |

All are 1080 px wide, 1724–1731 px tall (≈1.6:1), which satisfies Play's
"max dimension no more than twice the minimum" rule. 1080×2400 captures were
rejected for that reason, so the emulator was set to 1080×1920 before capture.

### How they were produced

1. `flutter build apk --release --dart-define-from-file=release-defines.json`
   with `android/key.properties` **moved aside** so Gradle fell back to the
   debug signing certificate. This is deliberate: Firebase rejects phone auth
   from a signing identity whose SHA-1 is not registered, and at capture time
   only the debug certificate was in `google-services.json`. Never ship that
   APK.
2. `adb shell wm size 1080x1920`, animations disabled.
3. Emulator GPS set to Lagos (`adb emu geo fix 3.3792 6.5244`) so the map shows
   Nigerian geography rather than the emulator's default Mountain View.
4. `adb exec-out screencap -p`, then cropped: emulator border, status bar and
   Android nav bar removed, width normalised to 1080.

## Regenerating

The screenshots are honest captures, not mockups. Re-capture after any UI
change rather than editing the images.

## Not yet done

- **Feature graphic** (1024×500). SafePass has no text-free 16:5 composition
  yet; the brand mark is square. Needs a deliberate design pass, not a crop.
