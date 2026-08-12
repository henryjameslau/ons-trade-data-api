<script lang="ts">
  import { onMount } from 'svelte';
  import { Plot, Line } from 'svelteplot';

  // ── EU27 country codes ────────────────────────────────────────────────────
  const EU_CODES = new Set([
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR',
    'HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'
  ]);

  // ── Chart data ────────────────────────────────────────────────────────────
  type Point = { date: Date; value: number };

  let fig1ExportsEuData: Point[] = [];
  let fig1ExportsNonEuData: Point[] = [];
  let fig1ImportsEuData: Point[] = [];
  let fig1ImportsNonEuData: Point[] = [];

  let fig2EuExportsData: Point[] = [];
  let fig2EuImportsData: Point[] = [];
  let fig2NonEuExportsData: Point[] = [];
  let fig2NonEuImportsData: Point[] = [];

  let fig5ExportsCpData: Point[] = [];
  let fig5ExportsCvmData: Point[] = [];
  let fig5ImportsCpData: Point[] = [];
  let fig5ImportsCvmData: Point[] = [];

  let loading = true;
  let error = '';

  const ROLLING_MONTH_COUNT = 36;

  function parseDate(iso: string): Date {
    return new Date(iso);
  }

  function latestMonthlyDateSet(records: Array<{ date: string }>, months = ROLLING_MONTH_COUNT): Set<string> {
    const dates = [...new Set(records.map((r) => r.date))].sort();
    return new Set(dates.slice(-months));
  }

  function seriesMax(series: Point[]): number {
    return series.reduce((m, p) => Math.max(m, p.value), 0);
  }

  $: fig1YMax = Math.max(
    1,
    seriesMax(fig1ExportsEuData),
    seriesMax(fig1ExportsNonEuData),
    seriesMax(fig1ImportsEuData),
    seriesMax(fig1ImportsNonEuData)
  );

  $: fig2YMax = Math.max(
    1,
    seriesMax(fig2EuExportsData),
    seriesMax(fig2EuImportsData),
    seriesMax(fig2NonEuExportsData),
    seriesMax(fig2NonEuImportsData)
  );

  $: fig5YMax = Math.max(
    1,
    seriesMax(fig5ExportsCpData),
    seriesMax(fig5ExportsCvmData),
    seriesMax(fig5ImportsCpData),
    seriesMax(fig5ImportsCvmData)
  );

  onMount(async () => {
    try {
      // ── Goods data (Figure 1 & 2) ─────────────────────────────────────
      const goodsRes = await fetch('/data/trade-by-commodity/t.json');
      if (!goodsRes.ok) throw new Error('Failed to load goods data');
      const goodsRaw: any[] = await goodsRes.json();

      // Filter to monthly, within date window
      const goodsMonthlyAll = goodsRaw.filter((r) => r.period_type === 'monthly');
      const latestGoodsDates = latestMonthlyDateSet(goodsMonthlyAll);
      const goodsMonthly = goodsMonthlyAll.filter((r) => latestGoodsDates.has(r.date));

      // Aggregate by date, flow, EU/Non-EU
      const agg = new Map<string, number>();
      for (const r of goodsMonthly) {
        const region = EU_CODES.has(r.country_code) ? 'EU' : 'Non-EU';
        const key = `${r.date}|${r.flow}|${region}`;
        agg.set(key, (agg.get(key) ?? 0) + r.value_gbp);
      }

      const fig1ExportsEu: Point[] = [];
      const fig1ExportsNonEu: Point[] = [];
      const fig1ImportsEu: Point[] = [];
      const fig1ImportsNonEu: Point[] = [];

      const fig2EuExports: Point[] = [];
      const fig2EuImports: Point[] = [];
      const fig2NonEuExports: Point[] = [];
      const fig2NonEuImports: Point[] = [];

      // Build chart arrays
      for (const [key, total] of agg) {
        const [date, flow, region] = key.split('|');
        const point: Point = { date: parseDate(date), value: total / 1e9 };

        if (flow === 'export' && region === 'EU') {
          fig1ExportsEu.push(point);
          fig2EuExports.push(point);
        } else if (flow === 'export' && region === 'Non-EU') {
          fig1ExportsNonEu.push(point);
          fig2NonEuExports.push(point);
        } else if (flow === 'import' && region === 'EU') {
          fig1ImportsEu.push(point);
          fig2EuImports.push(point);
        } else if (flow === 'import' && region === 'Non-EU') {
          fig1ImportsNonEu.push(point);
          fig2NonEuImports.push(point);
        }
      }

      const byDate = (a: Point, b: Point) => +a.date - +b.date;
      fig1ExportsEuData = fig1ExportsEu.sort(byDate);
      fig1ExportsNonEuData = fig1ExportsNonEu.sort(byDate);
      fig1ImportsEuData = fig1ImportsEu.sort(byDate);
      fig1ImportsNonEuData = fig1ImportsNonEu.sort(byDate);
      fig2EuExportsData = fig2EuExports.sort(byDate);
      fig2EuImportsData = fig2EuImports.sort(byDate);
      fig2NonEuExportsData = fig2NonEuExports.sort(byDate);
      fig2NonEuImportsData = fig2NonEuImports.sort(byDate);

      // ── Services data (Figure 5) ──────────────────────────────────────
      const svcRes = await fetch('/data/trade-by-commodity/ts_total.json');
      if (!svcRes.ok) throw new Error('Failed to load services data');
      const svcRaw: any[] = await svcRes.json();

      const fig5ExportsCp: Point[] = [];
      const fig5ExportsCvm: Point[] = [];
      const fig5ImportsCp: Point[] = [];
      const fig5ImportsCvm: Point[] = [];

      const servicesMonthlyAll = svcRaw.filter(
        (r) =>
          r.period_type === 'monthly' &&
          r.country_code === 'WW' &&
          (r.measure === 'CP' || r.measure === 'CVM')
      );
      const latestServiceDates = latestMonthlyDateSet(servicesMonthlyAll);

      for (const r of servicesMonthlyAll) {
        if (latestServiceDates.has(r.date)) {
          const point: Point = { date: parseDate(r.date), value: r.value_gbp / 1e9 };
          if (r.flow === 'export' && r.measure === 'CP') fig5ExportsCp.push(point);
          if (r.flow === 'export' && r.measure === 'CVM') fig5ExportsCvm.push(point);
          if (r.flow === 'import' && r.measure === 'CP') fig5ImportsCp.push(point);
          if (r.flow === 'import' && r.measure === 'CVM') fig5ImportsCvm.push(point);
        }
      }
      fig5ExportsCpData = fig5ExportsCp.sort(byDate);
      fig5ExportsCvmData = fig5ExportsCvm.sort(byDate);
      fig5ImportsCpData = fig5ImportsCp.sort(byDate);
      fig5ImportsCvmData = fig5ImportsCvm.sort(byDate);

      loading = false;
    } catch (e: any) {
      error = e.message;
      loading = false;
    }
  });

