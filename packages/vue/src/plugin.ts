import type { App, InjectionKey } from "vue";
import type { SyncStore } from "@syncraft-labs/core";

export type StoreRegistry = Map<string, SyncStore<never>>;

/**
 * Injection key for the Syncraft store registry.
 * @internal
 */
export const SyncraftRegistryKey: InjectionKey<StoreRegistry> = Symbol("SyncraftRegistry");

/**
 * Creates a Vue plugin that initializes the Syncraft Labs store registry.
 * Provides the registry to the Vue application, making it safe for SSR.
 *
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { createSyncraft } from '@syncraft-labs/vue'
 * import App from './App.vue'
 *
 * const app = createApp(App)
 * app.use(createSyncraft())
 * app.mount('#app')
 * ```
 */
export function createSyncraft() {
  const registry: StoreRegistry = new Map();

  return {
    install(app: App) {
      app.provide(SyncraftRegistryKey, registry);
    },
  };
}
