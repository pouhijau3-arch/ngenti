# WEB-AI

A real AI chat website: static frontend + Vercel Node.js Serverless
Functions. No Android/Electron/Flask/VPS/localhost-after-deploy — it
runs as `GitHub → Vercel → https://<your-app>.vercel.app → browser`.

## Status legend (used throughout this README)

- **IMPLEMENTED** — the source code integration is real (real HTTP
  calls to the real provider, real parsing, real error handling).
- **CONFIGURED** — the required environment variable(s) are set.
- **TESTED** — a smoke test has actually been run against the real
  provider with real credentials.
- **AVAILABLE** — the feature can currently be used by an end user
  (implies configured; testing is the operator's responsibility once
  credentials are added, see "Smoke testing" below).

A feature can be **IMPLEMENTED** without being **CONFIGURED**. When
not configured, every endpoint in this app returns a clear
`*_NOT_CONFIGURED` JSON error instead of a fabricated response — it
never silently falls back to a fake answer.

## Feature matrix

| Feature | Implemented | Provider | Requires |
|---|---|---|---|
| Chat (streaming, tool calling) | ✅ | xKiro (`api.xkiro.com`) | `XKIRO_API_KEY` |
| Model catalog | ✅ | xKiro `GET /v1/models` (live, not hardcoded) | `XKIRO_API_KEY` (public endpoint, key optional) |
| Web Search | ✅ | Brave Search API | `SEARCH_API_KEY` |
| Weather | ✅ | OpenWeatherMap | `WEATHER_API_KEY` |
| World Time | ✅ | Node/ICU IANA timezone database (no key needed) | — |
| Calculator | ✅ | mathjs safe evaluator (no `eval`) | — |
| YouTube search | ✅ | YouTube Data API v3 | `YOUTUBE_API_KEY` |
| YouTube/music playback | ✅ | Official YouTube IFrame Player API | — (no key) |
| GitHub connect/verify | ✅ | GitHub REST API (`GET /user`) | user pastes a PAT in the UI |
| GitHub read (repos/files) | ✅ | GitHub REST API | connected session |
| GitHub write/delete | ✅ | GitHub REST API, SHA-checked, approval-gated | connected session |
| Persistent sessions/approvals/rate-limit | ✅ | Upstash Redis REST API | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Session encryption at rest | ✅ | AES-256-GCM | `SESSION_ENCRYPTION_KEY` |

Nothing above is a mock. See `docs/xkiro-api.md` for the xKiro
verification notes specifically.

## Project structure

```
public/            static frontend (HTML/CSS/vanilla JS)
api/
  chat.js          POST /api/chat        - streaming chat + tool orchestration
  models.js        GET  /api/models      - live xKiro model catalog
  search.js        GET  /api/search      - standalone web search
  plugins/
    weather.js     GET  /api/plugins/weather
    calculator.js  POST /api/plugins/calculator
    time.js        GET  /api/plugins/time
    music.js       GET  /api/plugins/music
  github/
    verify.js      POST /api/github/verify      - PAT verification + session
    repos.js       GET  /api/github/repos
    files.js       GET  /api/github/files
    write.js       POST /api/github/write        - approval-gated
    delete.js      POST /api/github/delete       - approval-gated
    approve.js     POST /api/github/approve      - one-time approval / Auto Apply toggle
    disconnect.js  POST /api/github/disconnect
lib/               shared, provider-specific integration modules
docs/xkiro-api.md  xKiro documentation verification notes
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in what you have. At minimum,
   set `XKIRO_API_KEY` to get chat working.
3. For local development: `npx vercel dev` (requires the Vercel CLI
   and a Vercel account; `vercel dev` reproduces the serverless
   environment locally, including env var injection).
4. Deploy: push to GitHub, import the repo in Vercel, add the same
   environment variables in **Project → Settings → Environment
   Variables**, deploy. No shell access to the deployed environment is
   needed or used.

## Required environment variables

See `.env.example` for the full list and provider doc links. Only
`XKIRO_API_KEY` is required for the app to start being useful; every
other integration degrades to a clear `NOT CONFIGURED` error until you
add its key, rather than a fake response.

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and
`SESSION_ENCRYPTION_KEY` are required specifically for the GitHub
plugin and for distributed rate limiting — without them, GitHub
connect returns `STORAGE_NOT_CONFIGURED` and rate limiting fails open
with a warning header (`X-RateLimit-Status: disabled-not-configured`)
rather than pretending to enforce a limit it can't actually persist.

## Security model (summary)

- All request bodies are size- and shape-validated server-side
  (`lib/validation.js`); the frontend is never trusted as a boundary.
- Security headers (CSP, no-sniff, frame-deny, HSTS in prod) are set
  on every response (`lib/security.js`).
- CSRF is enforced (double-submit cookie) on every state-changing
  GitHub endpoint.
- GitHub tokens are encrypted at rest (AES-256-GCM) and never sent
  back to the browser; the browser only holds an opaque session id in
  an `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
- GitHub writes/deletes require the current blob `sha` (optimistic
  concurrency, same as the GitHub Contents API) and go through a
  one-time, session-bound approval unless the user has explicitly
  turned on Auto Apply for that session. The AI itself cannot flip
  Auto Apply — only a direct user action in the UI can.
- Web search / page content returned to the model is explicitly framed
  as untrusted data in the system prompt (`api/chat.js`); the model is
  told never to treat it as instructions.
- Tool-call orchestration is hard-capped at 10 iterations
  (`lib/config.js` → `app.maxToolIterations`).
- No arbitrary code execution anywhere: the calculator uses mathjs's
  restricted evaluator, never `eval`/`new Function`.
- Outbound calls this app makes (weather/search/YouTube) go through
  `assertSafeOutboundUrl`, which blocks non-HTTPS, localhost, private
  IP ranges, and the cloud metadata address, as defense in depth even
  though none of these calls currently take a user-supplied host.

## Known limitations / honest gaps

- Rate limiting requires Upstash; without it requests are allowed
  through with a visible warning header rather than silently
  unlimited-looking-limited.
- The GitHub flow uses a user-pasted Personal Access Token rather than
  a full GitHub OAuth App (no client secret to manage), which is
  simpler and equally real, but means users must generate their own
  token (fine-grained PATs recommended, scoped to the specific repos
  needed).
- xKiro's exact streaming/tool-call wire format was verified against
  its published guides, not a full endpoint-by-endpoint reference dump
  — see `docs/xkiro-api.md` for exactly what was and wasn't checked.
- TTS and image generation, which xKiro also exposes, are out of scope
  for this build and are not implemented under any plugin.

## Smoke testing

Once `XKIRO_API_KEY` is set:

1. Load the app, confirm the model dropdown populates from
   `/api/models` (not a hardcoded list).
2. Send a message with all plugins off — plain streaming chat.
3. Turn on Calculator and World Time (no keys needed) and ask a
   question that requires them; confirm the tool-call trace appears
   and the tool actually executed.
4. Add `SEARCH_API_KEY` / `WEATHER_API_KEY` / `YOUTUBE_API_KEY` as
   available and repeat with those plugins on.
5. Add Upstash + `SESSION_ENCRYPTION_KEY`, connect a GitHub PAT, try a
   read (`github_read_file`) and a write (confirm the approval modal
   appears and nothing is written until you click "Apply change").
