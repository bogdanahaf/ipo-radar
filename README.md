# IPO Radar

IPO Radar is a lightweight GitHub Pages site plus Telegram alert pipeline for one job: do not miss interesting IPOs the day before listing and about one hour before the US market opens.

It uses the Alpha Vantage `IPO_CALENDAR` endpoint as the main free data source, filters noisy rows like likely SPACs and units, renders a static dashboard from `docs/data/ipos.json`, and posts alerts to a Telegram channel through a bot.

## What v1 does

- Builds a static dashboard in `docs/` for GitHub Pages.
- Fetches expected IPOs from Alpha Vantage.
- Scores IPOs with simple explainable rules.
- Keeps filtered rows visible on the site, but out of Telegram alerts.
- Sends Telegram alerts for:
  - next market day IPOs after market close
  - same-day IPOs about one hour before market open
- Adds a **buzz** line per listing: keyword + venue + price-band heuristics for “narrative heat” only (not a return or volatility forecast).
- Stores `docs/data/alert-state.json` to avoid duplicate channel posts.

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

Scheduled runs still send **tomorrow’s list after the close** and **today’s list about an hour before the US open** (see cron times below). There is no separate “full day” digest unless you add another cron or run the workflow manually.

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
4. In GitHub, add repository variables:
   - `IPO_RADAR_SITE_URL`, for example `https://YOUR_USER.github.io/ipo-radar/`
   - optional `IPO_WATCHLIST`, comma-separated company keywords
5. In repository Settings -> Pages, set the source to GitHub Actions.
6. Run the `IPO Radar` workflow manually once.

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

GitHub Actions cron is UTC, so the workflow runs duplicate DST-safe schedules:

- `12:30` and `13:30` UTC for the morning alert.
- `20:30` and `21:30` UTC for the after-close next-day alert.

Duplicate prevention is handled by `docs/data/alert-state.json`.

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
- **Node deprecation warnings:** The workflow pins **Node 24** and uses current `actions/checkout` / `actions/setup-node` majors, plus `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` for remaining JavaScript actions until GitHub defaults to Node 24 everywhere.

Educational only. Not financial or investment advice.
