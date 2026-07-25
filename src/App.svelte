<script>
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import { KEYS, beatsPerMeasure } from "./lib/theory.js";
  import { loadCatalog, loadSong } from "./lib/songs.js";
  import { buildAudio, buildTimeline, buildEventQueue, pump } from "./lib/audio.js";
  import { renderScore, highlight } from "./lib/notation.js";
  import { loadPrefs, updatePrefs, saveSongKey } from "./lib/prefs.js";
  import { driveAuth } from "./lib/drive-auth.js";
  import { log } from "./lib/log.js";

  const prefs = loadPrefs();

  let scoreHost, highlightEl;

  let catalog = $state([]);
  let song = $state(null);
  let songIndex = $state(0);
  let songReqId = 0; // guards against an in-flight fetch resolving after a newer selection
  let key = $state("G3");
  let sheetPart = $state("melody"); // which part is on the staff: "melody" | "harmony"
  let bpm = $state(120);
  let playing = $state(false);
  let metronome = $state(true);
  let playMelody = $state(true);
  let playHarmony = $state(false);
  let countInMeasures = $state(prefs.countInMeasures);
  let loop = $state(false);
  let activeBeat = $state(-1);
  let statusText = $state("starting audio");
  let statusBad = $state(false);
  let driveUser = $state(driveAuth.isSignedIn() ? driveAuth.getIdentity() : null);

  const tonic = $derived(song && song.tonics && song.tonics[key] !== undefined ? song.tonics[key] : KEYS[key]?.tonic);
  const bpMeasure = $derived(song ? beatsPerMeasure(song.timeSignature) : 4);
  const songGroups = $derived.by(() => {
    const groups = [];
    const byName = new Map();
    catalog.forEach((s, i) => {
      let g = byName.get(s.group);
      if (!g) { g = { group: s.group, items: [] }; byName.set(s.group, g); groups.push(g); }
      g.items.push({ ...s, i });
    });
    return groups;
  });

  let placed = [];
  let melodyTimeline = [];
  let harmonyTimeline = [];
  let totalBeats = 0;
  let audio = null;
  let startAt = 0;
  let rafId = null;
  let schedTimer = null;
  let eventQueue = [];
  let nextEvent = 0;

  function setStatus(txt, bad) {
    statusText = txt;
    statusBad = !!bad;
    log("status:", txt);
  }

  function doRenderScore() {
    if (!scoreHost || !highlightEl || !song) return;
    placed = renderScore(scoreHost, highlightEl, { song, key: KEYS[key], tonic, part: sheetPart });
  }

  function stop() {
    playing = false;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    eventQueue = []; nextEvent = 0;
    if (audio) {
      try { audio.melody.releaseAll(); } catch (e) { /* not ready yet */ }
      try { audio.harmony.releaseAll(); } catch (e) { /* not ready yet */ }
      try { audio.master.gain.cancelScheduledValues(Tone.now()); } catch (e) { /* no-op */ }
      try { audio.master.gain.rampTo(0, 0.02); }
      catch (e) { try { audio.master.gain.value = 0; } catch (e2) { /* no-op */ } }
    }
    highlightEl?.classList.remove("on");
    activeBeat = -1;
  }

  function tick() {
    if (!playing) return;
    const sec = 60 / bpm, elapsed = Tone.now() - startAt;

    if (elapsed < 0) {
      const countInBeats = countInMeasures * bpMeasure;
      const lead = countInBeats ? (countInBeats - song.pickup) : 0;
      const ci = Math.floor((elapsed + lead * sec) / sec);
      activeBeat = ((Math.max(0, ci) % bpMeasure) + bpMeasure) % bpMeasure;
      rafId = requestAnimationFrame(tick);
      return;
    }
    const beat = elapsed / sec;
    if (beat >= totalBeats) {
      if (loop) { play(); return; }
      stop();
      return;
    }
    activeBeat = ((Math.floor(beat) - song.pickup) % bpMeasure + bpMeasure) % bpMeasure;

    // Highlight follows the part that's on the staff, which need not be the
    // (or an) audible one — the sheet is the practice reference either way.
    const timeline = sheetPart === "harmony" ? harmonyTimeline : melodyTimeline;
    let cur = null;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (beat >= timeline[i].t) { cur = timeline[i]; break; }
    }
    if (cur) highlight(highlightEl, placed, cur.idx);
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (!audio) audio = buildAudio(setStatus);
    ({ melodyTimeline, harmonyTimeline, totalBeats } = buildTimeline(song));
    ({ queue: eventQueue, startAt } = buildEventQueue({
      song, tonic, bpm, countInMeasures, metronome, playMelody, playHarmony,
      melodyTimeline, harmonyTimeline, totalBeats,
    }));
    nextEvent = 0;
    try { audio.master.gain.cancelScheduledValues(Tone.now()); } catch (e) { /* no-op */ }
    try { audio.master.gain.value = 1; } catch (e) { /* no-op */ }

    playing = true;

    if (schedTimer) clearInterval(schedTimer);
    const pumpNow = () => { nextEvent = pump(audio, eventQueue, nextEvent); };
    schedTimer = setInterval(pumpNow, 50);
    pumpNow();
    tick();
  }

  function handlePlayClick() {
    if (playing) { stop(); return; }
    let st = "?";
    try { st = Tone.getContext().state; } catch (e) { /* no-op */ }
    log("play pressed; context =", st, "| audio =", audio ? "ready" : "not ready yet");
    if (st !== "running") {
      Tone.start()
        .then(() => { log("context started ->", Tone.getContext().state); play(); })
        .catch((e) => setStatus("could not start audio: " + e.message, true));
    } else {
      play();
    }
  }

  async function selectSong(i) {
    stop();
    const prevIndex = songIndex;
    songIndex = i;
    const entry = catalog[i];
    const reqId = ++songReqId;
    setStatus(`loading "${entry.title}"…`);
    let loaded;
    try {
      loaded = await loadSong(entry.id);
    } catch (e) {
      if (reqId === songReqId) songIndex = prevIndex; // keep the dropdown in sync with the song actually loaded
      setStatus(`failed to load "${entry.title}": ${e.message}`, true);
      return;
    }
    if (reqId !== songReqId) return; // a newer selectSong() call superseded this one

    song = loaded;
    const savedKey = loadPrefs().songKeys[song.id];
    key = savedKey && song.keys.indexOf(savedKey) !== -1 ? savedKey : song.defaultKey;
    if (sheetPart === "harmony" && !song.harmony) sheetPart = "melody";
    bpm = song.defaultTempo;
    setStatus("ready");
    doRenderScore();
    updatePrefs({ lastSongId: song.id });
  }

  function onSongChange(e) {
    selectSong(+e.target.value);
  }

  function onKeyChange(e) {
    stop();
    key = e.target.value;
    doRenderScore();
    saveSongKey(song.id, key);
  }

  function onSheetPartChange(e) {
    sheetPart = e.target.value;
    doRenderScore(); // playback keeps going — the highlight just follows the newly shown part
  }

  function onTempoInput(e) {
    stop();
    bpm = +e.target.value;
  }

  function resetTempo() {
    stop();
    bpm = song.defaultTempo;
  }

  function toggleMetronome() {
    stop();
    metronome = !metronome;
  }

  function toggleLoop() {
    stop();
    loop = !loop;
  }

  function togglePlayMelody() {
    stop();
    playMelody = !playMelody;
  }

  function togglePlayHarmony() {
    stop();
    playHarmony = !playHarmony;
  }

  async function handleDriveSignIn() {
    setStatus("signing in with Google…");
    try {
      driveUser = await driveAuth.signIn();
      setStatus("ready");
    } catch (e) {
      setStatus(`Google sign-in failed: ${e.message}`, true);
    }
  }

  function handleDriveSignOut() {
    driveAuth.signOut();
    driveUser = null;
    setStatus("signed out of Google");
  }

  function cycleCountIn() {
    stop();
    countInMeasures = (countInMeasures + 1) % 3; // 0 -> 1 -> 2 -> 0
    updatePrefs({ countInMeasures });
  }

  // Keyboard shortcuts only fire when no control has focus (see onKeydown's
  // guard), so every control must give focus up once the interaction is done.
  // Delegated at the document: `change` covers selects, checkboxes, and the
  // tempo slider (fires on release); `click` covers buttons. Selects must not
  // blur on click — that would close their dropdown before a choice is made.
  function blurAfterInteraction(e) {
    if (e.type === "change") e.target.closest("input, select")?.blur();
    else e.target.closest("button")?.blur();
  }

  function onKeydown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); handlePlayClick(); }
    if (e.key === "ArrowRight" && songIndex < catalog.length - 1) selectSong(songIndex + 1);
    if (e.key === "ArrowLeft" && songIndex > 0) selectSong(songIndex - 1);
  }

  let resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { stop(); doRenderScore(); }, 180);
  }

  onMount(() => {
    // VexFlow's music font (Bravura) loads asynchronously; rendering before it's
    // ready produces wrong glyph metrics (offset stems, oversized ledger lines).
    document.fonts.ready.then(doRenderScore);

    try { audio = buildAudio(setStatus); } catch (e) { setStatus("audio setup failed: " + e.message, true); }

    setStatus("loading songs…");
    loadCatalog()
      .then((entries) => {
        catalog = entries;
        if (!entries.length) { setStatus("no songs available", true); return; }
        const lastIdx = entries.findIndex((s) => s.id === prefs.lastSongId);
        return selectSong(lastIdx !== -1 ? lastIdx : 0);
      })
      .catch((e) => setStatus("failed to load song catalog: " + e.message, true));

    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("change", blurAfterInteraction);
    document.addEventListener("click", blurAfterInteraction);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("change", blurAfterInteraction);
      document.removeEventListener("click", blurAfterInteraction);
    };
  });

  onDestroy(() => {
    if (schedTimer) clearInterval(schedTimer);
    if (rafId) cancelAnimationFrame(rafId);
    clearTimeout(resizeTimer);
  });
