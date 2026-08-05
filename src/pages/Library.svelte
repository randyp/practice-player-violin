<script>
  import { link } from "svelte-spa-router";
  import { loadCatalog } from "../lib/songs.js";
  import { loadPrefs, removeFromLibrary, createFolder, renameFolder, deleteFolder, moveSong, reorderFolders } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let prefs = $state(loadPrefs());
  let loadError = $state(null);
  let newFolderName = $state("");
  let renamingId = $state(null); // folder id currently showing a rename input, or null

  // Drag payload is one of two shapes, distinguished by `type`, so a single
  // dragover/drop handler pair can serve both songs and folders. Cleared on
  // dragend so a cancelled drag (e.g. Escape) leaves no stale drag state.
  let dragging = $state(null); // { type: "song", songId } | { type: "folder", fromIndex } | null

  function onSongDragStart(songId) {
    dragging = { type: "song", songId };
  }

  function onFolderDragStart(fromIndex) {
    dragging = { type: "folder", fromIndex };
  }

  function onDragEnd() {
    dragging = null;
  }

  // Dropping a song onto another song's row: move it to that row's folder,
  // at that row's index.
  function onSongDrop(e, targetFolderId, targetIndex) {
    e.preventDefault();
    if (!dragging || dragging.type !== "song") return;
    moveSong(dragging.songId, targetFolderId, targetIndex);
    refresh();
    dragging = null;
  }

  // A folder header is a drop target for two different drag types: a song
  // (append to the end of that folder) or another folder's drag handle
  // (reorder folders — targetIndex is the position within prefs.folders;
  // Unfiled is index 0 and is never a target since folder rows only render
  // for index > 0). Dropping on the handle still bubbles dragover/drop up
  // to this same header, so one handler covers both without a separate
  // listener on the handle itself.
  function onFolderHeaderDrop(e, targetFolderId, targetSongCount, targetIndex) {
    e.preventDefault();
    if (!dragging) return;
    if (dragging.type === "song") {
      moveSong(dragging.songId, targetFolderId, targetSongCount);
    } else {
      reorderFolders(dragging.fromIndex, targetIndex);
    }
    refresh();
    dragging = null;
  }

  function allowDrop(e) {
    e.preventDefault();
  }

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
    if (renamingId === folderId) renamingId = null;
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

    {#each folderSongs as f, folderIndex (f.id ?? "unfiled")}
      {#if f.id === null}
        {#if f.songs.length}
          <ul class="songlist unfiled">
            {#each f.songs as s, i (s.id)}
              <li
                draggable="true"
                class:dragging={dragging?.type === "song" && dragging.songId === s.id}
                ondragstart={() => onSongDragStart(s.id)}
                ondragend={onDragEnd}
                ondragover={allowDrop}
                ondrop={(e) => onSongDrop(e, f.id, i)}
              >
                <span class="title">{s.title}{s.source ? ` · ${s.source}` : ""}{s.sub ? ` · ${s.sub}` : ""}</span>
                <button class="remove" onclick={() => handleRemove(s.id)}>Remove</button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <section class="folder">
          <div
            class="folder-hdr"
            class:dragging={dragging?.type === "folder" && dragging.fromIndex === folderIndex}
            ondragover={allowDrop}
            ondrop={(e) => onFolderHeaderDrop(e, f.id, f.songs.length, folderIndex)}
          >
            <span class="dh" draggable="true" ondragstart={() => onFolderDragStart(folderIndex)} ondragend={onDragEnd}>≡</span>
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
            {#each f.songs as s, i (s.id)}
              <li
                draggable="true"
                class:dragging={dragging?.type === "song" && dragging.songId === s.id}
                ondragstart={() => onSongDragStart(s.id)}
                ondragend={onDragEnd}
                ondragover={allowDrop}
                ondrop={(e) => onSongDrop(e, f.id, i)}
              >
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
