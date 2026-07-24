// Dev-time tool: writes public/songs/catalog.json + public/songs/<id>.json.
// Not shipped to the browser — the runtime only ever fetches the JSON this
// script produces (see src/lib/songs.js). Re-run after editing the song
// definitions below, then commit the regenerated public/songs/ output.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { N } from "../src/lib/theory.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../public/songs");

const UPDOWN = [0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0];
const SCALE_KEYS = ["G", "D", "A"];

// Open-string degrees relative to a C-major tonic (degToMidi(60, deg)):
// G3=-3, D4=1, A4=5, E5=9.
const OPEN_G = -3, OPEN_D = 1, OPEN_A = 5, OPEN_E = 9;

// diatonic third below each melody degree — the standard "harmonize the scale" treatment
const THIRD_BELOW = (d) => d - 2;

function scaleSong(id, title, sub, melodyMeasures, harmonyMeasures, repeats) {
  return {
    id, group: "Scale variations", title, sub,
    defaultTempo: 120, keys: SCALE_KEYS, defaultKey: "G", pickup: 0, repeats,
    timeSignature: "4/4",
    melody: { measures: melodyMeasures },
    harmony: { measures: harmonyMeasures },
  };
}

// Traditional Scottish air, transcribed in MuseScore (D major) and
// converted from its MusicXML export — see design/marketplace.md's
// sibling transcription notes for how this differs from the earlier
// audio-transcription attempt.
const AULD_LANG_SYNE = {
  id: "auld-lang-syne", group: "Tunes", title: "Auld Lang Syne", sub: "traditional",
  defaultTempo: 80, keys: ["D"], defaultKey: "D", pickup: 1, repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [N(-3, "q")], // pickup
    [N(0, "qd", true), N(-1, "8"), N(0, "q"), N(2, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(2, "q")],
    [N(0, "qd"), N(0, "8"), N(2, "q"), N(4, "q")],
    [N(5, "hd"), N(5, "q")],
    [N(4, "qd"), N(2, "8"), N(2, "q"), N(0, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(2, "q")],
    [N(0, "qd", true), N(-2, "8"), N(-2, "q"), N(-3, "q")],
    [N(0, "hd"), N(5, "q")],
    [N(4, "qd", true), N(2, "8"), N(2, "q"), N(0, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(5, "q")],
    [N(4, "qd", true), N(2, "8"), N(2, "q"), N(4, "q")],
    [N(5, "hd"), N(5, "q")],
    [N(4, "qd", true), N(2, "8"), N(2, "q"), N(0, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(2, "q")],
    [N(0, "qd"), N(-2, "8"), N(-2, "q"), N(-3, "q")],
    [N(0, "hd")],
  ] },
};

const BOW_WARMUP = {
  id: "bow-warmup", group: "Warmups", title: "Beginner Bow Warmup", sub: "open strings only",
  defaultTempo: 120, keys: ["C"], defaultKey: "C", pickup: 0, repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    // whole notes: G G D D A A E E
    [N(OPEN_G, "w")], [N(OPEN_G, "w")], [N(OPEN_D, "w")], [N(OPEN_D, "w")],
    [N(OPEN_A, "w")], [N(OPEN_A, "w")], [N(OPEN_E, "w")], [N(OPEN_E, "w")],
    // half notes: E E A A D D G G
    [N(OPEN_E, "h"), N(OPEN_E, "h")], [N(OPEN_A, "h"), N(OPEN_A, "h")],
    [N(OPEN_D, "h"), N(OPEN_D, "h")], [N(OPEN_G, "h"), N(OPEN_G, "h")],
    // quarter notes, 4x each: G D A E A D
    [N(OPEN_G, "q"), N(OPEN_G, "q"), N(OPEN_G, "q"), N(OPEN_G, "q")],
    [N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q")],
    [N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q")],
    [N(OPEN_E, "q"), N(OPEN_E, "q"), N(OPEN_E, "q"), N(OPEN_E, "q")],
    [N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q")],
    [N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q")],
    // mixed quarter/half phrases
    [N(OPEN_G, "q"), N(OPEN_G, "q"), N(OPEN_D, "h")],
    [N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_E, "h")],
    [N(OPEN_E, "q"), N(OPEN_E, "q"), N(OPEN_A, "h")],
    [N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_G, "h")],
    [N(OPEN_G, "h"), N(OPEN_D, "q"), N(OPEN_D, "q")],
    [N(OPEN_A, "h"), N(OPEN_E, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "h"), N(OPEN_A, "q"), N(OPEN_A, "q")],
    [N(OPEN_D, "h"), N(OPEN_G, "q"), N(OPEN_G, "q")],
    // quarter-note phrases, 4 beats each
    [N(OPEN_G, "q"), N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_G, "q")],
    [N(OPEN_G, "q"), N(OPEN_D, "q"), N(OPEN_G, "q"), N(OPEN_D, "q")],
    [N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q")],
    [N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_D, "q")],
    [N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q")],
    [N(OPEN_A, "q"), N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_G, "q")],
    [N(OPEN_G, "q"), N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q")],
  ] },
};

const SONGS = [
  BOW_WARMUP,

  scaleSong("var1", "Half Notes Var. 1", null,
    [
      ...UPDOWN.map((d) => [N(d, "h"), N(d, "h")]),
      ...(() => {
        const m = [];
        for (let i = 0; i < UPDOWN.length; i += 2) m.push([N(UPDOWN[i], "h"), N(UPDOWN[i + 1], "h")]);
        return m;
      })(),
    ],
    [
      ...UPDOWN.map((d) => [N(THIRD_BELOW(d), "h"), N(THIRD_BELOW(d), "h")]),
      ...(() => {
        const m = [];
        for (let i = 0; i < UPDOWN.length; i += 2) {
          m.push([N(THIRD_BELOW(UPDOWN[i]), "h"), N(THIRD_BELOW(UPDOWN[i + 1]), "h")]);
        }
        return m;
      })(),
    ],
    // two independent repeated sections: the double-half-notes-per-note
    // pass (measures 0-15), then the one-half-note-per-note pass (16-23)
    [{ from: 0, to: UPDOWN.length - 1 }, { from: UPDOWN.length, to: UPDOWN.length + UPDOWN.length / 2 - 1 }]),

  AULD_LANG_SYNE,
];

const ids = new Set();
for (const s of SONGS) {
  if (ids.has(s.id)) throw new Error(`duplicate song id "${s.id}"`);
  ids.add(s.id);
  if (s.timeSignature !== "4/4") {
    throw new Error(`Song "${s.title}" has unsupported time signature "${s.timeSignature}" — only "4/4" is implemented`);
  }
  const lastMeasure = s.melody.measures.length - 1;
  let prevTo = -1;
  for (const r of s.repeats) {
    if (r.from > r.to || r.from <= prevTo || r.to > lastMeasure) {
      throw new Error(`Song "${s.title}" has an invalid repeat range {from: ${r.from}, to: ${r.to}} — ranges must be ascending, in bounds (0-${lastMeasure}), and non-overlapping`);
    }
    prevTo = r.to;
  }
}

mkdirSync(outDir, { recursive: true });

const catalog = SONGS.map(({ id, group, title, sub, timeSignature }) => ({ id, group, title, sub, timeSignature }));
writeFileSync(join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");

for (const song of SONGS) {
  const { id, ...rest } = song;
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(rest, null, 2) + "\n");
}

console.log(`wrote catalog.json + ${SONGS.length} song file(s) to ${outDir}`);
