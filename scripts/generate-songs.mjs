// Dev-time tool: writes public/songs/catalog.json + public/songs/<id>.json.
// Not shipped to the browser — the runtime only ever fetches the JSON this
// script produces (see src/lib/songs.js). Re-run after editing the song
// definitions below, then commit the regenerated public/songs/ output.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { N, R, assertSupportedTimeSignature, assertFullMeasures } from "../src/lib/theory.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../public/songs");

const UPDOWN = [0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0];
const SCALE_KEYS = ["G3", "D4", "A4"];

// Open-string degrees relative to a C-major tonic (degToMidi(60, deg)):
// G3=-3, D4=1, A4=5, E5=9.
const OPEN_G = -3, OPEN_D = 1, OPEN_A = 5, OPEN_E = 9;

// diatonic third below each melody degree — the standard "harmonize the scale" treatment
const THIRD_BELOW = (d) => d - 2;

function scaleSong(id, title, sub, melodyMeasures, harmonyMeasures, repeats) {
  return {
    id, group: "Scale variations", title, sub,
    // Every key here is equally suited to scale practice, so there's no
    // "preferred" key worth starring — unlike a tune, which usually has one
    // key it's best played in.
    defaultTempo: 120, keys: SCALE_KEYS, defaultKey: "G3", showDefaultKeyStar: false, repeats,
    timeSignature: "4/4",
    melody: { measures: melodyMeasures },
    harmony: { measures: harmonyMeasures },
  };
}

// The three passes of the quarter-note scale variation, built from one
// degree sequence so melody and harmony (thirds below) share the shape:
// two quarters per note, then quarter+rest per note, then one quarter per note.
function quarterNoteSections(degrees) {
  const measures = [];
  for (let i = 0; i < degrees.length; i += 2) {
    measures.push([N(degrees[i]), N(degrees[i]), N(degrees[i + 1]), N(degrees[i + 1])]);
  }
  for (let i = 0; i < degrees.length; i += 2) {
    measures.push([N(degrees[i]), R(), N(degrees[i + 1]), R()]);
  }
  for (let i = 0; i < degrees.length; i += 4) {
    measures.push([N(degrees[i]), N(degrees[i + 1]), N(degrees[i + 2]), N(degrees[i + 3])]);
  }
  return measures;
}

