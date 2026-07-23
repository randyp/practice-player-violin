import { N } from "./theory.js";

const UPDOWN = [0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0];
const SCALE_KEYS = ["G", "D", "A"];

// diatonic third below each melody degree — the standard "harmonize the scale" treatment
const THIRD_BELOW = (d) => d - 2;

function scaleSong(n, title, sub, melodyMeasures, harmonyMeasures) {
  return {
    group: "Scale variations", title: `Var. ${n} — ${title}`, sub,
    defaultTempo: 120, keys: SCALE_KEYS, defaultKey: "G", pickup: 0, repeat: true,
    timeSignature: "4/4",
    melody: { measures: melodyMeasures },
    harmony: { measures: harmonyMeasures },
  };
}

export const SONGS = [
  scaleSong(1, "Long tones", "two half notes per note",
    UPDOWN.map((d) => [N(d, "h"), N(d, "h")]),
    UPDOWN.map((d) => [N(THIRD_BELOW(d), "h"), N(THIRD_BELOW(d), "h")])),

  scaleSong(2, "Long tones", "one half note per note",
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
];

// Only 4/4 is implemented today — the notation renderer's line-breaking, the
// transport's beat-dot indicator, and the beat_value passed to VexFlow's Voice
// all hardcode a quarter-note beat and 4 beats/measure. Fail loudly rather than
// silently mis-render or mis-count a song authored in another time signature.
SONGS.forEach((s) => {
  if (s.timeSignature !== "4/4") {
    throw new Error(`Song "${s.title}" has unsupported time signature "${s.timeSignature}" — only "4/4" is implemented`);
  }
});
