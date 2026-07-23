import { N } from "./theory.js";

const UPDOWN = [0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0];
const SCALE_KEYS = ["G", "D", "A"];

function scaleSong(n, title, sub, measures) {
  return {
    group: "Scale variations", title: `Var. ${n} — ${title}`, sub,
    tempo: 120, keys: SCALE_KEYS, defKey: "G", pickup: 0, repeat: true, measures,
  };
}

export const SONGS = [
  scaleSong(1, "Long tones", "two half notes per note",
    UPDOWN.map((d) => [N(d, "h"), N(d, "h")])),

  scaleSong(2, "Long tones", "one half note per note",
    (() => {
      const m = [];
      for (let i = 0; i < UPDOWN.length; i += 2) m.push([N(UPDOWN[i], "h"), N(UPDOWN[i + 1], "h")]);
      return m;
    })()),
];
