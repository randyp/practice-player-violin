# My Library folders

## Purpose

Users can organize the songs they've added to their library into
custom, user-named folders — one level deep only, no nesting — and
reorder both folders and songs within them by drag-and-drop. Newly
added songs land in an implicit "Unfiled" bucket at the top. The
Player page's Song dropdown mirrors this same folder structure instead
of grouping by the song's built-in `group`/`source` field.

Not backwards compatible: the existing flat `library: string[]` pref
is replaced outright. Existing users' saved library selection is not
migrated — this is an accepted, explicit trade-off (see
[[design decisions]]).

## Data model (`src/lib/prefs.js`)

Replace `library: string[]` with a single `folders` array. Library
membership *is* presence in this structure — there is no second list
to fall out of sync with it.

```js
folders: [
  { id: null, name: null, songIds: [] }, // always first: the implicit "Unfiled" bucket
],
```

- `folders[0]` is always present and always `{ id: null, name: null,
  songIds: [...] }` — the Unfiled bucket. It is never removed, even
  when empty (there is always somewhere for a newly-added song to go).
- Every other entry is a user-named folder: `{ id: string, name:
  string, songIds: string[] }`. `id` is generated with
  `crypto.randomUUID()`.
- Array order is display order (folder order in Library and Player).
  `songIds` order is display order within that folder.
- A song id appears in **at most one** folder's `songIds` at a time.

### New/changed functions in `prefs.js`

- `addToLibrary(songId)` — appends to `folders[0].songIds` (Unfiled),
  no-op if the id is already present anywhere in `folders`.
- `removeFromLibrary(songId)` — removes the id from whichever folder
  contains it. If that folder is named (`id !== null`) and its
  `songIds` is now empty, the folder itself is dropped from `folders`.
  Unfiled is never dropped.
- `isInLibrary(prefs, songId)` — `folders.some(f =>
  f.songIds.includes(songId))`. Replaces the old `prefs.library.includes(...)`
  check in Marketplace.
- `createFolder(name)` — appends `{ id: crypto.randomUUID(), name,
  songIds: [] }` to `folders`.
- `renameFolder(folderId, name)` — updates a named folder's `name`.
- `deleteFolder(folderId)` — moves all of that folder's `songIds` to
  the end of `folders[0].songIds` (Unfiled), then removes the folder.
- `moveSong(songId, toFolderId, toIndex)` — removes `songId` from
  whichever folder currently holds it, then inserts it into the
  target folder's `songIds` at `toIndex`. Handles both cross-folder
  moves and same-folder reordering (remove-then-reinsert is safe for
  the same-array case too, since the index is resolved against the
  post-removal array).
- `reorderFolders(fromIndex, toIndex)` — moves a folder within
  `folders`, excluding index 0 (Unfiled cannot be reordered — it's
  always first, matching [[design decisions]]).

All of the above follow the existing pattern in `prefs.js`: read via
`loadPrefs()`, write the whole updated `folders` array via
`savePrefs()`. No new persistence mechanism.

## Library page (`src/pages/Library.svelte`)

Renders `folders` in order:

- `folders[0]` (Unfiled) renders its song list with **no heading** —
  visually just the top list — matching how it's the default/no-org
  state. If it's empty (a user has filed everything), it renders
  nothing (no empty heading-less gap).
- Each named folder renders a header row: drag handle (`≡`), the
  folder name (click to rename in place, e.g. turns into a text
  input), a song count, and a delete control. Below it, its songs.
- A "+ New folder" text input + button sits at the top of the page,
  above Unfiled. Submitting creates an empty folder appended to the
  end of `folders`.

### Drag-and-drop

Native HTML5 DnD (`draggable="true"`, `dragstart`/`dragover`/`drop`
handlers) — no new dependency, matching this project's existing
zero-dependency preference (e.g. native `<details>` for Marketplace's
collapsible sections).

- Each song row is draggable. Dropping it on another song row (in any
  folder, including Unfiled) calls `moveSong(songId, targetFolderId,
  targetIndex)` for that position — this covers both moving a song to
  a different folder and reordering it within its current one.
  Dropping onto a folder's *header* (not a specific song row) drops at
  the end of that folder's `songIds`.
- Each named folder's `≡` handle is draggable; dropping it above/below
  another named folder's header reorders via `reorderFolders`. Unfiled
  is not a drop target for folder-reordering (it isn't a folder you
  can move).
- No file-picker/native OS drag interop — this is DOM-internal
  reordering only.

### Removing a song

The existing "Remove" button per song stays, calling
`removeFromLibrary(songId)` (now folder-aware per the data-model
section above).

## Player page (`src/pages/Player.svelte`)

`songGroups` (used to build the Song `<select>`'s `<optgroup>`s)
changes from grouping `libSongs` by `s.group`/`s.source` to iterating
`prefs.folders` directly:

- `folders[0]` (Unfiled) songs render as plain `<option>`s with no
  wrapping `<optgroup>`, placed first — same visual result as today
  when a user hasn't made any folders yet.
- Each named folder renders as an `<optgroup label={folder.name}>`
  containing its songs in `songIds` order.
- Songs not present in any folder (i.e., not in the library) don't
  appear — unchanged from today.

The dropdown option label format (`title · source`/`sub`) is
unchanged. Keyboard next/prev song navigation
(`ArrowRight`/`ArrowLeft`) continues to walk the same flattened
`libSongs` list, now derived by concatenating `folders` in order
instead of the old `library` array — song order is now
user-controlled instead of catalog order.

## Marketplace page (`src/pages/Marketplace.svelte`)

Only change: the "already added" check
(`library.includes(s.id)`) becomes `isInLibrary(prefs, s.id)`.
Grouping in Marketplace stays by `source` (unrelated to this feature —
that's the catalog's own organization, not the user's library).

## Design decisions

- **Single data structure, not membership + organization split.**
  Considered (and rejected) keeping `library: string[]` as the
  membership source of truth alongside separate `folders`/
  `unfiledOrder` arrays for organization. Two structures need a
  reconciliation pass to stay in sync (e.g. a song added to `library`
  but never appended to any order array). Folding membership into
  `folders[*].songIds` directly removes the second structure and the
  sync problem entirely.
- **Unfiled is `folders[0]`, not a separate field.** Using the same
  `{id, name, songIds}` shape for Unfiled (distinguished only by
  `id === null`) means Library/Player rendering and `moveSong` all
  have one code path instead of special-casing Unfiled vs. named
  folders throughout.
- **One level of nesting, enforced structurally.** A folder's
  `songIds` holds only song ids, never folder ids — nesting isn't
  possible to represent, so no validation is needed to prevent it.
- **No backwards compatibility / migration.** Explicitly OK'd by the
  user: existing `library` prefs are simply superseded; there is no
  migration step from the old shape to the new one.
- **Native HTML5 drag-and-drop, no library.** Consistent with this
  codebase's preference for zero-dependency vanilla implementations
  over pulling in a DnD package for one feature.

## Out of scope

- Nested folders (structurally impossible per the data model, not
  just unimplemented).
- Cross-device sync — this remains `localStorage`-only, same as every
  other pref in this file.
- Drag targets outside the Library page (e.g. dragging a Marketplace
  song directly into a specific folder) — adding to the library always
  lands in Unfiled; filing it is a separate, subsequent action on the
  Library page.
