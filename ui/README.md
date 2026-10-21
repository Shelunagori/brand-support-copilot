# Support Copilot UI

Demo front end for the Urbane Threads Support Copilot. Built with React 18, Vite, TypeScript (strict), Tailwind v3, Framer Motion, Recharts and lucide-react.

| Route       | Screen                                                                   |
| ----------- | ------------------------------------------------------------------------ |
| `/`         | Support Chat: streaming replies with intent, policy, confidence, escalation and feedback |
| `/compare`  | Base vs Aligned: two parallel streams, a word-level LCS diff and a heuristic field table |
| `/pipeline` | Alignment Pipeline: Upload → Benchmark → Align → Poll → Deploy timeline, runs and spend |
| `/eval`     | Eval Dashboard: score cards, charts and a filterable question table       |
| `/feedback` | Feedback Loop: flags, corrections, the re-align dataset and a before/after eval comparison |

Every number on screen comes from the API. When an endpoint is down, returns 404 or has no data, the page shows a designed error or empty state with a retry button. It never shows placeholder data.

## Run

```bash
cd ui
npm install
npm run dev          # http://localhost:5173 ; /api/* is proxied to http://localhost:8000
```

Start the backend separately (`uv run uvicorn --factory app.api.main:create_app --port 8000` from the repo root).

```bash
npm run build        # tsc -b (strict) + vite build -> dist/
npm run preview      # serve dist/ on :5173 (same /api proxy)
npm run lint         # eslint flat config + typescript-eslint
npm run contrast     # WCAG AA check of design-token pairs (both themes)
```

## Environment

| Variable           | Default             | Purpose                                                    |
| ------------------ | ------------------- | ---------------------------------------------------------- |
| `VITE_API_BASE`    | `/api`              | API base URL. `/api` goes through the dev/nginx proxy.     |
| `VITE_API_KEY`     | `dev-key-change-me` | Sent as `X-API-Key` on every request.                      |
| `API_PROXY_TARGET` | `http://localhost:8000` | Where the dev server sends `/api` requests (dev only). |
| `UI_URL`           | `http://localhost:5173` | Base URL that Playwright tests run against.            |

Copy `.env.example` to `.env.local` to override these values. `VITE_*` values are compiled into the bundle, so do not use a production secret here.

## Screenshots and e2e

```bash
npx playwright install chromium
npm run test:e2e                         # smoke tests + screenshots (starts a dev server if none is running)
UI_URL=http://localhost:4173 npm run screenshots
```

`e2e/screenshots.spec.ts` sets the theme through `localStorage` before the page loads. It captures all five screens in dark and light mode at 1440×900, plus the chat screen at 390×844, and writes them to `screenshots/<screen>-<theme>.png`. `e2e/smoke.spec.ts` checks that every route renders its heading and that the theme toggle persists.

## Docker

```bash
docker build -t support-copilot-ui --build-arg VITE_API_KEY=dev-key-change-me ui/
docker run -p 8080:8080 --network <compose-network> support-copilot-ui
```

The build has two stages: `node:20-alpine` builds the app and `nginx:alpine` serves it. nginx runs as the unprivileged `nginx` user on port 8080. `nginx.conf` falls back to `index.html` for SPA routes and proxies `/api/` to `http://api:8000/` with `proxy_buffering off` so SSE streams pass through unbuffered.

## Design system

- Design tokens live in `src/index.css` as RGB channel variables under `[data-theme='dark']` and `[data-theme='light']`. `tailwind.config.js` maps them to Tailwind colors (`bg-surface/60`, `text-ink-muted`, `text-accent-text`, …). The two themes are designed separately; one is not an inversion of the other.
- The theme toggle has three options (light, system, dark). The choice is saved to `localStorage` under `ut-theme`, and an inline script in `index.html` applies it before the first paint.
- `scripts/contrast.mjs` reads the token blocks, blends the translucent glass surfaces over the page background, and fails if any text pair is below 4.5:1 or any UI pair is below 3:1.
- Motion uses `MotionConfig reducedMotion="user"`. A CSS `prefers-reduced-motion` block also disables shimmer, caret and keyframe animations.

## Implementation notes

- Streaming uses `fetch` with a `ReadableStream` SSE parser (`src/lib/sse.ts`) instead of `EventSource`, because the stream needs a POST body and the `X-API-Key` header. `answer_delta` text is revealed by a requestAnimationFrame typewriter. Raw `token` events appear behind a "Raw model tokens" toggle.
- The pipeline timeline is built from `state` and `events` (`src/lib/pipeline.ts`). Stage durations come from `detail.seconds` when present and otherwise from event timestamps. The page polls every 5 s while any run is still in progress, and for 2 min after you trigger a job.
- The Base vs Aligned verdict is labelled **heuristic**. It scores a valid `UT-XXX-000` policy_ref, no fallback, and higher confidence. Ground-truth escalation checks run in the server-side eval.
