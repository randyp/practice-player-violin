# My Library Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users organize their added songs into custom, one-level-deep, reorderable folders in My Library, with the Player page's Song dropdown mirroring that same folder structure.

**Architecture:** Replace `prefs.js`'s flat `library: string[]` with a single `folders` array, where `folders[0]` is always the implicit `{id: null, name: null}` "Unfiled" bucket — library membership and organization become one structure instead of two that can drift apart. `Library.svelte` renders folders with native HTML5 drag-and-drop for reordering; `Player.svelte` and `Marketplace.svelte` are updated to read the new shape.

**Tech Stack:** Svelte 5 (runes: `$state`, `$derived`), Vite, Vitest (Node environment, no jsdom), plain `localStorage`, native HTML5 Drag and Drop API (no new dependency).

## Global Constraints

- No backwards compatibility or migration from the old `library: string[]` shape — explicitly OK'd, existing saved prefs are simply superseded (spec: "Not backwards compatible").
- One level of folder nesting only, enforced structurally: a folder's `songIds` holds only song ids, never folder ids (spec: "Out of scope").
- `folders[0]` is always `{ id: null, name: null, songIds: [...] }`, always present, always first, never deleted even when empty (spec: "Data model").
- A song id appears in at most one folder's `songIds` at a time (spec: "Data model").
- No new npm dependency for drag-and-drop — native HTML5 DnD only (spec: "Design decisions").
- Follow the existing code style: no comments explaining *what*, only non-obvious *why*; 2-space indent; `function` declarations in `prefs.js` (not arrow consts), matching every existing export there.

---

## File Structure

- **Modify `src/lib/prefs.js`** — replace `library` with `folders` in `DEFAULTS`; replace `addToLibrary`/`removeFromLibrary` bodies; add `isInLibrary`, `createFolder`, `renameFolder`, `deleteFolder`, `moveSong`, `reorderFolders`.
- **Create `src/lib/prefs.test.mjs`** — Vitest unit tests for every new/changed `prefs.js` function (pure logic, no DOM needed — mirrors the existing `scripts/songs.test.mjs` pattern of colocated `*.test.mjs` files run by plain `vitest run`).
- **Modify `src/pages/Library.svelte`** — render `folders` (Unfiled unlabeled, named folders with header/rename/delete), "+ New folder" input, native HTML5 drag-and-drop for song moves/reorders and folder reordering.
- **Modify `src/pages/Player.svelte`** — `songGroups` derives from `prefs.folders` instead of grouping `libSongs` by `s.group`/`s.source`.
- **Modify `src/pages/Marketplace.svelte`** — swap `library.includes(s.id)` for `isInLibrary(prefs, s.id)`.
- **Modify `src/app.css`** — new styles for folder headers, drag handles, rename input, "+ New folder" form, drag-over states.

---

## Task 1: `prefs.js` data model — `folders` replaces `library`

**Files:**
- Modify: `src/lib/prefs.js` (all of it — full current content below for reference)
- Test: `src/lib/prefs.test.mjs` (new)

**Current full content of `src/lib/prefs.js`:**

```js
const STORAGE_KEY = "practice-player-violin:prefs";

// Global, session-independent user preferences. Versioned so a future
// shape change can migrate old localStorage values instead of discarding them.
const DEFAULT_COUNT_IN = 1; // measures of count-in when a song has no saved override

const DEFAULTS = {
  version: 1,
  lastSongId: null, // last-selected song's catalog id, or null (use the default first song)
  songKeys: {}, // per-song last-used key, keyed by catalog id (e.g. { "hot-cross-buns": "A4" })
  songCountIns: {}, // per-song count-in measures (0, 1, or 2), keyed by catalog id — a song
                     // preference, not global, since a fast tune and a slow scale exercise
                     // don't want the same lead-in
  library: [], // catalog ids the user has added from the marketplace — what the Player's
               // Song dropdown lists, as opposed to the full marketplace catalog
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) { /* storage unavailable (private mode, quota) — prefs just won't persist */ }
}

// Merge a partial update into the stored prefs. Always re-reads storage so a
// long-lived page doesn't clobber prefs written since it last loaded them.
export function updatePrefs(patch) {
  savePrefs({ ...loadPrefs(), ...patch });
}

export function saveSongKey(songId, key) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, songKeys: { ...prefs.songKeys, [songId]: key } });
}

export function countInFor(prefs, songId) {
  const saved = prefs.songCountIns[songId];
  return saved !== undefined ? saved : DEFAULT_COUNT_IN;
}

export function saveSongCountIn(songId, countInMeasures) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, songCountIns: { ...prefs.songCountIns, [songId]: countInMeasures } });
}

export function addToLibrary(songId) {
  const prefs = loadPrefs();
  if (prefs.library.includes(songId)) return;
  savePrefs({ ...prefs, library: [...prefs.library, songId] });
}

export function removeFromLibrary(songId) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, library: prefs.library.filter((id) => id !== songId) });
}
```

