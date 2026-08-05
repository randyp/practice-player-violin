<script>
  import { loadCatalog } from "../lib/songs.js";
  import { loadPrefs, addToLibrary, isInLibrary } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let prefs = $state(loadPrefs());
  let loadError = $state(null);

  const groups = $derived.by(() => {
    const groups = [];
    const byName = new Map();
    catalog.forEach((s) => {
      let g = byName.get(s.source);
      if (!g) { g = { group: s.source, items: [] }; byName.set(s.source, g); groups.push(g); }
      g.items.push(s);
    });
    return groups;
  });

  function handleAdd(songId) {
    addToLibrary(songId);
    prefs = loadPrefs();
  }

  loadCatalog()
    .then((entries) => { catalog = entries; })
    .catch((e) => { loadError = e.message; });
</script>

<div class="wrap page">
  <PageHeader current="marketplace" />

  <h1>Marketplace</h1>

  {#if loadError}
    <p class="err">Failed to load the song catalog: {loadError}</p>
  {:else}
    {#each groups as { group, items }}
      <details class="grp">
        <summary><h2>{group}</h2></summary>
        <ul class="songlist">
          {#each items as s}
            <li>
              <span class="title">{s.title}{s.sub ? ` · ${s.sub}` : ""}</span>
              {#if isInLibrary(prefs, s.id)}
                <span class="added">In your library</span>
              {:else}
                <button class="add" onclick={() => handleAdd(s.id)}>Add to library</button>
              {/if}
            </li>
          {/each}
        </ul>
      </details>
    {/each}
  {/if}
</div>
