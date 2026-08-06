import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Load JSON file from data directory
 */
export async function loadDataFile(filename: string): Promise<any> {
  const filepath = path.join(DATA_DIR, filename);
  
  // Security: prevent path traversal
  if (!filepath.startsWith(DATA_DIR)) {
    throw new Error('Invalid file path');
  }
  
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`File not found: ${filename}`);
    }
    throw error;
  }
}

/**
 * List all files in a subdirectory
 */
export function listDataFiles(subdir: string = ''): string[] {
  const dir = path.join(DATA_DIR, subdir);
  
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.basename(f, '.json'));
  } catch (error) {
    return [];
  }
}

/**
 * Get file size in bytes
 */
export function getFileSize(filename: string): number {
  try {
    const filepath = path.join(DATA_DIR, filename);
    return fs.statSync(filepath).size;
  } catch {
    return 0;
  }
}
