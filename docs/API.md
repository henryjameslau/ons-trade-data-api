# ONS Trade Data API Documentation

## Base URL

```
http://localhost:5173/api      (Development)
https://your-domain.com/api    (Production)
```

## Response Format

All responses are JSON. Successful responses return HTTP 200, errors return appropriate status codes (404 for not found, 500 for server errors).

## Common Response Structure

### Success Response
```json
{
  "records": [...],
  "meta": {
    "total_records": 100,
    "last_updated": "2026-08-05T14:53:00.348Z"
  }
}
```

### Error Response
```json
{
  "error": "File not found: commodities.json"
}
```

---

## Endpoints Reference

### 1. Metadata Endpoints

#### 1.1 Get Schema
**Endpoint:** `GET /api/meta/schema`

Returns information about the data schema, version, and metadata.

**Example:**
```bash
curl http://localhost:5173/api/meta/schema
```

---

#### 1.2 Get Commodities
**Endpoint:** `GET /api/meta/commodities`

Returns all commodity codes with their names and hierarchy levels.

**Example:**
```bash
curl http://localhost:5173/api/meta/commodities | jq '.'
```

---

#### 1.3 Get Countries
**Endpoint:** `GET /api/meta/countries`

Returns all country codes with their full names.

**Example:**
```bash
curl http://localhost:5173/api/meta/countries
```

---

#### 1.4 Get Time Periods
**Endpoint:** `GET /api/meta/periods`

Returns an array of all available time periods in the dataset.

**Example:**
```bash
curl http://localhost:5173/api/meta/periods
```

---

### 2. Trade Data Endpoints

#### 2.1 Get Trade by Commodity
**Endpoint:** `GET /api/trade-by-commodity/{commodity_code}`

Returns all trade records for a specific commodity.

**Example:**
```bash
curl http://localhost:5173/api/trade-by-commodity/SITC_28
```

---

#### 2.2 Get Trade by Country
**Endpoint:** `GET /api/trade-by-country/{country_code}`

Returns all trade records for a specific country.

**Example:**
```bash
curl http://localhost:5173/api/trade-by-country/US
curl http://localhost:5173/api/trade-by-country/de  # Case-insensitive
```

---

#### 2.3 Get Trade by Period
**Endpoint:** `GET /api/trade-by-period/{date}`

Returns all trade records for a specific time period.

**Example:**
```bash
curl http://localhost:5173/api/trade-by-period/2025-12
```

---

### 3. Aggregated Analysis Endpoints

#### 3.1 Get Top Imports
**Endpoint:** `GET /api/top-imports/{period}`

Returns the top 100 import records by trade value.

**Example:**
```bash
curl http://localhost:5173/api/top-imports/all-time
```

---

#### 3.2 Get Top Exports
**Endpoint:** `GET /api/top-exports/{period}`

Returns the top 100 export records by trade value.

**Example:**
```bash
curl http://localhost:5173/api/top-exports/all-time
```

---

#### 3.3 Get Trade Balance
**Endpoint:** `GET /api/balance/{country_code}/{period}`

Returns trade balance data for a country and period.

**Example:**
```bash
curl http://localhost:5173/api/balance/DE/2025-12
```

---

## Query Examples

### Example 1: Find all imports from China
```bash
curl http://localhost:5173/api/trade-by-country/CN | \
  jq '.[] | select(.flow=="import") | {commodity: .commodity_name, value: .value_gbp}'
```

### Example 2: Get top 10 exported commodities
```bash
curl http://localhost:5173/api/top-exports/all-time | \
  jq '.[0:10] | .[] | {commodity: .commodity_name, value: .value_gbp}'
```

### Example 3: List all commodities and their codes
```bash
curl http://localhost:5173/api/meta/commodities | jq 'keys'
```

---

## Error Handling

### 404 Not Found
Returned when a requested resource doesn't exist.

### 500 Internal Server Error
Returned when there's a server-side error processing the request.

---

## Data Schema

Each trade record contains:

```typescript
{
  commodity_code: string;
  commodity_name: string;
  commodity_level: number;
  country_code: string;
  country_name: string;
  flow: 'import' | 'export';
  date: string;                  // YYYY-MM-DD
  period_type: 'monthly' | 'quarterly' | 'annual';
  value_gbp: number;
  volume: number | null;
  volume_unit: string | null;
  data_source: string;
  last_updated: string;
}
```
