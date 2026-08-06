/**
 * Client-side Query Engine for ONS Trade Data
 *
 * Compose any multidimensional query with a fluent builder:
 *
 *   const results = await engine
 *     .query('country', 'DE')
 *     .filter({ flow: 'import', year: 2024 })
 *     .groupBy('commodity_code', 'commodity_name')
 *     .aggregate({ value_gbp: 'sum' })
 *     .compute('share_pct', (row, all) => {
 *       const total = all.reduce((s, r) => s + (r.value_gbp_sum as number), 0);
 *       return total > 0 ? Math.round(((row.value_gbp_sum as number) / total) * 10000) / 100 : 0;
 *     })
 *     .sortBy('value_gbp_sum', 'desc')
 *     .limit(20)
 *     .run();
 */

import type {
  TradeRecord,
  QueryFilter,
  QueryRow,
  GroupByField,
  AggregateSpec,
  AggFn,
  ComputeFn,
  SortSpec,
  MetaIndex
} from './types/trade.js';

// ---------------------------------------------------------------------------
// Fluent Query Builder
// ---------------------------------------------------------------------------

export class Query {
  private _engine: QueryEngine;
  private _anchor: { type: 'country' | 'commodity' | 'period'; code: string };
  private _filters: QueryFilter[] = [];
  private _groupByFields: GroupByField[] = [];
  private _aggSpec: AggregateSpec = {};
  private _computes: Array<{ name: string; fn: ComputeFn }> = [];
  private _sorts: SortSpec[] = [];
  private _limitN: number | null = null;

  constructor(
    engine: QueryEngine,
    type: 'country' | 'commodity' | 'period',
    code: string
  ) {
    this._engine = engine;
    this._anchor = { type, code };
  }

  /** Add one or more filter conditions (multiple calls are ANDed) */
  filter(f: QueryFilter): this {
    this._filters.push(f);
    return this;
  }

  /**
   * Group rows by one or more fields before aggregating.
   * If omitted, aggregation runs across all filtered rows as one group.
   */
  groupBy(...fields: GroupByField[]): this {
    this._groupByFields = fields;
    return this;
  }

  /**
   * Aggregate numeric fields.
   * Produces columns named `{field}_{fn}`, e.g. `value_gbp_sum`.
   * Pass an array of functions to get multiple aggregations on the same field.
   *
   * @example .aggregate({ value_gbp: 'sum', volume: ['sum', 'avg'] })
   */
  aggregate(spec: AggregateSpec): this {
    this._aggSpec = spec;
    return this;
  }

  /**
   * Add a computed (derived) column after aggregation.
   * The function receives the current row and all rows, so you can compute
   * ratios, ranks, z-scores, etc.
   *
   * @example .compute('share_pct', (row, all) => ...)
   */
  compute(name: string, fn: ComputeFn): this {
    this._computes.push({ name, fn });
    return this;
  }

  /** Sort results. Multiple calls are applied in order (stable). */
  sortBy(field: string, dir: 'asc' | 'desc' = 'desc'): this {
    this._sorts.push({ field, dir });
    return this;
  }

  /** Keep only the first N rows after sorting */
  limit(n: number): this {
    this._limitN = n;
    return this;
  }

