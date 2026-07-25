<script>
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import { KEYS, beatsPerMeasure } from "./lib/theory.js";
  import { loadCatalog, loadSong } from "./lib/songs.js";
  import { buildAudio, buildTimeline, buildEventQueue, pump, log } from "./lib/audio.js";
  import { renderScore, highlight } from "./lib/notation.js";
  import { loadPrefs, savePrefs } from "./lib/prefs.js";
  import { driveAuth, listDriveFiles } from "./lib/drive-auth.js";

  const prefs = loadPrefs();

  let scoreHost, hlEl;

  let catalog = $state([]);
  let song = $state(null);
  let si = $state(0);
  let songReqId = 0; // guards against an in-flight fetch resolving after a newer selection
  let key = $state("G3");
  let notationVoice = $state("melody");
  let bpm = $state(120);
  let playing = $state(false);
  let metro = $state(true);
  let melodyPlay = $state(true);
  let harmonyPlay = $state(false);
  let countInMeasures = $state(prefs.countInMeasures);
  let loop = $state(false);
  let activeBeat = $state(-1);
  let statusText = $state("starting audio");
  let statusBad = $state(false);
  let driveSignedIn = $state(driveAuth.isSignedIn());
  let driveIdentity = $state(driveAuth.getIdentity());

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
  let timeline = [];
  let totalBeats = 0;
  let audio = null;
  let startAt = 0;
  let rafId = null;
  let schedTimer = null;
  let evq = [];
  const evi = { i: 0 };

  function setStatus(txt, bad) {
    statusText = txt;
    statusBad = !!bad;
    log("status:", txt);
  }

  function spb() {
    return 60 / bpm;
  }

  function doRenderScore() {
    if (!scoreHost || !hlEl || !song) return;
    const showMelody = notationVoice === "melody";
    const showHarmony = notationVoice === "harmony";
    placed = renderScore(scoreHost, hlEl, song, KEYS[key], tonic, showMelody, showHarmony);
  }

  function stop() {
    playing = false;
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    evq = []; evi.i = 0;
    if (audio) {
      try { audio.melody.releaseAll(); } catch (e) { /* not ready yet */ }
      try { audio.harmony.releaseAll(); } catch (e) { /* not ready yet */ }
      try { audio.master.gain.cancelScheduledValues(Tone.now()); } catch (e) { /* no-op */ }
      try { audio.master.gain.rampTo(0, 0.02); }
      catch (e) { try { audio.master.gain.value = 0; } catch (e2) { /* no-op */ } }
    }
    hlEl?.classList.remove("on");
    activeBeat = -1;
  }

  function tick() {
    if (!playing) return;
    const sec = spb(), elapsed = Tone.now() - startAt;

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

    let cur = null;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (beat >= timeline[i].t) { cur = timeline[i]; break; }
    }
    if (cur) highlight(hlEl, placed, cur.idx);
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (!audio) audio = buildAudio(setStatus);
    let harmonyTimeline;
    ({ timeline, totalBeats, harmonyTimeline } = buildTimeline(song));
    ({ evq, startAt } = buildEventQueue({
      song, tonic, bpm, countInMeasures, metro, melodyPlay, harmonyPlay, timeline, harmonyTimeline,
    }));
    evi.i = 0;
    try { audio.master.gain.cancelScheduledValues(Tone.now()); } catch (e) { /* no-op */ }
    try { audio.master.gain.value = 1; } catch (e) { /* no-op */ }

    playing = true;

    if (schedTimer) clearInterval(schedTimer);
    schedTimer = setInterval(() => pump(audio, evq, evi), 50);
    pump(audio, evq, evi);
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
    const prevSi = si;
    si = i;
    const entry = catalog[i];
    const reqId = ++songReqId;
    setStatus(`loading "${entry.title}"…`);
    let loaded;
    try {
      loaded = await loadSong(entry.id);
    } catch (e) {
      if (reqId === songReqId) si = prevSi; // keep the dropdown in sync with the song actually loaded
      setStatus(`failed to load "${entry.title}": ${e.message}`, true);
      return;
    }
    if (reqId !== songReqId) return; // a newer selectSong() call superseded this one

    song = loaded;
    const savedKey = loadPrefs().songKeys[entry.id];
    key = savedKey && song.keys.indexOf(savedKey) !== -1 ? savedKey : song.defaultKey;
    if (notationVoice === "harmony" && !song.harmony) notationVoice = "melody";
    bpm = song.defaultTempo;
    setStatus("ready");
    doRenderScore();
    savePrefs({ ...loadPrefs(), lastSongId: entry.id });
  }

  function onSongChange(e) {
    e.target.blur(); // otherwise focus stays on the select and Space reopens it instead of playing
    selectSong(+e.target.value);
  }

  function onKeyChange(e) {
    e.target.blur();
    stop();
    key = e.target.value;
    doRenderScore();
    if (song) {
      const p = loadPrefs();
      savePrefs({ ...p, songKeys: { ...p.songKeys, [catalog[si].id]: key } });
    }
  }

  function onNotationVoiceChange(e) {
    e.target.blur();
    notationVoice = e.target.value;
    doRenderScore();
  }

  function onTempoInput(e) {
    stop();
    bpm = +e.target.value;
  }

  function resetTempo() {
    stop();
    bpm = song.defaultTempo;
  }

  function toggle(field) {
    return () => {
      stop();
      switch (field) {
        case "metro": metro = !metro; break;
        case "loop": loop = !loop; break;
      }
    };
  }

  async function handleDriveSignIn() {
    setStatus("signing in with Google…");
    try {
      const identity = await driveAuth.signIn();
      driveSignedIn = true;
      driveIdentity = identity;
      await listDriveFiles();
      setStatus("ready");
    } catch (e) {
      setStatus(`Google sign-in failed: ${e.message}`, true);
    }
  }

  function handleDriveSignOut() {
    driveAuth.signOut();
    driveSignedIn = false;
    driveIdentity = null;
    setStatus("signed out of Google");
  }

  function cycleCountIn() {
    stop();
    countInMeasures = (countInMeasures + 1) % 3; // 0 -> 1 -> 2 -> 0
    savePrefs({ ...loadPrefs(), countInMeasures });
  }

  function toggleVoice(field) {
    return (e) => {
      e.target.blur(); // otherwise the checkbox keeps focus and Space re-toggles it instead of playing
      stop();
      switch (field) {
        case "melodyPlay": melodyPlay = !melodyPlay; break;
        case "harmonyPlay": harmonyPlay = !harmonyPlay; break;
      }
    };
  }

  function onKeydown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); handlePlayClick(); }
    if (e.key === "ArrowRight" && si < catalog.length - 1) selectSong(si + 1);
    if (e.key === "ArrowLeft" && si > 0) selectSong(si - 1);
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
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeydown);
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
      <select id="song" value={si} onchange={onSongChange}>
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
      <div class="pick notationpick">
        <label for="notation">Part</label>
        <select id="notation" value={notationVoice} onchange={onNotationVoiceChange}>
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
    <div id="score" bind:this={scoreHost}><div id="hl" bind:this={hlEl}></div></div>
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
    <div class="voices">
      <span class="lbl">Play</span>
      <label><input type="checkbox" tabindex="-1" checked={melodyPlay} onchange={toggleVoice("melodyPlay")} /> Melody</label>
      <label><input type="checkbox" tabindex="-1" checked={harmonyPlay} disabled={!song?.harmony} onchange={toggleVoice("harmonyPlay")} /> Harmony</label>
    </div>
    <div class="toggles">
      <button class="tg" aria-pressed={metro} onclick={toggle("metro")}>Metronome</button>
      <button class="tg" aria-pressed={loop} onclick={toggle("loop")}>Loop</button>
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
      {#if driveSignedIn && driveIdentity}
        <img class="avatar" src={driveIdentity.picture} alt="" referrerpolicy="no-referrer" />
        <span class="email">{driveIdentity.email}</span>
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
