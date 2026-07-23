import { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline } from "vexflow";
import { degToMidi, midiVf, measureBeats } from "./theory.js";

function buildNotes(measure, tonic) {
  return measure.map((ev) => {
    if (ev.rest) return new StaveNote({ keys: ["b/4"], duration: ev.dur.replace("d", "") + "r" });
    return new StaveNote({ keys: [midiVf(degToMidi(tonic, ev.deg))], duration: ev.dur });
  });
}

// Builds a tight highlight box from the note's own notehead geometry (post-draw()),
// rather than StaveNote.getBoundingBox() — which bundles in ledger lines/stems and,
// combined with the VexFlow font-load race (see App.svelte's onMount), can report
// wildly wrong geometry. Rests have no notehead, so they use a fixed-size fallback.
function noteBox(note, lineY) {
  if (note.isRest()) {
    return { x: note.getAbsoluteX() - 6, y: lineY + 10, w: 14, h: 56 };
  }
  const x0 = note.getNoteHeadBeginX();
  const x1 = note.getNoteHeadEndX();
  const { yTop, yBottom } = note.getNoteHeadBounds();
  return { x: x0, y: yTop, w: x1 - x0, h: yBottom - yTop };
}

// Renders `song` in `key` into `host` (with a `hl` highlight div child preserved).
// showMelody/showHarmony control which voice(s) appear on the staff.
// Harmony is assumed to share melody's measure/beat layout (see design/song-format.md).
// Returns an array of bounding boxes, one per melody note/rest event in playback order.
export function renderScore(host, hl, song, key, tonic, showMelody, showHarmony) {
  Array.from(host.children).forEach((c) => { if (c !== hl) host.removeChild(c); });
  hl.classList.remove("on");
  const placed = [];

  const melodyMeasures = song.melody.measures;
  const harmonyMeasures = showHarmony && song.harmony ? song.harmony.measures : null;
  const width = Math.max(320, host.clientWidth || 800);
  const perLine = width < 660 ? 2 : 4;
  const lines = [];
  for (let i = 0; i < melodyMeasures.length; i += perLine) lines.push(melodyMeasures.slice(i, i + perLine));

  const lineH = 96, padX = 8, topPad = 14, bottomPad = 28;
  const holder = document.createElement("div");
  host.insertBefore(holder, hl);
  const renderer = new Renderer(holder, Renderer.Backends.SVG);
  renderer.resize(width, lines.length * lineH + topPad + bottomPad);
  const ctx = renderer.getContext();

  let mi = 0;
  for (let L = 0; L < lines.length; L++) {
    const row = lines[L];
    const extra = 74;
    const avail = width - padX * 2 - extra;
    const rowBeats = row.reduce((a, m) => a + measureBeats(m), 0);
    let x = padX;
    const y = topPad + L * lineH;

    for (let c = 0; c < row.length; c++, mi++) {
      const mb = measureBeats(row[c]);
      const w = Math.max(58, avail * (mb / rowBeats)) + (c === 0 ? extra : 0);
      const stave = new Stave(x, y, w);
      if (c === 0) {
        stave.addClef("treble").addKeySignature(key.sig);
        if (L === 0) stave.addTimeSignature("4/4");
      }
      if (song.repeat && mi === 0) stave.setBegBarType(Barline.type.REPEAT_BEGIN);
      if (song.repeat && mi === melodyMeasures.length - 1) stave.setEndBarType(Barline.type.REPEAT_END);
      stave.setContext(ctx).draw();

      const melodyNotes = showMelody ? buildNotes(row[c], tonic) : [];
      const harmonyNotes = harmonyMeasures ? buildNotes(harmonyMeasures[mi], tonic) : [];

      const voices = [];
      if (melodyNotes.length) {
        const v = new Voice({ num_beats: mb, beat_value: 4 });
        v.setStrict(false);
        v.addTickables(melodyNotes);
        voices.push(v);
      }
      if (harmonyNotes.length) {
        const v = new Voice({ num_beats: mb, beat_value: 4 });
        v.setStrict(false);
        v.addTickables(harmonyNotes);
        voices.push(v);
      }

      const fmtW = w - (c === 0 ? extra + 18 : 22);
      if (voices.length) new Formatter().joinVoices(voices).format(voices, Math.max(40, fmtW));
      voices.forEach((v) => v.draw(ctx, stave));

      [melodyNotes, harmonyNotes].forEach((notes) => {
        let beams = [];
        try { beams = Beam.generateBeams(notes); } catch (e) { beams = []; }
        beams.forEach((b) => { try { b.setContext(ctx).draw(); } catch (e) { /* skip unbeamable */ } });
      });

      melodyNotes.forEach((nt) => {
        placed.push(noteBox(nt, y));
      });
      x += w;
    }
  }
  return placed;
}

export function highlight(hl, placed, i) {
  const p = placed[i];
  if (!p) { hl.classList.remove("on"); return; }
  hl.style.left = (p.x - 5) + "px";
  hl.style.top = (p.y - 6) + "px";
  hl.style.width = (p.w + 10) + "px";
  hl.style.height = (p.h + 12) + "px";
  hl.classList.add("on");
  const paper = hl.parentElement.parentElement;
  if (p.y < paper.scrollTop + 8 || p.y + p.h > paper.scrollTop + paper.clientHeight - 8) {
    paper.scrollTo({ top: Math.max(0, p.y - 40), behavior: "smooth" });
  }
}
