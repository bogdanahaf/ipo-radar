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
  updatedAt: string;
};
```

Rules in v1:

- Watchlist company-name matches get a large score boost.
- Nasdaq/NYSE rows with valid dates are treated as potentially interesting.
- Likely SPACs, unit/warrant rows, sub-$5 IPOs, missing-date rows, and weak-signal rows are hidden from Telegram.
- Hidden rows still render in the dashboard for review.

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

Educational only. Not financial or investment advice.
