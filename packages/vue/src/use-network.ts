/**
 * @module @syncraft-labs/vue/use-network
 *
 * Composable for tracking browser network status and triggering sync on reconnect.
 */

import { ref, onMounted, onScopeDispose, type Ref } from "vue";
import type { VueStoreController } from "./controller.js";

export interface UseNetworkStatusReturn {
  readonly isOffline: Ref<boolean>;
}

/**
 * Tracks browser online/offline status and triggers store sync when network recovers.
 *
 * @param controller - The active Vue store controller.
 * @returns An object containing a reactive `isOffline` boolean ref.
 */
export function useNetworkStatus(
  controller: VueStoreController<any>,
): UseNetworkStatusReturn {
  const isOffline = ref<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  const handleOnline = () => {
    isOffline.value = false;
    controller.triggerSync();
  };

  const handleOffline = () => {
    isOffline.value = true;
  };

  onMounted(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
  });

  onScopeDispose(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  return { isOffline };
}