// Traditional Scottish air, transcribed in MuseScore (D major) and
// converted from its MusicXML export.
const AULD_LANG_SYNE = {
  id: "auld-lang-syne", group: "Tunes", title: "Auld Lang Syne", sub: "traditional",
  defaultTempo: 80, keys: ["D4"], defaultKey: "D4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [R("hd"), N(-3, "q")], // pickup
    [N(0, "qd", true), N(-1, "8"), N(0, "q"), N(2, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(2, "q")],
    [N(0, "qd"), N(0, "8"), N(2, "q"), N(4, "q")],
    [N(5, "hd"), N(5, "q")],
    [N(4, "qd"), N(2, "8"), N(2, "q"), N(0, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(2, "q")],
    [N(0, "qd", true), N(-2, "8"), N(-2, "q"), N(-3, "q")],
    [N(0, "hd"), N(5, "q")],
    [N(4, "qd", true), N(2, "8"), N(2, "q"), N(0, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(5, "q")],
    [N(4, "qd", true), N(2, "8"), N(2, "q"), N(4, "q")],
    [N(5, "hd"), N(5, "q")],
    [N(4, "qd", true), N(2, "8"), N(2, "q"), N(0, "q")],
    [N(1, "qd", true), N(0, "8"), N(1, "q"), N(2, "q")],
    [N(0, "qd"), N(-2, "8"), N(-2, "q"), N(-3, "q")],
    [N(0, "hd"), R("q")],
  ] },
};

const CAROLINA_BREEZE = {
  id: "carolina-breeze", group: "Introductory songs", title: "Carolina Breeze", source: "Essential Elements",
  defaultTempo: 120, keys: ["G3", "D4", "A4", "E5"], defaultKey: "D4",
  repeats: [{ from: 0, to: 3 }],
  timeSignature: "4/4",
  melody: { measures: [
    [N(3, "q"), N(3, "q"), N(2, "q"), N(2, "q")],
    [N(1, "q"), N(1, "q"), N(0, "q"), R("q")],
    [N(3, "q"), N(3, "q"), N(2, "q"), N(2, "q")],
    [N(1, "q"), N(2, "q"), N(3, "q"), R("q")],
  ] },
};

const MATTHEWS_MARCH = {
  id: "matthews-march", group: "Introductory songs", title: "Matthew's March", source: "Essential Elements",
  defaultTempo: 100, keys: ["G3", "D4", "A4"], defaultKey: "D4",
  repeats: [{ from: 0, to: 7 }],
  timeSignature: "4/4",
  melody: { measures: [
    [N(7, "q"), N(7, "q"), N(6, "q"), N(6, "q")],
    [N(7, "q"), N(7, "q"), N(4, "q"), R("q")],
    [N(7, "q"), N(7, "q"), N(6, "q"), N(6, "q")],
    [N(7, "q"), N(5, "q"), N(4, "q"), R("q")],
    [N(3, "q"), N(3, "q"), N(4, "q"), N(3, "q")],
    [N(2, "q"), N(2, "q"), N(3, "q"), N(2, "q")],
    [N(1, "q"), N(1, "q"), N(4, "q"), N(1, "q")],
    [N(0, "q"), N(0, "q"), N(0, "q"), R("q")],
  ] },
};

const CHRISTOPHERS_TUNE = {
  id: "christophers-tune", group: "Introductory songs", title: "Christopher's Tune", source: "Essential Elements",
  defaultTempo: 100, keys: ["G3", "D4", "A4"], defaultKey: "D4",
  repeats: [{ from: 0, to: 7 }],
  timeSignature: "4/4",
  melody: { measures: [
    [N(0, "q"), N(2, "q"), N(0, "q"), N(2, "q")],
    [N(1, "q"), N(2, "q"), N(3, "q"), R("q")],
    [N(1, "q"), N(3, "q"), N(1, "q"), N(3, "q")],
    [N(2, "q"), N(3, "q"), N(4, "q"), R("q")],
    [N(2, "q"), N(4, "q"), N(2, "q"), N(4, "q")],
    [N(3, "q"), N(4, "q"), N(5, "q"), R("q")],
    [N(4, "q"), N(4, "q"), N(5, "q"), N(4, "q")],
    [N(5, "q"), N(6, "q"), N(7, "q"), R("q")],
  ] },
};

const FOR_PETES_SAKE = {
  id: "for-petes-sake", group: "Introductory songs", title: "For Pete's Sake", source: "Essential Elements",
  defaultTempo: 100, keys: ["D4", "G3", "A4"], defaultKey: "D4", repeats: [],
  timeSignature: "2/4",
  melody: { measures: [
    [N(0, "q"), N(0, "q")],
    [N(2, "q"), N(2, "q")],
    [N(1, "q"), N(1, "8"), N(2, "8")],
    [N(1, "q"), R("q")],
    [N(1, "q"), N(1, "q")],
    [N(3, "q"), N(3, "q")],
    [N(2, "q"), N(2, "8"), N(3, "8")],
    [N(2, "q"), R("q")],
    [N(2, "q"), N(2, "q")],
    [N(4, "q"), N(4, "q")],
    [N(5, "8"), N(5, "8"), N(6, "8"), N(6, "8")],
    [N(7, "q"), N(4, "q")],
    [N(5, "q"), N(4, "q")],
    [N(3, "q"), N(1, "q")],
    [N(4, "q"), N(4, "8"), N(5, "8")],
    [N(4, "q"), R("q")],
    [N(0, "q"), N(0, "q")],
    [N(2, "q"), N(2, "q")],
    [N(1, "q"), N(1, "8"), N(2, "8")],
    [N(1, "q"), R("q")],
    [N(1, "q"), N(1, "q")],
    [N(3, "q"), N(3, "q")],
    [N(2, "q"), N(2, "8"), N(3, "8")],
    [N(2, "q"), R("q")],
    [N(2, "q"), N(2, "q")],
    [N(4, "q"), N(4, "q")],
    [N(5, "8"), N(5, "8"), N(6, "8"), N(6, "8")],
    [N(7, "q"), N(4, "q")],
    [N(5, "q"), N(4, "q")],
    [N(3, "q"), N(1, "q")],
    [N(0, "8"), N(0, "8"), N(1, "8"), N(1, "8")],
    [N(0, "q"), R("q")],
  ] },
};

const GRANDPARENTS_DAY = {
  id: "grandparents-day", group: "Introductory songs", title: "Grandparent's Day", source: "Essential Elements",
  defaultTempo: 120, keys: ["D4", "G3", "A4"], defaultKey: "D4",
  repeats: [{ from: 0, to: 7 }],
  timeSignature: "4/4",
  melody: { measures: [
    [N(0, "q"), N(0, "q"), N(2, "q"), N(2, "8"), N(2, "8")],
    [N(0, "q"), N(0, "q"), N(4, "h")],
    [N(0, "q"), N(0, "q"), N(2, "q"), N(2, "8"), N(2, "8")],
    [N(0, "q"), N(2, "q"), N(1, "h")],
    [N(0, "q"), N(0, "q"), N(2, "q"), N(2, "8"), N(2, "8")],
    [N(0, "q"), N(0, "q"), N(4, "h")],
    [N(0, "q"), N(0, "q"), N(2, "q"), N(0, "8"), N(0, "8")],
    [N(2, "q"), N(1, "8"), N(1, "8"), N(0, "h")],
  ] },
};

const MICHAEL_ROW = {
  id: "michael-row", group: "Introductory songs", title: "Michael Row The Boat Ashore", source: "Essential Elements",
  defaultTempo: 100, keys: ["D4", "G3", "A4"], defaultKey: "D4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [R("h"), N(0, "q"), N(2, "q")], // pickup
    [N(4, "q"), N(2, "q"), N(4, "q"), N(5, "q")],
    [N(4, "h"), N(2, "q"), N(4, "q")],
    [N(5, "h"), N(5, "h")],
    [N(4, "h"), N(2, "q"), N(4, "q")],
    [N(4, "q"), N(2, "q"), N(3, "q"), N(2, "q")],
    [N(1, "h"), N(0, "q"), N(1, "q")],
    [N(2, "h"), N(1, "h")],
    [N(0, "h"), N(0, "q"), N(2, "q")],
    [N(4, "q"), N(2, "q"), N(4, "q"), N(5, "q")],
    [N(4, "h"), N(2, "q"), N(4, "q")],
    [N(5, "h"), N(5, "h")],
    [N(4, "h"), N(2, "q"), N(4, "q")],
    [N(4, "q"), N(2, "q"), N(3, "q"), N(2, "q")],
    [N(1, "h"), N(0, "q"), N(1, "q")],
    [N(2, "h"), N(1, "h")],
    [N(0, "h"), R("h")],
  ] },
};

