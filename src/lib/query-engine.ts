/**
 * Client-side Query Engine for ONS Trade Data
 *
 * Fetches pre-generated JSON files and performs multidimensional filtering,
 * aggregation, and analysis entirely in the browser — no server required.
 *
 * Usage:
 *   const engine = new QueryEngine('/data');
 *   const results = await engine.partnerReliance('28', { flow: 'import', year: 2024 });
 */

import type {
  TradeRecord,
  QueryFilter,
  PartnerRelianceResult,
  GrowthResult,
  BalanceBreakdownResult,
  OutlierResult,
  MetaIndex
} from './types/trade.js';

export class QueryEngine {
  private baseUrl: string;
  private cache = new Map<string, TradeRecord[]>();

  constructor(baseUrl = '/data') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

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

  async fetchMetaIndex(): Promise<MetaIndex> {
    return this.fetchJson<MetaIndex>(`${this.baseUrl}/meta/index.json`);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  filter(records: TradeRecord[], f: QueryFilter): TradeRecord[] {
    return records.filter(r => {
      if (f.flow && r.flow !== f.flow) return false;
      if (f.commodityCode && r.commodity_code !== f.commodityCode) return false;
      if (f.countryCode && r.country_code !== f.countryCode.toUpperCase()) return false;
      if (f.year && !r.date.startsWith(String(f.year))) return false;
      if (f.dateFrom && r.date < f.dateFrom) return false;
      if (f.dateTo && r.date > f.dateTo) return false;
      if (f.periodType && r.period_type !== f.periodType) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Query 1 — Partner Reliance
  // Which countries supply (or receive) a given commodity?
  // GET /trade/imports?commodity=SITC_28&year=2025
  // ---------------------------------------------------------------------------

  async partnerReliance(
    commodityCode: string,
    filter: Pick<QueryFilter, 'flow' | 'year' | 'dateFrom' | 'dateTo'> = {},
    topN = 20
  ): Promise<PartnerRelianceResult[]> {
    const records = await this.fetchByCommodity(commodityCode);
    const filtered = this.filter(records, { ...filter, commodityCode });

    const totals = new Map<string, { name: string; value: number; periods: Set<string> }>();
    for (const r of filtered) {
      const entry = totals.get(r.country_code) ?? { name: r.country_name, value: 0, periods: new Set() };
      entry.value += r.value_gbp;
      entry.periods.add(r.date);
      totals.set(r.country_code, entry);
    }

    const grandTotal = Array.from(totals.values()).reduce((s, e) => s + e.value, 0);

    return Array.from(totals.entries())
      .map(([code, e]) => ({
        country_code: code,
        country_name: e.name,
        value_gbp: e.value,
        share_pct: grandTotal > 0 ? Math.round((e.value / grandTotal) * 10000) / 100 : 0,
        periods: Array.from(e.periods).sort()
      }))
      .sort((a, b) => b.value_gbp - a.value_gbp)
      .slice(0, topN);
  }

  // ---------------------------------------------------------------------------
  // Query 2 — Export/Import Growth Discovery
  // Which product categories are growing fastest for a given partner?
  // GET /trade/exports/top-growth?country=USA&period=12m
  // ---------------------------------------------------------------------------

  async topGrowth(
    countryCode: string,
    flow: 'import' | 'export',
    /** Number of most-recent periods to compare: compares last N vs previous N */
    windowPeriods = 12,
    topN = 20
  ): Promise<GrowthResult[]> {
    const records = await this.fetchByCountry(countryCode);
    const filtered = this.filter(records, { flow, countryCode });

    // Group by commodity, collect all periods
    const byCommodity = new Map<string, { name: string; byPeriod: Map<string, number> }>();
    for (const r of filtered) {
      const entry = byCommodity.get(r.commodity_code) ??
        { name: r.commodity_name, byPeriod: new Map() };
      entry.byPeriod.set(r.date, (entry.byPeriod.get(r.date) ?? 0) + r.value_gbp);
      byCommodity.set(r.commodity_code, entry);
    }

    // Find common sorted periods
    const allPeriods = Array.from(
      new Set(filtered.map(r => r.date))
    ).sort();

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
        code,
        name: entry.name,
        flow,
        value_start: previous,
        value_end: recent,
        growth_pct,
        periods_compared: [
          previousPeriods[0] ?? recentPeriods[0],
          recentPeriods[recentPeriods.length - 1]
        ]
      });
    }

    return results.sort((a, b) => b.growth_pct - a.growth_pct).slice(0, topN);
  }

  // ---------------------------------------------------------------------------
  // Query 3 — Trade Balance Breakdown
  // What's the net trade with a country, broken down by commodity?
  // GET /trade/balance?country=DE&flow=net&timeframe=monthly
  // ---------------------------------------------------------------------------

  async balanceBreakdown(
    countryCode: string,
    filter: Pick<QueryFilter, 'year' | 'dateFrom' | 'dateTo' | 'periodType'> = {}
  ): Promise<BalanceBreakdownResult[]> {
    const records = await this.fetchByCountry(countryCode);
    const filtered = this.filter(records, { ...filter, countryCode });

    const byCommodity = new Map<string, BalanceBreakdownResult>();

    for (const r of filtered) {
      const entry = byCommodity.get(r.commodity_code) ?? {
        commodity_code: r.commodity_code,
        commodity_name: r.commodity_name,
        imports_gbp: 0,
        exports_gbp: 0,
        net_gbp: 0
      };
      if (r.flow === 'import') entry.imports_gbp += r.value_gbp;
      else entry.exports_gbp += r.value_gbp;
      entry.net_gbp = entry.exports_gbp - entry.imports_gbp;
      byCommodity.set(r.commodity_code, entry);
    }

    return Array.from(byCommodity.values())
      .sort((a, b) => a.net_gbp - b.net_gbp); // most negative (deficit) first
  }

  // ---------------------------------------------------------------------------
  // Query 4 — Anomaly / Outlier Detection
  // Which commodity-country pairs show unexplained surges or drops?
  // GET /trade/outliers?flow=exports&metric=volume_change
  // ---------------------------------------------------------------------------

  async outliers(
    /** Anchor by country or commodity */
    anchor: { type: 'country'; code: string } | { type: 'commodity'; code: string },
    filter: Pick<QueryFilter, 'flow' | 'year' | 'dateFrom' | 'dateTo'> = {},
    /** z-score threshold — records beyond this are flagged as outliers */
    zThreshold = 2.5
  ): Promise<OutlierResult[]> {
    const records = anchor.type === 'country'
      ? await this.fetchByCountry(anchor.code)
      : await this.fetchByCommodity(anchor.code);

    const filtered = this.filter(records, filter);

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
