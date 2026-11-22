<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useSync } from "@syncraft-labs/vue";
import { createApiClient, type ApiHealth } from "../shared/api.js";
import {
  addCard,
  createEmptyBoard,
  deleteCard,
  editCard,
  getColumnOf,
  moveCard,
  moveCardBy,
  moveCardToColumn,
  moveCardWithinColumn,
} from "../shared/board.js";
import { siblingAppUrl } from "../shared/config.js";
import { formatRelativeTime } from "../shared/format.js";
import { createEventLog } from "../shared/log.js";
import { requestLocalCacheClear } from "../shared/reset.js";
import { createBoardSyncOptions, STORAGE_KEY } from "../shared/store.js";
import { openBoardStream } from "../shared/stream.js";
import type { BoardState } from "../shared/types.js";
import { shortId } from "../shared/ui.js";
import BoardColumn from "./BoardColumn.vue";
import CardDialog from "./CardDialog.vue";
import DevtoolsPanel from "./DevtoolsPanel.vue";
import TestLab from "./TestLab.vue";
import WakeBanner from "./WakeBanner.vue";

type StreamState = "connecting" | "open" | "reconnecting";

const HEALTH_LABELS: Record<ApiHealth, string> = {
  unknown: "API …",
  ok: "API live",
  waking: "API waking",
  offline: "API offline",
  error: "API error",
};

const api = createApiClient();
const log = createEventLog();
const streamState = ref<StreamState>("connecting");
const editingCardId = ref<string | null>(null);
const isTestLabOpen = ref(false);
const isDevtoolsOpen = ref(false);
const isCheckingHealth = ref(false);

const syncOptions = createBoardSyncOptions(api, {
  onSynced: () => log.add("sync", "success", "Outbox pushed to the API"),
  onSyncError: (error) =>
    log.add("sync", "error", `Push failed, retry scheduled: ${error.message}`),
});

const {
  data,
  update,
  refetch,
  applyRemoteState,
  isHydrating,
  isSyncing,
  isOffline,
  error: syncError,
} = useSync<BoardState, BoardState | undefined>(STORAGE_KEY, syncOptions);

const board = computed<BoardState>(() => data.value ?? createEmptyBoard());
const syncState = computed(() => ({
  isHydrating: isHydrating.value,
  isSyncing: isSyncing.value,
  isOffline: isOffline.value,
  error: syncError.value?.message ?? null,
}));

const apiSnapshot = shallowRef(api.getSnapshot());
const unsubscribeApi = api.subscribe(() => {
  apiSnapshot.value = api.getSnapshot();
});

const logs = shallowRef(log.getSnapshot());
const unsubscribeLog = log.subscribe(() => {
  logs.value = log.getSnapshot();
});

const editingCard = computed(() =>
  editingCardId.value ? board.value.cards[editingCardId.value] : undefined,
);
const editingColumn = computed(() =>
  editingCardId.value ? getColumnOf(board.value, editingCardId.value) : undefined,
);
const totalCards = computed(() => Object.keys(board.value.cards).length);

const healthTone = computed(() => {
  if (apiSnapshot.value.health === "ok") return "ok";
  if (apiSnapshot.value.health === "offline" || apiSnapshot.value.health === "error") return "error";
  return "warn";
});
const streamTone = computed(() =>
  streamState.value === "open" ? "ok" : streamState.value === "reconnecting" ? "warn" : "muted",
);

let checking = false;
let lastLoggedHealth: ApiHealth = "unknown";
let healthTimer: number | null = null;
let closeStream: (() => void) | null = null;
let initialPullStarted = false;

async function runHealthCheck(): Promise<void> {
  if (checking) return;
  checking = true;
  isCheckingHealth.value = true;
  try {
    const ok = await api.checkHealth();
    if (ok) {
      if (lastLoggedHealth !== "ok") {
        log.add("api", "success", "API health check passed");
        lastLoggedHealth = "ok";
      }
    } else if (lastLoggedHealth !== "waking") {
      log.add("api", "warn", "API unreachable; retrying in the background");
      lastLoggedHealth = "waking";
    }
  } finally {
    checking = false;
    isCheckingHealth.value = false;
  }
}

async function pullBoard(): Promise<void> {
  log.add("api", "info", "Pulling the latest board…");
  try {
    const remote = await api.fetcher();
    await applyRemoteState(remote);
    log.add("api", "success", "Board loaded from the API");
  } catch (fetchError) {
    log.add(
      "api",
      "warn",
      `Initial board fetch failed: ${
        fetchError instanceof Error ? fetchError.message : String(fetchError)
      }`,
    );
  }
}

watch(
  () => isHydrating.value,
  (hydrating) => {
    if (!hydrating && !initialPullStarted) {
      initialPullStarted = true;
      void pullBoard();
    }
  },
  { immediate: true },
);