const TEXAS_TWO_STRING = {
  id: "texas-two-string", group: "Introductory songs", title: "Texas Two-String", source: "Essential Elements",
  defaultTempo: 100, keys: ["D4", "A4", "E5"], defaultKey: "D4",
  repeats: [{ from: 0, to: 7 }],
  note: "Use your 4th finger for both notes.",
  timeSignature: "4/4",
  melody: { measures: [
    [N(4, "q"), N(4, "q"), R("h")],
    [N(0, "q"), N(0, "q"), R("h")],
    [N(4, "q"), N(4, "q"), R("h")],
    [N(0, "q"), N(0, "q"), R("h")],
    [N(4, "q"), N(4, "q"), N(4, "q"), R("q")],
    [N(0, "q"), N(0, "q"), N(0, "q"), R("q")],
    [N(4, "q"), N(4, "q"), N(4, "q"), N(4, "q")],
    [N(0, "q"), N(0, "q"), N(0, "q"), N(0, "q")],
  ] },
};

const ODE_TO_JOY = {
  id: "ode-to-joy", group: "Introductory songs", title: "Ode to Joy", source: "Essential Elements",
  defaultTempo: 100, keys: ["D4", "G3", "A4"], defaultKey: "D4",
  repeats: [],
  note: "Use your 4th finger for the 5th note (dominant) to exercise your pinky.",
  timeSignature: "4/4",
  melody: { measures: [
    [N(2, "q"), N(2, "q"), N(3, "q"), N(4, "q")],
    [N(4, "q"), N(3, "q"), N(2, "q"), N(1, "q")],
    [N(0, "q"), N(0, "q"), N(1, "q"), N(2, "q")],
    [N(2, "h"), N(1, "h")],
    [N(2, "q"), N(2, "q"), N(3, "q"), N(4, "q")],
    [N(4, "q"), N(3, "q"), N(2, "q"), N(1, "q")],
    [N(0, "q"), N(0, "q"), N(1, "q"), N(2, "q")],
    [N(1, "h"), N(0, "h")],
    [N(1, "h"), N(2, "q"), N(0, "q")],
    [N(1, "q"), N(2, "8"), N(3, "8"), N(2, "q"), N(0, "q")],
    [N(1, "q"), N(2, "8"), N(3, "8"), N(2, "q"), N(1, "q")],
    [N(0, "q"), N(1, "q"), N(4, "h")],
    [N(2, "q"), N(2, "q"), N(3, "q"), N(4, "q")],
    [N(4, "q"), N(3, "q"), N(2, "q"), N(1, "q")],
    [N(0, "q"), N(0, "q"), N(1, "q"), N(2, "q")],
    [N(1, "h"), N(0, "h")],
  ] },
};

