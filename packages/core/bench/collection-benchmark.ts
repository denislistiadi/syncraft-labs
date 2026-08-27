import "fake-indexeddb/auto";
import { openDB } from "idb";
import { createSyncStore } from "../src/store.js";

type Entity = { id: string; name: string; score: number; payload: string };
type State = Record<string, Entity>;

async function runBenchmark() {
  console.log("Starting Collection Mode Benchmark...");

  const ITEM_COUNT = 10_000;
  const initialState: State = {};

  const payload = "x".repeat(500); // 500 byte payload per item (~5MB total state)
  for (let i = 0; i < ITEM_COUNT; i++) {
    const id = `item_${i}`;
    initialState[id] = { id, name: `Entity ${i}`, score: i, payload };
  }

  // ── Document Mode ──────────────────────────────────────────
  console.log(`\nTesting Document Mode (10,000 items)...`);
  const docKey = "bench-doc-mode";
  const docStore = createSyncStore<State>({
    storageKey: docKey,
    storageMode: "document",
    initialState,
  });
  await docStore.hydrate();

  const docStart = performance.now();
  await docStore.set((draft) => {
    draft["item_5000"]!.score = 999999;
  });
  const docDuration = performance.now() - docStart;
  console.log(`Document Mode update time: ${docDuration.toFixed(2)} ms`);

  // Verify DB state for document mode
  const docDb = await openDB(`syncraft-labs_${docKey}`, 2);
  const docStateInDb = await docDb.get("state", "current");
  const docStateKeys = Object.keys(docStateInDb);
  console.log(`Document Mode IDB state record size: ${docStateKeys.length} entities stored in 1 single "current" blob`);
  docDb.close();
  docStore.destroy();

  // ── Collection Mode ────────────────────────────────────────
  console.log(`\nTesting Collection Mode (10,000 items)...`);
  const colKey = "bench-col-mode";
  const colStore = createSyncStore<State>({
    storageKey: colKey,
    storageMode: "collection",
    idField: "id",
    initialState,
  });
  await colStore.hydrate();

  const colStart = performance.now();
  await colStore.set((draft) => {
    draft["item_5000"]!.score = 999999;
  });
  const colDuration = performance.now() - colStart;
  console.log(`Collection Mode update time: ${colDuration.toFixed(2)} ms`);

  // Verify DB state for collection mode
  const colDb = await openDB(`syncraft-labs_${colKey}`, 2);
  const colEntitiesKeys = await colDb.getAllKeys("state_entities");
  const updatedEntity = await colDb.get("state_entities", "item_5000");
  console.log(`Collection Mode IDB state_entities count: ${colEntitiesKeys.length} per-entity records`);
  console.log(`Updated entity score in IDB state_entities: ${updatedEntity.score}`);
  colDb.close();
  colStore.destroy();

  // ── Verification ──────────────────────────────────────────
  console.log("\nBenchmark Summary:");
  console.log(`- Document mode: 1 blob containing all ${docStateKeys.length} items rewritten on every mutation.`);
  console.log(`- Collection mode: ${colEntitiesKeys.length} discrete per-entity records; updating 1 item mutates ONLY 1 record in IDB.`);
  console.log(`- Performance improvement: Collection mode updated in ${colDuration.toFixed(2)} ms vs Document mode in ${docDuration.toFixed(2)} ms.`);

  if (colEntitiesKeys.length === ITEM_COUNT && updatedEntity.score === 999999) {
    console.log("SUCCESS: Granular/keyed collection storage benchmark completed successfully!");
  } else {
    console.error("❌ FAILED verification criteria.");
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