watch(
  () => board.value.cards,
  (cards) => {
    if (editingCardId.value && !cards[editingCardId.value]) {
      editingCardId.value = null;
    }
  },
);

function handleAddCard(columnId: string, title: string): void {
  update((draft) => {
    addCard(draft, columnId, title);
  });
  log.add("local", "info", `Added “${title}” to ${columnId}`);
}

function handleSaveCard(cardId: string, patch: { title: string; notes: string }): void {
  update((draft) => {
    editCard(draft, cardId, patch);
  });
  log.add("local", "info", `Updated “${patch.title}”`);
}

function handleDeleteCard(cardId: string): void {
  update((draft) => {
    deleteCard(draft, cardId);
  });
  editingCardId.value = null;
  log.add("local", "info", "Deleted a card");
}

function handleMoveCard(cardId: string, toColumnId: string, index: number): void {
  update((draft) => {
    moveCard(draft, cardId, toColumnId, index);
  });
  log.add("local", "info", `Moved a card to ${toColumnId}`);
}

function handleMoveBy(cardId: string, direction: -1 | 1): void {
  update((draft) => {
    moveCardBy(draft, cardId, direction);
  });
}

function handleMoveWithin(cardId: string, direction: -1 | 1): void {
  update((draft) => {
    moveCardWithinColumn(draft, cardId, direction);
  });
}

function handleMoveTo(cardId: string, columnId: string): void {
  update((draft) => {
    moveCardToColumn(draft, cardId, columnId);
  });
  log.add("local", "info", `Moved a card to ${columnId}`);
}

async function handleReset(): Promise<void> {
  const confirmed = window.confirm(
    "Reset the shared demo board for everyone? Pending offline edits in this tab will be replayed on top.",
  );
  if (!confirmed) return;
  try {
    const response = await api.reset();
    await applyRemoteState(response.state);
    log.add("api", "success", `Server board reset to v${response.version}`);
  } catch (resetError) {
    log.add(
      "api",
      "error",
      `Reset failed: ${resetError instanceof Error ? resetError.message : String(resetError)}`,
    );
  }
}

function handleClearLocal(): void {
  const confirmed = window.confirm(
    "Delete this origin's IndexedDB cache and reload? Unpushed edits in this tab will be lost.",
  );
  if (!confirmed) return;
  requestLocalCacheClear();
}

function handleOpenSibling(): void {
  window.open(siblingAppUrl("react", api.boardId), "_blank", "noopener,noreferrer");
}

function openCard(cardId: string): void {
  editingCardId.value = cardId;
}

function closeCard(): void {
  editingCardId.value = null;
}

function closeTestLab(): void {
  isTestLabOpen.value = false;
}

function closeDevtools(): void {
  isDevtoolsOpen.value = false;
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (editingCardId.value !== null) {
    editingCardId.value = null;
    return;
  }
  if (isTestLabOpen.value) {
    isTestLabOpen.value = false;
    return;
  }
  if (isDevtoolsOpen.value) isDevtoolsOpen.value = false;
}

onMounted(() => {
  log.add("local", "info", `Board “${api.boardId}” · client ${shortId(api.clientId)}`);
  log.add("local", "info", `API origin: ${import.meta.env.VITE_API_URL || window.location.origin}`);
  void runHealthCheck();
  healthTimer = window.setInterval(() => {
    if (api.getSnapshot().health !== "ok") void runHealthCheck();
  }, 12_000);

  closeStream = openBoardStream(api, {
    onOpen: () => {
      streamState.value = "open";
      log.add("stream", "success", "SSE connected");
    },
    onError: () => {
      streamState.value = "reconnecting";
      log.add("stream", "warn", "SSE disconnected; EventSource will reconnect");
    },
    onEvent: (event) => {
      log.add(
        "stream",
        "info",
        `${event.type} v${event.version}${event.updatedBy ? ` from ${shortId(event.updatedBy)}` : ""}`,
      );
      void applyRemoteState(event.state).catch((streamError: unknown) => {
        log.add(
          "stream",
          "error",
          `Could not apply remote state: ${
            streamError instanceof Error ? streamError.message : String(streamError)
          }`,
        );
      });
    },
  });

  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  closeStream?.();
  closeStream = null;
  if (healthTimer !== null) window.clearInterval(healthTimer);
  window.removeEventListener("keydown", handleKeyDown);
  unsubscribeApi();
  unsubscribeLog();
});
</script>

