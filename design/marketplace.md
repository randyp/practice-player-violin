# Marketplace: browse and add to library

This doc scopes the first two marketplace stages: **browsing** a catalog
of songs beyond what ships in `public/songs/`, and **adding** one to a
user's personal library. It builds on the Google Drive sign-in already
implemented (`src/lib/drive-auth.js`) and the existing song JSON shape
(`design/song-format.md`).

**Status:** Stage 1 (browse, add, remove) is implemented — see below,
this section stays as the design record. The library is currently
`localStorage`-only (`src/lib/prefs.js`'s `library` array), not yet
Drive-backed; that gap is stage 2, still open.

Not covered here: authoring/uploading custom songs, or editing the
contents of a song already in the library — those are later stages,
noted at the end.

## Implemented: three pages

The app is a hash-routed (`svelte-spa-router`) 3-page SPA:

- **Player** (`/`, `src/pages/Player.svelte`) — today's player, unchanged
  except its Song dropdown now lists only the user's **library**
  (`catalog` filtered by `prefs.library`), not the full marketplace
  catalog. An empty library shows a message linking to the Marketplace
  page instead of the dropdown. Footer nav links to the other two pages.
- **My Library** (`/library`, `src/pages/Library.svelte`) — lists the
  user's library, grouped the same way the Player's dropdown used to
  (`song.group`), with a Remove button per song.
- **Marketplace** (`/marketplace`, `src/pages/Marketplace.svelte`) —
  lists every song in the catalog, same grouping, with an "Add to
  library" button (or "In your library" if already added).

`prefs.js` gained `library: string[]` (catalog ids) plus
`addToLibrary(id)`/`removeFromLibrary(id)` helpers, following the same
read-modify-write pattern as `saveSongKey`.

Both new pages fetch `loadCatalog()` independently (each page mounts
fresh under the router, so there's no shared parent state to lift this
into without more machinery than three read-only listings warrant).

## Design principles

- **Browsing needs no Google account and no Drive API call.** The
  marketplace catalog is public, static data — the same shape as
  `public/songs/catalog.json` — fetched directly over HTTPS. Requiring
  sign-in just to look at what's available would be an unnecessary
  barrier and an unnecessary Drive API dependency for a read that doesn't
  need per-user auth at all.
- **Google Drive's only job is per-user storage.** It's the answer to
  "where does *my* library live," not "where does the catalog live." This
  matches why `drive.file` scope was chosen originally (see
  [TODO.md](TODO.md) item 2 and the auth implementation): the app can
  freely create/read/list files it made itself, with no broader-scope
  verification burden.
- **Adding a song copies its data into the user's Drive; it does not
  store a reference to the marketplace original.** `drive.file` scope
  cannot see a file this app didn't create, so a "pointer" design would
  require either a broader OAuth scope (reopens app-verification cost)
  or the Google Picker API (a materially different, one-file-at-a-time
  UX). Copying the song JSON itself sidesteps both — see
  [Why copy, not reference](#why-copy-not-reference-full-rationale)
  below for the fuller comparison.

## Stage 1: browsing the marketplace

### Where the catalog lives

The marketplace catalog is a public JSON index plus per-song JSON files —
the same two-tier shape `public/songs/` already uses
(`catalog.json` + `<id>.json`), just hosted somewhere broader than this
repo's own bundled library. Candidate hosting: a public Google Drive
folder (shareable/readable without auth, exportable as direct-download
links), or any other static host. The exact hosting choice is an open
question (see [Open questions](#open-questions)) but doesn't affect the
client code below — it's just a base URL to fetch from.

### Fetching

A new loader mirrors `src/lib/songs.js`'s existing `loadCatalog`/
`loadSong`, pointed at the marketplace's base URL instead of
`import.meta.env.BASE_URL`:

```js
export async function loadMarketplaceCatalog() { /* fetch <base>/catalog.json */ }
export async function loadMarketplaceSong(id)  { /* fetch <base>/<id>.json */ }
```

No new song schema is needed — a marketplace song is a `Song` (per
song-format.md), identical in shape to a bundled one. The only new
concept is *where it was fetched from*, which matters for stage 2 (the
copy needs to remember it came from the marketplace, not local authoring).

### UI

Implemented as its own route (`/marketplace`, see "Implemented: three
pages" above) rather than a modal/inline panel — a real page, header nav
matching the Library page, distinct from the Player's own dropdown/
footer-nav UI.

## Stage 2: adding a song to the user's library

### What "adding" does

When a signed-in user clicks "Add to library" on a marketplace song:

1. Fetch the song's full JSON via `loadMarketplaceSong(id)` (if not
   already fetched for preview/display).
2. Create a new file in the user's Drive via the Drive API `files.create`
   endpoint, with the song JSON as its content — using the access token
   already obtained from `driveAuth.signIn()` (drive.file scope, so the
   app can freely create files here).
3. Tag the created file with identifying metadata (see below) so it can
   later be found and loaded back as a library song.

This is an **additive** operation — it does not touch the marketplace
original, and does not require write access to anything the app didn't
create.

### Identifying a library file

Drive file names aren't required to be unique or informative, so the
copy needs enough metadata to answer "which marketplace song is this"
and "is this a marketplace copy at all" when listing the user's Drive
files later. Google Drive's `appProperties` (private, per-app key/value
metadata attached to a file, invisible in the normal Drive UI) is the
natural fit — it's already scoped by `drive.file`, requires no extra
parsing of file content just to enumerate a library, and doesn't clutter
the visible filename:

```js
appProperties: {
  practicePlayerSongId: song.id,       // the marketplace song's id
  practicePlayerKind: "library-song",  // distinguishes from any other
                                        // file this app might create later
}
```

`files.list` (already implemented in `listDriveFiles`) can then filter
with a query like `appProperties has { key='practicePlayerKind' and
value='library-song' }` to enumerate exactly the user's saved songs,
ignoring anything else `drive.file` happens to expose.

### Loading a library song

Symmetric to loading a marketplace/bundled song: fetch the file's content
via `files.get?alt=media` (using the file's Drive file ID, obtained from
the filtered `files.list` above), parse it as a `Song`. The result is
usable by the existing player exactly like any other loaded `Song` —
no special-casing needed once it's in memory, since it's the same schema.

### Duplicate adds

If the user adds the same marketplace song twice, this design does
nothing to prevent a second copy being created — `files.create` doesn't
check for an existing `practicePlayerSongId` match first. Whether to
dedupe (check-then-create) or allow duplicates (simplest, user can
manually clean up) is an open question, not decided here.

## Why copy, not reference (full rationale)

| | Copy into user's Drive (this doc) | Reference marketplace original |
|---|---|---|
| OAuth scope needed | `drive.file` (already implemented) | `drive.readonly`/`drive` (broader, needs Google app verification for public use) or Picker API |
| UX for "add multiple songs" | One click each | Fine for scope; Picker API is one-file-at-a-time by design, awkward for a catalog-browsing flow |
| Marketplace changes after adding | User's copy is stable/unaffected | Reference would follow marketplace edits (could be a pro or a con) |
| Offline / marketplace unavailable later | User's library still works | Broken if the referenced file moves or sharing is revoked |
| Implementation cost | One `files.create` call, reuses existing auth | Either a verification process, or integrating a second Google API (Picker) with its own script/UI |

Copying wins on every axis that matters given this project's constraints
(backend-free, minimal consent scope, no app verification) except "stays
in sync with marketplace edits" — which isn't a stated goal here.

## Resolved

- **Where the catalog lives:** `public/songs/` itself, bundled with the
  app — not a separate Drive-hosted or externally-hosted catalog. A
  Drive-backed marketplace catalog was prototyped (public "anyone with
  the link" sharing + direct-download URLs) but real-browser `fetch()`
  hit inconsistent/undocumented CORS behavior on Drive's consumer
  download endpoints (curl saw permissive CORS headers; Chromium didn't,
  see conversation history if this is revisited) — the Drive API v3
  `alt=media` endpoint does CORS correctly but needs a Google Cloud API
  key, which was deferred as unnecessary complexity given the catalog is
  ~112 KB total. Bundling it in the app sidesteps the problem entirely.
- **Marketplace UI:** a separate page/route, not a modal — see
  "Implemented: three pages" above.
- **Library vs. marketplace listing:** separate pages/lists (My Library,
  Marketplace), not merged into one dropdown with mixed state.
- **Removing a library song:** implemented (Library page's Remove
  button), not deferred.

## Open questions

- Duplicate-add handling: `addToLibrary` is a no-op if the id's already
  present (see prefs.js), so this is actually resolved for the
  localStorage implementation — revisit once library storage moves to
  Drive (stage 2), where a duplicate `files.create` is possible again.
- Stage 2 (Drive-backed library) itself: still not implemented — the
  library is `localStorage` only, so it doesn't sync across devices or
  survive a cleared browser profile.

## Explicitly not covered by this doc

- Authoring or uploading a custom (non-marketplace) song.
- Marketplace search/filtering beyond the existing group-based listing.
- Any change to the `Song` schema itself (none needed — see Stage 1).
