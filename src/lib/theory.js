/* pitch: scale degree -> midi -> names */
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function degToMidi(tonic, deg) {
  const oct = Math.floor(deg / 7), step = deg - oct * 7;
  return tonic + oct * 12 + MAJ[step];
}

export function midiSci(m) {
  return SHARP[m % 12] + (Math.floor(m / 12) - 1);
}

export function midiVf(m) {
  const n = midiSci(m), oct = n.match(/-?\d+$/)[0];
  return n.slice(0, n.length - oct.length).toLowerCase() + "/" + oct;
}

export const KEYS = {
  G: { name: "G Major", sig: "G", tonic: 55 },
  D: { name: "D Major", sig: "D", tonic: 62 },
  A: { name: "A Major", sig: "A", tonic: 69 },
};

export const BEATS = { h: 2, q: 1, "8": 0.5, qd: 1.5, hd: 3 };

export function N(d, u, slur) {
  return { deg: d, dur: u || "q", slur: !!slur };
}

export function R(u) {
  return { rest: true, dur: u || "q" };
}

export function measureBeats(m) {
  return m.reduce((s, e) => s + BEATS[e.dur], 0);
}
