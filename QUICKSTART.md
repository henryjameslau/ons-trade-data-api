# Quick Start Guide

Get the ONS Trade Data API running in 5 minutes!

## 1. Install Dependencies

```bash
npm install
```

## 2. Generate Sample Data (Already Done!)

Sample data files are already generated in `/data`. Ready to use!

## 3. Start Development Server

```bash
npm run dev
```

Visit http://localhost:5173

## 4. Test the API

### Get Metadata
```bash
curl http://localhost:5173/api/meta/schema
curl http://localhost:5173/api/meta/commodities
curl http://localhost:5173/api/meta/countries
```

### Get Trade Data
```bash
# All US imports/exports
curl http://localhost:5173/api/trade-by-country/us

# Specific commodity
curl http://localhost:5173/api/trade-by-commodity/SITC_28

# Specific time period
curl http://localhost:5173/api/trade-by-period/2025-12

# Top imports
curl http://localhost:5173/api/top-imports/all-time

# Top exports
curl http://localhost:5173/api/top-exports/all-time
```

## 5. Refresh Data

The data in `static/data/` is automatically kept up to date by a scheduled GitHub Actions workflow (weekdays 7am UTC). To refresh locally:

### Step 1: Download latest ONS files
Download the current files to `data/raw/`:
- [All countries SA](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/uktradeallcountriesseasonallyadjusted) → `allcountries*.xlsx`
- [Country-by-commodity exports](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/uktradecountrybycommodityexports) → `countrybycommodityexports.xlsx`
- [Country-by-commodity imports](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/uktradecountrybycommodityimports) → `countrybycommodityimports.xlsx`
- [UK trade time series](https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/datasets/tradeingoodsmretsallbopeu2013timeseriesspreadsheet) → `mret.csv`

### Step 2: Run the full pipeline
```bash
npm run refresh-data
```

This runs all four steps in sequence:
1. `parse-data` — country-by-commodity exports + imports
2. `parse-allcountries` — all-countries seasonally adjusted totals
3. `parse-services` — trade in services from MRET CSV
4. `generate-files` — regenerate all `static/data/**` JSON

## 6. Deploy

### Quick Deploy to Vercel
```bash
npm install -g vercel
vercel
```

### Or Deploy Anywhere
```bash
npm run build
# Deploy the .svelte-kit/output directory
```

## 7. Explore More

- **API Docs:** [docs/API.md](docs/API.md)
- **Full README:** [README.md](README.md)
- **Deployment Guide:** [DEPLOYMENT.md](DEPLOYMENT.md)

## Available Commands

```bash
npm run dev                  # Start development server
npm run build                # Build for production
npm run preview              # Preview production build locally
npm run parse-data           # Parse country-by-commodity Excel files
npm run parse-allcountries   # Parse all-countries SA Excel file
npm run parse-services       # Parse MRET trade-in-services CSV
npm run generate-files       # Generate aggregated static/data/ JSON
npm run refresh-data         # Run full pipeline (all four steps above)
```

## Project Structure

```
src/
  ├── routes/api/         # API endpoints
  └── lib/                # Utilities and types
scripts/
  ├── parse-excel.ts      # Parse ONS Excel files
  └── generate-files.ts   # Generate aggregated data
data/
  ├── meta/               # Metadata (commodities, countries)
  ├── trade-by-*/         # Organized by dimension
  └── top-*/              # Pre-aggregated top results
docs/
  └── API.md              # Full API documentation
```

## Troubleshooting

### Server won't start
```bash
# Check if port 5173 is in use
lsof -i :5173
# Use different port
npm run dev -- --port 5174
```

### Can't find API endpoints
```bash
# Verify data files exist
ls -la data/meta/
# Should see: commodities.json, countries.json, schema.json, time-periods.json
```

### Data not updating
```bash
# Make sure to run the data generation script
npm run generate-files -- data/parsed.json
# Then restart dev server
```

## Next Steps

1. **Data stays fresh automatically** — the GitHub Actions workflow updates `data/raw/` and regenerates `static/data/` every weekday at 7am UTC
2. **Deploy** — push to Vercel, Netlify, GitHub Pages, or any static host
3. **Add frontend** — build visualisation dashboards on top of the query engine
4. **Extend API** — add filters, date ranges, search
