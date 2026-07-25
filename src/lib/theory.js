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

// Keyed by letter + octave (e.g. "G3", not just "G") so the tonic's octave is
// explicit everywhere a key is referenced, not just baked silently into this
// one numeric `tonic` value — G3/D4/A4/E5 are the violin's four open strings.
export const KEYS = {
  C4: { name: "C Major", sig: "C", tonic: 60 },
  G3: { name: "G Major", sig: "G", tonic: 55 },
  D4: { name: "D Major", sig: "D", tonic: 62 },
  A4: { name: "A Major", sig: "A", tonic: 69 },
  E5: { name: "E Major", sig: "E", tonic: 76 },
};

export const BEATS = { w: 4, h: 2, q: 1, "8": 0.5, qd: 1.5, hd: 3 };

// "4/4" -> 4, "2/4" -> 2, etc — only the numerator matters since every
// duration above is already expressed in quarter-note beats (see songs.js's
// timeSignature validation for which signatures are actually supported).
export function beatsPerMeasure(timeSignature) {
  return +timeSignature.split("/")[0];
}

export function N(d, u, slur) {
  return { deg: d, dur: u || "q", slur: !!slur };
}

export function R(u) {
  return { rest: true, dur: u || "q" };
}

export function measureBeats(m) {
  return m.reduce((s, e) => s + BEATS[e.dur], 0);
}
