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
