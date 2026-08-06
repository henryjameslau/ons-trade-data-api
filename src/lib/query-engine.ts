/**
 * Client-side Query Engine for ONS Trade Data
 *
 * Two layers:
 *
 * 1. Generic fluent builder — compose any query:
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
 *
 * 2. Named convenience methods that wrap the builder for common patterns:
 *   partnerReliance(), topGrowth(), balanceBreakdown(), outliers()
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
  MetaIndex,
  PartnerRelianceResult,
  GrowthResult,
  BalanceBreakdownResult,
  OutlierResult
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

  // ── Named convenience methods (built on query()) ──────────────────────────

  /**
   * Partner Reliance — top countries supplying or receiving a commodity.
   * Equivalent to:
   *   engine.query('commodity', code)
   *     .filter({ flow, year })
   *     .groupBy('country_code', 'country_name')
   *     .aggregate({ value_gbp: 'sum' })
   *     .compute('share_pct', ...)
   *     .sortBy('value_gbp_sum', 'desc')
   *     .limit(topN)
   *     .run()
   */
  async partnerReliance(
    commodityCode: string,
    filter: Pick<QueryFilter, 'flow' | 'year' | 'dateFrom' | 'dateTo'> = {},
    topN = 20
  ): Promise<PartnerRelianceResult[]> {
    const rows = await this
      .query('commodity', commodityCode)
      .filter(filter)
      .groupBy('country_code', 'country_name')
      .aggregate({ value_gbp: 'sum' })
      .compute('share_pct', (row, all) => {
        const total = all.reduce((s, r) => s + (r.value_gbp_sum as number), 0);
        return total > 0 ? Math.round(((row.value_gbp_sum as number) / total) * 10000) / 100 : 0;
      })
      .sortBy('value_gbp_sum', 'desc')
      .limit(topN)
      .run();

    // Reconstruct period list from cached records
    const records = await this.fetchByCommodity(commodityCode);
    const filtered = this.applyFilter(records, filter);
    const periodsByCountry = new Map<string, Set<string>>();
    for (const r of filtered) {
      const s = periodsByCountry.get(r.country_code) ?? new Set();
      s.add(r.date);
      periodsByCountry.set(r.country_code, s);
    }

    return rows.map(r => ({
      country_code: r.country_code as string,
      country_name: r.country_name as string,
      value_gbp: r.value_gbp_sum as number,
      share_pct: r.share_pct as number,
      periods: Array.from(periodsByCountry.get(r.country_code as string) ?? []).sort()
    }));
  }

  /**
   * Export/Import Growth Discovery — which commodities are growing fastest
   * for a given country partner over a rolling time window.
   */
  async topGrowth(
    countryCode: string,
    flow: 'import' | 'export',
    windowPeriods = 12,
    topN = 20
  ): Promise<GrowthResult[]> {
    const records = await this.fetchByCountry(countryCode);
    const filtered = this.applyFilter(records, { flow, countryCode });

    const byCommodity = new Map<string, { name: string; byPeriod: Map<string, number> }>();
    for (const r of filtered) {
      const entry = byCommodity.get(r.commodity_code) ??
        { name: r.commodity_name, byPeriod: new Map() };
      entry.byPeriod.set(r.date, (entry.byPeriod.get(r.date) ?? 0) + r.value_gbp);
      byCommodity.set(r.commodity_code, entry);
    }

    const allPeriods = Array.from(new Set(filtered.map(r => r.date))).sort();
    if (allPeriods.length < 2) return [];

    const recentPeriods = allPeriods.slice(-windowPeriods);
    const previousPeriods = allPeriods.slice(
      Math.max(0, allPeriods.length - windowPeriods * 2),
      allPeriods.length - windowPeriods
    );

    const results: GrowthResult[] = [];
    for (const [code, entry] of byCommodity) {
      const recent = recentPeriods.reduce((s, p) => s + (entry.byPeriod.get(p) ?? 0), 0);
      const previous = previousPeriods.reduce((s, p) => s + (entry.byPeriod.get(p) ?? 0), 0);
      if (previous === 0 && recent === 0) continue;
      const growth_pct = previous === 0
        ? (recent > 0 ? 100 : 0)
        : Math.round(((recent - previous) / previous) * 10000) / 100;
      results.push({
        code, name: entry.name, flow,
        value_start: previous, value_end: recent, growth_pct,
        periods_compared: [
          previousPeriods[0] ?? recentPeriods[0],
          recentPeriods[recentPeriods.length - 1]
        ]
      });
    }

    return results.sort((a, b) => b.growth_pct - a.growth_pct).slice(0, topN);
  }

  /**
   * Trade Balance Breakdown — net trade with a country by commodity.
   * Equivalent to:
   *   engine.query('country', code)
   *     .filter({ year })
   *     .groupBy('commodity_code', 'commodity_name', 'flow')
   *     .aggregate({ value_gbp: 'sum' })
   *     .run()
   *   …then pivoting flow into imports/exports columns.
   */
  async balanceBreakdown(
    countryCode: string,
    filter: Pick<QueryFilter, 'year' | 'dateFrom' | 'dateTo' | 'periodType'> = {}
  ): Promise<BalanceBreakdownResult[]> {
    const rows = await this
      .query('country', countryCode)
      .filter(filter)
      .groupBy('commodity_code', 'commodity_name', 'flow')
      .aggregate({ value_gbp: 'sum' })
      .run();

    const map = new Map<string, BalanceBreakdownResult>();
    for (const r of rows) {
      const code = r.commodity_code as string;
      const entry = map.get(code) ?? {
        commodity_code: code,
        commodity_name: r.commodity_name as string,
        imports_gbp: 0, exports_gbp: 0, net_gbp: 0
      };
      if (r.flow === 'import') entry.imports_gbp += r.value_gbp_sum as number;
      else entry.exports_gbp += r.value_gbp_sum as number;
      entry.net_gbp = entry.exports_gbp - entry.imports_gbp;
      map.set(code, entry);
    }

    return Array.from(map.values()).sort((a, b) => a.net_gbp - b.net_gbp);
  }

  /**
   * Anomaly / Outlier Detection — z-score based.
   * Equivalent to:
   *   engine.query(anchorType, code)
   *     .filter({ flow })
   *     .compute('z_score', (row, all) => ...)
   *     .run()
   *   …then filtering rows where |z_score| >= threshold.
   */
  async outliers(
    anchor: { type: 'country'; code: string } | { type: 'commodity'; code: string },
    filter: Pick<QueryFilter, 'flow' | 'year' | 'dateFrom' | 'dateTo'> = {},
    zThreshold = 2.5
  ): Promise<OutlierResult[]> {
    const records = anchor.type === 'country'
      ? await this.fetchByCountry(anchor.code)
      : await this.fetchByCommodity(anchor.code);

    const filtered = this.applyFilter(records, filter);
    if (filtered.length < 3) return [];

    const values = filtered.map(r => r.value_gbp);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    if (std === 0) return [];

    return filtered
      .map(r => ({
        record: r,
        mean_value: mean,
        std_dev: std,
        z_score: Math.round(((r.value_gbp - mean) / std) * 100) / 100
      }))
      .filter(o => Math.abs(o.z_score) >= zThreshold)
      .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));
  }
}

