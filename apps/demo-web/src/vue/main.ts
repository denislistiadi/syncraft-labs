import { createSyncraft } from "@syncraft-labs/vue";
import { createApp } from "vue";
import "../styles.css";
import { applyPendingCacheClear } from "../shared/reset.js";
import App from "./App.vue";

void applyPendingCacheClear().finally(() => {
  createApp(App).use(createSyncraft()).mount("#app");
});
