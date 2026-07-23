import * as Tone from "tone";
import { degToMidi, midiSci, BEATS } from "./theory.js";

export function log(...args) {
  try { console.log("[player]", ...args); } catch (e) { /* no console */ }
}

function synthVoice(dest) {
  const v = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 2, spread: 8 },
    envelope: { attack: 0.09, decay: 0.2, sustain: 0.85, release: 0.3 },
  }).connect(dest);
  v.volume.value = -14;
  return v;
}

export function buildAudio(onStatus) {
  log("building audio graph");

  const master = new Tone.Gain(1).toDestination();
  const rev = new Tone.Freeverb({ roomSize: 0.5, dampening: 3000, wet: 0.11 }).connect(master);

  const click = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
  }).connect(master);
  click.volume.value = -16;

  const audio = { melody: synthVoice(rev), harmony: synthVoice(rev), click, master, rev };
  onStatus("synth tone ready");

  return audio;
}

/* ---------- timeline ---------- */
// Builds a flat, repeat-expanded event list for one voice's measures.
function buildVoiceTimeline(measures, repeat, repeats) {
  const timeline = [];
  const passes = (repeat && repeats) ? 2 : 1;
  let t = 0, bow = 0;
  for (let p = 0; p < passes; p++) {
    let idx = 0;
    for (let m = 0; m < measures.length; m++) {
      for (let k = 0; k < measures[m].length; k++) {
        const ev = measures[m][k], b = BEATS[ev.dur];
        let dir = null;
        if (!ev.rest) { dir = (bow % 2 === 0) ? "down" : "up"; if (!ev.slur) bow++; }
        timeline.push({ t, beats: b, idx, measure: m, deg: ev.deg, rest: !!ev.rest, bow: dir });
        t += b; idx++;
      }
    }
  }
  return { timeline, totalBeats: t };
}

export function buildTimeline(song, repeats) {
  const melody = buildVoiceTimeline(song.melody.measures, song.repeat, repeats);
  const harmony = song.harmony
    ? buildVoiceTimeline(song.harmony.measures, song.repeat, repeats)
    : { timeline: [], totalBeats: 0 };
  return {
    timeline: melody.timeline,
    totalBeats: Math.max(melody.totalBeats, harmony.totalBeats),
    harmonyTimeline: harmony.timeline,
  };
}

/* ---------- event queue / transport ---------- */
const LOOKAHEAD = 0.2; // seconds of audio queued at a time

function scheduleVoiceNotes(evq, voiceTimeline, tonic, startAt, sec, kind) {
  voiceTimeline.forEach((ev) => {
    if (ev.rest) return;
    evq.push({
      t: startAt + ev.t * sec, kind,
      note: midiSci(degToMidi(tonic, ev.deg)),
      dur: Math.max(0.08, ev.beats * sec * 0.92),
      vel: 0.68 + Math.random() * 0.10,
    });
  });
}

export function buildEventQueue({ song, tonic, bpm, countIn, metro, melodyPlay, harmonyPlay, timeline, harmonyTimeline }) {
  const sec = 60 / bpm;
  const now = Tone.now() + 0.12;
  const leadBeats = countIn ? (4 - song.pickup) : 0;
  const startAt = now + leadBeats * sec;
  const evq = [];

  if (countIn && metro) {
    for (let i = 0; i < 4; i++) evq.push({ t: now + i * sec, kind: "click", freq: i === 0 ? 1760 : 1320 });
  }
  if (metro) {
    const totalBeats = timeline.length ? timeline[timeline.length - 1].t + timeline[timeline.length - 1].beats : 0;
    const nb = Math.ceil(totalBeats);
    for (let b = 0; b < nb; b++) {
      const isDown = ((b - song.pickup) % 4 + 4) % 4 === 0;
      evq.push({ t: startAt + b * sec, kind: "click", freq: isDown ? 1760 : 1320 });
    }
  }
  if (melodyPlay) scheduleVoiceNotes(evq, timeline, tonic, startAt, sec, "melody");
  if (harmonyPlay) scheduleVoiceNotes(evq, harmonyTimeline, tonic, startAt, sec, "harmony");
  evq.sort((a, b) => a.t - b.t);
  return { evq, startAt };
}

// only hand the audio clock a short slice at a time, so Stop can actually stop
export function pump(audio, evq, evi) {
  const horizon = Tone.now() + LOOKAHEAD;
  while (evi.i < evq.length && evq[evi.i].t < horizon) {
    const e = evq[evi.i++];
    try {
      if (e.kind === "click") audio.click.triggerAttackRelease(e.freq, 0.03, e.t);
      else if (e.kind === "melody" && audio.melody) audio.melody.triggerAttackRelease(e.note, e.dur, e.t, e.vel);
      else if (e.kind === "harmony" && audio.harmony) audio.harmony.triggerAttackRelease(e.note, e.dur, e.t, e.vel);
    } catch (err) { /* scheduling past events throws harmlessly */ }
  }
}
