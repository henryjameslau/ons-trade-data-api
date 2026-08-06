import XLSX from 'xlsx';
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
  period_type: 'annual' | 'quarterly' | 'monthly';
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const QUARTER_MAP: Record<string, string> = {
  Q1: '01', Q2: '04', Q3: '07', Q4: '10'
};

/**
 * Parse a column header into { date, period_type }.
 * Handles: "2024" → annual, "2024Q1" → quarterly, "2024JAN" → monthly
 */
function parseHeader(h: string): { date: string; period_type: 'annual' | 'quarterly' | 'monthly' } | null {
  // Annual: "2024"
  if (/^\d{4}$/.test(h)) {
    return { date: `${h}-01-01`, period_type: 'annual' };
  }
  // Quarterly: "2024Q1"
  const qm = h.match(/^(\d{4})(Q[1-4])$/);
  if (qm) {
    const month = QUARTER_MAP[qm[2]];
    return { date: `${qm[1]}-${month}-01`, period_type: 'quarterly' };
  }
  // Monthly: "2024JAN"
  const mm = h.match(/^(\d{4})([A-Z]{3})$/);
  if (mm && MONTH_MAP[mm[2]]) {
    return { date: `${mm[1]}-${MONTH_MAP[mm[2]]}-01`, period_type: 'monthly' };
  }
  return null;
}

/**
 * Sheets to skip by name pattern
 */
function shouldSkipSheet(name: string): boolean {
  return (
    name.toLowerCase().includes('cover') ||
    name.toLowerCase().includes('contents') ||
    name.toLowerCase().includes('notes') ||
    name.toLowerCase().includes('excluding pm') ||  // precious metals adjustments
    name === 'Table_of_contents'
  );
}

/**
 * Parse a single ONS Excel file.
 * Sheet structure: COMMODITY | COUNTRY | DIRECTION | <period cols...>
 */
export function parseONSExcel(filePath: string): RawTradeData[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const data: RawTradeData[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (shouldSkipSheet(sheetName)) continue;

    console.log(`  Processing sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const rawCsv = XLSX.utils.sheet_to_csv(worksheet);
    const lines = rawCsv.split('\n');

    // Find header row (contains COMMODITY + COUNTRY + DIRECTION)
    let headerRowIndex = -1;
    let headerRow: string[] = [];

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const upper = lines[i].toUpperCase();
      if (upper.includes('COMMODITY') && upper.includes('COUNTRY') && upper.includes('DIRECTION')) {
        headerRowIndex = i;
        headerRow = lines[i].split(',').map(h => h.trim().replace(/"/g, ''));
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log(`    No data table found — skipping`);
      continue;
    }

    // Map period columns
    const periodColumns: Array<{ index: number; date: string; period_type: 'annual' | 'quarterly' | 'monthly' }> = [];
    for (let i = 0; i < headerRow.length; i++) {
      const parsed = parseHeader(headerRow[i]);
      if (parsed) periodColumns.push({ index: i, ...parsed });
    }

    if (periodColumns.length === 0) {
      console.log(`    No period columns found — skipping`);
      continue;
    }

    let sheetRecords = 0;
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      if (parts.length < 3) continue;

      // "CODE Name" → split on first space
      const split = (s: string) => {
        const idx = s.indexOf(' ');
        return idx === -1 ? [s, s] : [s.slice(0, idx), s.slice(idx + 1)];
      };

      const [commodity_code, commodity_name] = split(parts[0]);
      const [country_code, country_name] = split(parts[1]);
      const direction = parts[2].toLowerCase();
      const flow: 'import' | 'export' = direction.includes('ex') ? 'export' : 'import';

      for (const { index, date, period_type } of periodColumns) {
        const valueStr = parts[index]?.trim();
        if (!valueStr || valueStr === '' || isNaN(Number(valueStr))) continue;
        const value = Number(valueStr);
        if (value <= 0) continue;

        data.push({
          commodity_code: commodity_code.trim().toUpperCase(),
          commodity_name: commodity_name.trim(),
          country_code: country_code.trim(),
          country_name: country_name.trim(),
          flow,
          value: value * 1_000_000, // values are in £ millions
          date,
          period_type
        });
        sheetRecords++;
      }
    }
    console.log(`    → ${sheetRecords.toLocaleString()} records`);
  }

  return data;
}

/**
 * Parse multiple ONS Excel files and merge, deduplicating by
 * commodity_code + country_code + flow + date + period_type.
 * Records from later files overwrite earlier ones on collision.
 */
export function parseMultiple(filePaths: string[]): RawTradeData[] {
  const map = new Map<string, RawTradeData>();

  for (const fp of filePaths) {
    console.log(`\nParsing: ${path.basename(fp)}`);
    const records = parseONSExcel(fp);
    for (const r of records) {
      const key = `${r.commodity_code}|${r.country_code}|${r.flow}|${r.date}|${r.period_type}`;
      map.set(key, r);
    }
    console.log(`  Subtotal after merge: ${map.size.toLocaleString()} unique records`);
  }

  return Array.from(map.values());
}

/**
 * Main execution — accepts one or more input files + output path
 *
 * Usage:
 *   ts-node parse-excel.ts output.json file1.xlsx file2.xlsx ...
 *   ts-node parse-excel.ts output.json data/raw/   (parse all xlsx in dir)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const [outputFile, ...inputs] = process.argv.slice(2);

  if (!outputFile || inputs.length === 0) {
    console.error('Usage: parse-excel.ts <output.json> <file.xlsx> [file2.xlsx ...] | <directory>');
    process.exit(1);
  }

  // Expand directories
  let filePaths: string[] = [];
  for (const input of inputs) {
    if (fs.statSync(input).isDirectory()) {
      filePaths.push(
        ...fs.readdirSync(input)
          .filter(f => f.endsWith('.xlsx') && !f.startsWith('~'))
          .map(f => path.join(input, f))
      );
    } else {
      filePaths.push(input);
    }
  }

  try {
    const data = parseMultiple(filePaths);
    console.log(`\nTotal unique records: ${data.length.toLocaleString()}`);

    // Write as NDJSON (newline-delimited JSON) to avoid V8 string length limit
    const stream = fs.createWriteStream(outputFile);
    for (const record of data) {
      stream.write(JSON.stringify(record) + '\n');
    }
    stream.end();
    await new Promise<void>((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });

    console.log(`Saved to ${outputFile}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
