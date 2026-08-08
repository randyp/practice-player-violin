import { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline, Dot, Curve, StaveText, StaveModifierPosition } from "vexflow";
import { degToMidi, midiToVexKey, measureBeats } from "./theory.js";

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

// A hidden, offscreen renderer used only to measure glyph overhead (never
// shown) — VexFlow needs a real context to lay out a Stave's modifiers
// (clef/key/time-sig/repeat-begin barline) and report how much width they
// actually consumed, and that consumption isn't a constant: a key with more
// sharps/flats, or a repeat-begin's double-bar-and-dots, each claim a
// different amount, discovered only by asking VexFlow, not by guessing.
let measureCtx = null;
function getMeasureCtx() {
  if (measureCtx) return measureCtx;
  const holder = document.createElement("div");
  holder.style.position = "absolute";
  holder.style.visibility = "hidden";
  document.body.appendChild(holder);
  const renderer = new Renderer(holder, Renderer.Backends.SVG);
  renderer.resize(2000, 200);
  measureCtx = renderer.getContext();
  return measureCtx;
}

// How much width a stave's own modifiers (clef+key signature, time
// signature, repeat-begin barline) consume before any note can be drawn —
// measured directly from VexFlow rather than a guessed constant, because
// that consumption depends on the key signature (sharp/flat count) and
// varies from what a hand-picked overhead number would predict (see the
// bug this replaced: a fixed 74px guess undershot a 3-sharp key + repeat
// barline by ~30px, visibly shrinking that measure's actual note area).
function overheadFor(keySig, isLineStart, hasTimeSig, isRepeatBegin) {
  if (!isLineStart && !isRepeatBegin) return 0;
  const ctx = getMeasureCtx();
  const probeWidth = 500; // wide enough that modifiers never crowd notes out
  const stave = new Stave(0, 0, probeWidth);
  if (isLineStart) {
    stave.addClef("treble").addKeySignature(keySig);
    if (hasTimeSig) stave.addTimeSignature("4/4"); // glyph width doesn't vary by signature digits
  }
  if (isRepeatBegin) stave.setBegBarType(Barline.type.REPEAT_BEGIN);
  stave.setContext(ctx).draw();
  return probeWidth - (stave.getNoteEndX() - stave.getNoteStartX());
}

// Extra breathing room added around every note/rest, regardless of its
// duration — preCalculateMinTotalWidth returns VexFlow's tightest possible
// fit with no slack, which reads as cramped once notes are actually spaced
// out to fill a justified width. This is added to the *estimate*, not
// passed to VexFlow directly (formatToStave has no such knob) — inflating
// the target width is what makes the justification pass space notes out
// further to fill it.
const NOTE_PADDING = 4;

// A measure's minimum note-content width, independent of layout — real
// width from VexFlow's own formatter (duration mix/beaming/dots accounted
// for, not just a beat count), excluding any clef/key/time-sig/repeat
// overhead. Needs the song's actual tonic (not a placeholder) because a
// pickup measure can use a negative scale degree, which maps to a real but
// out-of-range MIDI note if `tonic` isn't the real one — VexFlow's own key
// naming (midiToVexKey) then fails on it.
function minContentWidth(measure, tonic) {
  const notes = buildNotes(measure, tonic);
  const voice = new Voice({ num_beats: measureBeats(measure), beat_value: 4 });
  voice.setStrict(false);
  voice.addTickables(notes);
  const content = new Formatter().joinVoices([voice]).preCalculateMinTotalWidth([voice]);
  return content + NOTE_PADDING * measure.length;
}

