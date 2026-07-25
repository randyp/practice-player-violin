<script>
  import { link } from "svelte-spa-router";
  import { loadCatalog } from "../lib/songs.js";
  import { loadPrefs, removeFromLibrary } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let library = $state(loadPrefs().library);
  let loadError = $state(null);

  const libSongs = $derived(catalog.filter((s) => library.includes(s.id)));
  const groups = $derived.by(() => {
    const groups = [];
    const byName = new Map();
    libSongs.forEach((s) => {
      let g = byName.get(s.group);
      if (!g) { g = { group: s.group, items: [] }; byName.set(s.group, g); groups.push(g); }
      g.items.push(s);
    });
    return groups;
  });

  function handleRemove(songId) {
    removeFromLibrary(songId);
    library = loadPrefs().library;
  }

  loadCatalog()
    .then((entries) => { catalog = entries; })
    .catch((e) => { loadError = e.message; });
</script>

<div class="wrap page">
  <PageHeader current="library" />

  <h1>My Library</h1>

  {#if loadError}
    <p class="err">Failed to load the song catalog: {loadError}</p>
  {:else if !libSongs.length}
    <div class="empty-library">
      <p>Your library is empty.</p>
      <p><a href="/marketplace" use:link>Browse the marketplace</a> to add some songs.</p>
    </div>
  {:else}
    {#each groups as { group, items }}
      <section class="grp">
        <h2>{group}</h2>
        <ul class="songlist">
          {#each items as s}
            <li>
              <span class="title">{s.title}{s.source ? ` · ${s.source}` : (s.sub ? ` · ${s.sub}` : "")}</span>
              <button class="remove" onclick={() => handleRemove(s.id)}>Remove</button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
