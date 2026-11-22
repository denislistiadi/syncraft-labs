<script setup lang="ts">
import type { ApiSnapshot } from "../shared/api.js";
import { formatClock, formatRelativeTime } from "../shared/format.js";
import type { LogEntry } from "../shared/log.js";
import { shortId } from "../shared/ui.js";

defineProps<{
  snapshot: ApiSnapshot;
  sync: {
    isHydrating: boolean;
    isSyncing: boolean;
    isOffline: boolean;
    error: string | null;
  };
  logs: readonly LogEntry[];
  boardId: string;
  clientId: string;
}>();

const emit = defineEmits<{
  (e: "refetch"): void;
  (e: "clear-log"): void;
  (e: "close"): void;
}>();
</script>

<template>
  <div class="panel-backdrop" @mousedown.self="emit('close')">
    <aside class="panel panel--right panel--wide" aria-label="Sync devtools">
      <header class="panel__header">
        <div>
          <p class="eyebrow">Observability</p>
          <h2>Sync devtools</h2>
        </div>
        <button type="button" class="icon-button" aria-label="Close devtools" @click="emit('close')">
          ×
        </button>
      </header>

      <section class="panel__section">
        <h3>API counters</h3>
        <dl class="metrics">
          <div>
            <dt>Fetches</dt>
            <dd>{{ snapshot.metrics.fetches }}</dd>
          </div>
          <div>
            <dt>Pushes</dt>
            <dd>{{ snapshot.metrics.pushes }}</dd>
          </div>
          <div>
            <dt>Duplicates</dt>
            <dd>{{ snapshot.metrics.duplicates }}</dd>
          </div>
          <div>
            <dt>Failures</dt>
            <dd>{{ snapshot.metrics.failures }}</dd>
          </div>
          <div>
            <dt>Last latency</dt>
            <dd>
              {{ snapshot.metrics.lastLatencyMs === null ? "—" : `${snapshot.metrics.lastLatencyMs} ms` }}
            </dd>
          </div>
          <div>
            <dt>Last push</dt>
            <dd>{{ formatRelativeTime(snapshot.metrics.lastPushAt) }}</dd>
          </div>
        </dl>
      </section>

      <section class="panel__section">
        <h3>Session</h3>
        <dl class="metrics metrics--dense">
          <div>
            <dt>Board</dt>
            <dd>{{ boardId }}</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd :title="clientId">{{ shortId(clientId) }}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>v{{ snapshot.version }}</dd>
          </div>
          <div>
            <dt>Health</dt>
            <dd>{{ snapshot.health }}</dd>
          </div>
        </dl>
        <div class="badge-row">
          <span v-if="sync.isHydrating" class="badge badge--info">hydrating</span>
          <span v-if="sync.isSyncing" class="badge badge--info">syncing</span>
          <span v-if="sync.isOffline" class="badge badge--warn">browser offline</span>
          <span v-if="sync.error" class="badge badge--error" :title="sync.error">sync error</span>
          <span
            v-if="!sync.isHydrating && !sync.isSyncing && !sync.error"
            class="badge badge--ok"
          >
            idle
          </span>
        </div>
        <p v-if="snapshot.lastError" class="panel__error">{{ snapshot.lastError }}</p>
        <div class="panel__row">
          <button type="button" class="button button--secondary" @click="emit('refetch')">
            Refetch board
          </button>
          <button type="button" class="button button--ghost" @click="emit('clear-log')">
            Clear log
          </button>
        </div>
      </section>

      <section class="panel__section panel__section--grow">
        <h3>Event log</h3>
        <p v-if="logs.length === 0" class="panel__hint">No events yet.</p>
        <ol v-else class="log-list">
          <li
            v-for="entry in logs"
            :key="entry.id"
            class="log-entry"
            :class="`log-entry--${entry.level}`"
          >
            <span class="log-entry__time" :title="new Date(entry.at).toISOString()">
              {{ formatClock(entry.at) }}
            </span>
            <span class="log-entry__source">{{ entry.source }}</span>
            <span class="log-entry__message">{{ entry.message }}</span>
          </li>
        </ol>
      </section>
    </aside>
  </div>
</template>
