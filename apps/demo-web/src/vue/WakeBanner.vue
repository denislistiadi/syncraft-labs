<script setup lang="ts">
import type { ApiHealth } from "../shared/api.js";

defineProps<{
  health: ApiHealth;
  isChecking: boolean;
  lastError: string | null;
}>();

const emit = defineEmits<{
  (e: "retry"): void;
}>();
</script>

<template>
  <div
    v-if="health !== 'ok' && health !== 'unknown'"
    class="wake-banner"
    :class="{ 'wake-banner--offline': health === 'offline' }"
    role="status"
  >
    <span class="spinner" :class="{ 'spinner--paused': !isChecking }" aria-hidden="true" />
    <div class="wake-banner__copy">
      <strong v-if="health === 'offline'">You are offline.</strong>
      <strong v-else-if="health === 'waking'">Waking the free Render API.</strong>
      <strong v-else>The API is not responding.</strong>
      <span v-if="health === 'offline'">
        Edits stay in the outbox and will sync when the network returns.
      </span>
      <span v-else-if="health === 'waking'">
        Free instances sleep after 15 minutes. The first request can take up to a minute.
      </span>
      <span v-else>{{ lastError ?? "Check the Render dashboard, then retry." }}</span>
    </div>
    <button
      v-if="health !== 'offline'"
      type="button"
      class="button button--secondary"
      :disabled="isChecking"
      @click="emit('retry')"
    >
      {{ isChecking ? "Checking…" : "Retry now" }}
    </button>
  </div>
</template>
