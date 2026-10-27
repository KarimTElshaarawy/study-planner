# PROGRESS

Last updated: 2026-10-27. Nothing here depends on chat memory.

## 1. Goal
Dayfold, a study planner (personal project of the owner). Two codebases:
- Web app (self-hosted): /home/user/study-planner, branch claude/wizardly-davinci-derplc. Fastify 5 + better-sqlite3 + React 19 PWA, deterministic planner, daily email (Resend, else outbox/). Pushed. Definition of done met (all gates green, Opus final audit fixed).
- Mobile app (fully on-device, iOS + Android): /home/user/dayfold-app, remote dayfold-app (same owner), branch main. Capacitor 7 wrapper, no server, no email, local notifications. Built only in GitHub Actions workflow "Build apps": unsigned Dayfold.ipa (installed with Sideloadly, free Apple ID, user is on Windows ARM + WSL, no Mac) and Dayfold.apk.
Definition of done for the current phase: the newest mobile features (session reminders, bulk import of classes and topics, accent colors, native keyboard) pass all local gates, a CI build is green, and the user confirms them on the phone.

## 2. Decisions and reasons
- Mobile data mode fully on-device, separate repo (user chose both).
- PolyForm Noncommercial 1.0.0 (user wants free use, nobody may profit). Not OSI open source. GPL rejected because it allows selling.
- Name Dayfold (user rejected "Cadence" over trademark worry; wants unique, simple, memorable).
- Red default accent (user likes red), now user-changeable: 8 presets + custom picker, WCAG contrast adjusted per theme.
- Keyboard: hide iOS accessory bar, theme-matched, no autocorrect/suggestions, Done key, tap-away dismiss, because user said it must feel like an app, not a web form.
- Public repo must contain ZERO personal data (no email, student ID, real exams, secrets). Resend key is private; installers use their own. Real exams live only in gitignored seed/personal.json and .env.
- Native keyboard resize left at default (Capacitor config string 'native' failed typing).
- Android uses a committed public debug keystore (optional release signing via secrets).
- Toast centering via margins, not transform, because Motion overrides transforms.

## 3. My rules and preferences
- Ask questions only once; after that never ask the user anything again (original brief).
- No em dashes in my writing. No hard-coded values; read settings at runtime. Make no mistakes.
- Opus must review everything and loop until clean, but the user rejected the Agent call twice: confirm before relaunching Opus.
- Never delete, rename or revert files or code when compacting.
- Never repeat secret values.

## 4. Current state
Mobile repo last pushed 5578437 (courses+names+topics import; 39 unit tests, e2e, tsc, eslint, build green); before that 6bd3eed (8b5b2a5 keyboard, 2a62407 features). Web repo last 283ec91 (toast fix). Both working trees clean at resume.
Key mobile files: src/device/{storage,repo,prefs,router,service,reminders,notifications,importers,index}.ts, src/lib/{api,accent,keyboard,statusBar,hooks}.ts, src/main.tsx, src/pages/Settings.tsx, src/components/{BulkImportSheet,Sheet,Toast,StartupError,UnreadableBanner}.tsx, scripts/{config,patch-ios,patch-android,make-assets}.mjs, .github/workflows/build.yml, tests/{helpers,device,native,features}.test.ts, tests/e2e/app.spec.ts.
Last known results: mobile 38 unit tests, 1 e2e, tsc and eslint clean. Web 69 unit/API, 11 e2e, simulation 0 violations, secret scan clean, Lighthouse 96-100.

## 5. Unresolved errors and known failures
- None open locally. Past: Playwright pinned to 1.63.0; git push printed "fatal: expected 'acknowledgments', received 'packfile'" but the branch landed.
- Unverified: CI builds for the newest commits, real iPhone keyboard behavior, Sideloadly on Windows ARM, Docker image never built.

## 6. Ordered TODO
1. DONE 2026-10-27: re-verified both repos (mobile 39 unit + e2e; web typecheck, lint, 69 tests, simulate 0 violations, scan clean). Added course+name+topic CSV import (Settings > Data > Import courses and topics).
1b. NEXT ACTION: user re-runs Build apps and reinstalls; then ask about the Opus review.
2. User re-runs Actions > Build apps and reinstalls Dayfold.ipa via Sideloadly.
3. Ask the user whether to run the Opus review of the newest batch, loop until clean.
4. Optional offers: Raspberry Pi guide, Fly.io config, port mobile features to web, trademark check, store launch.

## 7. Commands
Mobile: npx tsc --noEmit; npx eslint .; npx vitest run; npm run build; npx playwright test.
Web: npm run typecheck; npm run lint; npm test; npm run test:e2e; npm run simulate; npm run scan.
Env var names: APP_PASSWORD, RESEND_API_KEY, TRUST_PROXY, FAKE_NOW (values never recorded).