const BOIL_EM_CABBAGE_DOWN = {
  id: "boil-em-cabbage-down", group: "Introductory songs", title: "Boil 'Em Cabbage Down", source: "Essential Elements",
  defaultTempo: 120, keys: ["D4", "G3", "A4", "E5"], defaultKey: "D4",
  repeats: [{ from: 0, to: 7 }],
  timeSignature: "4/4",
  melody: { measures: [
    [N(2, "q"), N(2, "8"), N(2, "8"), N(2, "q"), N(2, "8"), N(2, "8")],
    [N(3, "q"), N(3, "8"), N(3, "8"), N(3, "q"), N(3, "8"), N(3, "8")],
    [N(2, "q"), N(2, "8"), N(2, "8"), N(2, "q"), N(2, "8"), N(2, "8")],
    [N(1, "q"), N(1, "8"), N(1, "8"), N(1, "q"), N(1, "8"), N(1, "8")],
    [N(2, "q"), N(2, "8"), N(2, "8"), N(2, "q"), N(2, "8"), N(2, "8")],
    [N(3, "q"), N(3, "8"), N(3, "8"), N(3, "q"), N(3, "8"), N(3, "8")],
    [N(2, "q"), N(2, "8"), N(2, "8"), N(1, "q"), N(1, "8"), N(1, "8")],
    [N(0, "q"), N(0, "8"), N(0, "8"), N(0, "q"), R("q")],
  ] },
  // repeated open-string drone on the 5th — the Essential Elements accompaniment
  harmony: { measures: [
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), N(4, "8"), N(4, "8")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(4, "q"), R("q")],
  ] },
};

const FRERE_JACQUES = {
  id: "frere-jacques", group: "Introductory songs", title: "Frère Jacques", source: "Essential Elements",
  defaultTempo: 100, keys: ["D4", "G3", "A4"], defaultKey: "D4",
  repeats: [{ from: 0, to: 15 }],
  timeSignature: "2/4",
  melody: { measures: [
    [N(0, "q"), N(1, "q")],
    [N(2, "q"), N(0, "q")],
    [N(0, "q"), N(1, "q")],
    [N(2, "q"), N(0, "q")],
    [N(2, "q"), N(3, "q")],
    [N(4, "h")],
    [N(2, "q"), N(3, "q")],
    [N(4, "h")],
    [N(4, "8"), N(5, "8"), N(4, "8"), N(3, "8")],
    [N(2, "q"), N(0, "q")],
    [N(4, "8"), N(5, "8"), N(4, "8"), N(3, "8")],
    [N(2, "q"), N(0, "q")],
    [N(0, "q"), N(4, "q")],
    [N(0, "h")],
    [N(0, "q"), N(4, "q")],
    [N(0, "h")],
  ] },
};