</script>

<div class="wrap">
  <div class="controls">
    <div class="pick">
      <label for="song">Song</label>
      <select id="song" value={songIndex} onchange={onSongChange}>
        {#each songGroups as { group, items }}
          <optgroup label={group}>
            {#each items as s}
              <option value={s.i}>{s.title}{s.source ? ` · ${s.source}` : (s.sub ? ` · ${s.sub}` : "")}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>
    {#if song?.harmony}
      <div class="pick partpick">
        <label for="part">Part</label>
        <select id="part" value={sheetPart} onchange={onSheetPartChange}>
          <option value="melody">Melody</option>
          <option value="harmony">Harmony</option>
        </select>
      </div>
    {/if}
    {#if song && song.keys.length > 1}
      <div class="pick keypick">
        <label for="key">Key</label>
        <select id="key" value={key} onchange={onKeyChange}>
          {#each song.keys as k}
            <option value={k}>{KEYS[k].name}{k === song.defaultKey && song.showDefaultKeyStar !== false ? " ★" : ""}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="paper">
    {#if song?.note}<p class="songnote">{song.note}</p>{/if}
    <div id="score" bind:this={scoreHost}><div id="highlight" bind:this={highlightEl}></div></div>
  </div>

  <div class="stage">
    <button class="play" class:stop={playing} disabled={!song} onclick={handlePlayClick}>{playing ? "Stop" : "Play"}</button>
    <div class="beats">
      {#each { length: bpMeasure } as _, i}
        <div class="beat" class:one={i === 0} class:hit={i === activeBeat}></div>
      {/each}
    </div>
    <div class="field">
      <span class="lbl">Tempo</span>
      <input type="range" min="40" max="180" step="2" value={bpm} oninput={onTempoInput} disabled={!song} />
      <span class="bpm">{bpm}</span>
      <button class="reset" hidden={!song || bpm === song.defaultTempo} onclick={resetTempo}>Default {song?.defaultTempo}</button>
    </div>
    <div class="parts">
      <span class="lbl">Play</span>
      <label><input type="checkbox" tabindex="-1" checked={playMelody} onchange={togglePlayMelody} /> Melody</label>
      <label><input type="checkbox" tabindex="-1" checked={playHarmony} disabled={!song?.harmony} onchange={togglePlayHarmony} /> Harmony</label>
    </div>
    <div class="toggles">
      <button class="tg" aria-pressed={metronome} onclick={toggleMetronome}>Metronome</button>
      <button class="tg" aria-pressed={loop} onclick={toggleLoop}>Loop</button>
    </div>
  </div>

  <div class="footbar">
    <div class="toggles">
      <button class="tg" aria-pressed={countInMeasures > 0} onclick={cycleCountIn}>Count-in{countInMeasures > 0 ? ` ${countInMeasures}` : ""}</button>
    </div>
  </div>

  <div class="foot">
    <span class="brand">Practice <em>Player</em></span>
    <span class="astat" class:bad={statusBad}>{statusText}</span>
    <span class="hint"><kbd>Space</kbd> play or stop · <kbd>&larr;</kbd> <kbd>&rarr;</kbd> change song ·
    changing any setting stops playback.</span>
    <div class="account">
      {#if driveUser}
        <img class="avatar" src={driveUser.picture} alt="" referrerpolicy="no-referrer" />
        <span class="email">{driveUser.email}</span>
        <button class="signout" onclick={handleDriveSignOut}>Sign out</button>
      {:else}
        <button class="google-signin" onclick={handleDriveSignIn}>
          <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Sign in with Google
        </button>
      {/if}
    </div>
  </div>
</div>
