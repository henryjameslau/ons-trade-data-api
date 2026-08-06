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

/** Result of a partner reliance query: top origin/destination countries for a commodity */
export interface PartnerRelianceResult {
  country_code: string;
  country_name: string;
  value_gbp: number;
  share_pct: number;
  periods: string[];
}

/** Result of an export/import growth query: % change per commodity or country over a time window */
export interface GrowthResult {
  code: string;
  name: string;
  flow: 'import' | 'export';
  value_start: number;
  value_end: number;
  growth_pct: number;
  periods_compared: [string, string];
}

/** Result of a trade balance breakdown: net trade by commodity for a given country */
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

/** Filter options passed to QueryEngine methods */
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
}
