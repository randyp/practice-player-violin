import { N, R } from "./theory.js";

const PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7], [7, 6], [5, 4], [3, 2], [1, 0]];
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

  scaleSong(3, "Two quarters + half", "",
    PAIRS.map((p) => [N(p[0], "q"), N(p[0], "q"), N(p[1], "h")])),

  scaleSong(4, "Two quarters per note", "",
    PAIRS.map((p) => [N(p[0], "q"), N(p[0], "q"), N(p[1], "q"), N(p[1], "q")])),

  scaleSong(5, "Quarter + rest", "stop and reset the bow",
    PAIRS.map((p, i) => i === PAIRS.length - 1
      ? [N(p[0], "q"), R("q"), N(p[1], "h")]
      : [N(p[0], "q"), R("q"), N(p[1], "q"), R("q")])),

  scaleSong(6, "One quarter per note", "",
    [[0, 1, 2, 3], [4, 5, 6, 7], [7, 6, 5, 4], [3, 2, 1, 0]].map(
      (row) => row.map((d) => N(d, "q")))),

  {
    group: "Tunes", title: "Scale Song", sub: "solfège étude",
    tempo: 100, keys: SCALE_KEYS, defKey: "G", pickup: 0, repeat: false,
    measures: [
      [N(0, "q"), R("q"), N(1, "8"), N(2, "8"), R("q")],
      [N(0, "8"), N(2, "q"), N(0, "8"), N(2, "q"), R("q")],
      [N(1, "q"), R("8"), N(2, "8"), N(3, "8"), N(3, "8"), N(2, "8"), N(1, "8")],
      [N(3, "q"), R("q"), R("q"), R("q")],
      [N(2, "q"), R("q"), N(3, "8"), N(4, "8"), R("q")],
      [N(2, "8"), N(4, "q"), N(2, "8"), N(4, "q"), R("q")],
      [N(3, "q"), R("8"), N(4, "8"), N(5, "8"), N(5, "8"), N(4, "8"), N(3, "8")],
      [N(5, "q"), R("q"), R("q"), R("q")],
      [N(4, "q"), R("8"), N(0, "8"), N(1, "8"), N(2, "8"), N(3, "8"), N(4, "8")],
      [N(5, "q"), R("q"), R("q"), R("q")],
      [N(5, "q"), R("8"), N(1, "8"), N(2, "8"), N(3, "8"), N(4, "8"), N(5, "8")],
      [N(6, "q"), R("q"), R("q"), R("q")],
      [N(6, "q"), R("8"), N(2, "8"), N(3, "8"), N(4, "8"), N(5, "8"), N(6, "8")],
      [N(7, "q"), R("q"), R("q"), N(7, "8"), N(6, "8")],
      [N(5, "q"), N(2, "q"), N(6, "q"), N(4, "q")],
      [N(7, "q"), N(4, "q"), N(2, "q"), N(0, "q")],
    ],
  },

  {
    group: "Tunes", title: "Auld Lang Syne", sub: "traditional Scottish air",
    tempo: 80, keys: ["D", "G"], defKey: "D", pickup: 1, repeat: false,
    // melody dips a 4th below the tonic, so G must sit an octave up
    // to keep the pickup on the open D string rather than below the violin
    tonics: { D: 62, G: 67 },
    measures: [
      [N(-3, "q")],
      [N(0, "qd"), N(-1, "8", true), N(0, "q"), N(2, "q")],
      [N(1, "qd"), N(0, "8", true), N(1, "q"), N(2, "q")],
      [N(0, "qd"), N(0, "8"), N(2, "q"), N(4, "q")],
      [N(5, "hd"), N(5, "q")],
      [N(4, "qd"), N(2, "8", true), N(2, "q"), N(0, "q")],
      [N(1, "qd"), N(0, "8", true), N(1, "q"), N(2, "q")],
      [N(0, "qd"), N(-2, "8", true), N(-2, "q"), N(-3, "q")],
      [N(0, "hd"), N(5, "q")],
      [N(4, "qd"), N(2, "8", true), N(2, "q"), N(0, "q")],
      [N(1, "qd"), N(0, "8", true), N(1, "q"), N(5, "q")],
      [N(4, "qd"), N(2, "8", true), N(2, "q"), N(4, "q")],
      [N(5, "hd"), N(5, "q")],
      [N(4, "qd"), N(2, "8", true), N(2, "q"), N(0, "q")],
      [N(1, "qd"), N(0, "8", true), N(1, "q"), N(2, "q")],
      [N(0, "qd"), N(-2, "8", true), N(-2, "q"), N(-3, "q")],
      [N(0, "hd")],
    ],
  },
];