</script>

<main>
  <header>
    <h1>UK Trade in Goods and Services</h1>
    <p class="subtitle">
      Data from the <a href="https://www.ons.gov.uk/economy/nationalaccounts/balanceofpayments/bulletins/uktrade/latest" target="_blank">ONS UK Trade bulletin</a>.
      Monthly, current prices. Goods data summed across all trading partners (not seasonally adjusted).
    </p>

    <p>
      <a href="api/">View more information about the API.</a>
    </p>
  </header>

  {#if loading}
    <p class="loading">Loading chart data…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}

    <!-- ── Figure 1 ─────────────────────────────────────────────────────── -->
    <section class="chart-section">
      <h2>Figure 1: EU and non-EU goods exports and imports</h2>
      <p class="chart-subtitle">
        EU and non-EU goods imports and exports, current prices, latest 3 years
      </p>
      <div class="legend">
        <span class="legend-item" style="--c:#206095">EU</span>
        <span class="legend-item" style="--c:#F66068">Non-EU</span>
      </div>
      <div class="facet-row figure1-stack">
        <div class="facet-panel">
          <h3>Goods Exports</h3>
          <Plot
            height={260}
            marginLeft={50}
            marginRight={12}
            x={{ type: 'time', label: false }}
            y={{ label: '£ billion', grid: true, domain: [0, fig1YMax] }}
          >
            <Line
              data={fig1ExportsEuData}
              x="date"
              y="value"
              stroke="#206095"
              strokeWidth={2}
              curve="linear"
            />
            <Line
              data={fig1ExportsNonEuData}
              x="date"
              y="value"
              stroke="#F66068"
              strokeWidth={2}
              curve="linear"
            />
          </Plot>
        </div>
        <div class="facet-panel">
          <h3>Goods Imports</h3>
          <Plot
            height={260}
            marginLeft={50}
            marginRight={12}
            x={{ type: 'time', label: false }}
            y={{ label: '£ billion', grid: true, domain: [0, fig1YMax] }}
          >
            <Line
              data={fig1ImportsEuData}
              x="date"
              y="value"
              stroke="#206095"
              strokeWidth={2}
              curve="linear"
            />
            <Line
              data={fig1ImportsNonEuData}
              x="date"
              y="value"
              stroke="#F66068"
              strokeWidth={2}
              curve="linear"
            />
          </Plot>
        </div>
      </div>
    </section>

    <!-- ── Figure 2 ─────────────────────────────────────────────────────── -->
    <section class="chart-section">
      <h2>Figure 2: Imports and exports of goods, EU and non-EU</h2>
      <p class="chart-subtitle">
        Imports and exports of goods, current prices, EU and non-EU, latest 3 years
      </p>
      <div class="legend">
        <span class="legend-item" style="--c:#206095">Exports</span>
        <span class="legend-item" style="--c:#118C7B">Imports</span>
      </div>
      <div class="facet-row">
        <div class="facet-panel">
          <h3>EU</h3>
          <Plot
            height={260}
            marginLeft={50}
            marginRight={12}
            x={{ type: 'time', label: false }}
            y={{ label: '£ billion', grid: true, domain: [0, fig2YMax] }}
          >
            <Line
              data={fig2EuExportsData}
              x="date"
              y="value"
              stroke="#206095"
              strokeWidth={2}
              curve="linear"
            />
            <Line
              data={fig2EuImportsData}
              x="date"
              y="value"
              stroke="#118C7B"
              strokeWidth={2}
              curve="linear"
            />
          </Plot>
        </div>
        <div class="facet-panel">
          <h3>Non-EU</h3>
          <Plot
            height={260}
            marginLeft={50}
            marginRight={12}
            x={{ type: 'time', label: false }}
            y={{ label: '£ billion', grid: true, domain: [0, fig2YMax] }}
          >
            <Line
              data={fig2NonEuExportsData}
              x="date"
              y="value"
              stroke="#206095"
              strokeWidth={2}
              curve="linear"
            />
            <Line
              data={fig2NonEuImportsData}
              x="date"
              y="value"
              stroke="#118C7B"
              strokeWidth={2}
              curve="linear"
            />
          </Plot>
        </div>
      </div>
    </section>

    <!-- ── Figure 5 ─────────────────────────────────────────────────────── -->
    <section class="chart-section">
      <h2>Figure 5: Imports and exports of services</h2>
      <p class="chart-subtitle">
        Imports and exports of services, current prices and chained volume measures,
        seasonally adjusted, latest 3 years
      </p>
      <div class="legend">
        <span class="legend-item" style="--c:#206095">Exports CP</span>
        <span class="legend-item" style="--c:#27A0CC">Exports CVM</span>
        <span class="legend-item" style="--c:#118C7B">Imports CP</span>
        <span class="legend-item" style="--c:#F66068">Imports CVM</span>
      </div>
      <Plot
        height={300}
        marginLeft={55}
        marginRight={12}
        x={{ type: 'time', label: false }}
        y={{ label: '£ billion', grid: true, domain: [0, fig5YMax] }}
      >
        <Line
          data={fig5ExportsCpData}
          x="date"
          y="value"
          stroke="#206095"
          strokeWidth={2}
          curve="linear"
        />
        <Line
          data={fig5ExportsCvmData}
          x="date"
          y="value"
          stroke="#27A0CC"
          strokeWidth={2}
          curve="linear"
        />
        <Line
          data={fig5ImportsCpData}
          x="date"
          y="value"
          stroke="#118C7B"
          strokeWidth={2}
          curve="linear"
        />
        <Line
          data={fig5ImportsCvmData}
          x="date"
          y="value"
          stroke="#F66068"
          strokeWidth={2}
          curve="linear"
        />
      </Plot>
    </section>

  {/if}
