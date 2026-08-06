# ONS Trade Data API

A SvelteKit-based client-side API serving UK trade data from the Office for National Statistics (ONS).

## Overview

This project provides a lightweight, file-based API for querying UK trade data. Data is pre-processed and stored as JSON files, enabling fast, stateless API responses without a database.

## Features

- 📊 **Pre-generated data files** - Fast, efficient JSON responses
- 🗂️ **Multiple query dimensions** - Query by commodity, country, time period, or top results
- 🔧 **Easy data processing** - TypeScript scripts for parsing and aggregating data
- 🚀 **Deployable anywhere** - Runs on Node.js or serverless platforms (Vercel, Netlify)

## Project Structure

```
├── src/
│   ├── routes/
│   │   ├── api/
│   │   │   └── [...path]/        # Dynamic API route handler
│   │   └── +page.svelte          # Homepage
│   ├── lib/
│   │   ├── server/
│   │   │   └── data-loader.ts    # File loading utilities
│   │   └── types/
│   │       └── trade.ts           # TypeScript types
│   └── app.html
├── scripts/
│   ├── parse-excel.ts            # Excel file parser
│   └── generate-files.ts         # Data aggregation script
├── data/                          # Generated JSON data files
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

### Processing Excel Files

1. Place your ONS Excel file in `data/raw/`

2. Parse the file:
```bash
npm run parse-data -- data/raw/trade.xlsx data/parsed.json
```

3. Generate aggregated files:
```bash
npm run generate-files -- data/parsed.json
```

This creates pre-aggregated JSON files organized by:
- **Commodity** (`/data/trade-by-commodity/{code}.json`)
- **Country** (`/data/trade-by-country/{code}.json`)
- **Time period** (`/data/trade-by-period/{date}.json`)
- **Top results** (`/data/top-imports/`, `/data/top-exports/`)

## API Endpoints

### Metadata Endpoints

#### Get API Schema
```
GET /api/meta/schema
```

Returns the data schema version and metadata about the dataset.

#### Get Commodities Lookup
```
GET /api/meta/commodities
```

Returns a mapping of commodity codes to names and hierarchy levels.

#### Get Countries Lookup
```
GET /api/meta/countries
```

Returns a mapping of country codes to country names.

#### Get Available Time Periods
```
GET /api/meta/periods
```

Returns an array of available time periods in the dataset.

### Data Endpoints

#### Get Trade by Commodity
```
GET /api/trade-by-commodity/{commodity_code}
```

Returns all trade records for a specific commodity code.

**Example:**
```
GET /api/trade-by-commodity/SITC_28
```

#### Get Trade by Country
```
GET /api/trade-by-country/{country_code}
```

Returns all trade records for a specific country.

**Example:**
```
GET /api/trade-by-country/US
```

#### Get Trade by Period
```
GET /api/trade-by-period/{date}
```

Returns all trade records for a specific time period (YYYY-MM-DD format).

**Example:**
```
GET /api/trade-by-period/2025-12
```

#### Get Top Imports
```
GET /api/top-imports/{period}
```

Returns the top 100 import commodities/countries by trade value for a period.

**Example:**
```
GET /api/top-imports/all-time
```

#### Get Top Exports
```
GET /api/top-exports/{period}
```

Returns the top 100 export commodities/countries by trade value for a period.

**Example:**
```
GET /api/top-exports/all-time
```

#### Get Trade Balance
```
GET /api/balance/{country_code}/{period}
```

Returns the trade balance data for a specific country and period.

**Example:**
```
GET /api/balance/DE/2025-12
```

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

### Testing the API

```bash
# Test a specific endpoint
curl http://localhost:5173/api/meta/schema

# Pretty print JSON
curl http://localhost:5173/api/meta/commodities | jq '.'
```

## Future Enhancements

- [ ] GitHub Actions workflow for automatic data updates (Thursdays 7am)
- [ ] Database backend option for larger datasets
- [ ] Query parameter filtering (e.g., `?minValue=1000000`)
- [ ] Data caching strategies
- [ ] Performance optimizations for large datasets
- [ ] Visualization frontend components

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

