# TODO / roadmap

Open design problems, captured for later brainstorming — not yet
scoped, not yet planned. Each of these deserves its own design pass
(see [song-format.md](song-format.md) for the depth we go into once an
item is actually being built).

## 1. Marketplace: browse and save, or add custom songs

Users should be able to browse a catalog of songs beyond what ships in
`public/songs/`, save the ones they want, and also author/add their
own custom songs. Songs are already self-contained JSON files fetched
by id (see `src/lib/songs.js`), which is the groundwork this needs.

Browsing the marketplace and adding a song to a signed-in user's
personal library (backed by the Google Drive sign-in below) is designed
in [marketplace.md](marketplace.md). Still open beyond that doc:
authoring/uploading custom songs, editing/removing saved songs.

## 2. Backend-free implementation

Whatever gets built for the marketplace, preferences, and recordings
must not require a server this project operates. Static hosting
(GitHub Pages) and client-side storage/computation only. This is a
constraint on every other item here, not a standalone feature.

## 3. Recordings with client-side tempo/key resampling

Songs should be able to ship a real (professional) recording per
part, per [song-format.md](song-format.md)'s deferred `Recording`
type, and have the frontend pitch-shift/time-stretch that recording to
match the user's chosen key/tempo at playback — instead of, or as an
alternative to, synth playback. **Decided:** key/tempo changes are
done on the fly by the frontend (matches how synth playback already
works today — songs store scale-degree `deg` values, transposed live
via `degToMidi(tonic, deg)` for whichever key is selected; a recording
is one canonical performance, pitch-shifted/time-stretched at playback
rather than shipped as one file per key). Open questions: resampling
DSP approach (Tone.js `GrainPlayer`/`PitchShift` vs. a dedicated
library), quality trade-offs of on-the-fly resampling at extreme
key/tempo distances from the canonical recording, how large the audio
assets get for static hosting.

## 4. User preferences: global and per-song

Persist user preferences (e.g. metronome/count-in/loop defaults, last
key/tempo used per song, melody/harmony play/visibility choices — see
song-format.md's [Non-goals](song-format.md#non-goals-for-v1)) across
sessions, both as global defaults and per-song overrides. Backend-free
per item 2, so this is client-side storage (e.g. `localStorage`) —
exact shape TBD. Starting with global preferences first.

Count-in length is done (see `src/lib/prefs.js`) — remaining: the rest
of the global preferences (metronome/loop/repeats defaults), then
per-song overrides and last-used-per-song state.