</main>

<style>
  main {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  header {
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 2.5rem;
    padding-bottom: 1rem;
  }

  h1 {
    margin: 0 0 0.4rem;
    font-size: 1.6rem;
    color: #1e293b;
  }

  .subtitle {
    color: #64748b;
    font-size: 0.9rem;
    margin: 0;
  }

  .subtitle a {
    color: #206095;
  }

  .chart-section {
    margin-bottom: 3.5rem;
  }

  h2 {
    font-size: 1.05rem;
    margin: 0 0 0.25rem;
    color: #1e293b;
    border-left: 4px solid #206095;
    padding-left: 0.75rem;
  }

  .chart-subtitle {
    color: #64748b;
    font-size: 0.8rem;
    margin: 0.2rem 0 0.75rem 1.25rem;
  }

  h3 {
    font-size: 0.875rem;
    color: #475569;
    margin: 0 0 0.25rem;
    font-weight: 600;
    text-align: center;
  }

  .legend {
    display: flex;
    gap: 1.25rem;
    margin: 0 0 0.5rem 1.25rem;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: #475569;
  }

  .legend-item::before {
    content: '';
    display: inline-block;
    width: 24px;
    height: 3px;
    background: var(--c);
    border-radius: 2px;
  }

  .facet-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .facet-panel {
    min-width: 0;
  }

  .figure1-stack {
    grid-template-columns: 1fr;
  }

  .loading {
    color: #94a3b8;
    font-style: italic;
  }

  .error {
    color: #dc2626;
  }

  @media (max-width: 680px) {
    .facet-row {
      grid-template-columns: 1fr;
    }
  }
</style>
