<template>
  <div class="app-shell">
    <header class="app-shell__header">
      <div class="app-shell__header-inner">
        <img class="app-shell__logo" src="/brand/trackia.png" alt="TRAKIA" width="1536" height="1024" />
        <div v-if="$slots.actions" class="app-shell__actions">
          <slot name="actions" />
        </div>
      </div>
    </header>
    <slot />
  </div>
</template>

<style scoped>
@media (min-width: 48rem) {
  .app-shell__logo {
    width: 6.75rem;
    height: 4.5rem;
  }
}
</style>
