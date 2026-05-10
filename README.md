# IPO Radar

IPO Radar is a lightweight GitHub Pages site plus a Telegram pipeline: a **Sunday week digest**, **weekday after-close “next session”** list, and a **pre-open ping only when at least one hype-tier name** lists that day. Static Pages cannot call Telegram directly; GitHub Actions posts on a schedule.

It uses the Alpha Vantage `IPO_CALENDAR` endpoint as the main free data source, filters noisy rows like likely SPACs and units, renders a static dashboard from `docs/data/ipos.json`, and posts alerts to a Telegram channel through a bot.

## What v1 does

- Builds a static dashboard in `docs/` for GitHub Pages.
- Fetches expected IPOs from Alpha Vantage.
- Scores IPOs with simple explainable rules.
- Keeps filtered rows visible on the site, but out of Telegram alerts.
- Sends Telegram alerts for:
  - **Sunday 21:00 UTC** — Mon–Sun **week digest** (filtered IPOs in that window + buzz lines).
  - **Mon–Fri after the US close** — filtered names for the **next** market day.
  - **Mon–Fri ~1 hour before the open** — **only if** that session has at least one **hype** IPO (`attentionBand: high` **or** `buzzScore ≥` threshold; default threshold **68**, override with `IPO_HYPE_THRESHOLD`).
- When a **today** or **tomorrow** post goes out, the next such post (after one or more skipped days) can prepend **day-1 open→close %** for tickers from the **last** daily digest, using Alpha Vantage `TIME_SERIES_DAILY` on that digest’s listing date (approximate vs official tape).
- Adds a **buzz** line per listing: keyword + venue + price-band heuristics for “narrative heat” only (not a return or volatility forecast).
- Stores `docs/data/alert-state.json` to avoid duplicate channel posts and to remember the **last daily digest** (`lastDailyDigest`) for that follow-up block.

## What v1 does not do

- No Schwab, IBKR, Robinhood, or allocation workflow.
- No trade execution.
- No investment advice.
- No paid data dependency.

## Local commands

```bash
npm test
npm run refresh -- --input test/fixtures/alpha-vantage-sample.csv
npm run alert:tomorrow:dry
npm run alert:today:dry
npm run alert:ping:dry
npm run alert:week:dry
```

For a live refresh:

```bash
ALPHAVANTAGE_API_KEY=your_key npm run refresh
```

For a live Telegram send:

```bash
TELEGRAM_BOT_TOKEN=your_token \
TELEGRAM_CHAT_ID=@your_channel_username \
IPO_RADAR_SITE_URL=https://your-github-user.github.io/ipo-radar/ \
npm run alert -- --type tomorrow
```

### Verify Telegram (first message)

- **GitHub:** Actions → **IPO Radar** → Run workflow → `alert_type: ping`, `dry_run: false`. This posts a short “connected” message even when the calendar is empty. It does **not** touch `alert-state.json` dedupe keys for `today` / `tomorrow`.
- **Ping skips the Alpha Vantage refresh** so you can prove Telegram wiring even if `ALPHAVANTAGE_API_KEY` is missing or rate-limited. Full runs still require the key for `npm run refresh`.
- **Local:** `npm run alert:ping` with the same `TELEGRAM_*` and `IPO_RADAR_SITE_URL` env vars.

### Full pipeline (data + alerts) — what to click

All of this is the **IPO Radar** workflow unless noted. `dry_run` should be **false** unless you are only printing text.

For a manual **`week`** run, **`week_preview`** defaults to **on** in Actions: the digest is posted but **`alert-state.json` is not updated**, so the **scheduled Sunday** digest for the same Mon–Sun window can still fire. Turn **`week_preview`** off only if you want that manual run to count as the official week send for dedupe purposes.

| `alert_type` | Alpha Vantage refresh | Commit `docs/data/*.json` | Deploy Pages | Telegram |
| --- | --- | --- | --- | --- |
| **`sync`** / **`none`** | yes | yes (if diff) | yes | no |
| **`ping`** | **no** | no | yes | yes (connectivity ping) |
| **`tomorrow`** | yes | yes (if diff) | yes | yes — **next session** digest (+ optional **AI + web** per ticker) |
| **`today`** | yes | yes (if diff) | yes | yes — **~1h pre-open**, **hype gate** (+ optional **AI + web** per ticker; skipped if nothing hype-tier lists that day) |
| **`week`** | yes | yes (if diff) | yes | yes — **Mon–Sun** digest + optional **AI + web** lines **under each ticker** (if `OPENAI_API_KEY` is set) |
| **`both`** | yes | yes (if diff) | yes | yes — runs **`today`** then **`tomorrow`** |

