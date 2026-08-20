/**
 * parse-allcountries.ts
 *
 * Parses the ONS "Trade in goods: all countries, seasonally adjusted" Excel file.
 *
 * This file has a different structure from the country-by-commodity files:
 *   Row 0  – Title
 *   Row 1  – Description
 *   Row 2  – Source
 *   Row 3  – Headers: Country Code, Country Name, <period cols...>
 *   Row 4+ – Data rows
 *
 * Sheet names encode the flow and period type, e.g.:
 *   "1. Annual Exports", "2. Annual Imports",
 *   "3. Quarterly Exports", "4. Quarterly Imports",
 *   "5. Monthly Exports", "6. Monthly Imports"
 *
 * Period column formats: "1997", "1997Q1", "1997Jan"
 * Values are in £ millions and need to be multiplied by 1,000,000.
 *
 * Output: NDJSON (one JSON record per line), same shape as parse-excel.ts.
 *
 * Usage:
 *   npx tsx scripts/parse-allcountries.ts [output.ndjson] [input.xlsx]
 *   npx tsx scripts/parse-allcountries.ts data/parsed-allcountries.json data/raw/allcountriesjune2026.xlsx
 */

import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TradeRecord {
  commodity_code: string;
  commodity_name: string;
  country_code: string;
  country_name: string;
  flow: 'import' | 'export';
  value: number;
  date: string;
  period_type: 'annual' | 'quarterly' | 'monthly';
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const QUARTER_MAP: Record<string, string> = {
  Q1: '01', Q2: '04', Q3: '07', Q4: '10',
};

function parseHeader(h: string): { date: string; period_type: 'annual' | 'quarterly' | 'monthly' } | null {
  const s = h.trim();

  // Annual: "1997"
  if (/^\d{4}$/.test(s)) {
    return { date: `${s}-01-01`, period_type: 'annual' };
  }

  // Quarterly: "1997Q1"
  const qm = s.match(/^(\d{4})(Q[1-4])$/);
  if (qm) {
    return { date: `${qm[1]}-${QUARTER_MAP[qm[2]]}-01`, period_type: 'quarterly' };
  }

  // Monthly: "1997Jan" (mixed case, no separator)
  const mm = s.match(/^(\d{4})([A-Za-z]{3})$/);
  if (mm) {
    const month = MONTH_MAP[mm[2].toLowerCase()];
    if (month) return { date: `${mm[1]}-${month}-01`, period_type: 'monthly' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sheet → flow + period_type
// ---------------------------------------------------------------------------

function parseSheetMeta(name: string): { flow: 'import' | 'export' } | null {
  const lower = name.toLowerCase();
  if (lower.includes('cover') || lower.includes('content') || lower.includes('note')) return null;
  const flow: 'import' | 'export' = lower.includes('export') ? 'export' : 'import';
  return { flow };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseAllCountries(filePath: string): TradeRecord[] {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const workbook = XLSX.readFile(filePath);
  const records: TradeRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const meta = parseSheetMeta(sheetName);
    if (!meta) continue;

    console.log(`  Processing sheet: ${sheetName}`);
    const ws = workbook.Sheets[sheetName];
    const lines = XLSX.utils.sheet_to_csv(ws).split('\n');

    // Find header row: contains "Country Code" and "Country Name"
    let headerRowIndex = -1;
    let headers: string[] = [];

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const lower = lines[i].toLowerCase();
      if (lower.includes('country code') && lower.includes('country name')) {
        headerRowIndex = i;
        headers = lines[i].split(',').map(h => h.trim().replace(/"/g, ''));
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log(`    No header row found — skipping`);
      continue;
    }

    // Map period columns (index >= 2)
    const periodCols: Array<{ index: number; date: string; period_type: 'annual' | 'quarterly' | 'monthly' }> = [];
    for (let i = 2; i < headers.length; i++) {
      const parsed = parseHeader(headers[i]);
      if (parsed) periodCols.push({ index: i, ...parsed });
    }

    if (periodCols.length === 0) {
      console.log(`    No period columns found — skipping`);
      continue;
    }

    let count = 0;
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      const country_code = parts[0]?.trim();
      const country_name = parts[1]?.trim();

      // Skip rows that don't look like country data (notes, empty, etc.)
      if (!country_code || !/^[A-Z]{2,3}$/.test(country_code)) continue;
      if (!country_name) continue;

      for (const { index, date, period_type } of periodCols) {
        const valueStr = parts[index]?.trim();
        if (!valueStr || valueStr === '' || isNaN(Number(valueStr))) continue;
        const value = Number(valueStr);
        if (value <= 0) continue;

        records.push({
          commodity_code: 'TOTAL',
          commodity_name: 'Total Goods',
          country_code,
          country_name,
          flow: meta.flow,
          value: value * 1_000_000, // values are in £ millions
          date,
          period_type,
        });
        count++;
      }
    }
    console.log(`    → ${count.toLocaleString()} records`);
  }

  return records;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputFile = process.argv[2] || path.join('data', 'parsed-allcountries.json');
  const inputFile = process.argv[3];

  // If no input given, find the allcountries*.xlsx in data/raw/
  let resolvedInput = inputFile;
  if (!resolvedInput) {
    const rawDir = path.join('data', 'raw');
    const found = fs.readdirSync(rawDir).find(f => f.startsWith('allcountries') && f.endsWith('.xlsx'));
    if (!found) {
      console.error('No allcountries*.xlsx found in data/raw/');
      process.exit(1);
    }
    resolvedInput = path.join(rawDir, found);
  }

  console.log(`Parsing: ${path.basename(resolvedInput)}`);

  try {
    const records = parseAllCountries(resolvedInput);
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