<template>
  <div class="app-shell">
    <p class="sr-only" role="status" aria-live="polite">
      {{
        syncError
          ? `Sync error: ${syncError.message}`
          : isSyncing
            ? "Syncing changes"
            : "All changes synced"
      }}
    </p>

    <header class="app-header">
      <div class="app-header__inner">
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">S</span>
          <span class="brand__copy">
            <strong>Syncraft Kanban</strong>
            <span class="brand__sub">v0.9.0 reference app · Vue</span>
          </span>
        </div>

        <div class="app-header__status" aria-label="Connection status">
          <span class="status" :class="`status--${healthTone}`">
            <span class="status__dot" aria-hidden="true" />
            {{ HEALTH_LABELS[apiSnapshot.health] }}
          </span>
          <span class="status" :class="`status--${streamTone}`">
            <span class="status__dot" aria-hidden="true" />
            {{
              streamState === "open"
                ? "Live"
                : streamState === "reconnecting"
                  ? "Reconnecting"
                  : "Connecting"
            }}
          </span>
          <span v-if="isSyncing" class="status status--syncing">Syncing…</span>
          <span v-if="isOffline" class="status status--warn">Browser offline</span>
        </div>

        <nav class="app-header__actions" aria-label="Demo actions">
          <a class="button button--ghost" :href="siblingAppUrl('react', api.boardId)">
            React version ↗
          </a>
          <button type="button" class="button button--ghost" @click="isTestLabOpen = true">
            Test Lab
          </button>
          <button type="button" class="button button--ghost" @click="isDevtoolsOpen = true">
            Devtools
          </button>
          <button type="button" class="button button--ghost-danger" @click="handleReset">
            Reset
          </button>
        </nav>
      </div>
    </header>

    <div class="app-banners">
      <WakeBanner
        :health="apiSnapshot.health"
        :is-checking="isCheckingHealth"
        :last-error="apiSnapshot.lastError"
        @retry="runHealthCheck"
      />
      <div v-if="isOffline" class="notice notice--offline" role="status">
        <div>
          <strong>Browser offline.</strong> Edits stay in the outbox and sync when the
          connection returns.
        </div>
      </div>
      <div v-if="syncError" class="notice notice--error" role="alert">
        <div><strong>Sync issue.</strong> {{ syncError.message }}</div>
        <button type="button" class="button button--secondary" @click="refetch">
          Retry fetch
        </button>
      </div>
    </div>

    <main class="app-main">
      <div class="board-toolbar">
        <div>
          <p class="eyebrow">Board · {{ api.boardId }}</p>
          <h1>Launch board</h1>
          <p class="board-toolbar__meta">
            {{ board.columns.length }} columns · {{ totalCards }} cards · v{{ apiSnapshot.version }} · 
            {{ isHydrating ? "hydrating…" : `${apiSnapshot.metrics.pushes} pushes` }}
            <template v-if="apiSnapshot.metrics.duplicates > 0">
              · {{ apiSnapshot.metrics.duplicates }} duplicate{{
                apiSnapshot.metrics.duplicates === 1 ? "" : "s"
              }}
              absorbed
            </template>
          </p>
        </div>
        <div class="board-toolbar__actions">
          <span class="board-toolbar__hint">
            {{
              apiSnapshot.metrics.lastPushAt === null
                ? "No pushes yet"
                : `Last push ${formatRelativeTime(apiSnapshot.metrics.lastPushAt)}`
            }}
          </span>
          <button type="button" class="button button--secondary" @click="refetch">Refresh</button>
        </div>
      </div>

      <div
        class="board"
        role="list"
        aria-label="Kanban board"
        :aria-busy="isHydrating || isSyncing"
      >
        <BoardColumn
          v-for="(column, index) in board.columns"
          :key="column.id"
          :board="board"
          :column="column"
          :column-index="index"
          :column-count="board.columns.length"
          @add-card="handleAddCard"
          @open-card="openCard"
          @move-card="handleMoveCard"
          @move-by="handleMoveBy"
          @move-within="handleMoveWithin"
        />
      </div>

      <footer class="app-footer">
        <span>
          Dogfooding <code>@syncraft-labs/core</code>, <code>@syncraft-labs/vue</code>, Hono, and
          libSQL for issue #55.
        </span>
        <span>
          {{ isHydrating ? "Hydrating from IndexedDB…" : "Local-first · offline queue · SSE fan-out" }}
        </span>
      </footer>
    </main>

    <CardDialog
      v-if="editingCard"
      :key="editingCard.id"
      :card="editingCard"
      :columns="board.columns"
      :current-column-id="editingColumn?.id"
      @save="handleSaveCard"
      @delete="handleDeleteCard"
      @move-to="handleMoveTo"
      @close="closeCard"
    />

    <TestLab
      v-if="isTestLabOpen"
      :api="api"
      :network-mode="api.getNetworkMode()"
      :failure-mode="api.getFailureMode()"
      :latency="api.getLatency()"
      :log="log"
      @close="closeTestLab"
      @reset="handleReset"
      @clear-local="handleClearLocal"
      @open-sibling="handleOpenSibling"
    />

    <DevtoolsPanel
      v-if="isDevtoolsOpen"
      :snapshot="apiSnapshot"
      :sync="syncState"
      :logs="logs"
      :board-id="api.boardId"
      :client-id="api.clientId"
      @refetch="refetch"
      @clear-log="log.clear()"
      @close="closeDevtools"
    />
  </div>
</template>
