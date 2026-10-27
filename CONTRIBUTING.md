# Contributing

Thanks for helping. The app is a single TypeScript package, so setup is short.

```bash
npm install
cp .env.example .env          # set APP_PASSWORD
npm run seed:demo             # optional: load the fictional demo data
npm run dev                   # API on :3000, web on :5173
```

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test                      # unit, API, planner and 45 day simulation
npm run test:e2e              # Playwright, builds the app and starts its own server
```

## Ground rules

- **License.** By opening a pull request you agree that your contribution is licensed under the project's PolyForm Noncommercial License 1.0.0, and that the owner may also license it under other terms.
- **No personal data.** Real exams, addresses and keys belong in `seed/personal.json` and `.env`, both gitignored. Use fictional data in tests and docs.
- **The planner is plain code.** `shared/planner` must stay pure and deterministic (no I/O, no randomness, no network). Add a unit test, and if you change a rule, make sure `npm run simulate` still reports zero violations.
- **Design tokens first.** Colours, radii, spacing and type live in `web/src/styles/tokens.css`. Do not hardcode values in components, and check both themes.
- **Copy is short and human.** No filler, no emoji in the UI.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Project layout

| Folder | What lives there |
| --- | --- |
| `shared/` | Types, time helpers, the planner, the email builder |
| `server/` | Fastify API, SQLite, auth, mailer, scheduler |
| `web/` | React PWA, landing page at `/about` |
| `tests/` | Vitest suites and the Playwright end-to-end spec |
| `scripts/` | Simulation, seed loader, screenshots, icons |
