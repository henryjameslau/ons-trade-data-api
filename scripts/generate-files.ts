import * as fs from 'fs';
import * as path from 'path';

interface RawTradeData {
  commodity_code: string;
  commodity_name: string;
  country_code: string;
  country_name: string;
  flow: 'import' | 'export';
  value: number;
  volume?: number;
  volume_unit?: string;
  date: string;
  /** Passed through from parse-excel when available, otherwise derived */
  period_type?: 'annual' | 'quarterly' | 'monthly';
}

interface NormalizedRecord {
  commodity_code: string;
  commodity_name: string;
  commodity_level: number;
  country_code: string;
  country_name: string;
  flow: 'import' | 'export';
  date: string;
  period_type: 'monthly' | 'quarterly' | 'annual';
  value_gbp: number;
  volume: number | null;
  volume_unit: string | null;
  data_source: string;
  last_updated: string;
}

/** Generated JSON files go into static/data/ so SvelteKit serves them as static assets */
const DATA_DIR = path.join(process.cwd(), 'static', 'data');

/**
 * Sanitize filename to prevent issues with special characters
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')  // Replace problematic characters
    .replace(/\s+/g, '_')            // Replace spaces with underscores
    .replace(/_+/g, '_')             // Collapse multiple underscores
    .toLowerCase();
}

/**
 * Normalize trade data
 */
export function normalizeData(rawData: RawTradeData[]): NormalizedRecord[] {
  return rawData.map(record => ({
    commodity_code: record.commodity_code.toUpperCase(),
    commodity_name: record.commodity_name.trim(),
    commodity_level: deriveCommodityLevel(record.commodity_code),
    country_code: record.country_code.toUpperCase(),
    country_name: record.country_name.trim(),
    flow: record.flow,
    date: normalizeDate(record.date),
    period_type: record.period_type ?? derivePeriodType(record.date),
    value_gbp: Math.round(record.value),
    volume: record.volume ? Math.round(record.volume) : null,
    volume_unit: record.volume_unit || null,
    data_source: 'ONS',
    last_updated: new Date().toISOString()
  }));
}

/**
 * Derive commodity hierarchy level from code
 * Level 0: Single digit (0, 1, 2...9) - broad categories
 * Level 1: Two digits (00, 01, 21, 33) - subcategories
 * Level 2: Three+ characters (33O, 71EI, 792/3, etc.) - granular commodities
 */
function deriveCommodityLevel(code: string): number {
  if (!code) return 0;
  if (code.length === 1) return 0;  // Single digit: 0, 1, 2... (broad)
  if (code.length === 2) return 1;  // Two digits: 00, 01, 21, 33 (sub)
  return 2;                          // Three+ chars: 33O, 71EI, 792/3 (granular)
}

/**
 * Normalize date format to YYYY-MM-DD
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    return dateStr;
  }
  
  return dateStr;
}

/**
 * Derive period type from date
 */
function derivePeriodType(date: string): 'monthly' | 'quarterly' | 'annual' {
  if (date.match(/^\d{4}$/)) return 'annual';
  if (date.match(/^\d{4}-Q[1-4]$/)) return 'quarterly';
  return 'monthly';
}

/**
 * Check if a country code is valid (ISO 3166-1 format)
 */
function isValidCountryCode(code: string): boolean {
  // Only accept 2-letter or 3-letter codes (ISO 3166-1 alpha-2 and alpha-3)
  return /^[A-Z]{2,3}$/.test(code);
}

/**
 * Generate aggregated files
 */
