<script>
  import { link } from "svelte-spa-router";
  import { loadCatalog } from "../lib/songs.js";
  import { loadPrefs, removeFromLibrary, createFolder, renameFolder, deleteFolder } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let prefs = $state(loadPrefs());
  let loadError = $state(null);
  let newFolderName = $state("");
  let renamingId = $state(null); // folder id currently showing a rename input, or null

  const byId = $derived(new Map(catalog.map((s) => [s.id, s])));
  // Each folder's songs resolved from the catalog, in songIds order —
  // folders with no matching catalog entries (shouldn't happen, but a
  // song could be dropped from the catalog) simply render an empty list.
  const folderSongs = $derived(prefs.folders.map((f) => ({
    ...f,
    songs: f.songIds.map((id) => byId.get(id)).filter(Boolean),
  })));
  const isEmpty = $derived(prefs.folders.every((f) => f.songIds.length === 0));

  function refresh() {
    prefs = loadPrefs();
  }

  function handleRemove(songId) {
    removeFromLibrary(songId);
    refresh();
  }

  function handleCreateFolder(e) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    createFolder(name);
    newFolderName = "";
    refresh();
  }

  function startRename(folderId) {
    renamingId = folderId;
  }

  function commitRename(folderId, e) {
    const name = e.target.value.trim();
    if (name) renameFolder(folderId, name);
    renamingId = null;
    refresh();
  }

  function handleDeleteFolder(folderId) {
    deleteFolder(folderId);
    refresh();
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
  {:else if isEmpty}
    <div class="empty-library">
      <p>Your library is empty.</p>
      <p><a href="/marketplace" use:link>Browse the marketplace</a> to add some songs.</p>
    </div>
  {:else}
    <form class="new-folder" onsubmit={handleCreateFolder}>
      <input type="text" placeholder="New folder name" bind:value={newFolderName} aria-label="New folder name" />
      <button type="submit">+ New folder</button>
    </form>

    {#each folderSongs as f (f.id ?? "unfiled")}
      {#if f.id === null}
        {#if f.songs.length}
          <ul class="songlist unfiled">
            {#each f.songs as s (s.id)}
              <li>
                <span class="title">{s.title}{s.source ? ` · ${s.source}` : ""}{s.sub ? ` · ${s.sub}` : ""}</span>
                <button class="remove" onclick={() => handleRemove(s.id)}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <section class="folder">
          <div class="folder-hdr">
            <span class="dh">≡</span>
            {#if renamingId === f.id}
              <input
                type="text"
                class="rename-input"
                value={f.name}
                onblur={(e) => commitRename(f.id, e)}
                onkeydown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") renamingId = null; }}
              />
            {:else}
              <button class="folder-name" onclick={() => startRename(f.id)}>{f.name}</button>
            {/if}
            <span class="folder-count">{f.songs.length}</span>
            <button class="folder-delete" onclick={() => handleDeleteFolder(f.id)} aria-label={`Delete folder ${f.name}`}>Delete</button>
          </div>
          <ul class="songlist">
            {#each f.songs as s (s.id)}
              <li>
                <span class="title">{s.title}{s.source ? ` · ${s.source}` : ""}{s.sub ? ` · ${s.sub}` : ""}</span>
                <button class="remove" onclick={() => handleRemove(s.id)}>Remove</button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
  {/if}
</div>