const BUCKEYE_SALUTE = {
  id: "buckeye-salute", group: "Introductory songs", title: "Buckeye Salute", source: "Essential Elements",
  defaultTempo: 100, keys: ["D4", "G3", "A4"], defaultKey: "D4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [N(7, "q"), N(7, "8"), N(7, "8"), N(6, "8"), N(6, "8"), N(6, "q")],
    [N(5, "8"), N(5, "8"), N(5, "8"), N(5, "8"), N(4, "q"), N(2, "q")],
    [N(3, "q"), N(3, "8"), N(3, "8"), N(2, "8"), N(2, "8"), N(0, "q")],
    [N(1, "8"), N(1, "8"), N(1, "8"), N(1, "8"), N(0, "q"), R("q")],
    [N(0, "q"), N(0, "8"), N(0, "8"), N(1, "8"), N(1, "8"), N(1, "q")],
    [N(2, "8"), N(2, "8"), N(2, "8"), N(2, "8"), N(3, "q"), N(5, "q")],
    [N(4, "q"), N(4, "8"), N(4, "8"), N(5, "8"), N(5, "8"), N(7, "q")],
    [N(6, "8"), N(6, "8"), N(6, "8"), N(6, "8"), N(7, "q"), R("q")],
  ] },
};

const JINGLE_BELLS = {
  id: "jingle-bells", group: "Introductory songs", title: "Jingle Bells", source: "Essential Elements",
  defaultTempo: 120, keys: ["D4", "G3", "A4"], defaultKey: "D4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [N(2, "q"), N(2, "q"), N(2, "q"), R("q")],
    [N(2, "q"), N(2, "q"), N(2, "q"), R("q")],
    [N(2, "q"), N(4, "q"), N(0, "q"), N(1, "q")],
    [N(2, "q"), R("hd")],
    [N(3, "q"), N(3, "q"), N(3, "q"), N(3, "q")],
    [N(3, "q"), N(2, "q"), N(2, "q"), N(2, "q")],
    [N(2, "q"), N(1, "q"), N(1, "q"), N(2, "q")],
    [N(1, "q"), R("q"), N(4, "q"), R("q")],
    [N(2, "q"), N(2, "q"), N(2, "q"), R("q")],
    [N(2, "q"), N(2, "q"), N(2, "q"), R("q")],
    [N(2, "q"), N(4, "q"), N(0, "q"), N(1, "q")],
    [N(2, "q"), R("hd")],
    [N(3, "q"), N(3, "q"), N(3, "q"), N(3, "q")],
    [N(3, "q"), N(2, "q"), N(2, "q"), N(2, "q")],
    [N(4, "q"), N(4, "q"), N(3, "q"), N(1, "q")],
    [N(0, "q"), R("hd")],
  ] },
};

const OLD_MACDONALD = {
  id: "old-macdonald", group: "Introductory songs", title: "Old MacDonald", source: "Essential Elements",
  defaultTempo: 110, keys: ["D4", "G3", "A4"], defaultKey: "D4",
  repeats: [{ from: 0, to: 3 }],
  timeSignature: "4/4",
  melody: { measures: [
    [N(3, "q"), N(3, "q"), N(3, "q"), N(0, "q")],
    [N(1, "q"), N(1, "q"), N(0, "q"), R("q")],
    [N(5, "q"), N(5, "q"), N(4, "q"), N(4, "q")],
    [N(3, "q"), R("h"), N(0, "q")],
    [N(3, "q"), N(3, "q"), N(3, "q"), R("q")],
    [N(3, "q"), N(3, "q"), N(3, "q"), R("q")],
    [N(3, "q"), N(3, "q"), N(3, "q"), N(3, "q")],
    [N(3, "q"), N(3, "q"), N(3, "q"), N(0, "q")],
    [N(3, "q"), N(3, "q"), N(3, "q"), N(0, "q")],
    [N(1, "q"), N(1, "q"), N(0, "q"), R("q")],
    [N(5, "q"), N(5, "q"), N(4, "q"), N(4, "q")],
    [N(3, "q"), N(3, "hd")],
  ] },
};

