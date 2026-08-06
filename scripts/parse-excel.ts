import XLSX from 'xlsx';
import * as fs from 'fs';

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
}

/**
 * Parse ONS Excel files with structure:
 * COMMODITY | COUNTRY | DIRECTION | 2018 | 2019 | ... | 2025
 */
export function parseONSExcel(filePath: string): RawTradeData[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const data: RawTradeData[] = [];

  for (const sheetName of workbook.SheetNames) {
    // Skip metadata sheets
    if (
      sheetName.includes('Cover') ||
      sheetName.includes('Contents') ||
      sheetName.includes('Notes') ||
      sheetName === 'Table_of_contents'
    ) {
      continue;
    }

    console.log(`Processing sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const rawCsv = XLSX.utils.sheet_to_csv(worksheet);
    const lines = rawCsv.split('\n');

    // Find header row
    let headerRowIndex = -1;
    let headerRow: string[] = [];

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      if (
        lines[i].includes('COMMODITY') &&
        lines[i].includes('COUNTRY') &&
        lines[i].includes('DIRECTION')
      ) {
        headerRowIndex = i;
        headerRow = lines[i].split(',').map(h => h.trim().replace(/"/g, ''));
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log(`  No data table found in ${sheetName}`);
      continue;
    }

    // Extract year columns (numeric column headers)
    const yearColumns = headerRow
      .map((h, i) => ({ header: h, index: i }))
      .filter(({ header }) => /^\d{4}$/.test(header))
      .map(({ header, index }) => ({ year: parseInt(header), index }));

    // Process data rows
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line
      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));

      if (parts.length < 3) continue;

      const commodityPart = parts[0];
      const countryPart = parts[1];
      const directionPart = parts[2];

      // Extract commodity code and name from "CODE Name" format
      const commodityMatch = commodityPart.match(/^([0-9A-Z]+)\s+(.+)$/);
      const commodity_code = commodityMatch?.[1] || commodityPart;
      const commodity_name = commodityMatch?.[2] || commodityPart;

      // Extract country code and name from "CODE Name" format
      const countryMatch = countryPart.match(/^([A-Z0-9]+)\s+(.+)$/);
      const country_code = countryMatch?.[1] || countryPart;
      const country_name = countryMatch?.[2] || countryPart;

      // Extract flow direction
      const direction = directionPart.toLowerCase();
      const flow = direction.includes('export') || direction.includes('ex')
        ? 'export'
        : 'import';

      // Process each year column
      for (const { year, index } of yearColumns) {
        const valueStr = parts[index]?.trim();
        if (!valueStr || valueStr === '' || isNaN(parseFloat(valueStr))) {
          continue;
        }

        const value = parseFloat(valueStr);
        if (value <= 0) continue;

        // Values are in millions of pounds, convert to base units
        const record: RawTradeData = {
          commodity_code: commodity_code.trim(),
          commodity_name: commodity_name.trim(),
          country_code: country_code.trim(),
          country_name: country_name.trim(),
          flow,
          value: value * 1_000_000, // Convert from millions to pounds
          date: `${year}-01-01`,
          volume: undefined,
          volume_unit: undefined
        };

        data.push(record);
      }
    }
  }

  return data;
}

/**
 * Main execution
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputFile = process.argv[2] || 'data/raw/trade.xlsx';
  const outputFile = process.argv[3] || 'data/parsed.json';

  try {
    const data = parseONSExcel(inputFile);
    console.log(`\nParsed ${data.length} records from ${inputFile}`);
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`Saved to ${outputFile}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
