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
