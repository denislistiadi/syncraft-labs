<script setup lang="ts">
import { computed, ref } from "vue";
import type { Card, Column } from "../shared/types.js";
import { CARD_MIME } from "../shared/ui.js";

const props = defineProps<{
  card: Card;
  column: Column;
  columnIndex: number;
  columnCount: number;
  cardIndex: number;
}>();

const emit = defineEmits<{
  (e: "open-card", cardId: string): void;
  (e: "move-card", cardId: string, toColumnId: string, index: number): void;
  (e: "move-by", cardId: string, direction: -1 | 1): void;
  (e: "move-within", cardId: string, direction: -1 | 1): void;
}>();

const isDragging = ref(false);

const canLeft = computed(() => props.columnIndex > 0 || props.cardIndex > 0);
const canRight = computed(
  () =>
    props.columnIndex < props.columnCount - 1 ||
    props.cardIndex < props.column.cardIds.length - 1,
);
const canUp = computed(() => props.cardIndex > 0);
const canDown = computed(() => props.cardIndex < props.column.cardIds.length - 1);

function handleDragStart(event: DragEvent): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(CARD_MIME, props.card.id);
  event.dataTransfer.setData("text/plain", props.card.id);
  isDragging.value = true;
}

function handleDrop(event: DragEvent): void {
  const cardId =
    event.dataTransfer?.getData(CARD_MIME) ||
    event.dataTransfer?.getData("text/plain") ||
    "";
  if (cardId) emit("move-card", cardId, props.column.id, props.cardIndex);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    emit("open-card", props.card.id);
  }
}
</script>

<template>
  <article
    class="card"
    :class="{ 'card--dragging': isDragging }"
    :draggable="true"
    role="button"
    tabindex="0"
    :aria-label="`Edit ${card.title}`"
    @dragstart="handleDragStart"
    @dragend="isDragging = false"
    @dragover.prevent
    @drop.prevent.stop="handleDrop"
    @click="emit('open-card', card.id)"
    @keydown="handleKeydown"
  >
    <h3 class="card__title">{{ card.title }}</h3>
    <p v-if="card.notes" class="card__notes">{{ card.notes }}</p>
    <div class="card__meta">
      <time :datetime="new Date(card.createdAt).toISOString()">
        {{
          new Date(card.createdAt).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })
        }}
      </time>
      <span class="card__move-group" aria-label="Move card">
        <button
          type="button"
          class="card__move"
          :disabled="!canUp"
          aria-label="Move card up"
          title="Move up"
          @click.stop="emit('move-within', card.id, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="card__move"
          :disabled="!canDown"
          aria-label="Move card down"
          title="Move down"
          @click.stop="emit('move-within', card.id, 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="card__move"
          :disabled="!canLeft"
          aria-label="Move card to previous column"
          title="Move left"
          @click.stop="emit('move-by', card.id, -1)"
        >
          ←
        </button>
        <button
          type="button"
          class="card__move"
          :disabled="!canRight"
          aria-label="Move card to next column"
          title="Move right"
          @click.stop="emit('move-by', card.id, 1)"
        >
          →
        </button>
      </span>
    </div>
  </article>
</template>
