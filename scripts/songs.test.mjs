import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSupportedTimeSignature, assertFullMeasures } from "../src/lib/theory.js";

// Validates the actual generated artifacts in public/songs/ — the files the
// app fetches at runtime — not the SONGS array in generate-songs.mjs, so a
// stale (un-regenerated) public/songs/ after a source edit fails here too.
const songsDir = join(dirname(fileURLToPath(import.meta.url)), "../public/songs");
const catalog = JSON.parse(readFileSync(join(songsDir, "catalog.json"), "utf8"));

describe("public/songs/*.json", () => {
  it("catalog.json lists exactly the song files on disk", () => {
    const onDisk = readdirSync(songsDir).filter((f) => f !== "catalog.json").sort();
    const listed = catalog.map((s) => `${s.id}.json`).sort();
    expect(onDisk).toEqual(listed);
  });

  for (const entry of catalog) {
    describe(entry.id, () => {
      const song = JSON.parse(readFileSync(join(songsDir, `${entry.id}.json`), "utf8"));

      it("has a supported time signature", () => {
        expect(() => assertSupportedTimeSignature(song)).not.toThrow();
      });

      it("has every measure summing to a full measure (pickups/endings included)", () => {
        expect(() => assertFullMeasures(song)).not.toThrow();
      });

      it("has ascending, in-bounds, non-overlapping repeat ranges", () => {
        const lastMeasure = song.melody.measures.length - 1;
        let prevTo = -1;
        for (const r of song.repeats) {
          expect(r.from).toBeLessThanOrEqual(r.to);
          expect(r.from).toBeGreaterThan(prevTo);
          expect(r.to).toBeLessThanOrEqual(lastMeasure);
          prevTo = r.to;
        }
      });

      it("includes defaultKey in keys", () => {
        expect(song.keys).toContain(song.defaultKey);
      });
    });
  }
});
