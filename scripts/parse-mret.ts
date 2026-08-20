/**
 * parse-mret.ts
 *
 * Parses data/raw/mret.csv — the ONS "Monthly value of UK exports and imports
 * of goods and services" time-series dataset — and extracts Trade in Services
 * records into the same NDJSON format used by parse-excel.ts.
 *
 * mret.csv structure:
 *   Row 1  – Title (human-readable series names)
 *   Row 2  – CDID codes
 *   Rows 3–7 – Metadata (PreUnit, Unit, Release Date, Next Release, Important Notes)
 *   Data rows – col 0 = date ("1997 Q1", "2024 JAN", "2024"), remaining cols = values
 *
 * Output: NDJSON file, one JSON record per line, same shape as parse-excel.ts.
 *
 * Usage:
 *   npx tsx scripts/parse-mret.ts [output.ndjson] [input.csv]
 *   npx tsx scripts/parse-mret.ts data/parsed-services.json data/raw/mret.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceRecord {
  commodity_code: string;
  commodity_name: string;
  country_code: string;
  country_name: string;
  flow: 'import' | 'export';
  value: number;
  date: string;
  period_type: 'annual' | 'quarterly' | 'monthly';
  measure: 'CP' | 'CVM' | 'IDEF';
  data_type: 'services';
}

interface ColumnMeta {
  index: number;
  cdid: string;
  commodity_code: string;
  commodity_name: string;
  flow: 'import' | 'export';
  measure: 'CP' | 'CVM' | 'IDEF';
  /** Multiply raw value by this factor — CP/CVM columns are in £m */
  scale: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

const QUARTER_MAP: Record<string, string> = {
  Q1: '01', Q2: '04', Q3: '07', Q4: '10',
};

/** Number of metadata rows after the CDID row to skip before data begins */
const METADATA_ROWS = 5; // PreUnit, Unit, Release Date, Next Release, Important Notes

// ---------------------------------------------------------------------------
// Date parsing

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse mret date cell into { date: 'YYYY-MM-DD', period_type }.
 * Formats: "2024", "2024 Q1", "2024 JAN"
 */
