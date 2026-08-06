# Data Processing Guide

This guide explains how to process ONS trade data from Excel files into the JSON format used by the API.

## Data Flow Overview

```
ONS Excel Files
    ↓
Parse Excel (parse-excel.ts)
    ↓
Raw JSON Records
    ↓
Normalize Data (generate-files.ts)
    ↓
Aggregated JSON Files
    ↓
SvelteKit API ← API Requests
```

## Step 1: Parse Excel Files

### Overview
The `parse-excel.ts` script reads Excel files and extracts trade data.

### Supported Format
The script expects Excel sheets with columns like:
- Commodity Code / COICOP
- Commodity Name / Description
- Country Code / Partner
- Country Name
- Flow / Direction (import/export)
- Value / Trade Value
- Volume (optional)
- Volume Unit / Unit (optional)
- Date / Period

### Usage
```bash
npm run parse-data -- <input-file> <output-file>

# Example
npm run parse-data -- data/raw/trade.xlsx data/parsed.json
```

### Output Format
Creates a JSON file with an array of raw trade records:
```json
[
  {
    "commodity_code": "SITC_28",
    "commodity_name": "Metallic ore and metal scrap",
    "country_code": "BR",
    "country_name": "Brazil",
    "flow": "import",
    "value": 2156789034,
    "volume": 890000,
    "volume_unit": "tonnes",
    "date": "2025-12"
  }
]
```

### Customization
Edit `scripts/parse-excel.ts` to adjust column mappings:
```typescript
const record: RawTradeData = {
  commodity_code: row['Your Column Name'] || '',
  // ... customize other fields
};
```

---

## Step 2: Normalize Data

### Overview
The `generate-files.ts` script normalizes raw data and creates aggregated files.

### Normalization Process
1. **Standardizes formats:**
   - Commodity codes → UPPERCASE
   - Country codes → ISO 3166-1 alpha-2
   - Dates → YYYY-MM-DD format
   - Values → Rounded integers

2. **Derives missing fields:**
   - Commodity level (1-4) from code structure
   - Period type (monthly/quarterly/annual) from date

3. **Validates data:**
   - Only includes records with commodity, country, and value
   - Ensures value > 0

### Usage
```bash
npm run generate-files -- <input-file>

# Example
npm run generate-files -- data/parsed.json
```

### Output Structure
Creates organized JSON files in `data/`:

```
data/
├── meta/
│   ├── commodities.json      # All commodity codes → names
│   ├── countries.json        # All country codes → names
│   ├── time-periods.json     # Available dates
│   └── schema.json           # Metadata
├── trade-by-commodity/
│   └── {code}.json           # All records for commodity
├── trade-by-country/
│   └── {code}.json           # All records for country
├── trade-by-period/
│   └── {date}.json           # All records for period
├── top-imports/
│   └── all-time.json         # Top 100 imports
└── top-exports/
    └── all-time.json         # Top 100 exports
```

### Record Schema
Normalized records include:
```typescript
{
  commodity_code: string;
  commodity_name: string;
  commodity_level: number;      // Derived
  country_code: string;
  country_name: string;
  flow: 'import' | 'export';
  date: string;                 // Normalized
  period_type: string;          // Derived
  value_gbp: number;           // Rounded
  volume: number | null;
  volume_unit: string | null;
  data_source: string;         // Always "ONS"
  last_updated: string;        // ISO timestamp
}
```

---

## Full Processing Example

### 1. Download ONS Data
Get the latest trade Excel file from ONS website.

### 2. Prepare File
Place in `data/raw/`:
```bash
cp ~/Downloads/ons_trade_data.xlsx data/raw/
```

### 3. Parse to JSON
```bash
npm run parse-data -- data/raw/ons_trade_data.xlsx data/parsed.json
```

Check output:
```bash
cat data/parsed.json | jq '.[0]'
```

### 4. Generate Aggregated Files
```bash
npm run generate-files -- data/parsed.json
```

Verify files created:
```bash
find data -type f -name "*.json" | head -20
```

