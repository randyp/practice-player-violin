import * as Tone from "tone";
import { degToMidi, midiToNote, BEATS, beatsPerMeasure } from "./theory.js";
import { log } from "./log.js";

function partSynth(dest) {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 2, spread: 8 },
    envelope: { attack: 0.09, decay: 0.2, sustain: 0.85, release: 0.3 },
  }).connect(dest);
  synth.volume.value = -14;
  return synth;
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

  const audio = { melody: partSynth(rev), harmony: partSynth(rev), click, master, rev };
  onStatus("synth tone ready");

  return audio;
}

/* ---------- timeline ---------- */
// Builds a flat, repeat-expanded event list for one part's measures. Each
// {from, to} in `repeats` replays that measure range again immediately after
// it's first played — idx is reused from the original pass (rather than
// counting up past it) so highlight() keeps pointing at the same
// notation.js-rendered noteheads on the repeat instead of running off the
// end of `placed`.
function buildPartTimeline(measures, repeats) {
  const timeline = [];
  let t = 0;

  function playMeasures(from, to) {
    let idx = measures.slice(0, from).reduce((n, m) => n + m.length, 0);
    for (let m = from; m <= to; m++) {
      for (const ev of measures[m]) {
        const beats = BEATS[ev.dur];
        timeline.push({ t, beats, idx, deg: ev.deg, rest: !!ev.rest });
        t += beats; idx++;
      }
    }
  }

  let m = 0;
  for (const r of repeats) {
    if (m < r.from) playMeasures(m, r.from - 1);
    playMeasures(r.from, r.to);
    playMeasures(r.from, r.to);
    m = r.to + 1;
  }
  if (m < measures.length) playMeasures(m, measures.length - 1);

  return { timeline, totalBeats: t };
}

export function buildTimeline(song) {
  const melody = buildPartTimeline(song.melody.measures, song.repeats);
  const harmony = song.harmony
    ? buildPartTimeline(song.harmony.measures, song.repeats)
    : { timeline: [], totalBeats: 0 };
  return {
    melodyTimeline: melody.timeline,
    harmonyTimeline: harmony.timeline,
    totalBeats: Math.max(melody.totalBeats, harmony.totalBeats),
  };
}

/* ---------- event queue / transport ---------- */
const LOOKAHEAD = 0.2; // seconds of audio queued at a time

function schedulePartNotes(queue, timeline, tonic, startAt, sec, kind) {
  timeline.forEach((ev) => {
    if (ev.rest) return;
    queue.push({
      t: startAt + ev.t * sec, kind,
      note: midiToNote(degToMidi(tonic, ev.deg)),
      dur: Math.max(0.08, ev.beats * sec * 0.92),
      vel: 0.68 + Math.random() * 0.10,
    });
  });
}

export function buildEventQueue({
  song, tonic, bpm, countInMeasures, metronome, playMelody, playHarmony,
  melodyTimeline, harmonyTimeline, totalBeats,
}) {
  const sec = 60 / bpm;
  const now = Tone.now() + 0.12;
  const bpMeasure = beatsPerMeasure(song.timeSignature);
  const countInBeats = countInMeasures * bpMeasure;
  const leadBeats = countInBeats ? (countInBeats - song.pickup) : 0;
  const startAt = now + leadBeats * sec;
  const queue = [];

  if (countInBeats && metronome) {
    // The pickup note plays over the count-in's final song.pickup beats (see
    // leadBeats above) — click there too and the two audibly collide, so
    // those beats get silence instead of a click.
    const clickBeats = countInBeats - song.pickup;
    for (let i = 0; i < clickBeats; i++) {
      queue.push({ t: now + i * sec, kind: "click", freq: i % bpMeasure === 0 ? 1760 : 1320 });
    }
  }
  if (metronome) {
    // Beats before song.pickup are the pickup note itself playing (see
    // startAt above) — clicking there collides with it audibly, so the
    // ongoing metronome only starts once the pickup has played out.
    for (let b = song.pickup; b < Math.ceil(totalBeats); b++) {
      const isDown = ((b - song.pickup) % bpMeasure + bpMeasure) % bpMeasure === 0;
      queue.push({ t: startAt + b * sec, kind: "click", freq: isDown ? 1760 : 1320 });
    }
  }
  if (playMelody) schedulePartNotes(queue, melodyTimeline, tonic, startAt, sec, "melody");
  if (playHarmony) schedulePartNotes(queue, harmonyTimeline, tonic, startAt, sec, "harmony");
  queue.sort((a, b) => a.t - b.t);
  return { queue, startAt };
}

// Only hand the audio clock a short slice at a time, so Stop can actually
// stop. Consumes queue entries from `i` up to the lookahead horizon and
// returns the index to resume from on the next call.
export function pump(audio, queue, i) {
  const horizon = Tone.now() + LOOKAHEAD;
  while (i < queue.length && queue[i].t < horizon) {
    const e = queue[i++];
    try {
      if (e.kind === "click") audio.click.triggerAttackRelease(e.freq, 0.03, e.t);
      else if (e.kind === "melody") audio.melody.triggerAttackRelease(e.note, e.dur, e.t, e.vel);
      else if (e.kind === "harmony") audio.harmony.triggerAttackRelease(e.note, e.dur, e.t, e.vel);
    } catch (err) { /* scheduling past events throws harmlessly */ }
  }
  return i;
}
