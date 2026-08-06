<script lang="ts">
  import { onMount } from 'svelte';
  import { QueryEngine } from '$lib/query-engine.js';
  import type { PartnerRelianceResult, GrowthResult, BalanceBreakdownResult, OutlierResult } from '$lib/types/trade.js';

  const engine = new QueryEngine('/data');

  // ── Query 1: Partner Reliance ──────────────────────────────────────────────
  let q1Commodity = '28';
  let q1Year = 2024;
  let q1Flow: 'import' | 'export' = 'import';
  let q1Results: PartnerRelianceResult[] = [];
  let q1Loading = false;
  let q1Error = '';

  async function runQ1() {
    q1Loading = true; q1Error = '';
    try {
      q1Results = await engine.partnerReliance(q1Commodity, { flow: q1Flow, year: q1Year });
    } catch (e: any) { q1Error = e.message; }
    q1Loading = false;
  }

  // ── Query 2: Export/Import Growth ─────────────────────────────────────────
  let q2Country = 'US';
  let q2Flow: 'import' | 'export' = 'export';
  let q2Window = 12;
  let q2Results: GrowthResult[] = [];
  let q2Loading = false;
  let q2Error = '';

  async function runQ2() {
    q2Loading = true; q2Error = '';
    try {
      q2Results = await engine.topGrowth(q2Country, q2Flow, q2Window);
    } catch (e: any) { q2Error = e.message; }
    q2Loading = false;
  }

  // ── Query 3: Trade Balance Breakdown ──────────────────────────────────────
  let q3Country = 'DE';
  let q3Year = 2024;
  let q3Results: BalanceBreakdownResult[] = [];
  let q3Loading = false;
  let q3Error = '';

  async function runQ3() {
    q3Loading = true; q3Error = '';
    try {
      q3Results = await engine.balanceBreakdown(q3Country, { year: q3Year });
    } catch (e: any) { q3Error = e.message; }
    q3Loading = false;
  }

  // ── Query 4: Anomaly Detection ────────────────────────────────────────────
  let q4AnchorType: 'country' | 'commodity' = 'country';
  let q4Code = 'CN';
  let q4Flow: 'import' | 'export' = 'export';
  let q4Threshold = 2.5;
  let q4Results: OutlierResult[] = [];
  let q4Loading = false;
  let q4Error = '';

  async function runQ4() {
    q4Loading = true; q4Error = '';
    try {
      q4Results = await engine.outliers(
        { type: q4AnchorType, code: q4Code },
        { flow: q4Flow }
      );
    } catch (e: any) { q4Error = e.message; }
    q4Loading = false;
  }

  onMount(() => {
    // Auto-run all four queries on page load
    runQ1(); runQ2(); runQ3(); runQ4();
  });

  function fmt(n: number): string {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  function pct(n: number): string {
    return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  }
</script>

<main>
  <header>
    <h1>ONS Trade Data — Client-Side Query Engine</h1>
    <p class="subtitle">All queries run in the browser from pre-generated JSON files. No server required.</p>
  </header>

  <!-- Query 1: Partner Reliance -->
  <section>
    <h2>1 · Partner Reliance</h2>
    <p class="desc">Which countries supply (or receive) a given commodity? Identifies concentration risk.</p>
    <div class="controls">
      <label>Commodity code <input bind:value={q1Commodity} /></label>
      <label>Year <input type="number" bind:value={q1Year} min="2000" max="2030" /></label>
      <label>Flow
        <select bind:value={q1Flow}>
          <option value="import">Import</option>
          <option value="export">Export</option>
        </select>
      </label>
      <button on:click={runQ1} disabled={q1Loading}>{q1Loading ? 'Loading…' : 'Run'}</button>
    </div>
    {#if q1Error}<p class="error">{q1Error}</p>{/if}
    {#if q1Results.length}
      <table>
        <thead><tr><th>Country</th><th>Value (GBP)</th><th>Share</th><th>Periods</th></tr></thead>
        <tbody>
          {#each q1Results as r}
            <tr>
              <td><strong>{r.country_code}</strong> {r.country_name}</td>
              <td class="num">{fmt(r.value_gbp)}</td>
              <td class="num">{r.share_pct}%</td>
              <td>{r.periods.length} period(s)</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <!-- Query 2: Growth Discovery -->
  <section>
    <h2>2 · Export / Import Growth Discovery</h2>
    <p class="desc">Which UK product categories are growing fastest with a given partner?</p>
    <div class="controls">
      <label>Country code <input bind:value={q2Country} /></label>
      <label>Flow
        <select bind:value={q2Flow}>
          <option value="export">Export</option>
          <option value="import">Import</option>
        </select>
      </label>
      <label>Window (periods) <input type="number" bind:value={q2Window} min="1" max="60" /></label>
      <button on:click={runQ2} disabled={q2Loading}>{q2Loading ? 'Loading…' : 'Run'}</button>
    </div>
    {#if q2Error}<p class="error">{q2Error}</p>{/if}
    {#if q2Results.length}
      <table>
        <thead><tr><th>Commodity</th><th>Previous</th><th>Recent</th><th>Growth</th></tr></thead>
        <tbody>
          {#each q2Results as r}
            <tr>
              <td><strong>{r.code}</strong> {r.name}</td>
              <td class="num">{fmt(r.value_start)}</td>
              <td class="num">{fmt(r.value_end)}</td>
              <td class="num" class:positive={r.growth_pct > 0} class:negative={r.growth_pct < 0}>{pct(r.growth_pct)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <!-- Query 3: Trade Balance Breakdown -->
  <section>
    <h2>3 · Trade Balance Breakdown</h2>
    <p class="desc">Net trade with a country by commodity — isolates what's driving a surplus or deficit.</p>
    <div class="controls">
      <label>Country code <input bind:value={q3Country} /></label>
      <label>Year <input type="number" bind:value={q3Year} min="2000" max="2030" /></label>
      <button on:click={runQ3} disabled={q3Loading}>{q3Loading ? 'Loading…' : 'Run'}</button>
    </div>
    {#if q3Error}<p class="error">{q3Error}</p>{/if}
    {#if q3Results.length}
      <table>
        <thead><tr><th>Commodity</th><th>Imports</th><th>Exports</th><th>Net</th></tr></thead>
        <tbody>
          {#each q3Results as r}
            <tr>
              <td><strong>{r.commodity_code}</strong> {r.commodity_name}</td>
              <td class="num">{fmt(r.imports_gbp)}</td>
              <td class="num">{fmt(r.exports_gbp)}</td>
              <td class="num" class:positive={r.net_gbp > 0} class:negative={r.net_gbp < 0}>{fmt(r.net_gbp)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <!-- Query 4: Anomaly Detection -->
  <section>
    <h2>4 · Anomaly Detection</h2>
    <p class="desc">Flags statistically unusual trade values (z-score outliers) for a given country or commodity.</p>
    <div class="controls">
      <label>Anchor by
        <select bind:value={q4AnchorType}>
          <option value="country">Country</option>
          <option value="commodity">Commodity</option>
        </select>
      </label>
      <label>Code <input bind:value={q4Code} /></label>
      <label>Flow
        <select bind:value={q4Flow}>
          <option value="export">Export</option>
          <option value="import">Import</option>
        </select>
      </label>
      <label>Z-score threshold <input type="number" bind:value={q4Threshold} step="0.1" min="1" max="5" /></label>
      <button on:click={runQ4} disabled={q4Loading}>{q4Loading ? 'Loading…' : 'Run'}</button>
    </div>
    {#if q4Error}<p class="error">{q4Error}</p>{/if}
    {#if q4Results.length}
      <table>
        <thead><tr><th>Date</th><th>Commodity</th><th>Country</th><th>Value</th><th>Z-score</th></tr></thead>
        <tbody>
          {#each q4Results as o}
            <tr>
              <td>{o.record.date}</td>
              <td>{o.record.commodity_code} {o.record.commodity_name}</td>
              <td>{o.record.country_code}</td>
              <td class="num">{fmt(o.record.value_gbp)}</td>
              <td class="num" class:positive={o.z_score > 0} class:negative={o.z_score < 0}>{o.z_score.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if !q4Loading && !q4Error}
      <p class="muted">No outliers found at z ≥ {q4Threshold}.</p>
    {/if}
  </section>
</main>

<style>
  main { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; }
  header { border-bottom: 2px solid #e2e8f0; margin-bottom: 2rem; padding-bottom: 1rem; }
  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
  .subtitle { color: #64748b; margin: 0; }
  section { margin-bottom: 3rem; }
  h2 { font-size: 1.1rem; border-left: 4px solid #3b82f6; padding-left: 0.75rem; }
  .desc { color: #64748b; font-size: 0.9rem; margin: 0.25rem 0 0.75rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
  label { display: flex; flex-direction: column; font-size: 0.8rem; color: #475569; gap: 0.25rem; }
  input, select { padding: 0.35rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.9rem; }
  button { padding: 0.4rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
  button:disabled { background: #94a3b8; cursor: default; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { text-align: left; border-bottom: 2px solid #e2e8f0; padding: 0.5rem; color: #475569; font-weight: 600; }
  td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #f1f5f9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .positive { color: #16a34a; font-weight: 600; }
  .negative { color: #dc2626; font-weight: 600; }
  .error { color: #dc2626; font-size: 0.875rem; }
  .muted { color: #94a3b8; font-size: 0.875rem; }
</style>

