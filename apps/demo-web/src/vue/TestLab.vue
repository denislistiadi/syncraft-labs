<script setup lang="ts">
import type { ApiClient, FailureMode, NetworkMode } from "../shared/api.js";
import type { EventLog } from "../shared/log.js";

const props = defineProps<{
  api: ApiClient;
  networkMode: NetworkMode;
  failureMode: FailureMode;
  latency: number;
  log: EventLog;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "reset"): void;
  (e: "clear-local"): void;
  (e: "open-sibling"): void;
}>();

function setOnline(): void {
  props.api.setNetworkMode("online");
  props.log.add("test", "info", "Network mode: online");
}

function setOffline(): void {
  props.api.setNetworkMode("offline");
  props.log.add("test", "warn", "Network mode: offline");
}

function failNext(): void {
  props.api.failNextPush();
  props.log.add("test", "warn", "The next push will fail");
}

function togglePermanent(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  const mode: FailureMode = checked ? "permanent" : "none";
  props.api.setFailureMode(mode);
  props.log.add(
    "test",
    "warn",
    mode === "permanent" ? "Permanent push failures enabled" : "Push failures disabled",
  );
}

function changeLatency(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  props.api.setLatency(value);
  props.log.add("test", "info", `Latency set to ${value} ms`);
}

function copyUrl(): void {
  void navigator.clipboard?.writeText(window.location.href);
  props.log.add("test", "info", "Copied this tab's URL");
}
</script>

<template>
  <div class="panel-backdrop" @mousedown.self="emit('close')">
    <aside class="panel panel--right" aria-label="Test Lab">
      <header class="panel__header">
        <div>
          <p class="eyebrow">Field testing</p>
          <h2>Test Lab</h2>
        </div>
        <button type="button" class="icon-button" aria-label="Close Test Lab" @click="emit('close')">
          ×
        </button>
      </header>

      <section class="panel__section">
        <h3>Connectivity</h3>
        <div class="segmented" role="group" aria-label="Network mode">
          <button
            type="button"
            class="segmented__button"
            :class="{ 'segmented__button--active': networkMode !== 'offline' }"
            @click="setOnline"
          >
            Online
          </button>
          <button
            type="button"
            class="segmented__button"
            :class="{ 'segmented__button--active': networkMode === 'offline' }"
            @click="setOffline"
          >
            Offline
          </button>
        </div>
        <p class="panel__hint">
          Offline mode blocks every request without touching the browser connection. Add or
          move a card, then switch back to online and watch the outbox drain.
        </p>
      </section>

      <section class="panel__section">
        <h3>Failure injection</h3>
        <div class="panel__row">
          <button
            type="button"
            class="button button--secondary"
            :disabled="failureMode === 'permanent'"
            @click="failNext"
          >
            Fail next push
          </button>
          <label class="switch">
            <input
              type="checkbox"
              :checked="failureMode === 'permanent'"
              @change="togglePermanent"
            />
            <span>Permanent</span>
          </label>
        </div>
        <p class="panel__hint">
          A failed push leaves the entry in the outbox. Syncraft retries with exponential
          backoff, so the change survives a flaky tunnel or a closed laptop lid.
        </p>
      </section>

      <section class="panel__section">
        <h3>Latency</h3>
        <label class="range">
          <span>{{ latency === 0 ? "No added delay" : `${latency} ms per request` }}</span>
          <input
            type="range"
            min="0"
            max="3000"
            step="250"
            :value="latency"
            @input="changeLatency"
          />
        </label>
        <p class="panel__hint">
          Use 1–2 seconds of latency to see optimistic updates and the “Syncing” state before
          the API confirms the push.
        </p>
      </section>

      <section class="panel__section">
        <h3>Two tabs, one board</h3>
        <div class="panel__row">
          <button type="button" class="button button--secondary" @click="emit('open-sibling')">
            Open other framework
          </button>
          <button type="button" class="button button--ghost" @click="copyUrl">Copy URL</button>
        </div>
        <p class="panel__hint">
          Each tab gets its own client ID in sessionStorage, so SSE updates flow both ways.
          Both tabs intentionally share the same IndexedDB storage key.
        </p>
      </section>

      <section class="panel__section">
        <h3>Destructive actions</h3>
        <div class="panel__stack">
          <button type="button" class="button button--danger-outline" @click="emit('reset')">
            Reset server board
          </button>
          <button
            type="button"
            class="button button--danger-outline"
            @click="emit('clear-local')"
          >
            Clear local cache
          </button>
        </div>
        <p class="panel__hint">
          Reset restores the seeded board for everyone. Clearing local cache closes this tab's
          IndexedDB and reloads from the server.
        </p>
      </section>
    </aside>
  </div>
</template>