### 5. Restart API
```bash
# If dev server running, it hot-reloads
# Otherwise restart manually
npm run dev
```

### 6. Test New Data
```bash
curl http://localhost:5173/api/meta/schema
curl http://localhost:5173/api/trade-by-country/us | jq '.[] | .value_gbp' | head -5
```

---

## Advanced: Customize Aggregation

### Modify Top N Results
Edit `scripts/generate-files.ts`:
```typescript
// Change from 100 to 50 top results
fs.writeFileSync(
  path.join(DATA_DIR, 'top-imports', 'all-time.json'),
  JSON.stringify(importsByValue.slice(0, 50), null, 2)  // Change 100 to 50
);
```

### Add New Aggregations
Example: Group by flow type:
```typescript
// Add after generating top-imports/exports
const byFlow: Record<string, NormalizedRecord[]> = {};
for (const record of records) {
  if (!byFlow[record.flow]) {
    byFlow[record.flow] = [];
  }
  byFlow[record.flow].push(record);
}

for (const [flow, data] of Object.entries(byFlow)) {
  fs.writeFileSync(
    path.join(DATA_DIR, `by-flow`, `${flow}.json`),
    JSON.stringify(data, null, 2)
  );
}
```

Then access via: `GET /api/by-flow/import`

### Filter Specific Time Periods
```typescript
// Only process 2025 data
const records2025 = records.filter(r => r.date.startsWith('2025'));
generateAggregatedFiles(records2025);
```

---

## Troubleshooting Data Issues

### Excel Parse Errors
**Problem:** Script crashes when parsing Excel
**Solution:** Check column names match your Excel structure and update parse-excel.ts

### Missing Files After Generation
**Problem:** Some aggregated files not created
**Solution:** Ensure input data has all required fields (commodity_code, country_code, value)

### Inconsistent Commodity Codes
**Problem:** Same commodity appears with different codes
**Solution:** Add mapping logic in normalization:
```typescript
// Add to normalizeData function
const codeMapping: Record<string, string> = {
  'COICOP_28': 'SITC_28',
  // ... add mappings
};
record.commodity_code = codeMapping[record.commodity_code] || record.commodity_code;
```

### Date Format Issues
**Problem:** Dates parsed incorrectly
**Solution:** Update `normalizeDate()` function in generate-files.ts

---

## File Size Optimization

### Monitor Generated Files
```bash
du -sh data/*
find data -type f -name "*.json" -exec wc -c {} \; | sort -n | tail -10
```

### Compress Data (Optional)
```bash
# Compress JSON files
gzip -k data/**/*.json

# Nginx will serve .gz automatically
```

### Split Large Datasets
For very large datasets, split by year:
```typescript
// In generate-files.ts
const byYear: Record<string, NormalizedRecord[]> = {};
for (const record of records) {
  const year = record.date.substring(0, 4);
  if (!byYear[year]) byYear[year] = [];
  byYear[year].push(record);
}

// Save separately
for (const [year, data] of Object.entries(byYear)) {
  fs.writeFileSync(
    path.join(DATA_DIR, `trade-by-year/${year}.json`),
    JSON.stringify(data, null, 2)
  );
}
```

---

## Validating Data Quality

### Check Record Count
```bash
cat data/parsed.json | jq 'length'
```

### Verify No Nulls in Required Fields
```bash
cat data/parsed.json | jq '.[] | select(.commodity_code == null or .country_code == null or .value == null) | length'
```

### Check Value Distribution
```bash
cat data/parsed.json | jq '[.[].value] | {min: min, max: max, avg: (add/length)}'
```

### Verify Dates
```bash
cat data/parsed.json | jq '[.[].date] | unique'
```

---

## Automation (Future)

Currently manual. When GitHub Actions are implemented:

```yaml
name: Process ONS Data
on:
  schedule:
    - cron: '0 7 * * 4'  # Thursday 7am

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run parse-data -- data/raw/*.xlsx data/parsed.json
      - run: npm run generate-files -- data/parsed.json
      - run: git commit -am "Update trade data"
      - run: git push
```

