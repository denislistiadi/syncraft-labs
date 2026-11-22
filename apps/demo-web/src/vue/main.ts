import { createSyncraft } from "@syncraft-labs/vue";
import { createApp } from "vue";
import "../styles.css";
import App from "./App.vue";

createApp(App).use(createSyncraft()).mount("#app");
