export interface TradeRecord {
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
  /** ONS measure type: CP = current price, CVM = chained volume measures, IDEF = implied deflator */
  measure?: 'CP' | 'CVM' | 'IDEF';
  /** Whether this record comes from goods or services statistics */
  data_type?: 'goods' | 'services';
}

export interface CommodityLookup {
  [code: string]: {
    name: string;
    level: number;
    parent?: string;
  };
}

export interface CountryLookup {
  [code: string]: string;
}

export interface TradeData {
  records: TradeRecord[];
  meta: {
    total_records: number;
    periods: string[];
    commodities: CommodityLookup;
    countries: CountryLookup;
    last_updated: string;
  };
}

// ---------------------------------------------------------------------------
// Generic query builder types
// ---------------------------------------------------------------------------

/** Fields a query can group by */
export type GroupByField =
  | 'commodity_code'
  | 'commodity_name'
  | 'commodity_level'
  | 'country_code'
  | 'country_name'
  | 'flow'
  | 'date'
  | 'period_type';

/** Numeric fields available for aggregation */
export type NumericField = 'value_gbp' | 'volume';

/** Aggregation functions */
export type AggFn = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** One aggregation spec: { value_gbp: 'sum' } or { value_gbp: ['sum', 'avg'] } */
export type AggregateSpec = Partial<Record<NumericField, AggFn | AggFn[]>>;

/**
 * A computed (derived) column added after aggregation.
 * Receives the current row object and all rows, returns a new value.
 */
export type ComputeFn = (row: QueryRow, allRows: QueryRow[]) => number | string | null;

/** Sort spec: field name + direction */
export interface SortSpec {
  field: string;
  dir: 'asc' | 'desc';
}

/**
 * A row produced by the generic query builder.
 * Keys are group-by fields + aggregated columns (e.g. "value_gbp_sum")
 * + any computed columns.
 */
export type QueryRow = Record<string, string | number | null>;

// ---------------------------------------------------------------------------
// Filter types (kept for backward compat + convenience wrappers)
// ---------------------------------------------------------------------------

/** Filter options */
export interface QueryFilter {
  flow?: 'import' | 'export';
  commodityCode?: string;
  countryCode?: string;
  /** Inclusive ISO date string start, e.g. "2023-01-01" */
  dateFrom?: string;
  /** Inclusive ISO date string end, e.g. "2024-12-31" */
  dateTo?: string;
  year?: number;
  periodType?: 'monthly' | 'quarterly' | 'annual';
  measure?: 'CP' | 'CVM' | 'IDEF';
  data_type?: 'goods' | 'services';
  /** Arbitrary predicate for anything not covered above */
  where?: (record: TradeRecord) => boolean;
}

// ---------------------------------------------------------------------------
// Convenience result types (kept as reference examples in README/docs)
// ---------------------------------------------------------------------------

/** Result of a partner reliance query */
export interface PartnerRelianceResult {
  country_code: string;
  country_name: string;
  value_gbp: number;
  share_pct: number;
  periods: string[];
}

/** Result of an export/import growth query */
export interface GrowthResult {
  code: string;
  name: string;
  flow: 'import' | 'export';
  value_start: number;
  value_end: number;
  growth_pct: number;
  periods_compared: [string, string];
}

/** Result of a trade balance breakdown */
export interface BalanceBreakdownResult {
  commodity_code: string;
  commodity_name: string;
  imports_gbp: number;
  exports_gbp: number;
  net_gbp: number;
}

/** Result of an anomaly/outlier detection query */
export interface OutlierResult {
  record: TradeRecord;
  mean_value: number;
  std_dev: number;
  z_score: number;
}

/** Lightweight meta index: per-country summary of available commodities and periods */
export interface MetaIndex {
  [country_code: string]: {
    commodities: string[];
    periods: string[];
  };
}
