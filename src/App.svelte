<script>
  import { onMount, onDestroy } from "svelte";
  import * as Tone from "tone";
  import { KEYS } from "./lib/theory.js";
  import { SONGS } from "./lib/songs.js";
  import { buildAudio, buildTimeline, buildEventQueue, pump, log } from "./lib/audio.js";
  import { renderScore, highlight } from "./lib/notation.js";

  let scoreHost, hlEl;

  let si = $state(0);
  let key = $state("G");
  let notationVoice = $state("melody");
  let bpm = $state(120);
  let playing = $state(false);
  let metro = $state(true);
  let melodyPlay = $state(true);
  let harmonyPlay = $state(false);
  let countIn = $state(true);
  let repeats = $state(true);
  let loop = $state(false);
  let activeBeat = $state(-1);
  let statusText = $state("starting audio");
  let statusBad = $state(false);

  const song = $derived(SONGS[si]);
  const tonic = $derived(song.tonics && song.tonics[key] !== undefined ? song.tonics[key] : KEYS[key].tonic);
  const songGroups = $derived.by(() => {
    const groups = [];
    const byName = new Map();
    SONGS.forEach((s, i) => {
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
    if (!scoreHost || !hlEl) return;
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
      const lead = countIn ? (4 - song.pickup) : 0;
      const ci = Math.floor((elapsed + lead * sec) / sec);
      activeBeat = Math.max(0, Math.min(3, ci));
      rafId = requestAnimationFrame(tick);
      return;
    }
    const beat = elapsed / sec;
    if (beat >= totalBeats) {
      if (loop) { play(); return; }
      stop();
      return;
    }
    activeBeat = ((Math.floor(beat) - song.pickup) % 4 + 4) % 4;

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
    ({ timeline, totalBeats, harmonyTimeline } = buildTimeline(song, repeats));
    ({ evq, startAt } = buildEventQueue({
      song, tonic, bpm, countIn, metro, melodyPlay, harmonyPlay, timeline, harmonyTimeline,
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

  function selectSong(i) {
    stop();
    si = i;
    if (song.keys.indexOf(key) === -1) key = song.defaultKey;
    if (notationVoice === "harmony" && !song.harmony) notationVoice = "melody";
    bpm = song.defaultTempo;
    doRenderScore();
  }

  function onSongChange(e) {
    selectSong(+e.target.value);
  }

  function onKeyChange(e) {
    stop();
    key = e.target.value;
    doRenderScore();
  }

  function onNotationVoiceChange(e) {
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
        case "countIn": countIn = !countIn; break;
        case "repeats": repeats = !repeats; break;
        case "loop": loop = !loop; break;
      }
    };
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
    if (e.key === "ArrowRight" && si < SONGS.length - 1) selectSong(si + 1);
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
              <option value={s.i}>{s.title}{s.sub ? ` · ${s.sub}` : ""}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>
    <div class="pick notationpick">
      <label for="notation">Sheet music</label>
      <select id="notation" value={notationVoice} onchange={onNotationVoiceChange}>
        <option value="melody">Melody</option>
        <option value="harmony" disabled={!song.harmony}>Harmony</option>
      </select>
    </div>
    <div class="pick keypick">
      <label for="key">Key</label>
      <select id="key" value={key} onchange={onKeyChange}>
        {#each song.keys as k}
          <option value={k}>{KEYS[k].name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="paper"><div id="score" bind:this={scoreHost}><div id="hl" bind:this={hlEl}></div></div></div>

  <div class="stage">
    <button class="play" class:stop={playing} onclick={handlePlayClick}>{playing ? "Stop" : "Play"}</button>
    <div class="beats">
      {#each [0, 1, 2, 3] as i}
        <div class="beat" class:one={i === 0} class:hit={i === activeBeat}></div>
      {/each}
    </div>
    <div class="toggles">
      <button class="tg" aria-pressed={metro} onclick={toggle("metro")}>Metronome</button>
      <button class="tg" aria-pressed={countIn} onclick={toggle("countIn")}>Count-in</button>
      <button class="tg" aria-pressed={repeats} disabled={!song.repeat} onclick={toggle("repeats")}>Repeats</button>
      <button class="tg" aria-pressed={loop} onclick={toggle("loop")}>Loop</button>
    </div>
  </div>

  <div class="footbar">
    <div class="field">
      <span class="lbl">Tempo</span>
      <input type="range" min="40" max="180" step="2" value={bpm} oninput={onTempoInput} />
      <span class="bpm">{bpm}</span>
      <button class="reset" hidden={bpm === song.defaultTempo} onclick={resetTempo}>Default {song.defaultTempo}</button>
    </div>
    <div class="voices">
      <span class="lbl">Play</span>
      <label><input type="checkbox" tabindex="-1" checked={melodyPlay} onchange={toggleVoice("melodyPlay")} /> Melody</label>
      <label><input type="checkbox" tabindex="-1" checked={harmonyPlay} disabled={!song.harmony} onchange={toggleVoice("harmonyPlay")} /> Harmony</label>
    </div>
  </div>

  <p class="foot">
    <span class="brand">Practice <em>Player</em></span>
    <span class="astat" class:bad={statusBad}>{statusText}</span>
    <span class="hint"><kbd>Space</kbd> play or stop · <kbd>&larr;</kbd> <kbd>&rarr;</kbd> change song ·
    changing any setting stops playback.</span>
  </p>
</div>
