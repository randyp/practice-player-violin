import { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline, Dot, Curve, StaveText, StaveModifierPosition } from "vexflow";
import { degToMidi, midiToVexKey, measureBeats, beatsPerMeasure } from "./theory.js";

// VexFlow durations don't have a "dotted" letter of their own (our "qd"/"hd")
// — the base duration and the augmentation dot are separate: a duration
// string plus a Dot built and attached to the note.
function splitDur(dur) {
  return dur.endsWith("d") ? { base: dur.slice(0, -1), dotted: true } : { base: dur, dotted: false };
}

// Vertical spacing between staff lines, shared between renderScore's layout
// and highlight()'s scroll-to-current-line math.
const LINE_H = 96;

function buildNotes(measure, tonic) {
  return measure.map((ev) => {
    const { base, dotted } = splitDur(ev.dur);
    // Without autoStem, VexFlow defaults every stem to point up regardless of
    // pitch — autoStem makes it follow the standard convention (down for
    // notes on/above the middle line, up below).
    const note = ev.rest
      ? new StaveNote({ keys: ["b/4"], duration: base + "r" })
      : new StaveNote({ keys: [midiToVexKey(degToMidi(tonic, ev.deg))], duration: base, autoStem: true });
    if (dotted) Dot.buildAndAttach([note], { all: true });
    return note;
  });
}

