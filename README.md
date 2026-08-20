# ONS Trade Data API

A SvelteKit-based **fully static** query engine for UK trade data from the Office for National Statistics (ONS). All queries run in the browser — no server required.

## Overview

This project pre-processes ONS trade data into JSON files and ships a **client-side `QueryEngine`** that fetches and analyses those files entirely in the browser. It deploys to any static host (GitHub Pages, Netlify, Cloudflare Pages) with zero server cost.

## Features

- 📊 **Pre-generated data files** — Fast JSON files served from any CDN
- 🔍 **Multidimensional client-side queries** — Filter by commodity, country, flow, and date range simultaneously
- 📈 **Built-in analytics** — Partner reliance, growth discovery, trade balance breakdown, anomaly detection
- 🌐 **Fully static** — `adapter-static` build, no Node.js server required
- 🔧 **Easy data processing** — TypeScript scripts for parsing and aggregating data
- 🚀 **Deployable anywhere** — GitHub Pages, Netlify, Cloudflare Pages, or any CDN

## Project Structure

```
├── src/
│   ├── routes/
│   │   ├── +layout.ts            # prerender = true
│   │   └── +page.svelte          # Interactive query demo
│   ├── lib/
│   │   ├── query-engine.ts       # Client-side multidimensional query engine
│   │   └── types/
│   │       └── trade.ts          # TypeScript types + query result types
│   └── app.html
├── scripts/
│   ├── parse-excel.ts            # Country-by-commodity Excel parser
│   ├── parse-allcountries.ts     # All-countries SA Excel parser
│   ├── parse-mret.ts             # MRET CSV (trade in services) parser
│   └── generate-files.ts         # Data aggregation + index generation
├── data/                          # Generated JSON data files
│   ├── meta/
│   │   ├── index.json            # Lightweight per-country lookup index
│   │   ├── commodities.json
│   │   ├── countries.json
│   │   └── time-periods.json
│   ├── trade-by-commodity/
│   ├── trade-by-country/
│   └── trade-by-period/
└── package.json
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
# Start development server
npm run dev

# Visit http://localhost:5173
```

### Production Build

```bash
npm run build
npm run preview
```

## Data Processing

The raw ONS files live in `data/raw/` and are committed to the repository so the automated workflow can detect changes.

### Source files

| File | Description | Parser script |
|---|---|---|
| `countrybycommodityexports.xlsx` | Monthly exports by country × commodity | `parse-excel.ts` |
| `countrybycommodityimports.xlsx` | Monthly imports by country × commodity | `parse-excel.ts` |
| `allcountries*.xlsx` | Annual/quarterly/monthly totals for all countries (SA) | `parse-allcountries.ts` |
| `mret.csv` | UK trade in services time series | `parse-mret.ts` |

### Running the pipeline

```bash
# Parse country-by-commodity Excel files
npm run parse-data

# Parse all-countries seasonally adjusted file
npm run parse-allcountries

# Parse trade-in-services CSV
npm run parse-services

# Generate all aggregated static/data/ JSON files
npm run generate-files

# Or run all steps in sequence
npm run refresh-data
```

This creates pre-aggregated JSON files served as static assets, organised by:
- **Commodity** (`static/data/trade-by-commodity/{code}.json`)
- **Country** (`static/data/trade-by-country/{code}.json`)
- **Time period** (`static/data/trade-by-period/{date}.json`)
- **Top results** (`static/data/top-imports/`, `static/data/top-exports/`)
- **Meta index** (`static/data/meta/index.json`) — compact per-country lookup


## Data Schema

Each trade record contains:

```typescript
{
  commodity_code: string;        // e.g., "SITC_28"
  commodity_name: string;        // e.g., "Metallic ore and metal scrap"
  commodity_level: number;       // Hierarchy level (1-4)
  country_code: string;          // ISO 3166-1 alpha-2
  country_name: string;
  flow: 'import' | 'export';
  date: string;                  // YYYY-MM-DD
  period_type: 'monthly' | 'quarterly' | 'annual';
  value_gbp: number;             // Trade value in GBP
  volume: number | null;         // Physical quantity (if available)
  volume_unit: string | null;    // e.g., "tonnes"
  data_source: string;           // "ONS"
  last_updated: string;          // ISO timestamp
}
```

## Deployment

### Vercel

```bash
npm run build
# Deploy the .svelte-kit/output directory
```

### Node.js Server

```bash
npm run build
npm start
```

The server will listen on `http://localhost:3000` by default.

### Environment Variables

Create a `.env` file for configuration:

```
VITE_API_PORT=3000
NODE_ENV=production
```

## Development

### Adding New Data

1. Update the Excel files in `data/raw/`
2. Run the parse and generate scripts
3. The API will automatically serve the new data

### Customizing Data Processing

Edit `scripts/generate-files.ts` to:
- Change the directory structure
- Modify aggregation logic
- Add new endpoints

## Client-Side Query Engine

`src/lib/query-engine.ts` provides four analytical query types that run entirely in the browser:

### 1. Partner Reliance
Which countries supply (or receive) a given commodity? Tracks concentration risk.

