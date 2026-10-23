# Deploying the public demo (all free tier)

**UI** on Vercel · **API** on Render · **Postgres** on Neon · **Redis** on Upstash.

The API runs in **demo mode** (`DEMO_MODE=true`):

- **Read-only screens are public.** Pipeline, Eval and Feedback show the *real* runs, evals and
  feedback from development, seeded into Neon.
- **Live chat needs an access code.** Chat and Compare call the live **base** model
  (`Llama-3.2-3B-Instruct`), and only with the access code. The aligned model shows as
  "offline (undeployed to save credits)".
- **Paid and admin actions return 403 "disabled in demo".** These are align, deploy, re-align
  and feedback writes.
- **Spending is capped:** $1/day (`DEMO_DAILY_CAP_USD`) and $5 lifetime (`DEMO_TOTAL_CAP_USD`),
  counted in Redis. There is also a limit of 10 messages per IP per hour.
- **No key in the browser.** `NUGEN_API_KEY` only ever lives in Render's environment, and CORS
  only allows your Vercel domain.

> ⚠️ You do steps 1–5 (creating accounts needs you). Each step says what to send me.
> Copy secrets only into the places named; **never** into git, chat screenshots or issues.

Time needed: about 25 minutes, most of it waiting for the first Render build.

---

## 1. Neon (Postgres): ~4 min

1. Open <https://console.neon.tech/signup>, then **Continue with GitHub**.
2. **Create project**:
   - Project name: `brand-support-copilot`
   - Postgres version: the default (16 or 17)
   - Cloud / region: **AWS · US East (Ohio) `us-east-2`** (the live demo uses this; keep Neon,
     Upstash and Render in the same area)
   - Click **Create project**.
3. On the project dashboard, click **Connect** (top right).
   - Branch `main`, database `neondb`, role: the default owner.
   - Turn **Connection pooling OFF** (use the *direct* connection).
   - Copy the connection string. It looks like
     `postgresql://neondb_owner:****@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
     (the app converts it to asyncpg format itself).
4. Put it in your **local** `.env` (gitignored) as one line:
   ```
   DEMO_DATABASE_URL=postgresql://neondb_owner:...@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
   Keep the string handy: it is also Render's `DATABASE_URL` in step 3.
5. **Seed it with the real data.** Either tell me **"Neon ready"** and I'll run it, or run it yourself:
   ```bash
   make demo-seed      # runs migrations on Neon, then copies the local DB (wipes Neon's tables first)
   ```
   Expected output: about 4 eval runs, 3 alignment runs, ~40 events, 38 inferences, 24 feedback
   rows and ~300 spend rows.

## 2. Upstash (Redis): ~3 min

1. Open <https://console.upstash.com>, then **Sign up with GitHub**.
2. **Redis**, then **Create database**:
   - Name: `bsc-demo`
   - Type / primary region: **AWS · us-east-2 (Ohio)**, or us-east-1 if Ohio isn't offered
   - Plan: **Free**. Leave **TLS on**.
   - Click **Create**.
3. On the database page, under **Connect**, choose the **Redis URL** / `redis-cli` tab and copy
   the URL. It must start with **`rediss://`** (two s), e.g.
   `rediss://default:****@xxxx-yyyy.upstash.io:6379`.
   This is Render's `REDIS_URL` in step 3.

## 3. Render (API): ~10 min (first Docker build)

1. Open <https://dashboard.render.com/register>, then **GitHub**, and authorize Render.
2. Click **New +**, then **Blueprint**.
3. Connect GitHub if asked, pick **`Shelunagori/brand-support-copilot`**, then **Connect**.
   Render reads [`render.yaml`](../render.yaml) and shows one web service,
   **`brand-support-copilot-api`** (Docker, Free, Ohio).
4. Render asks for the secret env vars (declared `sync: false`). Paste:

   | Key | Value |
   |---|---|
   | `NUGEN_API_KEY` | your Nugen key (from platform.nugen.in) |
   | `DATABASE_URL` | the Neon string from step 1 |
   | `REDIS_URL` | the Upstash `rediss://…` URL from step 2 |
   | `DEMO_ACCESS_CODE` | a code you invent, e.g. `linen-kurta-42` (share it privately) |
   | `CORS_ORIGINS` | `https://placeholder.invalid` for now (fixed in step 5) |

   Everything else (`DEMO_MODE=true`, caps, base model) is already set by `render.yaml`.
5. Click **Apply** / **Create**. Wait for the build. Logs should end with `Uvicorn running on
   http://0.0.0.0:10000`.
