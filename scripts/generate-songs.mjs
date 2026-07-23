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

// diatonic third below each melody degree — the standard "harmonize the scale" treatment
const THIRD_BELOW = (d) => d - 2;

function scaleSong(id, n, title, sub, melodyMeasures, harmonyMeasures) {
  return {
    id, group: "Scale variations", title: `Var. ${n} — ${title}`, sub,
    defaultTempo: 120, keys: SCALE_KEYS, defaultKey: "G", pickup: 0, repeat: true,
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
  defaultTempo: 80, keys: ["D"], defaultKey: "D", pickup: 1, repeat: false,
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

const SONGS = [
  scaleSong("var1", 1, "Long tones", "two half notes per note",
    UPDOWN.map((d) => [N(d, "h"), N(d, "h")]),
    UPDOWN.map((d) => [N(THIRD_BELOW(d), "h"), N(THIRD_BELOW(d), "h")])),

  scaleSong("var2", 2, "Long tones", "one half note per note",
    (() => {
      const m = [];
      for (let i = 0; i < UPDOWN.length; i += 2) m.push([N(UPDOWN[i], "h"), N(UPDOWN[i + 1], "h")]);
      return m;
    })(),
    (() => {
      const m = [];
      for (let i = 0; i < UPDOWN.length; i += 2) {
        m.push([N(THIRD_BELOW(UPDOWN[i]), "h"), N(THIRD_BELOW(UPDOWN[i + 1]), "h")]);
      }
      return m;
    })()),

  AULD_LANG_SYNE,
];

const ids = new Set();
for (const s of SONGS) {
  if (ids.has(s.id)) throw new Error(`duplicate song id "${s.id}"`);
  ids.add(s.id);
  if (s.timeSignature !== "4/4") {
    throw new Error(`Song "${s.title}" has unsupported time signature "${s.timeSignature}" — only "4/4" is implemented`);
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