const HOT_CROSS_BUNS = {
  id: "hot-cross-buns", group: "Introductory songs", title: "Hot Cross Buns", sub: "with rests", source: "Essential Elements",
  defaultTempo: 100, keys: ["G3", "D4", "A4", "E5"], defaultKey: "A4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [N(2, "q"), R("q"), N(1, "q"), R("q")],
    [N(0, "q"), R("hd")],
    [N(2, "q"), R("q"), N(1, "q"), R("q")],
    [N(0, "q"), R("hd")],
    [N(0, "q"), N(0, "q"), N(0, "q"), N(0, "q")],
    [N(1, "q"), N(1, "q"), N(1, "q"), N(1, "q")],
    [N(2, "q"), R("q"), N(1, "q"), R("q")],
    [N(0, "q"), R("hd")],
  ] },
};

const MOZART_MELODY = {
  id: "mozart-melody", group: "Introductory songs", title: "A Mozart Melody", source: "Essential Elements",
  defaultTempo: 100, keys: ["G3", "D4", "A4"], defaultKey: "D4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    [N(0, "q"), N(0, "q"), N(4, "q"), N(4, "q")],
    [N(5, "q"), N(5, "q"), N(4, "q"), R("q")],
    [N(3, "q"), N(3, "q"), N(2, "q"), N(2, "q")],
    [N(1, "q"), N(1, "q"), N(0, "q"), R("q")],
    [N(4, "q"), N(4, "q"), N(3, "q"), N(3, "q")],
    [N(2, "q"), N(2, "q"), N(1, "q"), R("q")],
    [N(4, "q"), N(4, "q"), N(3, "q"), N(3, "q")],
    [N(2, "q"), N(2, "q"), N(1, "q"), R("q")],
    [N(0, "q"), N(0, "q"), N(4, "q"), N(4, "q")],
    [N(5, "q"), N(5, "q"), N(4, "q"), R("q")],
    [N(3, "q"), N(3, "q"), N(2, "q"), N(2, "q")],
    [N(1, "q"), N(1, "q"), N(0, "q"), R("q")],
  ] },
};

const BOW_WARMUP = {
  id: "bow-warmup", group: "Warmups", title: "Beginner Bow Warmup", sub: "open strings only",
  defaultTempo: 120, keys: ["C4"], defaultKey: "C4", repeats: [],
  timeSignature: "4/4",
  melody: { measures: [
    // whole notes: G G D D A A E E
    [N(OPEN_G, "w")], [N(OPEN_G, "w")], [N(OPEN_D, "w")], [N(OPEN_D, "w")],
    [N(OPEN_A, "w")], [N(OPEN_A, "w")], [N(OPEN_E, "w")], [N(OPEN_E, "w")],
    // half notes: E E A A D D G G
    [N(OPEN_E, "h"), N(OPEN_E, "h")], [N(OPEN_A, "h"), N(OPEN_A, "h")],
    [N(OPEN_D, "h"), N(OPEN_D, "h")], [N(OPEN_G, "h"), N(OPEN_G, "h")],
    // quarter notes, 4x each: G D A E A D
    [N(OPEN_G, "q"), N(OPEN_G, "q"), N(OPEN_G, "q"), N(OPEN_G, "q")],
    [N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q")],
    [N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q")],
    [N(OPEN_E, "q"), N(OPEN_E, "q"), N(OPEN_E, "q"), N(OPEN_E, "q")],
    [N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_A, "q")],
    [N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_D, "q")],
    // mixed quarter/half phrases
    [N(OPEN_G, "q"), N(OPEN_G, "q"), N(OPEN_D, "h")],
    [N(OPEN_A, "q"), N(OPEN_A, "q"), N(OPEN_E, "h")],
    [N(OPEN_E, "q"), N(OPEN_E, "q"), N(OPEN_A, "h")],
    [N(OPEN_D, "q"), N(OPEN_D, "q"), N(OPEN_G, "h")],
    [N(OPEN_G, "h"), N(OPEN_D, "q"), N(OPEN_D, "q")],
    [N(OPEN_A, "h"), N(OPEN_E, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "h"), N(OPEN_A, "q"), N(OPEN_A, "q")],
    [N(OPEN_D, "h"), N(OPEN_G, "q"), N(OPEN_G, "q")],
    // quarter-note phrases, 4 beats each
    [N(OPEN_G, "q"), N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_G, "q")],
    [N(OPEN_G, "q"), N(OPEN_D, "q"), N(OPEN_G, "q"), N(OPEN_D, "q")],
    [N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q")],
    [N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_D, "q")],
    [N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q")],
    [N(OPEN_A, "q"), N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_G, "q")],
    [N(OPEN_G, "q"), N(OPEN_D, "q"), N(OPEN_A, "q"), N(OPEN_E, "q")],
    [N(OPEN_E, "q"), N(OPEN_A, "q"), N(OPEN_D, "q"), N(OPEN_A, "q")],
  ] },
};