**Interfaces:**
- Consumes: nothing new — this is the base layer.
- Produces (used by Tasks 2, 3, 4, 5):
  - `DEFAULTS.folders = [{ id: null, name: null, songIds: [] }]`
  - `addToLibrary(songId: string): void`
  - `removeFromLibrary(songId: string): void`
  - `isInLibrary(prefs: object, songId: string): boolean`
  - `createFolder(name: string): void`
  - `renameFolder(folderId: string, name: string): void`
  - `deleteFolder(folderId: string): void`
  - `moveSong(songId: string, toFolderId: string | null, toIndex: number): void`
  - `reorderFolders(fromIndex: number, toIndex: number): void`
  - All follow the existing pattern: read via `loadPrefs()`, write via `savePrefs({ ...prefs, folders: newFolders })`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/prefs.test.mjs`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPrefs, addToLibrary, removeFromLibrary, isInLibrary,
  createFolder, renameFolder, deleteFolder, moveSong, reorderFolders,
} from "./prefs.js";

// prefs.js reads/writes localStorage directly (no injectable storage), so
// each test clears it first — mirrors how the browser starts fresh per user.
beforeEach(() => { localStorage.clear(); });

describe("folders default shape", () => {
  it("starts with only the Unfiled bucket", () => {
    const prefs = loadPrefs();
    expect(prefs.folders).toEqual([{ id: null, name: null, songIds: [] }]);
  });
});

describe("addToLibrary", () => {
  it("appends the song to the Unfiled bucket", () => {
    addToLibrary("hot-cross-buns");
    const prefs = loadPrefs();
    expect(prefs.folders[0].songIds).toEqual(["hot-cross-buns"]);
  });

  it("is a no-op if the song is already in the library", () => {
    addToLibrary("hot-cross-buns");
    addToLibrary("hot-cross-buns");
    const prefs = loadPrefs();
    expect(prefs.folders[0].songIds).toEqual(["hot-cross-buns"]);
  });

  it("is a no-op if the song is already filed in a named folder", () => {
    addToLibrary("hot-cross-buns");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("hot-cross-buns", folderId, 0);
    addToLibrary("hot-cross-buns");
    const prefs = loadPrefs();
    expect(prefs.folders[0].songIds).toEqual([]);
    expect(prefs.folders[1].songIds).toEqual(["hot-cross-buns"]);
  });
});

describe("isInLibrary", () => {
  it("is true for a song in Unfiled", () => {
    addToLibrary("hot-cross-buns");
    expect(isInLibrary(loadPrefs(), "hot-cross-buns")).toBe(true);
  });

  it("is true for a song filed in a named folder", () => {
    addToLibrary("hot-cross-buns");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("hot-cross-buns", folderId, 0);
    expect(isInLibrary(loadPrefs(), "hot-cross-buns")).toBe(true);
  });

  it("is false for a song never added", () => {
    expect(isInLibrary(loadPrefs(), "hot-cross-buns")).toBe(false);
  });
});

describe("removeFromLibrary", () => {
  it("removes a song from Unfiled", () => {
    addToLibrary("hot-cross-buns");
    removeFromLibrary("hot-cross-buns");
    expect(loadPrefs().folders[0].songIds).toEqual([]);
  });

  it("removes a song from a named folder and drops the folder if now empty", () => {
    addToLibrary("hot-cross-buns");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("hot-cross-buns", folderId, 0);
    removeFromLibrary("hot-cross-buns");
    const prefs = loadPrefs();
    expect(prefs.folders).toEqual([{ id: null, name: null, songIds: [] }]);
  });

  it("keeps a named folder that still has other songs", () => {
    addToLibrary("hot-cross-buns");
    addToLibrary("jingle-bells");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("hot-cross-buns", folderId, 0);
    moveSong("jingle-bells", folderId, 1);
    removeFromLibrary("hot-cross-buns");
    const prefs = loadPrefs();
    expect(prefs.folders[1].songIds).toEqual(["jingle-bells"]);
  });

  it("never drops the Unfiled bucket even when empty", () => {
    addToLibrary("hot-cross-buns");
    removeFromLibrary("hot-cross-buns");
    expect(loadPrefs().folders[0]).toEqual({ id: null, name: null, songIds: [] });
  });
});

describe("createFolder", () => {
  it("appends a new named folder with a generated id and empty songIds", () => {
    createFolder("Warmups");
    const prefs = loadPrefs();
    expect(prefs.folders).toHaveLength(2);
    expect(prefs.folders[1].name).toBe("Warmups");
    expect(prefs.folders[1].songIds).toEqual([]);
    expect(typeof prefs.folders[1].id).toBe("string");
    expect(prefs.folders[1].id).not.toBeNull();
  });

  it("gives each folder a distinct id", () => {
    createFolder("Warmups");
    createFolder("Tunes");
    const prefs = loadPrefs();
    expect(prefs.folders[1].id).not.toBe(prefs.folders[2].id);
  });
});

describe("renameFolder", () => {
  it("updates the folder's name", () => {
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    renameFolder(folderId, "Bow Warmups");
    expect(loadPrefs().folders[1].name).toBe("Bow Warmups");
  });
});

describe("deleteFolder", () => {
  it("moves the folder's songs to the end of Unfiled and removes the folder", () => {
    addToLibrary("hot-cross-buns");
    addToLibrary("jingle-bells");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("jingle-bells", folderId, 0);
    deleteFolder(folderId);
    const prefs = loadPrefs();
    expect(prefs.folders).toEqual([
      { id: null, name: null, songIds: ["hot-cross-buns", "jingle-bells"] },
    ]);
  });

  it("deleting an empty folder just removes it", () => {
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    deleteFolder(folderId);
    expect(loadPrefs().folders).toEqual([{ id: null, name: null, songIds: [] }]);
  });
});

describe("moveSong", () => {
  it("moves a song from Unfiled into a named folder", () => {
    addToLibrary("hot-cross-buns");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("hot-cross-buns", folderId, 0);
    const prefs = loadPrefs();
    expect(prefs.folders[0].songIds).toEqual([]);
    expect(prefs.folders[1].songIds).toEqual(["hot-cross-buns"]);
  });

  it("moves a song back to Unfiled (toFolderId: null)", () => {
    addToLibrary("hot-cross-buns");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("hot-cross-buns", folderId, 0);
    moveSong("hot-cross-buns", null, 0);
    const prefs = loadPrefs();
    expect(prefs.folders[0].songIds).toEqual(["hot-cross-buns"]);
    expect(prefs.folders[1].songIds).toEqual([]);
  });

  it("reorders a song within its current folder", () => {
    addToLibrary("hot-cross-buns");
    addToLibrary("jingle-bells");
    moveSong("jingle-bells", null, 0);
    const prefs = loadPrefs();
    expect(prefs.folders[0].songIds).toEqual(["jingle-bells", "hot-cross-buns"]);
  });

  it("inserts at the target index within a different folder", () => {
    addToLibrary("hot-cross-buns");
    addToLibrary("jingle-bells");
    addToLibrary("old-macdonald");
    createFolder("Warmups");
    const folderId = loadPrefs().folders[1].id;
    moveSong("jingle-bells", folderId, 0);
    moveSong("old-macdonald", folderId, 0);
    const prefs = loadPrefs();
    expect(prefs.folders[1].songIds).toEqual(["old-macdonald", "jingle-bells"]);
  });
});

describe("reorderFolders", () => {
  it("moves a named folder to a new position, excluding index 0 (Unfiled)", () => {
    createFolder("Warmups");
    createFolder("Tunes");
    createFolder("Scales");
    reorderFolders(1, 3);
    const prefs = loadPrefs();
    expect(prefs.folders.map((f) => f.name)).toEqual([null, "Tunes", "Scales", "Warmups"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/prefs.test.mjs`
