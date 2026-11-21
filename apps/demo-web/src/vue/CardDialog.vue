<script setup lang="ts">
import { ref } from "vue";
import type { Card, Column } from "../shared/types.js";
import { shortId } from "../shared/ui.js";

const props = defineProps<{
  card: Card;
  columns: readonly Column[];
  currentColumnId: string | undefined;
}>();

const emit = defineEmits<{
  (e: "save", cardId: string, patch: { title: string; notes: string }): void;
  (e: "delete", cardId: string): void;
  (e: "move-to", cardId: string, columnId: string): void;
  (e: "close"): void;
}>();

const title = ref(props.card.title);
const notes = ref(props.card.notes);
const confirmDelete = ref(false);

function handleSubmit(): void {
  const trimmed = title.value.trim();
  if (trimmed.length === 0) return;
  emit("save", props.card.id, { title: trimmed, notes: notes.value.trim() });
  emit("close");
}

function handleDelete(): void {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  emit("delete", props.card.id);
  emit("close");
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="emit('close')">
    <form
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-dialog-title"
      @submit.prevent="handleSubmit"
    >
      <header class="dialog__header">
        <div>
          <p class="eyebrow">Card</p>
          <h2 id="card-dialog-title">Edit card</h2>
        </div>
        <button type="button" class="icon-button" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>

      <label class="field">
        <span class="field__label">Title</span>
        <input
          v-model="title"
          class="field__input"
          maxlength="120"
          autofocus
          required
        />
      </label>

      <label class="field">
        <span class="field__label">Notes</span>
        <textarea
          v-model="notes"
          class="field__input field__input--area"
          rows="5"
          maxlength="2000"
          placeholder="Add context for the next person who picks this up."
        />
      </label>

      <div class="dialog__section">
        <span class="field__label">Move to</span>
        <div class="dialog__columns">
          <button
            v-for="column in columns"
            :key="column.id"
            type="button"
            class="chip"
            :class="{ 'chip--active': column.id === currentColumnId }"
            :disabled="column.id === currentColumnId"
            @click="emit('move-to', card.id, column.id)"
          >
            {{ column.title }}
          </button>
        </div>
      </div>

      <footer class="dialog__footer">
        <span class="dialog__meta">
          Created {{ new Date(card.createdAt).toLocaleDateString() }} · id {{ shortId(card.id) }}
        </span>
        <div class="dialog__actions">
          <button
            type="button"
            class="button"
            :class="confirmDelete ? 'button--danger' : 'button--ghost-danger'"
            @click="handleDelete"
          >
            {{ confirmDelete ? "Confirm delete" : "Delete" }}
          </button>
          <button type="submit" class="button button--primary" :disabled="!title.trim()">
            Save changes
          </button>
        </div>
      </footer>
    </form>
  </div>
</template>
