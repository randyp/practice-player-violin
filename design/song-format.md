# Song format

A **song** is a self-contained musical exercise or tune: one or more
**parts** (melody, harmony) sharing a time signature, a set of playable
keys, and a default tempo. This doc defines the data shape and the
reasoning behind it.

## Design principles

- **A song owns notes, keys, and tempo. It does not own playback
  preferences.** Whether melody is currently audible, which part is
  shown on the staff, synth-vs-recording — all of that is player/user
  state, not song data. A song answers "what is this piece," not "how is
  the user currently experiencing it." (See [Non-goals](#non-goals-for-v1).)
- **Every song has a canonical key and tempo.** This is the pitch/tempo a
  professional recording is made at. All other supported keys/tempos are
  reached by transposing/time-stretching from that canonical performance
  (recordings) or by re-synthesizing at the target pitch/tempo (synth) —
  the song never needs a separate recording per key.
- **Parts are independent musical lines, not mix settings.** Melody and
  harmony can have different rhythms, different rest patterns — they are
  not required to line up note-for-note. Each part is a self-contained
  sequence of measures.

## Schema

```ts
Song = {
  // -- identity / grouping --
  id: string,             // catalog id, also the JSON filename (e.g. "hot-cross-buns")
  group: string,          // menu section, e.g. "Introductory songs", "Tunes"
  title: string,          // e.g. "Hot Cross Buns"
  sub?: string,           // subtitle shown after title, e.g. "with rests"
  source?: string,        // where the arrangement comes from, e.g. "Essential Elements"
  note?: string,          // practice note shown above the sheet music,
                          // e.g. "Use your 4th finger for both notes."

  // -- keys --
  keys: string[],         // playable keys as KEYS ids (letter+octave, e.g. ["G3", "D4"]) —
                          // must include defaultKey
  defaultKey: string,     // the canonical key: what a recording is performed in
  showDefaultKeyStar?: boolean,
                          // default true: the key dropdown marks defaultKey with ★ as the
                          // preferred key; false for songs (e.g. scale exercises) where
                          // every key is equally suited
  tonics?: { [key]: midiNumber },
                          // per-key tonic override, for songs whose melody range
                          // requires a specific octave in a non-default key
                          // (see "Auld Lang Syne" case below)

  // -- tempo --
  defaultTempo: number,   // BPM: the canonical tempo a recording is performed at
                          // (tempo slider range/step is a player concern, not song data)

  // -- form --
  timeSignature: string,  // e.g. "4/4" — only "N/4" signatures are implemented, see below
  pickup: number,         // beats of pickup before beat 1 (0 = none)
  repeats: { from: number, to: number }[],
                          // repeated sections as inclusive measure-index ranges, ascending
                          // and non-overlapping; each plays twice (both parts repeat together)

  // -- parts (fixed: exactly these two keys, harmony optional) --
  melody: Part,
  harmony?: Part,
}

Part = {
  measures: Measure[],    // this part's own measures — independent rhythm from other parts
  recording?: Recording,  // present if a professional recording exists for this part
}

Measure = NoteEvent[]     // { deg, dur, slur?: true } | { rest: true, dur }
                          // slur means "slurred to the following note" and is only
                          // present when true

Recording = {
  src: string,            // URL/path to the audio file
  key: string,            // key the recording was performed in — MUST equal Song.defaultKey
  tempo: number,          // tempo the recording was performed at — MUST equal Song.defaultTempo
}
```

### Why `keys`/`defaultKey`/`tonics` look the way they do

Keys are identified by letter + octave (`"D4"`, not `"D"`) so the
tonic's octave is explicit everywhere a key is referenced — the display
hides the octave digit. `defaultKey` is also the key a `Recording` must
be performed in, so pitch-shifting always starts from one known-good
source rather than needing per-key recordings.

`tonics` is an override map because some melodies have a range that
only fits the violin/staff in a specific octave per key — e.g. "Auld
Lang Syne" dips a 4th below its tonic, so in G it must sit an octave
higher than the naive `KEYS.G3.tonic` to avoid going below the open G
string. That's a per-song, per-key concern independent of parts, so it
stays at the song level, not duplicated per part.

### Why `timeSignature` only accepts `"N/4"`

Every duration in the app (`theory.js`'s `BEATS`) and the `beat_value`
passed to VexFlow's `Voice` are quarter-note-based, so any simple
signature with a quarter-note beat (4/4, 2/4, 3/4…) works — the beat-dot
count, count-in, and measures-per-line all derive from
`beatsPerMeasure()`. Compound signatures like 6/8 would silently
mis-render and mis-count, so `assertSupportedTimeSignature` fails loudly
on them, at generation time and again at load time.

### Why parts are fixed (`melody` / `harmony`), not an open list

Two named slots, not `parts: []`. Every song in the library today is
either melody-only or melody+harmony; an open-ended list would be
speculative generality with no current use, and adding a third part
later is a small, explicit schema change if it's ever needed — not a
breaking migration, since `melody`/`harmony` stay as-is and a new named
slot is additive.

### Why `harmony` has its own `measures`, not notes-per-melody-event

Harmony is frequently rhythmically independent of melody (a sustained
whole note under a moving melodic line, a different rest pattern, etc).
Attaching a harmony note to each melody event would force them to share
durations, which is wrong more often than it's right. Each part is a
complete, independent sequence of measures; the player is responsible
for playing them on a shared clock (shared tempo, shared pickup, shared
repeats), not for aligning their internal event counts.

### Why `Recording` lives on the `Part`, not the `Song`

Melody and harmony are different instrumental lines and may be recorded
(or not) independently — e.g. a song could ship a real melody recording
with only a synthesized harmony. Scoping `recording` to the part keeps
"does this line have real audio" a per-line fact.

## Non-goals for v1

These are explicitly **not** part of the song schema — they're player/
session state, decided per your direction that defaults here come from
user preference or last-used-per-song, not from the song definition:

- Which part is currently **shown** on the staff (the Part dropdown).
- Whether melody/harmony is currently **audible** (the Play checkboxes).
- Whether an audible part plays from its **recording or synth**.

The player tracks these as UI/session state, the same way the
Metronome/Count-in/Loop toggles are session state and not part of
`Song`. What *is* persisted (count-in length, last song, last key per
song) lives in `src/lib/prefs.js`, not in song data.

## Explicitly deferred: recording playback engine

This doc defines *what a `Recording` reference looks like*
(`src`/`key`/`tempo`), not *how it gets pitch-shifted and time-stretched*
to an arbitrary user-selected key/tempo at playback time. That's a real
DSP problem (formant-preserving pitch shift, transient-preserving time
stretch) worth its own design pass — likely built on Tone.js's
`GrainPlayer`/`PitchShift` or a dedicated library — once at least one
real recording exists to test against. Until then, synth playback (today's
behavior) remains the only implemented path; `Recording` fields can be
authored but the player will not yet act on them.
