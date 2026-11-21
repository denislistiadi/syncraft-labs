<script setup lang="ts">
import { computed, ref } from "vue";
import { getColumnCards } from "../shared/board.js";
import type { BoardState, Column } from "../shared/types.js";
import { columnTheme, CARD_MIME } from "../shared/ui.js";
import CardTile from "./CardTile.vue";

const props = defineProps<{
  board: BoardState;
  column: Column;
  columnIndex: number;
  columnCount: number;
}>();

const emit = defineEmits<{
  (e: "add-card", columnId: string, title: string): void;
  (e: "open-card", cardId: string): void;
  (e: "move-card", cardId: string, toColumnId: string, index: number): void;
  (e: "move-by", cardId: string, direction: -1 | 1): void;
  (e: "move-within", cardId: string, direction: -1 | 1): void;
}>();

const cards = computed(() => getColumnCards(props.board, props.column));
const theme = computed(() => columnTheme(props.column.id));
const isAdding = ref(false);
const draft = ref("");
const isDropTarget = ref(false);

const style = computed(() => ({
  "--column-accent": theme.value.accent,
  "--column-soft": theme.value.soft,
}));

function handleDragOver(event: DragEvent): void {
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  isDropTarget.value = true;
}

function handleDragLeave(event: DragEvent): void {
  const related = event.relatedTarget as Node | null;
  if (related && event.currentTarget instanceof Node && event.currentTarget.contains(related)) {
    return;
  }
  isDropTarget.value = false;
}

function handleDrop(event: DragEvent): void {
  isDropTarget.value = false;
  const cardId =
    event.dataTransfer?.getData(CARD_MIME) ||
    event.dataTransfer?.getData("text/plain") ||
    "";
  if (cardId) emit("move-card", cardId, props.column.id, props.column.cardIds.length);
}

function submit(): void {
  const title = draft.value.trim();
  if (title.length === 0) return;
  emit("add-card", props.column.id, title);
  draft.value = "";
}

function closeForm(): void {
  draft.value = "";
  isAdding.value = false;
}
</script>

<template>
  <section
    class="board-column"
    :class="{ 'board-column--target': isDropTarget }"
    :style="style"
    role="listitem"
    :aria-labelledby="`column-${column.id}`"
  >
    <header class="board-column__header">
      <span class="board-column__dot" aria-hidden="true" />
      <h2 :id="`column-${column.id}`">{{ column.title }}</h2>
      <span class="board-column__count" :aria-label="`${cards.length} cards`">
        {{ cards.length }}
      </span>
      <button
        type="button"
        class="board-column__add"
        :aria-expanded="isAdding"
        @click="isAdding = !isAdding"
      >
        {{ isAdding ? "Close" : "+ Add" }}
      </button>
    </header>

    <div
      class="board-column__cards"
      :class="{ 'board-column__cards--empty': cards.length === 0 }"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <p v-if="cards.length === 0" class="board-column__empty">
        Drop a card here, or add one below.
      </p>

      <CardTile
        v-for="(card, cardIndex) in cards"
        :key="card.id"
        :card="card"
        :column="column"
        :column-index="columnIndex"
        :column-count="columnCount"
        :card-index="cardIndex"
        @open-card="(cardId) => emit('open-card', cardId)"
        @move-card="(cardId, toColumnId, index) => emit('move-card', cardId, toColumnId, index)"
        @move-by="(cardId, direction) => emit('move-by', cardId, direction)"
        @move-within="(cardId, direction) => emit('move-within', cardId, direction)"
      />
    </div>

    <form v-if="isAdding" class="add-card-form" @submit.prevent="submit">
      <label class="sr-only" :for="`new-card-${column.id}`">New card title</label>
      <textarea
        :id="`new-card-${column.id}`"
        v-model="draft"
        class="add-card-form__input"
        placeholder="What needs to happen?"
        rows="2"
        autofocus
        @keydown.enter.exact.prevent="submit"
        @keydown.esc="closeForm"
      />
      <div class="add-card-form__actions">
        <button type="submit" class="button button--primary" :disabled="!draft.trim()">
          Add card
        </button>
        <button type="button" class="button button--ghost" @click="closeForm">Cancel</button>
      </div>
    </form>
    <button v-else type="button" class="board-column__footer-add" @click="isAdding = true">
      + Add a card
    </button>
  </section>
</template>
