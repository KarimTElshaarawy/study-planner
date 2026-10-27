# Decisions

Name: **Dayfold** (a day, folded open into a plan). Chosen to be short, coined and easy to remember. A first name, "Cadence", was dropped because it collides with a well-known engineering software company. No trademark search was done beyond a web look-up; check the registers before commercial use. Mark: a three-quarter ring with a dot at the open end.

## Stack (and why)
- **Single TypeScript package**, folders `shared/ server/ web/ tests/ scripts/`. One `package.json` keeps Docker, CI and contribution trivial; no workspace tooling to explain.
- **Fastify + better-sqlite3**: tiny, fast, one file DB (`data/dayfold.db`), synchronous API makes the planner persistence simple and transactional. Zod validates every request.
- **Luxon** for all timezone math. Every local date is `YYYY-MM-DD`, every local time is minutes since midnight in `settings.timezone`. Exams are stored as local date + time and interpreted in the user's timezone, so DST and travel are handled in one place.
- **React + Vite + Motion + Lucide + TanStack Query**. Plain CSS variables with a custom token layer, no component library. Charts are hand written SVG.
- **PWA** via a hand written service worker (app shell and hashed assets only; the API is never cached by the worker) plus a persisted TanStack Query cache and an offline queue for task toggles. Both are cleared on logout.
- **Planner is pure deterministic code** in `shared/planner`, no I/O, no randomness (templates picked by hash). That makes it simulatable over 45 days in tests.
- **Auth**: one password from `APP_PASSWORD`, exchanged for a signed httpOnly cookie (HMAC). The server refuses to boot without it (except `NODE_ENV=test`).
- **Email**: provider chosen from env: `RESEND_API_KEY` (HTTPS API, no SDK), else `SMTP_HOST` (nodemailer), else HTML written to `outbox/` with a visible warning in the UI.
- **Cron**: node-cron evaluated in the user's timezone; on boot, if today's send time has passed and no send is logged for today, send once (catch-up).

## Planner model
- Local-day granularity; the planner is `planDay(ctx, date, now)`. Demand is **stateless**: remaining need of an exam = need − minutes of *completed* sessions attributed to it. Therefore missed work is never dropped, it just remains demand, and completed work is never regenerated.
- Need (minutes) = (120 + 90·weight) · (0.6 + 0.2·(5 − confidence)). Weight 1..5 (defaults: quiz 1, midterm 3, final 5). Deadlines (labs, assignments) use the same formula with a lower base.
- Prep window opens `10 + 4·weight` days before an exam.
- Fixed blocks: commitments, meals (shifted ±2h if clashing), exams with 30 min before and 60 min after blackout, done tasks. Study never touches them; study stops `windDown` minutes before sleep and starts `morning` minutes after wake.
- Session priority = pace (remaining / days left) · stakes + staleness boost (≥2 days since last study forces a session) + carry-over boost (missed sessions in the last 2 days). Taper: day before an exam gives that course at most 2 light-review sessions; exam day only a pre-exam review when the gap allows.
- Persisted plan exists for today and past days only; future days are previews computed assuming scheduled work gets done. Replan = mark past undone as missed, delete future undone of today, regenerate.
- Methods rotate: recall, practice, association (write an analogy or mnemonic), past paper, quiz-yourself. Notes come from static templates.

## Ambiguities resolved without asking
- Ambiguous exam times in the user's tracker are resolved at seed time in the gitignored personal file, never in the repo.
- Exam duration defaults: quiz 60 min, midterm 90, final 120; editable.
- Default daily cap 6 h, 50/10 sessions, 25 min break every 3rd, meals 07:30 / 13:00 / 19:30.
- Email default 06:30 local; Resend sandbox sender `onboarding@resend.dev` unless `MAIL_FROM` is set (it can only deliver to the account owner, which is exactly the single-user case).
- The user's address was not supplied: it is entered in the setup wizard. Their Resend key lives only in gitignored `.env`.
- Hosting: Docker + Tailscale (`tailscale serve`) for iPhone HTTPS; instructions in README.
- Week starts Monday. Weekday numbers are ISO (1 = Monday).
- Ticking a past or "missed" task is allowed and turns it into done.

## Architecture review follow-ups
- Wall-clock minutes-of-day are kept for planning (DST days may be off by one hour; documented limitation). Exams keep their wall-clock time when the timezone setting changes.
- Blackouts are clipped to their own day; overlapping exams are accepted but surface a warning, and blackouts are unioned before free windows are computed.
- Rule priority: blackouts > daily cap > taper > staleness > pace. When a rule cannot be met the day carries a visible warning, as does a shortfall (remaining need larger than capacity before the taper day).
- Cap counts study + review minutes (done and planned) on the local date; breaks are excluded.
- Sessions carry the `examId` they were created for. Task ids are deterministic (`date:start:kind`), toggles are idempotent and a toggle for a vanished id is a no-op.
- Email: a unique send-log row per local date is claimed in a transaction before sending; the plan is regenerated first; the setup wizard has a "send test email" button that surfaces provider errors (the Resend sandbox sender only delivers to the account owner).
- Auth: session token has an expiry, constant-time comparison, login throttling, `SameSite=Lax` (needed so the email button opens a signed-in app), and the service worker cache plus offline queue are cleared on logout or a 401. `data/`, `outbox/` and `.env` are gitignored and dockerignored.

## Design
- The single accent is a refined red (light #E5322D, dark #FF5A52, text-safe variants #B3261E / #FF8A82) at the user's request. It is used for the progress ring, active tab, missed or exam emphasis and the logo dot. Buttons stay ink-coloured so small text keeps AA contrast.

## License
- GNU GPL v3.0 (chosen by the owner). Anyone may use and modify the app for free, but a distributed modified version must stay GPL with its source available. GPL does not forbid selling copies, and the copyright holder can still offer the code under other terms. Earlier commits were published under MIT; copies taken from them keep that grant.