**The “full” operator loop you usually want**

1. **`sync`** (default) or **`none`** — pull calendar JSON, push it to `main` if it changed, redeploy Pages. No Telegram noise.
2. **`tomorrow`** when you also want the **next-session** channel post immediately (or rely on the Mon–Fri **20:30/21:30 UTC** schedule instead).
3. **`week`** when you want the **week-ahead** post on demand (or wait for **Sunday 21:00 UTC**).
4. **`Pages site only`** (separate workflow) — redeploy `docs/` from git **without** Alpha Vantage or tests; use when the main job failed after refresh but you still want the latest HTML live.

Scheduled automation mirrors **`tomorrow`**, **`today`** (hype-gated), and **`week`** as described in **Schedules** below.

## GitHub setup

1. Create a public GitHub repository named `ipo-radar`.
2. Push this project:

```bash
git remote add origin git@github.com:YOUR_USER/ipo-radar.git
git push -u origin main
```

3. In GitHub, add repository secrets:
   - `ALPHAVANTAGE_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - optional `OPENAI_API_KEY` — if set, **week**, **today**, and **tomorrow** add **per-ticker** **AI + web** lines (week-ahead uses a slightly richer cap; listing-day alerts stress fresh wires). Spotlight labels are **capped** vs each row’s Buzz/100. Not return forecasts or advice.
4. In GitHub, add repository variables:
   - `IPO_RADAR_SITE_URL`, for example `https://YOUR_USER.github.io/ipo-radar/`
   - optional `IPO_WATCHLIST`, comma-separated company keywords
   - optional `IPO_HYPE_THRESHOLD` (number, default `68` for the pre-open hype gate)
   - optional `OPENAI_MODEL` — Chat Completions fallback if web search is off or fails (default `gpt-4o-mini`)
   - optional `OPENAI_RESPONSES_MODEL` — model for Responses + web search (default `gpt-4o`)
   - optional `OPENAI_WEB_SEARCH` — set to `false` to disable hosted web search and use the fallback only
5. In repository Settings -> Pages, set the source to GitHub Actions.
6. Run the `IPO Radar` workflow manually once (default **`sync`** = data + Pages only).

### Pages UI looks stale

- Hard-refresh the site (**Cmd+Shift+R** / **Ctrl+Shift+R**). GitHub’s CDN can cache HTML for a bit.
- If the main **IPO Radar** workflow fails before **Deploy to GitHub Pages** (tests, Alpha Vantage, Telegram, etc.), the public site will not update. Run **Actions → “Pages site only” → Run workflow** to publish whatever is already on `main` under `docs/` (no API, no tests, no commits).

## Telegram setup

1. Create a bot with BotFather and copy the token.
2. Create a Telegram channel.
3. Add the bot as an admin with permission to post messages.
4. Use a public channel username like `@your_channel_username` for `TELEGRAM_CHAT_ID`.

If the channel is private, use the numeric channel id instead.

## Data and scoring

The normalized event shape is:

```ts
type IpoEvent = {
  symbol: string;
  companyName: string;
  exchange?: string;
  ipoDate: string;
  priceRange?: string;
  source: "alpha_vantage";
  score: number;
  reasons: string[];
  hiddenReason?: "spac" | "unit" | "microcap" | "missing_date" | "low_signal";
  buzzScore: number;
  attentionBand: "high" | "medium" | "low";
  buzzReasons: string[];
  updatedAt: string;
};
```

Rules in v1:

- Watchlist company-name matches get a large score boost.
- Nasdaq/NYSE rows with valid dates are treated as potentially interesting.
- Likely SPACs, unit/warrant rows, sub-$5 IPOs, missing-date rows, and weak-signal rows are hidden from Telegram.
- Hidden rows still render in the dashboard for review.
- **Buzz** ranks attention from story-like keywords (AI, software, bio, etc.), listing venue, price band, and watchlist hits. Use it to sort what to read first, not to infer opening prints.

## Schedules

Cron times are UTC (duplicate morning slots stay DST-safe):

- **Weekday pre-open hype gate:** `30 12` and `30 13` Mon–Fri — `today` alert (skipped automatically if no hype-tier IPOs that session).
- **Weekday after-close:** `30 20` and `30 21` Mon–Fri — `tomorrow` digest.
- **Sunday week digest:** `0 21` — `week` (upcoming Mon–Sun window in America/New_York calendar dates).

Duplicate prevention is handled by `docs/data/alert-state.json`.

### Will the workflow keep running?

