/* pitch: scale degree -> midi -> names */
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function degToMidi(tonic, deg) {
  const oct = Math.floor(deg / 7), step = deg - oct * 7;
  return tonic + oct * 12 + MAJ[step];
}

// e.g. 62 -> "D4" (scientific pitch notation, what Tone.js consumes)
export function midiToNote(midi) {
  return SHARP[midi % 12] + (Math.floor(midi / 12) - 1);
}

// e.g. 62 -> "d/4" (VexFlow's key format)
export function midiToVexKey(midi) {
  const note = midiToNote(midi), oct = note.match(/-?\d+$/)[0];
  return note.slice(0, note.length - oct.length).toLowerCase() + "/" + oct;
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
// duration above is already expressed in quarter-note beats (see
// assertSupportedTimeSignature for which signatures are actually supported).
export function beatsPerMeasure(timeSignature) {
  return +timeSignature.split("/")[0];
}

// Only simple time signatures with a quarter-note beat are implemented —
// the notation renderer's beat_value passed to VexFlow's Voice and every
// duration in BEATS are both quarter-note-based. Fail loudly rather than
// silently mis-render or mis-count a song authored in, say, 6/8.
export function assertSupportedTimeSignature(song) {
  if (!/^[0-9]+\/4$/.test(song.timeSignature)) {
    throw new Error(`Song "${song.title}" has unsupported time signature "${song.timeSignature}" — only "N/4" signatures are implemented`);
  }
}

// note event: `slur` means "slurred to the following note" and is only
// present when true, so serialized songs don't carry `"slur": false` noise
export function N(deg, dur = "q", slur = false) {
  return slur ? { deg, dur, slur: true } : { deg, dur };
}

export function R(dur = "q") {
  return { rest: true, dur };
}

export function measureBeats(measure) {
  return measure.reduce((sum, ev) => sum + BEATS[ev.dur], 0);
}
