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
  songLoops: {}, // per-song loop toggle, keyed by catalog id — a short warmup loops, a
                  // full piece usually doesn't, so this shouldn't carry over between songs
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

export function loopFor(prefs, songId) {
  return prefs.songLoops[songId] ?? false;
}

export function saveSongLoop(songId, loop) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, songLoops: { ...prefs.songLoops, [songId]: loop } });
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
