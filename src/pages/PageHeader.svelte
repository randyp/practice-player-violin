<script>
  import { link } from "svelte-spa-router";
  import { driveAuth } from "../lib/drive-auth.js";
  import { log } from "../lib/log.js";

  let { current } = $props();

  let driveUser = $state(driveAuth.isSignedIn() ? driveAuth.getIdentity() : null);

  async function handleDriveSignIn() {
    try {
      driveUser = await driveAuth.signIn();
    } catch (e) {
      log("Google sign-in failed:", e.message);
    }
  }

  function handleDriveSignOut() {
    driveAuth.signOut();
    driveUser = null;
  }
</script>

<header class="pagehead">
  <span class="brand">Practice <em>Player</em></span>
  <nav class="pagenav">
    <a href="/" use:link class:active={current === "player"}>Player</a>
    <a href="/library" use:link class:active={current === "library"}>My Library</a>
    <a href="/marketplace" use:link class:active={current === "marketplace"}>Marketplace</a>
  </nav>
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
</header>
