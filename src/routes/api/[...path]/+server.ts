import { json, type RequestHandler } from '@sveltejs/kit';
import { loadDataFile } from '$lib/server/data-loader';

// Helper to sanitize filenames
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const path = params.path?.split('/').filter(Boolean) || [];
    
    // Handle meta endpoints
    if (path[0] === 'meta') {
      if (path[1] === 'schema') {
        return json(await loadDataFile('meta/schema.json'));
      } else if (path[1] === 'commodities') {
        return json(await loadDataFile('meta/commodities.json'));
      } else if (path[1] === 'countries') {
        return json(await loadDataFile('meta/countries.json'));
      } else if (path[1] === 'periods') {
        return json(await loadDataFile('meta/time-periods.json'));
      }
    }
    
    // Handle trade-by-commodity: /api/trade-by-commodity/{code}
    if (path[0] === 'trade-by-commodity' && path[1]) {
      const code = sanitizeFilename(path[1]);
      return json(await loadDataFile(`trade-by-commodity/${code}.json`));
    }
    
    // Handle trade-by-country: /api/trade-by-country/{code}
    if (path[0] === 'trade-by-country' && path[1]) {
      const code = sanitizeFilename(path[1]);
      return json(await loadDataFile(`trade-by-country/${code}.json`));
    }
    
    // Handle trade-by-period: /api/trade-by-period/{date}
    if (path[0] === 'trade-by-period' && path[1]) {
      const date = sanitizeFilename(path[1]);
      return json(await loadDataFile(`trade-by-period/${date}.json`));
    }
    
    // Handle top-imports: /api/top-imports/{period}
    if (path[0] === 'top-imports' && path[1]) {
      const period = sanitizeFilename(path[1]);
      return json(await loadDataFile(`top-imports/${period}.json`));
    }
    
    // Handle top-exports: /api/top-exports/{period}
    if (path[0] === 'top-exports' && path[1]) {
      const period = sanitizeFilename(path[1]);
      return json(await loadDataFile(`top-exports/${period}.json`));
    }
    
    // Handle balance: /api/balance/{country}/{period}
    if (path[0] === 'balance' && path[1] && path[2]) {
      const country = sanitizeFilename(path[1]);
      const period = sanitizeFilename(path[2]);
      return json(await loadDataFile(`balance/${country}_${period}.json`));
    }
    
    return json({ error: 'Endpoint not found' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    
    if (message.includes('File not found')) {
      return json({ error: message }, { status: 404 });
    }
    
    return json({ error: message }, { status: 500 });
  }
};