6. Copy the service URL from the top of the page, e.g.
   `https://brand-support-copilot-api.onrender.com`. Check in a browser:
   - `…/health` should show `{"status":"ok"}`
   - `…/ready` should show `{"status":"ready","checks":{"postgres":"ok","redis":"ok"}}`
   - `…/v1/demo/status` should show `"demo_mode":true`

> **Created the service by hand instead of via Blueprint?** Then `render.yaml`'s values were not
> applied. In the service, open **Environment** and add **every** variable from
> [`deploy/render.env.example`](../deploy/render.env.example). The non-secret ones are
> `DEMO_MODE=true`, the caps, `NUGEN_BASE_MODEL_ID` and `NUGEN_PRICE_PER_MTOK_USD`. Also set
> `CLIENT_API_KEYS` to a long random string. Leave **Settings → Docker Command** empty: the image's `CMD`
> ([`scripts/start.sh`](../scripts/start.sh)) runs the migrations, then uvicorn on `$PORT` with
> `--proxy-headers`. Check that `…/v1/demo/status` shows
> `"demo_mode":true`. (When hosted, the API never accepts the public dev key, even if
> misconfigured.)

## 4. Vercel (UI): ~4 min

1. Open <https://vercel.com/signup>, then **Continue with GitHub**.
2. **Add New…**, then **Project**, then **Import** `Shelunagori/brand-support-copilot`.
3. **Configure Project**:
   - **Root Directory**: click **Edit**, choose **`ui`**, then **Continue**.
   - Framework Preset: **Vite** (auto-detected; build `npm run build`, output `dist`, from
     [`ui/vercel.json`](../ui/vercel.json)).
   - **Environment Variables**: add **one**:
     `VITE_API_BASE` = your Render URL from step 3 (no trailing slash).
     Do **not** add any API key.
4. Click **Deploy**. When it finishes, copy the domain, e.g.
   `https://brand-support-copilot.vercel.app` (Project, then **Domains**).

## 5. Allow the Vercel domain on the API: ~2 min

1. Render, then **`brand-support-copilot-api`**, then **Environment**.
2. Set `CORS_ORIGINS` = your exact Vercel domain, e.g. `https://brand-support-copilot.vercel.app`
   (https, no trailing slash; comma-separate if you add a custom domain later).
3. **Save changes**. Render redeploys automatically (~2 min).

## 6. Send me the URLs

Send me **the Render URL and the Vercel URL**. I'll run the smoke test (free: no model calls):

```bash
make demo-smoke API=https://<render>.onrender.com UI=https://<app>.vercel.app
```

It checks:
- health and readiness (Neon + Upstash)
- public real data
- the 403s
- that chat requires the code
- CORS allows only your domain
- that the UI and snapshot are served with no API key

If you also send the access code, it checks that too. If you say **"include one chat message"**,
it sends one real message (about $0.02 against the daily cap).

---

## Day-2 operations

- **Aligned model on/off for the public demo:** run `make demo-redeploy` (paid: shows the cost and
  asks y/N) or `make demo-undeploy`. Both also reseed Neon, so the live API follows within ~30 s
  and the UI switches its default (Aligned when deployed, Base otherwise) and its badges by itself.
- **Lifetime cap safety:** when `DEMO_TOTAL_CAP_USD` is reached, the API undeploys the aligned model
  once and sets the Redis key `demo:aligned_disabled`, so all replicas answer with the base model.
  Chat stays paused until you raise the cap. To re-enable the aligned model afterwards: raise the
  cap, delete that key (`redis-cli -u "$UPSTASH_URL" DEL demo:aligned_disabled`), then run
  `make demo-redeploy`.

- **Pause live chat:** in Render, set `DEMO_ACCESS_CODE` to empty. Chat then fails closed with 503;
  everything read-only keeps working.
- **Rotate the code:** change `DEMO_ACCESS_CODE` in Render. Visitors with the old code are asked
  again.
- **Budget:** adjust `DEMO_DAILY_CAP_USD` / `DEMO_TOTAL_CAP_USD`. Usage is in Redis
  (`demo:spend:<date>`, `demo:spend:total`).
- **New results** (after new local evals): run `make demo-seed`, then `make demo-snapshot`,
  commit and push. Vercel redeploys the snapshot; Neon has the new rows.
- **Cold starts:** Render free sleeps after ~15 min idle; the first request takes 30–60 s. The UI
  shows a "Waking up the server… ☕" screen, and Pipeline/Eval/Feedback render instantly from the
  bundled snapshot meanwhile.
