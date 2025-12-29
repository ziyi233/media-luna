<template>
  <div class="scroll-container">
    <div class="scroll-content ml-scrollbar">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
@import '../styles/shared.css';

.scroll-container {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  background-color: var(--k-card-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 12px;
}

.scroll-content {
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem;
}
</style>