Expected: FAIL — `addToLibrary`, `isInLibrary`, `createFolder`, `renameFolder`, `deleteFolder`, `moveSong`, `reorderFolders` are not exported yet (or `prefs.library` shape mismatches).

- [ ] **Step 3: Replace `src/lib/prefs.js` with the new implementation**

```js
const STORAGE_KEY = "practice-player-violin:prefs";

// Global, session-independent user preferences. Versioned so a future
// shape change can migrate old localStorage values instead of discarding them.
const DEFAULT_COUNT_IN = 1; // measures of count-in when a song has no saved override

const DEFAULTS = {
  version: 1,
  lastSongId: null, // last-selected song's catalog id, or null (use the default first song)
  songKeys: {}, // per-song last-used key, keyed by catalog id (e.g. { "hot-cross-buns": "A4" })
  songCountIns: {}, // per-song count-in measures (0, 1, or 2), keyed by catalog id — a song
                     // preference, not global, since a fast tune and a slow scale exercise
                     // don't want the same lead-in
  // Library membership *and* organization in one structure — a song's
  // presence in some folder's songIds *is* library membership, so there's
  // no separate list that can drift out of sync with it. folders[0] is
  // always the implicit, unnamed "Unfiled" bucket: always present, always
  // first, never deleted even when empty, so a newly-added song always has
  // somewhere to land. Every other entry is a user-named folder. A song id
  // appears in at most one folder's songIds at a time.
  folders: [{ id: null, name: null, songIds: [] }],
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) { /* storage unavailable (private mode, quota) — prefs just won't persist */ }
}

// Merge a partial update into the stored prefs. Always re-reads storage so a
// long-lived page doesn't clobber prefs written since it last loaded them.
export function updatePrefs(patch) {
  savePrefs({ ...loadPrefs(), ...patch });
}

export function saveSongKey(songId, key) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, songKeys: { ...prefs.songKeys, [songId]: key } });
}

export function countInFor(prefs, songId) {
  const saved = prefs.songCountIns[songId];
  return saved !== undefined ? saved : DEFAULT_COUNT_IN;
}

export function saveSongCountIn(songId, countInMeasures) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, songCountIns: { ...prefs.songCountIns, [songId]: countInMeasures } });
}

export function isInLibrary(prefs, songId) {
  return prefs.folders.some((f) => f.songIds.includes(songId));
}

export function addToLibrary(songId) {
  const prefs = loadPrefs();
  if (isInLibrary(prefs, songId)) return;
  const folders = prefs.folders.map((f, i) => (i === 0 ? { ...f, songIds: [...f.songIds, songId] } : f));
  savePrefs({ ...prefs, folders });
}

export function removeFromLibrary(songId) {
  const prefs = loadPrefs();
  const folders = prefs.folders
    .map((f) => ({ ...f, songIds: f.songIds.filter((id) => id !== songId) }))
    .filter((f) => f.id === null || f.songIds.length > 0);
  savePrefs({ ...prefs, folders });
}

export function createFolder(name) {
  const prefs = loadPrefs();
  const folder = { id: crypto.randomUUID(), name, songIds: [] };
  savePrefs({ ...prefs, folders: [...prefs.folders, folder] });
}

export function renameFolder(folderId, name) {
  const prefs = loadPrefs();
  const folders = prefs.folders.map((f) => (f.id === folderId ? { ...f, name } : f));
  savePrefs({ ...prefs, folders });
}

export function deleteFolder(folderId) {
  const prefs = loadPrefs();
  const target = prefs.folders.find((f) => f.id === folderId);
  if (!target) return;
  const folders = prefs.folders
    .filter((f) => f.id !== folderId)
    .map((f) => (f.id === null ? { ...f, songIds: [...f.songIds, ...target.songIds] } : f));
  savePrefs({ ...prefs, folders });
}

// Handles both moving a song to a different folder and reordering it within
// its current one: removing first, then inserting means toIndex is always
// resolved against the post-removal array, which is correct for both cases.
export function moveSong(songId, toFolderId, toIndex) {
  const prefs = loadPrefs();
  const withoutSong = prefs.folders.map((f) => ({ ...f, songIds: f.songIds.filter((id) => id !== songId) }));
  const folders = withoutSong.map((f) => {
    if (f.id !== toFolderId) return f;
    const songIds = [...f.songIds];
    songIds.splice(toIndex, 0, songId);
    return { ...f, songIds };
  });
  savePrefs({ ...prefs, folders });
}

// Unfiled (index 0) is excluded from reordering — it's always first.
export function reorderFolders(fromIndex, toIndex) {
  const prefs = loadPrefs();
  const folders = [...prefs.folders];
  const [moved] = folders.splice(fromIndex, 1);
  folders.splice(toIndex, 0, moved);
  savePrefs({ ...prefs, folders });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/prefs.test.mjs`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefs.js src/lib/prefs.test.mjs