  /** Execute the query and return results */
  async run(): Promise<QueryRow[]> {
    // 1. Fetch anchor data
    let records: TradeRecord[];
    if (this._anchor.type === 'country') {
      records = await this._engine.fetchByCountry(this._anchor.code);
    } else if (this._anchor.type === 'commodity') {
      records = await this._engine.fetchByCommodity(this._anchor.code);
    } else {
      records = await this._engine.fetchByPeriod(this._anchor.code);
    }

    // 2. Apply all filters
    for (const f of this._filters) {
      records = this._engine.applyFilter(records, f);
    }

    // 3. Group + aggregate (or return raw rows if neither specified)
    let rows: QueryRow[];
    if (this._groupByFields.length > 0 || Object.keys(this._aggSpec).length > 0) {
      rows = aggregate(records, this._groupByFields, this._aggSpec);
    } else {
      rows = records as unknown as QueryRow[];
    }

    // 4. Computed columns
    for (const { name, fn } of this._computes) {
      rows = rows.map(row => ({ ...row, [name]: fn(row, rows) }));
    }

    // 5. Sort
    for (const { field, dir } of [...this._sorts].reverse()) {
      rows = rows.sort((a, b) => {
        const av = a[field] ?? 0;
        const bv = b[field] ?? 0;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // 6. Limit
    if (this._limitN !== null) rows = rows.slice(0, this._limitN);

    return rows;
  }
}

// ---------------------------------------------------------------------------
// Aggregation helper (standalone so it can be tested independently)
// ---------------------------------------------------------------------------

function aggregate(
  records: TradeRecord[],
  groupByFields: GroupByField[],
  spec: AggregateSpec
): QueryRow[] {
  const fns = (Object.entries(spec) as Array<[keyof AggregateSpec, AggFn | AggFn[]]>)
    .flatMap(([field, fnOrFns]) =>
      (Array.isArray(fnOrFns) ? fnOrFns : [fnOrFns]).map(fn => ({ field, fn }))
    );

  // Bucket records by group key
  const buckets = new Map<string, TradeRecord[]>();
  for (const r of records) {
    const key = groupByFields.length
      ? groupByFields.map(f => String(r[f] ?? '')).join('\0')
      : '__all__';
    const bucket = buckets.get(key) ?? [];
    bucket.push(r);
    buckets.set(key, bucket);
  }

  const rows: QueryRow[] = [];

  for (const [, bucket] of buckets) {
    const row: QueryRow = {};

    // Group-by field values (from first record in bucket)
    for (const f of groupByFields) {
      row[f] = bucket[0][f] as string | number;
    }

    // Aggregated columns
    for (const { field, fn } of fns) {
      const values = bucket
        .map(r => r[field as keyof TradeRecord] as number | null)
        .filter((v): v is number => v !== null && !isNaN(v));

      const colName = `${field}_${fn}`;
      if (fn === 'count') {
        row[colName] = bucket.length;
      } else if (fn === 'sum') {
        row[colName] = values.reduce((s, v) => s + v, 0);
      } else if (fn === 'avg') {
        row[colName] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
      } else if (fn === 'min') {
        row[colName] = values.length ? Math.min(...values) : null;
      } else if (fn === 'max') {
        row[colName] = values.length ? Math.max(...values) : null;
      }
    }

    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// QueryEngine — data loading + query builder entry point
// ---------------------------------------------------------------------------

export class QueryEngine {
  private baseUrl: string;
  private cache = new Map<string, TradeRecord[]>();

  constructor(baseUrl = '/data') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  private sanitize(value: string): string {
    return value
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  async fetchByCountry(countryCode: string): Promise<TradeRecord[]> {
    const key = `country:${countryCode}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const data = await this.fetchJson<TradeRecord[]>(
      `${this.baseUrl}/trade-by-country/${this.sanitize(countryCode)}.json`
    );
    this.cache.set(key, data);
    return data;
  }

  async fetchByCommodity(commodityCode: string): Promise<TradeRecord[]> {
    const key = `commodity:${commodityCode}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const data = await this.fetchJson<TradeRecord[]>(
      `${this.baseUrl}/trade-by-commodity/${this.sanitize(commodityCode)}.json`
    );
    this.cache.set(key, data);
    return data;
  }

  async fetchByPeriod(period: string): Promise<TradeRecord[]> {
    const key = `period:${period}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const data = await this.fetchJson<TradeRecord[]>(
      `${this.baseUrl}/trade-by-period/${this.sanitize(period)}.json`
    );
    this.cache.set(key, data);
    return data;
  }

  async fetchMetaIndex(): Promise<MetaIndex> {
    return this.fetchJson<MetaIndex>(`${this.baseUrl}/meta/index.json`);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  /** Clear the in-memory cache */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Filtering (also used internally by Query builder) ─────────────────────

  applyFilter(records: TradeRecord[], f: QueryFilter): TradeRecord[] {
    return records.filter(r => {
      if (f.flow && r.flow !== f.flow) return false;
      if (f.commodityCode && r.commodity_code !== f.commodityCode) return false;
      if (f.countryCode && r.country_code !== f.countryCode.toUpperCase()) return false;
      if (f.year && !r.date.startsWith(String(f.year))) return false;
      if (f.dateFrom && r.date < f.dateFrom) return false;
      if (f.dateTo && r.date > f.dateTo) return false;
      if (f.periodType && r.period_type !== f.periodType) return false;
      if (f.where && !f.where(r)) return false;
      return true;
    });
  }

  // ── Generic query builder entry point ────────────────────────────────────

  /**
   * Start a fluent query anchored on a country, commodity, or period file.
   *
   * @example
   *   engine.query('country', 'DE')
   *     .filter({ flow: 'import', year: 2024 })
   *     .groupBy('commodity_code', 'commodity_name')
   *     .aggregate({ value_gbp: 'sum' })
   *     .compute('share_pct', (row, all) => {
   *       const total = all.reduce((s, r) => s + (r.value_gbp_sum as number), 0);
   *       return total > 0 ? Math.round(((row.value_gbp_sum as number) / total) * 10000) / 100 : 0;
   *     })
   *     .sortBy('value_gbp_sum', 'desc')
   *     .limit(20)
   *     .run()
   */
  query(
    anchorType: 'country' | 'commodity' | 'period',
    anchorCode: string
  ): Query {
    return new Query(this, anchorType, anchorCode);
  }
}