export function generateAggregatedFiles(records: NormalizedRecord[]): void {
  // Strip records where country_code failed ISO validation — these are
  // mis-parsed rows where the ONS Excel country column held a commodity name.
  const validRecords = records.filter(r => isValidCountryCode(r.country_code));
  console.log(`Filtered ${records.length - validRecords.length} records with invalid country codes`);
  records = validRecords;

  // Clear and recreate output directories so stale files from previous runs
  // don't survive (e.g. a commodity whose records were all filtered out).
  const dirs = [
    'meta',
    'trade-by-commodity',
    'trade-by-country',
    'trade-by-period',
    'top-imports',
    'top-exports',
    'balance'
  ];

  for (const dir of dirs) {
    const dirPath = path.join(DATA_DIR, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Create metadata
  const commodities: Record<string, any> = {};
  const countries: Record<string, string> = {};
  const periods = new Set<string>();

  for (const record of records) {
    commodities[record.commodity_code] = {
      name: record.commodity_name,
      level: record.commodity_level
    };
    // Only include valid country codes
    if (isValidCountryCode(record.country_code)) {
      countries[record.country_code] = record.country_name;
    }
    periods.add(record.date);
  }

  // Save metadata
  fs.writeFileSync(
    path.join(DATA_DIR, 'meta', 'commodities.json'),
    JSON.stringify(commodities, null, 2)
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'meta', 'countries.json'),
    JSON.stringify(countries, null, 2)
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'meta', 'time-periods.json'),
    JSON.stringify(Array.from(periods).sort(), null, 2)
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'meta', 'schema.json'),
    JSON.stringify({
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      total_records: records.length
    }, null, 2)
  );

  // Build lightweight index: per-country → { commodities, periods }
  const metaIndex: Record<string, { commodities: Set<string>; periods: Set<string> }> = {};
  for (const record of records) {
    if (!isValidCountryCode(record.country_code)) continue;
    if (!metaIndex[record.country_code]) {
      metaIndex[record.country_code] = { commodities: new Set(), periods: new Set() };
    }
    metaIndex[record.country_code].commodities.add(record.commodity_code);
    metaIndex[record.country_code].periods.add(record.date);
  }

  const metaIndexSerializable: Record<string, { commodities: string[]; periods: string[] }> = {};
  for (const [cc, val] of Object.entries(metaIndex)) {
    metaIndexSerializable[cc] = {
      commodities: Array.from(val.commodities).sort(),
      periods: Array.from(val.periods).sort()
    };
  }
  fs.writeFileSync(
    path.join(DATA_DIR, 'meta', 'index.json'),
    JSON.stringify(metaIndexSerializable, null, 2)
  );

  // Group by commodity
  const byCommodity: Record<string, NormalizedRecord[]> = {};
  for (const record of records) {
    if (!byCommodity[record.commodity_code]) {
      byCommodity[record.commodity_code] = [];
    }
    byCommodity[record.commodity_code].push(record);
  }

  for (const [code, data] of Object.entries(byCommodity)) {
    const sanitized = sanitizeFilename(code);
    fs.writeFileSync(
      path.join(DATA_DIR, 'trade-by-commodity', `${sanitized}.json`),
      JSON.stringify(data, null, 2)
    );
  }

  // Group by country
  const byCountry: Record<string, NormalizedRecord[]> = {};
  for (const record of records) {
    if (!byCountry[record.country_code]) {
      byCountry[record.country_code] = [];
    }
    byCountry[record.country_code].push(record);
  }

  for (const [code, data] of Object.entries(byCountry)) {
    const sanitized = sanitizeFilename(code);
    fs.writeFileSync(
      path.join(DATA_DIR, 'trade-by-country', `${sanitized}.json`),
      JSON.stringify(data, null, 2)
    );
  }

  // Group by period
  const byPeriod: Record<string, NormalizedRecord[]> = {};
  for (const record of records) {
    if (!byPeriod[record.date]) {
      byPeriod[record.date] = [];
    }
    byPeriod[record.date].push(record);
  }

  for (const [date, data] of Object.entries(byPeriod)) {
    const sanitized = sanitizeFilename(date);
    fs.writeFileSync(
      path.join(DATA_DIR, 'trade-by-period', `${sanitized}.json`),
      JSON.stringify(data, null, 2)
    );
  }

  // Generate top imports/exports
  const importsByValue = records
    .filter(r => r.flow === 'import')
    .sort((a, b) => b.value_gbp - a.value_gbp);

  const exportsByValue = records
    .filter(r => r.flow === 'export')
    .sort((a, b) => b.value_gbp - a.value_gbp);

  fs.writeFileSync(
    path.join(DATA_DIR, 'top-imports', 'all-time.json'),
    JSON.stringify(importsByValue.slice(0, 100), null, 2)
  );

  fs.writeFileSync(
    path.join(DATA_DIR, 'top-exports', 'all-time.json'),
    JSON.stringify(exportsByValue.slice(0, 100), null, 2)
  );

  console.log('Generated aggregated files successfully');
}

/**
 * Read NDJSON (one JSON record per line) and return normalized records.
 */
async function readNDJSON(inputFile: string): Promise<NormalizedRecord[]> {
  const { createInterface } = await import('readline');
  const records: NormalizedRecord[] = [];

  const rl = createInterface({
    input: fs.createReadStream(inputFile, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw: RawTradeData = JSON.parse(trimmed);
      records.push({
        commodity_code: raw.commodity_code.toUpperCase(),
        commodity_name: raw.commodity_name.trim(),
        commodity_level: deriveCommodityLevel(raw.commodity_code),
        country_code: raw.country_code.toUpperCase(),
        country_name: raw.country_name.trim(),
        flow: raw.flow,
        date: normalizeDate(raw.date),
        period_type: raw.period_type ?? derivePeriodType(raw.date),
        value_gbp: Math.round(raw.value),
        volume: raw.volume ? Math.round(raw.volume) : null,
        volume_unit: raw.volume_unit || null,
        data_source: 'ONS',
        last_updated: new Date().toISOString()
      });
    } catch {
      // skip malformed lines
    }
  }

  return records;
}

/**
 * Main execution
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputFile = process.argv[2] || 'data/parsed.json';

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }

  (async () => {
    console.log(`Reading ${inputFile} …`);
    const normalized = await readNDJSON(inputFile);
    console.log(`Loaded ${normalized.length.toLocaleString()} records`);
    generateAggregatedFiles(normalized);
    console.log(`Processed ${normalized.length.toLocaleString()} records`);
  })().catch(err => { console.error(err); process.exit(1); });
}