git commit -m "$(cat <<'EOF'
Replace prefs.js's library list with a single folders structure

Library membership and organization are now one structure instead of
two that can drift apart: a song's presence in some folder's songIds
is library membership. folders[0] is always the implicit Unfiled
bucket. Not backwards compatible — old library prefs are superseded.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Marketplace — swap to `isInLibrary`

**Files:**
- Modify: `src/pages/Marketplace.svelte:3,7,23,46`

**Interfaces:**
- Consumes: `isInLibrary(prefs, songId)` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Update the import and state**

In `src/pages/Marketplace.svelte`, change:

```js
  import { loadPrefs, addToLibrary } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let library = $state(loadPrefs().library);
  let loadError = $state(null);
```

to:

```js
  import { loadPrefs, addToLibrary, isInLibrary } from "../lib/prefs.js";
  import PageHeader from "./PageHeader.svelte";

  let catalog = $state([]);
  let prefs = $state(loadPrefs());
  let loadError = $state(null);
```

- [ ] **Step 2: Update `handleAdd`**

Change:

```js
  function handleAdd(songId) {
    addToLibrary(songId);
    library = loadPrefs().library;
  }
```

to:

```js
  function handleAdd(songId) {
    addToLibrary(songId);
    prefs = loadPrefs();
  }
```

- [ ] **Step 3: Update the template's membership check**

Change:

```svelte
              {#if library.includes(s.id)}
```

to:

```svelte
              {#if isInLibrary(prefs, s.id)}
```

- [ ] **Step 4: Manually verify no other `library` reference remains**

Run: `grep -n "library" src/pages/Marketplace.svelte`
Expected: no matches (all references are now `prefs`/`isInLibrary`).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (this file has no dedicated test; confirms no other suite broke).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Marketplace.svelte
git commit -m "$(cat <<'EOF'
Marketplace: use isInLibrary instead of the removed library array

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Player — `songGroups` derives from `prefs.folders`

**Files:**
- Modify: `src/pages/Player.svelte:9,18,37-47,166-176,253-254,276,278`

**Interfaces:**
- Consumes: `prefs.folders` shape from Task 1 (`[{id, name, songIds}]`).
- Produces: `libSongs` (flat array, folder order then songIds order, each entry `{...songCatalogEntry, i}`) and `songGroups` (`[{group: string|null, items: [...]}]`) — same shape Task 3's template already expects (`group`/`items`), so the `<select>` markup in `Player.svelte`'s template does not need to change.

