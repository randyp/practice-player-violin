# Song format

A **song** is a self-contained musical exercise or tune: one or more
**voices** (melody, harmony) sharing a time signature, a set of playable
keys, and a default tempo. This doc defines the data shape and the
reasoning behind it, ahead of implementing recorded-audio playback and
per-voice visibility/audio controls.

## Design principles

- **A song owns notes, keys, and tempo. It does not own playback
  preferences.** Whether melody is currently audible, whether harmony is
  shown on the staff, synth-vs-recording — all of that is player/user
  state, not song data. A song answers "what is this piece," not "how is
  the user currently experiencing it." (See [Non-goals](#non-goals-for-v1).)
- **Every song has a canonical key and tempo.** This is the pitch/tempo a
  professional recording is made at. All other supported keys/tempos are
  reached by transposing/time-stretching from that canonical performance
  (recordings) or by re-synthesizing at the target pitch/tempo (synth) —
  the song never needs a separate recording per key.
- **Voices are independent musical lines, not mix settings.** Melody and
  harmony can have different rhythms, different rest patterns, different
  numbers of measures-per-line — they are not required to line up
  note-for-note. Each voice is a self-contained sequence of measures.

## Schema

```ts
Song = {
  // -- identity / grouping --
  group: string,          // menu section, e.g. "Scale variations", "Tunes"
  title: string,          // e.g. "Var. 1 — Long tones"
  sub?: string,           // subtitle shown after title, e.g. "two half notes per note"

  // -- keys --
  keys: string[],         // playable keys, e.g. ["G", "D", "A"] — must include defaultKey
  defaultKey: string,     // the canonical key: what a recording is performed in
  tonics?: { [key]: midiNumber },
                          // per-key tonic override, for songs whose melody range
                          // requires a specific octave in a non-default key
                          // (see "Auld Lang Syne" case below)

  // -- tempo --
  defaultTempo: number,   // BPM: the canonical tempo a recording is performed at
                          // (tempo slider range/step is a player concern, not song data)

  // -- form --
  timeSignature: string,  // e.g. "4/4" — ONLY "4/4" IS IMPLEMENTED, see below
  pickup: number,         // beats of pickup before beat 1 (0 = none)
  repeat: boolean,        // whether this song has a repeat (both voices repeat together)

  // -- voices (fixed: exactly these two keys, harmony optional) --
  melody: Voice,
  harmony?: Voice,
}

Voice = {
  measures: Measure[],    // this voice's own measures — independent rhythm from other voices
  recording?: Recording,  // present if a professional recording exists for this voice
}

Measure = NoteEvent[]     // same event shape as today: { deg, dur, slur? } | { rest: true, dur }

Recording = {
  src: string,            // URL/path to the audio file
  key: string,            // key the recording was performed in — MUST equal Song.defaultKey
  tempo: number,          // tempo the recording was performed at — MUST equal Song.defaultTempo
}
```

### Why `keys`/`defaultKey`/`tonics` look the way they do

This is exactly today's shape (`keys`, `defKey` renamed to `defaultKey` for
clarity, `tonics`), unchanged in spirit. `defaultKey` additionally becomes
the key a `Recording` must be performed in, so pitch-shifting always
starts from one known-good source rather than needing per-key recordings.

`tonics` stays as an override map because some melodies have a range that
only fits the violin/staff in a specific octave per key — e.g. today's
"Auld Lang Syne" dips a 4th below its tonic, so in G it must sit an
octave higher than the naive `KEYS.G.tonic` to avoid going below the
open G string. That's a per-song, per-key concern independent of voices,
so it stays at the song level, not duplicated per voice.

### Why `defaultTempo` replaces `tempo`

Renamed only — today's field is already "the tempo this song opens at /
resets to via the Default-N button." Calling it `defaultTempo` makes
explicit that it's also the tempo a `Recording` is captured at, which
matters once recordings exist.

### Why `timeSignature` is in the schema but only `"4/4"` is accepted

The field exists now so every song explicitly declares its time
signature rather than leaving it an unstated assumption. But three
separate places in the player currently hardcode 4/4: the notation
renderer's `beat_value: 4` passed to VexFlow's `Voice`, the transport's
beat-dot indicator (exactly 4 dots, `% 4` arithmetic for which one lights
up), and the notation renderer's literal `"4/4"` time-signature glyph.
None of that has been generalized yet. Rather than accept a
`timeSignature` value that would silently mis-render or mis-count beats,
`songs.js` validates every song at module load and throws if
`timeSignature !== "4/4"` — a new time signature requires generalizing
those three places first, not just declaring the field on a song.

### Why voices are fixed (`melody` / `harmony`), not an open list

Two named slots, not `voices: []`. Every song in the library today is
either melody-only or melody+harmony; an open-ended list would be
speculative generality with no current use, and adding a third voice
later is a small, explicit schema change if it's ever needed — not a
breaking migration, since `melody`/`harmony` stay as-is and a new named
slot is additive.

### Why `harmony` has its own `measures`, not notes-per-melody-event

Harmony is frequently rhythmically independent of melody (a sustained
whole note under a moving melodic line, a different rest pattern, etc).
Attaching a harmony note to each melody event would force them to share
durations, which is wrong more often than it's right. Each voice is a
complete, independent sequence of measures; the player is responsible
for playing them on a shared clock (shared tempo, shared pickup, shared
repeat), not for aligning their internal event counts.

### Why `Recording` lives on the `Voice`, not the `Song`

Melody and harmony are different instrumental lines and may be recorded
(or not) independently — e.g. a song could ship a real melody recording
with only a synthesized harmony. Scoping `recording` to the voice keeps
"does this line have real audio" a per-line fact.

## Non-goals for v1

These are explicitly **not** part of the song schema — they're player/
session state, decided per your direction that defaults here come from
user preference or last-used-per-song, not from the song definition:

- Whether melody/harmony is currently **visible** on the staff.
- Whether melody/harmony is currently **audible**.
- Whether the audible voice plays from its **recording or synth**.

The player is expected to track these as UI/session state (e.g. "last
choice per song" or a single global preference), the same way today's
Metronome/Violin/Count-in/Repeats/Loop toggles are session state and not
part of `Song`.

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

## Migration from the current shape

Current `songs.js` entries look like:

```js
{ group, title, sub, tempo, keys, defKey, pickup, repeat, tonics?, measures }
```

Mapping to the new shape:

| old field  | new location              |
|------------|----------------------------|
| `tempo`    | `defaultTempo`             |
| `defKey`   | `defaultKey`               |
| `measures` | `melody.measures`          |
| (new)      | `harmony` (omitted = melody-only, same as today) |
| everything else | unchanged |

This migration has been applied to `src/lib/songs.js`. Both current
songs (Var. 1, Var. 2) also gained a `harmony` voice: a diatonic third
below melody, same rhythm — the standard treatment for harmonizing a
scale exercise, and the simplest case allowed by the "voices are
independent" principle above (nothing requires melody and harmony to
share rhythm, but here they happen to).

Visibility/audibility of each voice is exposed in the UI as four
checkboxes (Melody Play/Sheet music, Harmony Play/Sheet music) next to
the Tempo control — session state, not song data, per the non-goals
above. Playback for both voices currently uses the synth voice (see
[Explicitly deferred](#explicitly-deferred-recording-playback-engine));
no recordings exist yet.
