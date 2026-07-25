<script>
  import { link } from "svelte-spa-router";
  let { title, current } = $props();
</script>

<div class="pagehead">
  <span class="brand">Practice <em>Player</em></span>
  <h1>{title}</h1>
  <nav class="pagenav">
    <a href="/" use:link class:active={current === "player"}>Player</a>
    <a href="/library" use:link class:active={current === "library"}>My Library</a>
    <a href="/marketplace" use:link class:active={current === "marketplace"}>Marketplace</a>
  </nav>
</div>
