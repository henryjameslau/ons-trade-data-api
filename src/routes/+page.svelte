<script>
  import { onMount } from 'svelte';
  
  let status = 'Loading...';
  let examples = [
    '/api/meta/commodities',
    '/api/meta/countries',
    '/api/trade-by-commodity/28',
    '/api/trade-by-country/us',
    '/api/top-exports/all-time'
  ];
  
  onMount(async () => {
    try {
      const res = await fetch('/api/meta/schema');
      const data = await res.json();
      status = `API Status: OK. Last updated: ${data.last_updated}`;
    } catch (e) {
      status = `API Status: Error - ${e.message}`;
    }
  });
</script>

<div style="padding: 2rem;">
  <h1>ONS Trade Data API</h1>
  <p>{status}</p>
  
  <h2>Example Endpoints</h2>
  <ul>
    {#each examples as example}
      <li><a href={example}>{example}</a></li>
    {/each}
  </ul>
  
  <h2>Documentation</h2>
  <p>See <code>/docs/API.md</code> for full API documentation.</p>
</div>

<style>
  :global(body) {
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