**Yes — on every cron match.** `on.schedule` in `.github/workflows/ipo-radar.yml` starts a **new** workflow run each time (Mon–Fri twice for `today`, twice for `tomorrow`, Sun for `week`). A successful run does **not** disable the next one.

What *can* look like “it only ran once”:

- **Telegram skipped** — `send-alert.js` checks `alert-state.json`; if that `today`/`tomorrow`/`week` key was already sent for the same date/window, the job still **finishes green** but logs something like `already sent; skipping` and does not post again. That is intentional dedupe, not a broken schedule.
- **GitHub UI** — filter **Actions → IPO Radar** and sort by time: you should see recurring runs at the UTC times under **Schedules** (roughly every weekday for the two jobs, plus Sunday).

**Node.js 20 warning on Pages steps:** the job sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` so those actions run on Node 24. GitHub may still print an advisory until `configure-pages` / `deploy-pages` / `upload-pages-artifact` update their declared runtime; it does not mean the job ran only once.

## Analytics for the public Pages site

GitHub Pages is static HTML — there is no built-in visitor analytics. Common minimal options:

- **GitHub traffic** — repo **Insights → Traffic** for referrers/views (coarse, repo-level only).
- **Privacy-friendly embed** — self-host **[Umami](https://umami.is/)** or use **[Plausible](https://plausible.io/)** and paste their one-line script into `docs/index.html` if you accept a third-party beacon.
- **None** — the default build ships **no** trackers.

## Repository hygiene (secrets in git history)

Never commit API keys or bot tokens. To audit an existing clone:

```bash
git rev-list --all | wc -l
git grep -n "sk-[a-zA-Z0-9]\\{20,\\}" $(git rev-list --all)
git grep -n "ghp_[A-Za-z0-9]\\{20,\\}" $(git rev-list --all)
```

If a real secret ever lands in a commit, **rotate the credential** and rewrite history (for example `git filter-repo`) or treat the repo as compromised.

## Sources

- Alpha Vantage IPO Calendar: https://www.alphavantage.co/documentation/#ipo-calendar
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Nasdaq IPO Calendar: https://www.nasdaq.com/market-activity/ipos
- Telegram Bot API: https://core.telegram.org/bots/api

## Notes from common questions (not legal advice)

- **Robinhood geography** — Robinhood’s US entity is primarily for US residents. The company has also rolled out UK-facing brokerage products (for example US-listed equities and related offerings for UK customers). Coverage in the rest of Europe is not uniform “Robinhood everywhere”; check Robinhood’s own country list and terms before assuming you can onboard or keep trading from a new address.
- **Moving from the US to the EU while keeping US accounts** — Eligibility, tax reporting, and whether you may keep a US brokerage account after relocating depend on the broker, products, and your citizenship or residency status. A US bank relationship by itself does not guarantee you can keep every US brokerage workflow. Ask Schwab, Interactive Brokers, or any other firm directly and read their cross-border policies.
- **Allocation windows** — Retail IPO access and “stage” notifications are broker-specific. This repo only mirrors public calendar-style data plus your own watchlist hints.

## Troubleshooting Actions (exit code 1)

- **Alpha Vantage:** `Missing ALPHAVANTAGE_API_KEY` or rate-limit text means the secret is empty or the free tier quota was hit. Wait and re-run, or use `alert_type: ping` to test Telegram only.
- **Git push from Actions fails:** In the repo, **Settings → Actions → General → Workflow permissions**, enable **Read and write permissions** for the `GITHUB_TOKEN` so the workflow can commit `docs/data/*.json` updates to `main`.
- **Telegram `chat not found` (HTTP 400):** `TELEGRAM_CHAT_ID` does not match a chat the bot can see. Store it as a **Repository secret** (same place as the bot token), not a variable. Use `@YourChannel` or a `t.me/YourChannel` URL (the app normalizes that to `@YourChannel`), or the numeric **supergroup** id (often starts with `-100`). The bot must be a **channel administrator** with **Post Messages**. Remove accidental spaces or newlines when pasting the secret. If the channel is private, use the numeric id (e.g. forward a channel post to `@getidsbot` and copy the forwarded chat id).
- **Environment secret override:** If you added `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` under **Settings → Environments → `github-pages` → Environment secrets**, those values **override** repository secrets with the same name. Remove wrong environment secrets or update them to match the channel where this bot is admin.
- **Node deprecation warnings:** The workflow pins **Node 24** and uses current `actions/checkout` / `actions/setup-node` majors, plus `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` for remaining JavaScript actions until GitHub defaults to Node 24 everywhere.

Educational only. Not financial or investment advice.