```typescript
const engine = new QueryEngine('/data');
const results = await engine.partnerReliance('28', { flow: 'import', year: 2024 }, 10);
// → [{ country_code, country_name, value_gbp, share_pct, periods }]
```

### 2. Export / Import Growth Discovery
Which product categories are surging with a given partner over a time window?

```typescript
const growth = await engine.topGrowth('US', 'export', 12, 20);
// → [{ code, name, value_start, value_end, growth_pct, periods_compared }]
```

### 3. Trade Balance Breakdown
Net trade with a country, broken down by commodity. Sorted by largest deficit first.

```typescript
const balance = await engine.balanceBreakdown('DE', { year: 2024 });
// → [{ commodity_code, commodity_name, imports_gbp, exports_gbp, net_gbp }]
```

### 4. Anomaly / Outlier Detection
Flags statistically unusual trade values using z-score analysis.

```typescript
const outliers = await engine.outliers({ type: 'country', code: 'CN' }, { flow: 'export' }, 2.5);
// → [{ record, mean_value, std_dev, z_score }]
```

All methods accept a `QueryFilter` for composable multi-dimensional filtering:

```typescript
interface QueryFilter {
  flow?: 'import' | 'export';
  commodityCode?: string;
  countryCode?: string;
  dateFrom?: string;   // "YYYY-MM-DD"
  dateTo?: string;
  year?: number;
  periodType?: 'monthly' | 'quarterly' | 'annual';
}
```

### How it works

The engine fetches one pre-generated file as an "anchor" (by country or by commodity), then filters and aggregates entirely client-side. Results are cached in-memory so repeated queries on the same anchor are instant.

| Query | File fetched | Client-side logic |
|---|---|---|
| Partner Reliance | `trade-by-commodity/{code}.json` | filter flow + year, group by country |
| Growth Discovery | `trade-by-country/{code}.json` | period-over-period % change by commodity |
| Balance Breakdown | `trade-by-country/{code}.json` | group by commodity, net = exports − imports |
| Anomaly Detection | either file | z-score vs dataset mean |

## Data Files

```
data/
├── meta/
│   ├── index.json          ← lightweight per-country lookup (commodities + periods)
│   ├── commodities.json
│   ├── countries.json
│   └── time-periods.json
├── trade-by-commodity/     ← one JSON array per commodity code
├── trade-by-country/       ← one JSON array per country code
├── trade-by-period/        ← one JSON array per date
├── top-imports/
├── top-exports/
└── balance/
```

## Deployment

### GitHub Pages / Netlify / Cloudflare Pages

```bash
npm run build
# Upload the `build/` directory to any static host
```

No server needed. Point your static host's root to `build/`.

### Local Preview

```bash
npm run build
npm run preview
```

## Development

### Adding New Data

1. Update the Excel files in `data/raw/`
2. Run the parse and generate scripts:
   ```bash
   npm run parse-data -- data/raw/trade.xlsx data/parsed.json
   npm run generate-files -- data/parsed.json
   ```
3. Rebuild: `npm run build`

### Customising Query Logic

Edit `src/lib/query-engine.ts` to add new query methods or change aggregation logic.
Edit `scripts/generate-files.ts` to change the generated file structure.

## Automated Data Updates

A GitHub Actions workflow (`.github/workflows/update-data.yml`) runs every **weekday at 7am UTC** and keeps the data current with no manual intervention.

### What it does

1. **Checks for new ONS files** — scrapes each dataset page for the current download URL and compares against `data/raw/` (filename comparison for the date-named `allcountries*.xlsx`; SHA-256 hash for stable-named files)
2. **Downloads updated files** if anything changed
3. **Re-runs the full processing pipeline** — `parse-data` → `parse-allcountries` → `parse-services` → `generate-files`
4. **Validates output** — checks `static/data/meta/schema.json` has ≥ 100,000 records; fails the run if not
5. **Commits and pushes** updated `data/raw/` and `static/data/` back to `main`

### Data sources monitored

| Dataset | File | ONS page |
|---|---|---|
| Trade in goods: all countries SA | `allcountries*.xlsx` (date-named) | [link](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/uktradeallcountriesseasonallyadjusted) |
| Country-by-commodity exports | `countrybycommodityexports.xlsx` | [link](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/uktradecountrybycommodityexports) |
| Country-by-commodity imports | `countrybycommodityimports.xlsx` | [link](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/uktradecountrybycommodityimports) |
| UK trade time series (MRET) | `mret.csv` | [link](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/tradeingoodsmretsallbopeu2013timeseriesspreadsheet) |

### Triggering manually

```bash
gh workflow run update-data.yml
# or via GitHub UI: Actions → Update ONS Trade Data → Run workflow
```

### Rate limiting

Follows [ONS bot guidance](https://developer.ons.gov.uk/bots/): uses a `ONSTradeDataUpdater/1.0.0` User-Agent, honours `Retry-After` headers on 429 responses, and adds polite pauses between requests.

## Future Enhancements

- [ ] Visualisation components (charts per query result)
- [ ] Exportable CSV from query results
- [ ] Shareable query URLs (encode filters in hash/search params)

## Data Sources

- UK trade data from [Office for National Statistics](https://www.ons.gov.uk)
- Published in the UK Trade bulletins

## License

MIT

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