function parseMretDate(raw: string): { date: string; period_type: 'annual' | 'quarterly' | 'monthly' } | null {
  const s = raw.trim();

  // Annual: "2024"
  if (/^\d{4}$/.test(s)) {
    return { date: `${s}-01-01`, period_type: 'annual' };
  }

  // Quarterly: "2024 Q1"
  const qm = s.match(/^(\d{4})\s+(Q[1-4])$/);
  if (qm) {
    const month = QUARTER_MAP[qm[2]];
    return { date: `${qm[1]}-${month}-01`, period_type: 'quarterly' };
  }

  // Monthly: "2024 JAN"
  const mm = s.match(/^(\d{4})\s+([A-Z]{3})$/);
  if (mm && MONTH_MAP[mm[2]]) {
    return { date: `${mm[1]}-${MONTH_MAP[mm[2]]}-01`, period_type: 'monthly' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Title parsing
// ---------------------------------------------------------------------------

/**
 * Convert a service category name to a slug used as commodity_code.
 * e.g. "Financial Services" → "TS_FINANCIAL_SERVICES"
 *      "WW" (total) → "TS_WW_TOTAL"
 */
function categoryToCode(category: string): string {
  const slug = category
    .toUpperCase()
    .replace(/[,\.]/g, '')
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `TS_${slug}`;
}

/**
 * Parse a Trade in Services column title into its component parts.
 *
 * Formats seen in the data:
 *   "Trade in Services (TS): {Category}: WW: {Flow}: BOP: {Measure}: SA[: £m]"
 *   "Trade in Services (TS): WW: {Flow}: BOP: {Measure}: SA"
 *
 * Returns null if the title cannot be recognised as a TS series or if the
 * flow is "Balance" (derivable, excluded from output).
 */
function parseTSTitle(title: string): { commodity_code: string; commodity_name: string; flow: 'import' | 'export'; measure: 'CP' | 'CVM' | 'IDEF'; scale: number } | null {
  if (!title.includes('Trade in Services')) return null;

  // Determine measure
  let measure: 'CP' | 'CVM' | 'IDEF' | null = null;
  if (title.includes('IDEF')) measure = 'IDEF';
  else if (title.includes('CVM')) measure = 'CVM';
  else if (title.includes(': CP:') || title.includes(': CP ')) measure = 'CP';
  // Some CP titles omit the measure label but include "£m" — default to CP
  else if (title.includes('£m') || title.includes('BOP: CP')) measure = 'CP';
  if (!measure) return null;

  // Determine flow — skip Balance rows
  const flowMatch = title.match(/:\s*(Exports|Imports|Balance)\s*:/i);
  if (!flowMatch) return null;
  const flowRaw = flowMatch[1].toLowerCase();
  if (flowRaw === 'balance') return null;
  const flow: 'import' | 'export' = flowRaw === 'exports' ? 'export' : 'import';

  // Extract category
  // Strip the "Trade in Services (TS): " prefix
  const withoutPrefix = title.replace(/^Trade in Services \(TS\):\s*/, '').trim();
  // First segment before ": WW:" or ": {Flow}:"
  const segments = withoutPrefix.split(':').map(s => s.trim());
  // First segment is the category (or "WW" for aggregate totals)
  const rawCategory = segments[0];

  let commodity_name: string;
  let commodity_code: string;

  if (rawCategory === 'WW') {
    // Aggregate totals — treat as "Total Services"
    commodity_name = 'Total Services';
    commodity_code = 'TS_TOTAL';
  } else {
    commodity_name = rawCategory;
    commodity_code = categoryToCode(rawCategory);
  }

  // CP and CVM values are in £m — scale to £
  const scale = measure === 'IDEF' ? 1 : 1_000_000;

  return { commodity_code, commodity_name, flow, measure, scale };
}

// ---------------------------------------------------------------------------
// CSV streaming parser
// ---------------------------------------------------------------------------

async function parseMretCSV(inputFile: string): Promise<ServiceRecord[]> {
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const lines: string[] = [];
  for await (const line of rl) {
    lines.push(line);
  }

  if (lines.length < 2) throw new Error('mret.csv is too short — expected at least 2 header rows');

  // Parse a CSV line into fields (handles quoted commas)
  function parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let inQuote = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const titleRow = parseCSVLine(lines[0]);
  const cdidRow = parseCSVLine(lines[1]);

  // Build column metadata for Trade in Services series
  const columns: ColumnMeta[] = [];
  for (let i = 1; i < titleRow.length; i++) {
    const parsed = parseTSTitle(titleRow[i]);
    if (!parsed) continue;
    columns.push({
      index: i,
      cdid: cdidRow[i] || '',
      ...parsed,
    });
  }

  console.log(`Found ${columns.length} Trade in Services columns to extract`);

  const records: ServiceRecord[] = [];

  // Data starts after title row (0), CDID row (1), and METADATA_ROWS rows
  const dataStartIndex = 2 + METADATA_ROWS;

  for (let lineIndex = dataStartIndex; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    const dateParsed = parseMretDate(fields[0]);
    if (!dateParsed) continue; // skip non-date rows (metadata remnants)

    const { date, period_type } = dateParsed;

    for (const col of columns) {
      const rawValue = fields[col.index]?.trim();
      if (!rawValue || rawValue === '') continue;

      const numValue = Number(rawValue);
      if (isNaN(numValue)) continue;

      records.push({
        commodity_code: col.commodity_code,
        commodity_name: col.commodity_name,
        country_code: 'WW',
        country_name: 'World',
        flow: col.flow,
        value: numValue * col.scale,
        date,
        period_type,
        measure: col.measure,
        data_type: 'services',
      });
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputFile = process.argv[2] || path.join('data', 'parsed-services.json');
  const inputFile = process.argv[3] || path.join('data', 'raw', 'mret.csv');

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Parsing: ${path.basename(inputFile)}`);

  try {
    const records = await parseMretCSV(inputFile);
    console.log(`\nTotal records: ${records.length.toLocaleString()}`);

    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const stream = fs.createWriteStream(outputFile);
    for (const record of records) {
      stream.write(JSON.stringify(record) + '\n');
    }
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    console.log(`Saved to ${outputFile}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