// Slurs connect a note to the next one (ev.slur means "slurred to the note
// that follows"), so they're built from a flat, in-order note list rather
// than per-measure — a slur can span a measure/line break.
function buildSlurs(events, notes, ctx) {
  const curves = [];
  for (let i = 0; i < events.length - 1; i++) {
    if (!events[i].slur || events[i].rest || events[i + 1].rest) continue;
    const curve = new Curve(notes[i], notes[i + 1], {});
    curve.setContext(ctx);
    curves.push(curve);
  }
  return curves;
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

// Renders one part of `song` in `key` into `host` (with a `highlightEl`
// highlight div child preserved). `part` is "melody" or "harmony" — exactly
// one part is on the staff at a time, matching the Part dropdown.
// Returns an array of bounding boxes, one per rendered note/rest event, in
// the same order that part's timeline indexes them (see audio.js).
export function renderScore(host, highlightEl, { song, key, tonic, part }) {
  Array.from(host.children).forEach((c) => { if (c !== highlightEl) host.removeChild(c); });
  highlightEl.classList.remove("on");
  const placed = [];

  const measures = (part === "harmony" ? song.harmony : song.melody).measures;
  const width = Math.max(320, host.clientWidth || 800);
  // Target a constant number of beats per line — 4/4's usual 4 measures/line
  // is 16 beats/line — rather than a fixed measure count, so a lighter time
  // signature like 2/4 fits proportionally more measures per line instead of
  // looking sparse.
  const targetBeatsPerLine = (width < 660 ? 2 : 4) * 4;
  const perLine = Math.max(1, Math.round(targetBeatsPerLine / beatsPerMeasure(song.timeSignature)));
  const lines = [];
  for (let i = 0; i < measures.length; i += perLine) lines.push(measures.slice(i, i + perLine));

  const padX = 8, topPad = 14, bottomPad = 28;
  const holder = document.createElement("div");
  host.insertBefore(holder, highlightEl);
  const renderer = new Renderer(holder, Renderer.Backends.SVG);
  renderer.resize(width, lines.length * LINE_H + topPad + bottomPad);
  const ctx = renderer.getContext();

  let mi = 0;
  for (let L = 0; L < lines.length; L++) {
    const row = lines[L];
    const extra = 74;
    // A short last row (fewer measures than a full line) shouldn't stretch to
    // the full page width — scale it down proportionally, so a lone leftover
    // measure isn't blown up to fill the same space as a 4-measure row.
    const rowFrac = row.length / perLine;
    const avail = (width - padX * 2 - extra) * rowFrac;
    const rowBeats = row.reduce((a, m) => a + measureBeats(m), 0);
    let x = padX;
    const y = topPad + L * LINE_H;

    for (let c = 0; c < row.length; c++, mi++) {
      const mb = measureBeats(row[c]);
      // A repeat-begin barline draws its own double-bar-and-dots glyph, which
      // needs extra reserved width on top of the usual clef/key/time-signature
      // budget — otherwise its notes get squeezed and spill toward the next
      // measure's barline.
      const hasBegRepeat = song.repeats.some((r) => mi === r.from);
      const extraHere = (c === 0 ? extra : 0) + (hasBegRepeat ? 18 : 0);
      const w = Math.max(58, avail * (mb / rowBeats)) + extraHere;
      const stave = new Stave(x, y, w);
      if (c === 0) {
        stave.addClef("treble").addKeySignature(key.sig);
        if (L === 0) stave.addTimeSignature(song.timeSignature);
      }
      for (const r of song.repeats) {
        if (mi === r.from) stave.setBegBarType(Barline.type.REPEAT_BEGIN);
        if (mi === r.to) {
          stave.setEndBarType(Barline.type.REPEAT_END);
          // A bare repeat barline conventionally means "play twice" — a
          // times > 2 range needs an explicit "×N" marking or it reads wrong.
          if (r.times > 2) {
            stave.addModifier(new StaveText(`×${r.times}`, StaveModifierPosition.ABOVE));
          }
        }
      }
      stave.setContext(ctx).draw();

      const notes = buildNotes(row[c], tonic);
      const voice = new Voice({ num_beats: mb, beat_value: 4 });
      voice.setStrict(false);
      voice.addTickables(notes);

      // formatToStave measures the actual stave geometry (clef/key/time-sig/
      // repeat-glyph/barline) for the available width, rather than a manually
      // guessed budget — a fixed guess left uneven trailing space in measures
      // with an asymmetric duration mix (e.g. a run of eighths ending in two
      // quarters), crowding the last note against the barline.
      new Formatter().joinVoices([voice]).formatToStave([voice], stave);

      // Beams must be generated before the voice is drawn: Beam's constructor
      // recomputes and takes over each of its notes' stems (so the beam and
      // stem slant match) — generating beams after voice.draw() has already
      // drawn independent per-note stems produces two overlapping stems per
      // note.
      let beams = [];
      try { beams = Beam.generateBeams(notes); } catch (e) { /* unbeamable measure */ }

      voice.draw(ctx, stave);
      beams.forEach((b) => { try { b.setContext(ctx).draw(); } catch (e) { /* skip unbeamable */ } });
      buildSlurs(row[c], notes, ctx).forEach((curve) => { try { curve.draw(); } catch (e) { /* skip */ } });

      notes.forEach((nt) => {
        placed.push({ ...noteBox(nt, y), lineY: y });
      });
      x += w;
    }
  }
  return placed;
}

export function highlight(highlightEl, placed, i) {
  const p = placed[i];
  if (!p) { highlightEl.classList.remove("on"); return; }
  highlightEl.style.left = (p.x - 5) + "px";
  highlightEl.style.top = (p.y - 6) + "px";
  highlightEl.style.width = (p.w + 10) + "px";
  highlightEl.style.height = (p.h + 12) + "px";
  highlightEl.classList.add("on");
  const paper = highlightEl.closest(".paper");
  // Only scroll if the sheet doesn't already fit entirely on screen. Otherwise
  // center the current *line* — using lineY (constant for every note on that
  // line) rather than the note's own y/h, which varies note-to-note by pitch
  // and would otherwise jitter the scroll position within a single line.
  // Clamped to [0, max scroll] so lines near the start/end pin to the
  // top/bottom rather than leaving dead margin just to keep the line centered.
  const maxScroll = paper.scrollHeight - paper.clientHeight;
  if (maxScroll <= 0) return;
  const target = Math.min(maxScroll, Math.max(0, p.lineY + LINE_H / 2 - paper.clientHeight / 2));
  paper.scrollTo({ top: target, behavior: "smooth" });
}
