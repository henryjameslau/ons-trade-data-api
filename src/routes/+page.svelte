<script lang="ts">
  import { onMount } from 'svelte';
  import { QueryEngine } from '$lib/query-engine.js';
  import type { QueryRow } from '$lib/types/trade.js';

  const engine = new QueryEngine('/data');

  // ── Live Query Builder ────────────────────────────────────────────────────
  let qbAnchorType: 'country' | 'commodity' | 'period' = 'country';
  let qbAnchorCode = 'DE';
  let qbGroupBy = 'commodity_code';
  let qbSecondGroupBy = 'commodity_name';
  let qbAggField = 'value_gbp';
  let qbAggFn: 'sum' | 'avg' | 'min' | 'max' | 'count' = 'sum';
  let qbFlow = '';
  let qbYear = '';
  let qbSortDir: 'asc' | 'desc' = 'desc';
  let qbLimit = 20;
  let qbResults: QueryRow[] = [];
  let qbLoading = false;
  let qbError = '';

  $: filterParts = [
    qbFlow ? `flow: '${qbFlow}'` : '',
    qbYear ? `year: ${qbYear}` : ''
  ].filter(Boolean);

  $: groupParts = [qbGroupBy, qbSecondGroupBy].filter(Boolean);

  $: qbCode = [
    `engine`,
    `  .query('${qbAnchorType}', '${qbAnchorCode}')`,
    filterParts.length ? `  .filter({ ${filterParts.join(', ')} })` : '',
    `  .groupBy(${groupParts.map(f => `'${f}'`).join(', ')})`,
    `  .aggregate({ ${qbAggField}: '${qbAggFn}' })`,
    `  .sortBy('${qbAggField}_${qbAggFn}', '${qbSortDir}')`,
    `  .limit(${qbLimit})`,
    `  .run()`
  ].filter(Boolean).join('\n');

  async function runQb() {
    qbLoading = true; qbError = '';
    try {
      const filter: Record<string, any> = {};
      if (qbFlow) filter.flow = qbFlow;
      if (qbYear) filter.year = Number(qbYear);

      const q = engine
        .query(qbAnchorType, qbAnchorCode)
        .groupBy(...(groupParts as any))
        .aggregate({ [qbAggField]: qbAggFn } as any)
        .sortBy(`${qbAggField}_${qbAggFn}`, qbSortDir)
        .limit(qbLimit);

      if (Object.keys(filter).length) q.filter(filter);
      qbResults = await q.run();
    } catch (e: any) { qbError = e.message; }
    qbLoading = false;
  }

  // ── Raw fetch demo ────────────────────────────────────────────────────────
  let rawAnchorType = 'trade-by-country';
  let rawAnchorCode = 'de';
  let rawResults: any[] = [];
  let rawLoading = false;
  let rawError = '';
  let rawCount = 0;

  $: rawUrl = `/data/${rawAnchorType}/${rawAnchorCode.toLowerCase()}.json`;
  $: rawFetchCode = esc(`const res = await fetch('${rawUrl}');
const records = await res.json();
// records is a TradeRecord[]`);

  async function runRaw() {
    rawLoading = true; rawError = '';
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      rawCount = data.length;
      rawResults = data.slice(0, 10);
    } catch (e: any) { rawError = e.message; }
    rawLoading = false;
  }

  onMount(runQb);

  function n(v: number): string {
    return v?.toLocaleString('en-GB') ?? '—';
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const recipe1 = esc(`engine
  .query('commodity', '28')
  .filter({ flow: 'import', year: 2024 })
  .groupBy('country_code', 'country_name')
  .aggregate({ value_gbp: 'sum' })
  .compute('share_pct', (row, all) => {
    const total = all.reduce((s, r) =>
      s + (r.value_gbp_sum as number), 0);
    return total > 0
      ? Math.round(((row.value_gbp_sum as number)
          / total) * 10000) / 100
      : 0;
  })
  .sortBy('value_gbp_sum', 'desc')
  .limit(20)
  .run()`);

  const recipe2 = esc(`// Recent window (last 12 periods)
const recent = await engine
  .query('country', 'US')
  .filter({ flow: 'export', dateFrom: '2024-01-01' })
  .groupBy('commodity_code', 'commodity_name')
  .aggregate({ value_gbp: 'sum' })
  .run();

// Previous window
const prev = await engine
  .query('country', 'US')
  .filter({ flow: 'export', dateFrom: '2023-01-01', dateTo: '2023-12-31' })
  .groupBy('commodity_code')
  .aggregate({ value_gbp: 'sum' })
  .run();

// Join + compute growth client-side
const prevMap = new Map(
  prev.map(r => [r.commodity_code, r.value_gbp_sum])
);
const growth = recent.map(r => {
  const p = (prevMap.get(r.commodity_code) as number) ?? 0;
  return {
    ...r,
    growth_pct: p > 0
      ? ((r.value_gbp_sum as number) - p) / p * 100
      : null
  };
}).sort((a, b) =>
  (b.growth_pct as number) - (a.growth_pct as number));`);

  const recipe3 = esc(`// Group by commodity + flow, then pivot
const rows = await engine
  .query('country', 'DE')
  .filter({ year: 2024 })
  .groupBy('commodity_code', 'commodity_name', 'flow')
  .aggregate({ value_gbp: 'sum' })
  .run();

const map = new Map();
for (const r of rows) {
  const e = map.get(r.commodity_code) ?? {
    commodity_code: r.commodity_code,
    commodity_name: r.commodity_name,
    imports: 0, exports: 0
  };
  if (r.flow === 'import') e.imports += r.value_gbp_sum;
  else e.exports += r.value_gbp_sum;
  e.net = e.exports - e.imports;
  map.set(r.commodity_code, e);
}

const balance = [...map.values()]
  .sort((a, b) => a.net - b.net); // deficit-first`);

  const recipe4 = esc(`const rows = await engine
  .query('country', 'CN')
  .filter({ flow: 'export' })
  .compute('z_score', (row, all) => {
    const vals = all.map(r => r.value_gbp as number);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(
      vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
    );
    return std > 0
      ? Math.round(
          ((row.value_gbp as number) - mean) / std * 100
        ) / 100
      : 0;
  })
  .sortBy('z_score', 'desc')
  .run();

const outliers = rows.filter(r =>
  Math.abs(r.z_score as number) >= 2.5);`);


</script>

<main>
  <header>
    <h1>ONS Trade Data</h1>
    <p class="subtitle">All queries run in the browser from pre-generated JSON files — no server required.</p>
  </header>

  <!-- ── Live Query Builder ─────────────────────────────────────────────── -->
  <section class="builder">
    <h2>Query Builder</h2>
    <p class="desc">Compose any multidimensional query. Change the controls and press <strong>Run</strong>.</p>

    <div class="controls">
      <label>Anchor
        <select bind:value={qbAnchorType}>
          <option value="country">country</option>
          <option value="commodity">commodity</option>
          <option value="period">period</option>
        </select>
      </label>
      <label>Code
        <input bind:value={qbAnchorCode} style="width:5rem" />
      </label>
      <label>Group by
        <select bind:value={qbGroupBy}>
          <option value="commodity_code">commodity_code</option>
          <option value="commodity_name">commodity_name</option>
          <option value="country_code">country_code</option>
          <option value="country_name">country_name</option>
          <option value="flow">flow</option>
          <option value="date">date</option>
          <option value="period_type">period_type</option>
          <option value="commodity_level">commodity_level</option>
        </select>
      </label>
      <label>+ also group
        <select bind:value={qbSecondGroupBy}>
          <option value="">—</option>
          <option value="commodity_name">commodity_name</option>
          <option value="commodity_code">commodity_code</option>
          <option value="country_name">country_name</option>
          <option value="country_code">country_code</option>
          <option value="flow">flow</option>
          <option value="date">date</option>
        </select>
      </label>
      <label>Aggregate
        <select bind:value={qbAggField}>
          <option value="value_gbp">value_gbp</option>
          <option value="volume">volume</option>
        </select>
      </label>
      <label>Fn
        <select bind:value={qbAggFn}>
          <option value="sum">sum</option>
          <option value="avg">avg</option>
          <option value="min">min</option>
          <option value="max">max</option>
          <option value="count">count</option>
        </select>
      </label>
      <label>Flow
        <select bind:value={qbFlow}>
          <option value="">any</option>
          <option value="import">import</option>
          <option value="export">export</option>
        </select>
      </label>
      <label>Year
        <input type="number" bind:value={qbYear} min="2000" max="2030" placeholder="any" style="width:5rem" />
      </label>
      <label>Sort
        <select bind:value={qbSortDir}>
          <option value="desc">desc</option>
          <option value="asc">asc</option>
        </select>
      </label>
      <label>Limit
        <input type="number" bind:value={qbLimit} min="1" max="500" style="width:4rem" />
      </label>
      <button on:click={runQb} disabled={qbLoading}>{qbLoading ? 'Loading…' : 'Run'}</button>
    </div>

    <details class="code-block" open>
      <summary>Code</summary>
      <pre>{qbCode}</pre>
    </details>

    {#if qbError}<p class="error">{qbError}</p>{/if}
    {#if qbResults.length}
      <div class="scroll-table">
        <table>
          <thead><tr>{#each Object.keys(qbResults[0]) as col}<th>{col}</th>{/each}</tr></thead>
          <tbody>
            {#each qbResults as row}
              <tr>
                {#each Object.values(row) as val}
                  <td class:num={typeof val === 'number'}>
                    {typeof val === 'number' ? n(val) : val ?? '—'}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- ── Raw file fetch (no query engine) ─────────────────────────────── -->
  <section>
    <h2>Direct File Access</h2>
    <p class="desc">Every data file is a plain JSON array served as a static asset. You can fetch it directly without the query engine — useful for loading all records for a country or commodity into your own code.</p>

    <div class="controls">
      <label>File type
        <select bind:value={rawAnchorType}>
          <option value="trade-by-country">trade-by-country</option>
          <option value="trade-by-commodity">trade-by-commodity</option>
          <option value="trade-by-period">trade-by-period</option>
          <option value="meta">meta</option>
        </select>
      </label>
      <label>Code / filename
        <input bind:value={rawAnchorCode} style="width:8rem" />
      </label>
      <button on:click={runRaw} disabled={rawLoading}>{rawLoading ? 'Loading…' : 'Fetch'}</button>
    </div>

    <details class="code-block">
      <summary>Code</summary>
      <pre>{@html rawFetchCode}</pre>
    </details>

    {#if rawError}<p class="error">{rawError}</p>{/if}
    {#if rawResults.length}
      <p class="muted">Showing first 10 of {rawCount.toLocaleString()} records from <code>{rawUrl}</code></p>
      <div class="scroll-table">
        <table>
          <thead><tr>{#each Object.keys(rawResults[0]) as col}<th>{col}</th>{/each}</tr></thead>
          <tbody>
            {#each rawResults as row}
              <tr>
                {#each Object.values(row) as val}
                  <td class:num={typeof val === 'number'}>
                    {typeof val === 'number' ? n(val) : val ?? '—'}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- ── Example recipes ──────────────────────────────────────────────── -->
  <section>
    <h2>Example Query Recipes</h2>
    <p class="desc">These are the four analytical patterns from the original spec — shown here as query engine code you can copy and adapt.</p>

    <div class="recipes">

      <article>
        <h3>Partner Reliance</h3>
        <p>Which countries supply a given commodity? Identifies concentration risk.</p>
        <pre>{@html recipe1}</pre>
      </article>

      <article>
        <h3>Export Growth Discovery</h3>
        <p>Which commodities are growing fastest by value with a given partner? Use two queries — one for recent periods, one for the previous window — then join on commodity_code.</p>
        <pre>{@html recipe2}</pre>
      </article>

      <article>
        <h3>Trade Balance Breakdown</h3>
        <p>Net trade (exports − imports) with a country, broken down by commodity.</p>
        <pre>{@html recipe3}</pre>
      </article>

      <article>
        <h3>Anomaly Detection</h3>
        <p>Flag statistically unusual trade values using z-score. Records where |z| ≥ threshold are outliers.</p>
        <pre>{@html recipe4}</pre>
      </article>

    </div>
  </section>

</main>

<style>
  main { font-family: system-ui, -apple-system, sans-serif; max-width: 1040px; margin: 0 auto; padding: 2rem; }
  header { border-bottom: 2px solid #e2e8f0; margin-bottom: 2rem; padding-bottom: 1rem; }
  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
  .subtitle { color: #64748b; margin: 0; font-size: 0.95rem; }
  section { margin-bottom: 3.5rem; }
  section.builder { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; }
  h2 { font-size: 1.1rem; border-left: 4px solid #3b82f6; padding-left: 0.75rem; margin-top: 0; }
  h3 { font-size: 0.95rem; margin: 0 0 0.4rem; color: #1e293b; }
  .desc { color: #64748b; font-size: 0.9rem; margin: 0.25rem 0 1rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
  label { display: flex; flex-direction: column; font-size: 0.78rem; color: #475569; gap: 0.2rem; }
  input, select { padding: 0.35rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.875rem; }
  button { padding: 0.4rem 1.25rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; align-self: flex-end; }
  button:disabled { background: #94a3b8; cursor: default; }
  .code-block { margin: 0.5rem 0 1rem; }
  .code-block summary { cursor: pointer; font-size: 0.8rem; color: #64748b; user-select: none; }
  .code-block pre { background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 1rem; font-size: 0.8rem; overflow-x: auto; margin: 0.5rem 0 0; white-space: pre; line-height: 1.5; }
  .scroll-table { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.83rem; white-space: nowrap; }
  th { text-align: left; border-bottom: 2px solid #e2e8f0; padding: 0.45rem 0.5rem; color: #475569; font-weight: 600; }
  td { padding: 0.35rem 0.5rem; border-bottom: 1px solid #f1f5f9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .error { color: #dc2626; font-size: 0.875rem; }
  .muted { color: #94a3b8; font-size: 0.825rem; margin: 0 0 0.5rem; }

  .recipes { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 1.5rem; }
  article { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; }
  article p { color: #64748b; font-size: 0.875rem; margin: 0 0 0.75rem; }
  article pre { background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 1rem; font-size: 0.75rem; overflow-x: auto; margin: 0; white-space: pre; line-height: 1.5; }
</style>

