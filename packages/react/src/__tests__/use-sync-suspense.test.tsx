/**
 * Tests for the `useSyncSuspense` React hook.
 */
import { Suspense, Component, type ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createSyncStore } from "@syncraft-labs/core";
import { useSyncSuspense, SyncraftProvider } from "../index.js";

type TestState = {
  count: number;
  title: string;
};

const INITIAL_STATE: TestState = { count: 10, title: "Suspense Initial" };

let keyCounter = 0;
function uniqueKey(): string {
  keyCounter++;
  return `suspense-test-${keyCounter}-${Date.now()}`;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TestErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error)
      ) : (
        <div data-testid="error-boundary">
          Error: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function SuspenseComponent({
  storageKey,
  initialState,
  fetcher,
}: {
  storageKey: string;
  initialState?: TestState;
  fetcher?: () => Promise<TestState>;
}) {
  const { data } = useSyncSuspense<TestState>(storageKey, {
    initialState,
    fetcher,
  });

  return (
    <div>
      <h1 data-testid="count">{data.count}</h1>
      <p data-testid="title">{data.title}</p>
    </div>
  );
}

describe("useSyncSuspense", () => {
  it("suspends during hydration and renders data when hydrated", async () => {
    const key = uniqueKey();

    // Pre-populate IndexedDB
    const store = createSyncStore<TestState>({
      storageKey: key,
      initialState: INITIAL_STATE,
    });
    await store.hydrate();
    await store.set((d) => {
      d.count = 99;
      d.title = "Loaded from IDB";
    });
    store.destroy();

    render(
      <SyncraftProvider>
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
          <SuspenseComponent storageKey={key} initialState={INITIAL_STATE} />
        </Suspense>
      </SyncraftProvider>,
    );

    // Initial fallback should show
    expect(screen.getByTestId("loading")).toBeDefined();

    // Wait for hydration to finish and render content
    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("99");
    });
    expect(screen.getByTestId("title").textContent).toBe("Loaded from IDB");
  });

  it("suspends on initial fetch if store has no data", async () => {
    const key = uniqueKey();

    const fetcher = vi.fn().mockImplementation(async () => {
      return { count: 50, title: "Fetched Data" };
    });

    render(
      <SyncraftProvider>
        <Suspense fallback={<div data-testid="loading">Loading...</div>}>
          <SuspenseComponent storageKey={key} fetcher={fetcher} />
        </Suspense>
      </SyncraftProvider>,
    );

    expect(screen.getByTestId("loading")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("50");
    });
    expect(screen.getByTestId("title").textContent).toBe("Fetched Data");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("catches hydration rejection in ErrorBoundary without infinite throw loop", async () => {
    const key = uniqueKey();
    const faultyKey = `${key}-faulty`;

    render(
      <SyncraftProvider>
        <TestErrorBoundary>
          <Suspense fallback={<div data-testid="loading">Loading...</div>}>
            <SuspenseComponent storageKey={faultyKey} />
          </Suspense>
        </TestErrorBoundary>
      </SyncraftProvider>,
    );

    // It should hit ErrorBoundary rather than looping infinitely
    await waitFor(() => {
      expect(screen.getByTestId("error-boundary")).toBeDefined();
    });
    expect(screen.getByTestId("error-boundary").textContent).toContain(
      "useSyncSuspense: Store",
    );
  });
});