- [ ] **Step 1: Update the prefs import and initial state**

In `src/pages/Player.svelte`, change:

```js
  import { loadPrefs, updatePrefs, saveSongKey, countInFor, saveSongCountIn } from "../lib/prefs.js";
```

(no change to this import line itself — `loadPrefs` etc. are unchanged), but change:

```js
  const prefs = loadPrefs();

  let scoreHost = $state(), highlightEl = $state();

  let catalog = $state([]);
  let library = $state(prefs.library);
```

to:

```js
  const initialPrefs = loadPrefs();

  let scoreHost = $state(), highlightEl = $state();

  let catalog = $state([]);
  let folders = $state(initialPrefs.folders);
```

(Renamed the outer `prefs` const to `initialPrefs` because `prefs.lastSongId` is read later at line 278 via the same binding — this rename keeps that read intact while freeing `folders` to be the reactive piece that changes.)

- [ ] **Step 2: Replace `libSongs`/`songGroups` derivation**

Change:

```js
  // Only songs the user has added to their library — the full marketplace
  // catalog is browsed/added from the Marketplace page instead.
  const libSongs = $derived(catalog.filter((s) => library.includes(s.id)));
  const songGroups = $derived.by(() => {
    const groups = [];
    const byName = new Map();
    libSongs.forEach((s, i) => {
      let g = byName.get(s.group);
      if (!g) { g = { group: s.group, items: [] }; byName.set(s.group, g); groups.push(g); }
      g.items.push({ ...s, i });
    });
    return groups;
  });
```

to:

```js
  // The Song dropdown mirrors the user's own folder organization from My
  // Library (folders[0] is always the unnamed "Unfiled" bucket, rendered
  // as ungrouped options) rather than the catalog's built-in group/source.
  const songGroups = $derived.by(() => {
    const byId = new Map(catalog.map((s) => [s.id, s]));
    let i = 0;
    return folders
      .map((f) => ({
        group: f.name,
        items: f.songIds.map((id) => byId.get(id)).filter(Boolean).map((s) => ({ ...s, i: i++ })),
      }))
      .filter((g) => g.items.length > 0);
  });
  const libSongs = $derived(songGroups.flatMap((g) => g.items));
```

- [ ] **Step 3: Update `onMount`'s catalog-load handler**

Change (around what was line 273-281):

```js
    setStatus("loading songs…");
    loadCatalog()
      .then((entries) => {
        catalog = entries;
        library = loadPrefs().library; // re-read in case Library/Marketplace changed it this session
        if (!libSongs.length) { setStatus("ready"); return; }
        const lastIdx = libSongs.findIndex((s) => s.id === prefs.lastSongId);
        return selectSong(lastIdx !== -1 ? lastIdx : 0);
      })
      .catch((e) => setStatus("failed to load song catalog: " + e.message, true));
```

to:

```js
    setStatus("loading songs…");
    loadCatalog()
      .then((entries) => {
        catalog = entries;
        folders = loadPrefs().folders; // re-read in case Library/Marketplace changed it this session
        if (!libSongs.length) { setStatus("ready"); return; }
        const lastIdx = libSongs.findIndex((s) => s.id === initialPrefs.lastSongId);
        return selectSong(lastIdx !== -1 ? lastIdx : 0);
      })
      .catch((e) => setStatus("failed to load song catalog: " + e.message, true));
```

- [ ] **Step 4: Confirm no other stale references**

Run: `grep -n "\bprefs\b\|\blibrary\b" src/pages/Player.svelte`
Expected: every remaining `prefs` reference is `loadPrefs(` (function calls) or `freshPrefs`/`initialPrefs` (already-renamed locals) — no bare `prefs.` or `library` identifier left. (Lines 167-176's `freshPrefs` local inside `selectSong` is untouched — it's an unrelated, already-correctly-scoped variable.)

- [ ] **Step 5: Manual smoke test**