// Greedily packs measures into lines: adding a measure to the current line
// means every measure on that line (old and new) grows to the widest one's
// content width, so a line's content width is tested — not each measure
// added independently — against the line's overhead-adjusted budget. This
// is what guarantees every measure's final content width is >= its own
// minimum: nothing is ever squeezed below what it was tested to fit at.
// Only the very first line's first measure also carries the time-signature
// glyph (later lines repeat the clef/key but not the time signature), so
// packing line 0 must price in slightly more overhead than every other line.
function packLines(measures, song, key, tonic, availWidth) {
  const contentWidths = measures.map((m) => minContentWidth(m, tonic));
  const lines = [];
  let mi = 0;
  while (mi < measures.length) {
    const isFirstLine = lines.length === 0;
    const overheadOf = (k) => overheadFor(key.sig, k === 0, k === 0 && isFirstLine, song.repeats.some((r) => mi + k === r.from));
    let lineContentW = contentWidths[mi];
    let count = 1;
    const lineOverhead = () => {
      let sum = 0;
      for (let k = 0; k < count; k++) sum += overheadOf(k);
      return sum;
    };
    if (lineContentW * count + lineOverhead() > availWidth) {
      // A single measure's own minimum doesn't fit — nothing shrinks it
      // further, so it goes on its own line rather than looping forever.
      lines.push(measures.slice(mi, mi + 1));
      mi += 1;
      continue;
    }
    while (mi + count < measures.length) {
      const candidateContentW = Math.max(lineContentW, contentWidths[mi + count]);
      const candidateCount = count + 1;
      let candidateOverhead = 0;
      for (let k = 0; k < candidateCount; k++) candidateOverhead += overheadOf(k);
      if (candidateContentW * candidateCount + candidateOverhead > availWidth) break;
      lineContentW = candidateContentW;
      count = candidateCount;
    }
    lines.push(measures.slice(mi, mi + count));
    mi += count;
  }
  return lines;
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
  const padX = 8, topPad = 14, bottomPad = 28;
  const lines = packLines(measures, song, key, tonic, width - padX * 2);

  const holder = document.createElement("div");
  host.insertBefore(holder, highlightEl);
  const renderer = new Renderer(holder, Renderer.Backends.SVG);
  renderer.resize(width, lines.length * LINE_H + topPad + bottomPad);
  const ctx = renderer.getContext();

  let mi = 0;
  for (let L = 0; L < lines.length; L++) {
    const row = lines[L];
    const avail = width - padX * 2;
    // Every measure on the line gets the same note-content width, filling
    // whatever's left after each measure's own overhead (clef/key/time-sig
    // on the first, repeat-begin glyph where relevant) — the packer already
    // guaranteed this is >= every measure's own minimum content width, so
    // filling it here only ever stretches, never compresses.
    const overheads = row.map((_, c) => overheadFor(key.sig, c === 0, c === 0 && L === 0, song.repeats.some((r) => mi + c === r.from)));
    const totalOverhead = overheads.reduce((a, o) => a + o, 0);
    const lineContentW = (avail - totalOverhead) / row.length;
    let x = padX;
    const y = topPad + L * LINE_H;

    for (let c = 0; c < row.length; c++, mi++) {
      const mb = measureBeats(row[c]);
      const w = lineContentW + overheads[c];
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

      // Beams must be generated before formatToStave, not just before
      // voice.draw(): the formatter's justification spacing treats a beamed
      // group's notes as one unit, but without beams yet attached it spaces
      // them as independent notes instead — visibly uneven (e.g. a run of 4
      // equal eighths gets a near-double gap after the first note) even
      // though every note has the same duration. Beam's constructor also
      // recomputes and takes over each of its notes' stems (so the beam and
      // stem slant match), which is why it must precede voice.draw() too —
      // generating beams after voice.draw() has already drawn independent
      // per-note stems produces two overlapping stems per note.
      let beams = [];
      try { beams = Beam.generateBeams(notes); } catch (e) { /* unbeamable measure */ }

      // formatToStave measures the actual stave geometry (clef/key/time-sig/
      // repeat-glyph/barline) for the available width, rather than a manually
      // guessed budget — a fixed guess left uneven trailing space in measures
      // with an asymmetric duration mix (e.g. a run of eighths ending in two
      // quarters), crowding the last note against the barline.
      new Formatter().joinVoices([voice]).formatToStave([voice], stave);

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
