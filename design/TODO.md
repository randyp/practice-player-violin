# TODO / roadmap

Open design problems, captured for later brainstorming — not yet
scoped, not yet planned. Each of these deserves its own design pass
(see [song-format.md](song-format.md) for the depth we go into once an
item is actually being built).

## 1. Marketplace: browse and save, or add custom songs

Users should be able to browse a catalog of songs beyond what ships in
`songs.js`, save the ones they want, and also author/add their own
custom songs. Open questions: where the catalog lives, how "saving" a
song works without an account system, what a user-authored song needs
to provide vs. what today's `Song` schema already requires.

## 2. Backend-free implementation

Whatever gets built for the marketplace, preferences, and recordings
must not require a server this project operates. Static hosting
(GitHub Pages) and client-side storage/computation only. This is a
constraint on every other item here, not a standalone feature.

## 3. Recordings with client-side tempo/key resampling

Songs should be able to ship a real (professional) recording per
voice, per [song-format.md](song-format.md)'s deferred `Recording`
type, and have the frontend pitch-shift/time-stretch that recording to
match the user's chosen key/tempo at playback — instead of, or as an
alternative to, synth playback. Alternatively, ship one recording per
key rather than resampling pitch. Open questions: resampling DSP
approach (Tone.js `GrainPlayer`/`PitchShift` vs. a dedicated library),
quality trade-offs of resampling vs. per-key recordings, how large the
audio assets get for static hosting.

## 4. User preferences: global and per-song

Persist user preferences (e.g. metronome/count-in/loop defaults, last
key/tempo used per song, melody/harmony play/visibility choices — see
song-format.md's [Non-goals](song-format.md#non-goals-for-v1)) across
sessions, both as global defaults and per-song overrides. Backend-free
per item 2, so this is client-side storage (e.g. `localStorage`) —
exact shape TBD. Starting with global preferences first.

### Count-in length (global preference)

User-configurable count-in of **1 or 2 measures** (not a raw beat
count). Count-in convention is generally "1 or 2 measures of the
piece's own meter," not a fixed number of beats — e.g. 4 or 8 beats in
4/4, but 3 or 6 in 3/4, 6 or 12 in 6/8. Storing the preference as
measures and deriving the beat count from the song's `timeSignature`
at playback time keeps this correct today (4/4-only) and automatically
correct if other time signatures are ever implemented, with no later
migration. Today's `countIn` boolean (on/off) becomes a measures count
(0 = off, 1, or 2).
