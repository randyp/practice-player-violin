<script>
  import Router from "svelte-spa-router";
  import Player from "./pages/Player.svelte";
  import Library from "./pages/Library.svelte";
  import Marketplace from "./pages/Marketplace.svelte";

  const routes = {
    "/": Player,
    "/library": Library,
    "/marketplace": Marketplace,
  };
</script>

<Router {routes} />
