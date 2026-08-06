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

## 5. Add Your Own Data

### Step 1: Get Excel Data
Download ONS trade data Excel files to `data/raw/`

### Step 2: Parse Excel
```bash
npm run parse-data -- data/raw/your-file.xlsx data/parsed.json
```

### Step 3: Generate Files
```bash
npm run generate-files -- data/parsed.json
```

### Step 4: Restart Server
The API automatically serves the new data!

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
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build locally
npm run parse-data       # Parse Excel files
npm run generate-files   # Generate aggregated JSON files
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

1. **Add real ONS data** - Update with actual trade datasets
2. **Deploy** - Push to Vercel, Netlify, or self-hosted
3. **Automate updates** - Set up GitHub Actions (Phase 2)
4. **Add frontend** - Build visualization dashboards
5. **Extend API** - Add filters, date ranges, search

Enjoy! 🚀
