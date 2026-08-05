import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPrefs, addToLibrary, removeFromLibrary, isInLibrary,
  createFolder, renameFolder, deleteFolder, moveSong, reorderFolders,
} from "./prefs.js";

// Plain `node`/`vitest run` only exposes a working localStorage global when
// launched with --localstorage-file (Node 26+); a bare in-memory stand-in
// keeps this file runnable via the project's normal `pnpm run test`, no flag
// required — prefs.js itself only ever calls getItem/setItem.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

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