Run: `pnpm run dev --port 8291 &` then wait ~2s, `curl -s http://localhost:8291/practice-player-violin/ -o /dev/null -w "%{http_code}\n"` (expect `200`). Then use a Playwright script (see Task 5's smoke pattern) or open the URL in a browser to confirm:
- With no folders created yet (fresh localStorage), the Song dropdown shows all library songs as plain (ungrouped) options, matching today's behavior for Unfiled-only state.
- Selecting a song still loads and renders it.

Stop the dev server afterward: `pkill -f "vite.*8291"`.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Player.svelte
git commit -m "$(cat <<'EOF'
Player: Song dropdown mirrors the user's My Library folders

songGroups now derives from prefs.folders (in folder order, matching
My Library) instead of grouping by each song's built-in group/source.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Library — render folders, create/rename/delete (no drag yet)

**Files:**
- Modify: `src/pages/Library.svelte` (full rewrite of the current 61-line file)
- Modify: `src/app.css` (append new rules; do not remove/reorder existing ones)

**Interfaces:**
- Consumes: `loadPrefs`, `removeFromLibrary`, `createFolder`, `renameFolder`, `deleteFolder` from Task 1.
- Produces: the folder header structure (`.folder-hdr`, `.folder-name`, drag handle markup with class `.dh`) that Task 5's drag-and-drop styles/handlers attach to — so Task 5 does not restructure this markup, only adds `draggable`/event attributes to it.

**Current full content of `src/pages/Library.svelte`** (for reference — being replaced):

```svelte
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
              <span class="title">{s.title}{s.source ? ` · ${s.source}` : ""}{s.sub ? ` · ${s.sub}` : ""}</span>
              <button class="remove" onclick={() => handleRemove(s.id)}>Remove</button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
```

- [ ] **Step 1: Write the new `src/pages/Library.svelte` (folders, no drag-and-drop yet)**

```svelte
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
```

- [ ] **Step 2: Append new styles to `src/app.css`**

Append after the existing `.songlist .added { ... }` / `.add, .remove { ... }` block (i.e., right after the current line `.err { color: var(--rosin); }` at the end of that section):

```css
.new-folder { display: flex; gap: 8px; margin-bottom: 20px; }
.new-folder input {
  flex: 1; max-width: 260px; background: var(--ebony2); border: 1px solid var(--edge); color: var(--paper);
  border-radius: var(--r); font-family: inherit; font-size: 13px; padding: 9px 12px;
}
.new-folder input:focus { border-color: var(--string); outline: none; }
.new-folder button {
  background: transparent; border: 1px solid var(--edge); color: var(--muted); border-radius: var(--r);
  font-family: inherit; font-size: 12px; padding: 9px 14px; cursor: pointer; white-space: nowrap;
}
.new-folder button:hover { color: var(--string); border-color: var(--string); }

.folder { margin-bottom: 24px; }
.folder-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.folder-hdr .dh { color: var(--muted); cursor: grab; font-size: 14px; user-select: none; }
.folder-name {
  background: transparent; border: 0; color: var(--paper); font-family: inherit;
  font-size: 13px; font-weight: 600; padding: 2px 0; cursor: text; text-align: left;
}
.folder-name:hover { color: var(--string); }
.rename-input {
  background: var(--ebony2); border: 1px solid var(--string); color: var(--paper);
  border-radius: var(--r); font-family: inherit; font-size: 13px; padding: 3px 6px;
}
.folder-count { font-size: 11px; color: var(--muted); }
.folder-delete {
  margin-left: auto; background: transparent; border: 1px solid var(--edge); color: var(--muted);
  border-radius: var(--r); font-family: inherit; font-size: 11px; padding: 5px 10px; cursor: pointer;
}
.folder-delete:hover { color: var(--rosin); border-color: var(--rosin); }
.songlist.unfiled { margin-bottom: 24px; }
```

- [ ] **Step 3: Manual smoke test**

Run: `pnpm run dev --port 8291 &`, wait ~2s, verify with a Playwright script that:
- Adding songs from Marketplace, then visiting `#/library`, shows them unlabeled (Unfiled) at the top.
- Typing a name into "+ New folder" and submitting creates a folder section with that name and a song count of `0`.
- Clicking a folder name turns it into an editable text input; blurring after editing renames it.
- Clicking "Delete" on an empty folder removes its section.

Example script (adapt paths per the project's existing Playwright smoke-test convention — run via `NODE_PATH` pointing at the npx-cached `playwright` install, since it is not a project dependency):

```js
import pkg from "playwright"; const { chromium } = pkg;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const BASE = "http://localhost:8291/practice-player-violin/";

await page.goto(BASE + "#/marketplace");
await page.waitForSelector("details.grp");
await page.locator("details.grp summary").first().click();
await page.locator(".songlist li button.add").first().click();

await page.goto(BASE + "#/library");
await page.waitForSelector(".songlist li");
console.log("unfiled songs:", await page.locator(".songlist.unfiled li").count());

await page.fill(".new-folder input", "Warmups");
await page.click(".new-folder button[type=submit]");
await page.waitForSelector(".folder-hdr");
console.log("folder created:", await page.locator(".folder-name").textContent());

await page.click(".folder-name");
await page.fill(".rename-input", "Bow Warmups");
await page.locator(".rename-input").blur();
await page.waitForTimeout(150);
console.log("renamed to:", await page.locator(".folder-name").textContent());

await page.click(".folder-delete");
await page.waitForTimeout(150);
console.log("folders remaining:", await page.locator(".folder-hdr").count());

console.log("errors:", errors);
await browser.close();
```

Stop the dev server afterward: `pkill -f "vite.*8291"`.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Library.svelte src/app.css
git commit -m "$(cat <<'EOF'
Library: render, create, rename, and delete folders

No drag-and-drop yet — songs stay wherever addToLibrary/moveSong put
them. This lands the folder CRUD UI as an independently testable step
before drag-and-drop is layered on top.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Library — drag-and-drop for songs and folders

**Files:**
- Modify: `src/pages/Library.svelte` (add drag state + handlers + `draggable`/event attributes to Task 4's markup)
- Modify: `src/app.css` (append drag-over visual states)

**Interfaces:**
- Consumes: `moveSong(songId, toFolderId, toIndex)`, `reorderFolders(fromIndex, toIndex)` from Task 1; the `.folder-hdr`/`.dh`/`.songlist li` markup from Task 4.
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Add drag-and-drop imports and state to the `<script>` block**

In `src/pages/Library.svelte`, change the import line:

```js
  import { loadPrefs, removeFromLibrary, createFolder, renameFolder, deleteFolder } from "../lib/prefs.js";
```

to:

```js
  import { loadPrefs, removeFromLibrary, createFolder, renameFolder, deleteFolder, moveSong, reorderFolders } from "../lib/prefs.js";
```

Add after the existing `let renamingId = $state(null);` line:

```js
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

  // Dropping a song onto a folder's header (not a specific row): append to
  // the end of that folder.
  function onFolderHeaderDrop(e, targetFolderId, targetSongCount) {
    e.preventDefault();
    if (!dragging || dragging.type !== "song") return;
    moveSong(dragging.songId, targetFolderId, targetSongCount);
    refresh();
    dragging = null;
  }

  // Dropping a folder's drag handle onto another named folder reorders
  // folders. targetIndex is the position within prefs.folders (Unfiled is
  // index 0 and is never a target — folder rows only render for index > 0).
  function onFolderDrop(e, targetIndex) {
    e.preventDefault();
    if (!dragging || dragging.type !== "folder") return;
    reorderFolders(dragging.fromIndex, targetIndex);
    refresh();
    dragging = null;
  }

  function allowDrop(e) {
    e.preventDefault();
  }
```

- [ ] **Step 2: Wire drag attributes onto song rows**

In both the Unfiled `<ul class="songlist unfiled">` block and the per-folder `<ul class="songlist">` block from Task 4, change each song `<li>`:

```svelte
              <li>
                <span class="title">{s.title}{s.source ? ` · ${s.source}` : ""}{s.sub ? ` · ${s.sub}` : ""}</span>
                <button class="remove" onclick={() => handleRemove(s.id)}>Remove</button>
              </li>
```

to (for the Unfiled list, `f.id` is `null`; for a named folder's list, `f.id` is that folder's id — both blocks use the same `f` from their enclosing `{#each folderSongs as f}` iteration, and `i` is each song's index within `f.songs`):

```svelte
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
```

This requires switching both song loops from `{#each f.songs as s (s.id)}` to `{#each f.songs as s, i (s.id)}` to get the index — update both occurrences.

- [ ] **Step 3: Wire drag attributes onto folder headers (song-drop target + folder-reorder source)**

Change the `folder-hdr` div from Task 4:

```svelte
          <div class="folder-hdr">
            <span class="dh">≡</span>
```

to (folder index within `prefs.folders` — `folderSongs` preserves `prefs.folders`' order/indices 1:1, so use the enclosing `{#each folderSongs as f, folderIndex (...)}`'s index; update that `{#each}` to capture it):

```svelte
          <div
            class="folder-hdr"
            class:dragging={dragging?.type === "folder" && dragging.fromIndex === folderIndex}
            ondragover={allowDrop}
            ondrop={(e) => onFolderHeaderDrop(e, f.id, f.songs.length)}
          >
            <span class="dh" draggable="true" ondragstart={() => onFolderDragStart(folderIndex)} ondragend={onDragEnd} ondrop={(e) => onFolderDrop(e, folderIndex)}>≡</span>
```

Update the top-level `{#each folderSongs as f (f.id ?? "unfiled")}` to:

```svelte
    {#each folderSongs as f, folderIndex (f.id ?? "unfiled")}
```

- [ ] **Step 4: Append drag-over visual styles to `src/app.css`**

Append after the `.songlist.unfiled { margin-bottom: 24px; }` line added in Task 4:

```css
.songlist li[draggable] { cursor: grab; }
.songlist li.dragging { opacity: .4; }
.folder-hdr.dragging { opacity: .4; }
.folder-hdr .dh[draggable] { cursor: grab; }
```

- [ ] **Step 5: Manual smoke test**

Run: `pnpm run dev --port 8291 &`, wait ~2s. HTML5 drag-and-drop's native `dragstart`/`dragover`/`drop` events are not directly dispatchable via Playwright's high-level `.dragTo()` API in all cases, so verify via `dispatchEvent` with a `DataTransfer`, or (simpler and sufficient here, since the goal is confirming the handlers are wired and `prefs.js` calls happen) call the exposed handlers indirectly by checking that after a real drag interaction the DOM order changes:

```js
import pkg from "playwright"; const { chromium } = pkg;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const BASE = "http://localhost:8291/practice-player-violin/";

await page.goto(BASE + "#/marketplace");
await page.waitForSelector("details.grp");
await page.locator("details.grp summary").first().click();
const addButtons = page.locator(".songlist li button.add");
await addButtons.nth(0).click();
await addButtons.nth(1).click();

await page.goto(BASE + "#/library");
await page.waitForSelector(".songlist.unfiled li");
const titlesBefore = await page.locator(".songlist.unfiled .title").allTextContents();
console.log("before:", titlesBefore);

const rows = page.locator(".songlist.unfiled li");
await rows.nth(1).dragTo(rows.nth(0));
await page.waitForTimeout(200);

const titlesAfter = await page.locator(".songlist.unfiled .title").allTextContents();
console.log("after:", titlesAfter);
console.log("order changed:", JSON.stringify(titlesBefore) !== JSON.stringify(titlesAfter));
console.log("errors:", errors);
await browser.close();
```

If Playwright's `.dragTo()` does not trigger the native HTML5 DnD sequence reliably in headless Chromium (a known flakiness with the HTML5 DnD spec specifically, as opposed to mouse-based sortable libraries), fall back to manually dispatching the sequence:

```js
await rows.nth(1).evaluate((el) => el.dispatchEvent(new DragEvent("dragstart", { bubbles: true })));
await rows.nth(0).evaluate((el) => el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true })));
await rows.nth(0).evaluate((el) => el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true })));
```

Confirm no console errors and that the resulting order matches a call to `moveSong` with the expected arguments (cross-check by reading `localStorage.getItem("practice-player-violin:prefs")` via `page.evaluate(() => localStorage.getItem(...))` and asserting the JSON reflects the new order).

Also verify manually in a real browser tab (open `http://localhost:8291/practice-player-violin/#/library`) since native DnD is easiest to validate by hand: drag a song between folders, drag a song within a folder to reorder, and drag a folder's `≡` handle to reorder folders. Confirm the Player page's Song dropdown (`#/`) reflects the same folder grouping/order afterward.

Stop the dev server afterward: `pkill -f "vite.*8291"`.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Library.svelte src/app.css
git commit -m "$(cat <<'EOF'
Library: drag-and-drop to move/reorder songs and reorder folders

Native HTML5 Drag and Drop API, no new dependency. Dropping a song on
another song's row moves/reorders it to that position (within or
across folders); dropping on a folder header appends to that folder.
Dragging a folder's handle reorders folders (Unfiled excluded).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full regression pass

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing — this is the final gate before considering the feature done.

- [ ] **Step 1: Run the full automated test suite**

Run: `npx vitest run`
Expected: PASS — both `src/lib/prefs.test.mjs` and `scripts/songs.test.mjs` green.

- [ ] **Step 2: Run the production build**

Run: `pnpm run build`
Expected: succeeds with no errors, `docs/` output regenerated (this project publishes `docs/` via GitHub Pages — see `vite.config.js`'s `build.outDir`).

- [ ] **Step 3: End-to-end manual walkthrough**

Start `pnpm run dev --port 8291 &`, then in a browser:
1. `#/marketplace` — add 3-4 songs from different sources.
2. `#/library` — confirm they appear unlabeled (Unfiled) at the top.
3. Create two folders ("Warmups", "Tunes"). Confirm they render below Unfiled, empty.
4. Drag two songs into "Warmups", one into "Tunes". Confirm Unfiled shrinks accordingly and counts update.
5. Reorder songs within "Warmups" by dragging. Confirm order persists after a page reload (`location.reload()`).
6. Drag "Tunes" above "Warmups" via its `≡` handle. Confirm order persists after reload.
7. Rename "Warmups" to "Bow Warmups" by clicking its name, editing, and clicking away. Confirm it persists after reload.
8. Remove all songs from "Tunes" one by one via each song's "Remove" button. Confirm the "Tunes" folder itself disappears once empty (auto-delete).
9. `#/` (Player) — confirm the Song dropdown's optgroups match Library's current folder names/order exactly, with Unfiled songs listed first as plain (non-grouped) options.
10. Select a song from within a named-folder optgroup and confirm it loads/plays normally.

Stop the dev server afterward: `pkill -f "vite.*8291"`.

- [ ] **Step 4: No commit for this task** — verification only, nothing to stage. If any issue surfaces, return to the relevant task above, fix, and re-commit there.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1) ✓. `prefs.js` function list (Task 1) ✓. Library rendering/creation/rename/delete (Task 4) ✓. Drag-and-drop for songs and folders (Task 5) ✓. Player `songGroups` from `prefs.folders` (Task 3) ✓. Marketplace `isInLibrary` swap (Task 2) ✓. "No backwards compatibility" honored — `DEFAULTS.folders` replaces `DEFAULTS.library` outright, no migration code. "One level of nesting enforced structurally" — `folders[*].songIds` only ever holds song ids in every function in Task 1, never folder ids. Out-of-scope items (nested folders, cross-device sync, dragging directly from Marketplace into a folder) are correctly not implemented anywhere in this plan.
- **Placeholder scan:** no TBD/TODO markers; every step has complete code, not descriptions of code.
- **Type/name consistency:** `moveSong(songId, toFolderId, toIndex)` and `reorderFolders(fromIndex, toIndex)` signatures match between Task 1's implementation, Task 1's tests, and Task 5's call sites. `isInLibrary(prefs, songId)` matches between Task 1 and Task 2. Folder shape `{id, name, songIds}` is consistent across all tasks.