const SONGS = [
  BOW_WARMUP,

  scaleSong("var1", "Half Notes Var. 1", null,
    [
      ...UPDOWN.map((d) => [N(d, "h"), N(d, "h")]),
      ...(() => {
        const m = [];
        for (let i = 0; i < UPDOWN.length; i += 2) m.push([N(UPDOWN[i], "h"), N(UPDOWN[i + 1], "h")]);
        return m;
      })(),
    ],
    [
      ...UPDOWN.map((d) => [N(THIRD_BELOW(d), "h"), N(THIRD_BELOW(d), "h")]),
      ...(() => {
        const m = [];
        for (let i = 0; i < UPDOWN.length; i += 2) {
          m.push([N(THIRD_BELOW(UPDOWN[i]), "h"), N(THIRD_BELOW(UPDOWN[i + 1]), "h")]);
        }
        return m;
      })(),
    ],
    // two independent repeated sections: the double-half-notes-per-note
    // pass (measures 0-15), then the one-half-note-per-note pass (16-23)
    [{ from: 0, to: UPDOWN.length - 1 }, { from: UPDOWN.length, to: UPDOWN.length + UPDOWN.length / 2 - 1 }]),

  scaleSong("var2", "Quarter Notes Var. 2", null,
    quarterNoteSections(UPDOWN),
    quarterNoteSections(UPDOWN.map(THIRD_BELOW)),
    // each section repeats: two-quarters-per-note (0-7), note-then-rest (8-15),
    // one-quarter-per-note (16-19)
    [
      { from: 0, to: UPDOWN.length / 2 - 1 },
      { from: UPDOWN.length / 2, to: UPDOWN.length - 1 },
      { from: UPDOWN.length, to: UPDOWN.length + UPDOWN.length / 4 - 1 },
    ]),

  HOT_CROSS_BUNS,
  CAROLINA_BREEZE,
  MATTHEWS_MARCH,
  CHRISTOPHERS_TUNE,
  JINGLE_BELLS,
  OLD_MACDONALD,
  MOZART_MELODY,
  BUCKEYE_SALUTE,
  FOR_PETES_SAKE,
  GRANDPARENTS_DAY,
  MICHAEL_ROW,
  TEXAS_TWO_STRING,
  ODE_TO_JOY,
  FRERE_JACQUES,
  BOIL_EM_CABBAGE_DOWN,
  AULD_LANG_SYNE,
];

const ids = new Set();
for (const s of SONGS) {
  if (ids.has(s.id)) throw new Error(`duplicate song id "${s.id}"`);
  ids.add(s.id);
  assertSupportedTimeSignature(s);
  assertFullMeasures(s);
  const lastMeasure = s.melody.measures.length - 1;
  let prevTo = -1;
  for (const r of s.repeats) {
    if (r.from > r.to || r.from <= prevTo || r.to > lastMeasure) {
      throw new Error(`Song "${s.title}" has an invalid repeat range {from: ${r.from}, to: ${r.to}} — ranges must be ascending, in bounds (0-${lastMeasure}), and non-overlapping`);
    }
    prevTo = r.to;
  }
}

mkdirSync(outDir, { recursive: true });

// Drops fields a song simply doesn't have (e.g. a null `sub`) from the output.
const dropNulls = (k, v) => v ?? undefined;

const catalog = SONGS.map(({ id, group, title, sub, source, timeSignature }) => ({ id, group, title, sub, source, timeSignature }));
writeFileSync(join(outDir, "catalog.json"), JSON.stringify(catalog, dropNulls, 2) + "\n");

// `id` stays in the song file (not just the filename) — the app uses it for
// per-song preferences after the song is loaded.
for (const song of SONGS) {
  writeFileSync(join(outDir, `${song.id}.json`), JSON.stringify(song, dropNulls, 2) + "\n");
}

console.log(`wrote catalog.json + ${SONGS.length} song file(s) to ${outDir}`);
