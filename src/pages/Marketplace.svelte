<script>
  import { loadCatalog } from "../lib/songs.js";
  import { loadPrefs, addToLibrary } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let library = $state(loadPrefs().library);
  let loadError = $state(null);

  const groups = $derived.by(() => {
    const groups = [];
    const byName = new Map();
    catalog.forEach((s) => {
      let g = byName.get(s.group);
      if (!g) { g = { group: s.group, items: [] }; byName.set(s.group, g); groups.push(g); }
      g.items.push(s);
    });
    return groups;
  });

  function handleAdd(songId) {
    addToLibrary(songId);
    library = loadPrefs().library;
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
      <section class="grp">
        <h2>{group}</h2>
        <ul class="songlist">
          {#each items as s}
            <li>
              <span class="title">{s.title}{s.source ? ` · ${s.source}` : (s.sub ? ` · ${s.sub}` : "")}</span>
              {#if library.includes(s.id)}
                <span class="added">In your library</span>
              {:else}
                <button class="add" onclick={() => handleAdd(s.id)}>Add to library</button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
