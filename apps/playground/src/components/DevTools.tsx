import type { TodoState } from "../types";

export function DevTools({ 
  data, 
  isSyncing, 
  isHydrating, 
  isOffline 
}: { 
  data: TodoState | undefined;
  isSyncing: boolean;
  isHydrating: boolean;
  isOffline: boolean;
}) {
  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col h-[500px] lg:h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Store Inspector</span>
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] text-zinc-500 mr-1 uppercase font-medium tracking-wide">Status</span>
          {isHydrating && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Hydrating" />}
          {isSyncing && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Syncing" />}
          {isOffline && <span className="w-2 h-2 rounded-full bg-red-500" title="Offline" />}
          {!isOffline && !isSyncing && !isHydrating && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Idle" />}
        </div>
      </div>
      <div className="p-4 overflow-auto text-[13px] font-mono text-zinc-400 flex-1 bg-zinc-950">
        {data ? (
          <pre 
            className="text-zinc-300 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: `<span class="text-pink-400">const</span> storeState <span class="text-pink-400">=</span> ` + 
                JSON.stringify(data, null, 2)
                  .replace(/"([^"]+)":/g, '<span class="text-blue-300">"$1"</span>:')
                  .replace(/: (true|false)/g, ': <span class="text-purple-400">$1</span>')
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600">
            No data available
          </div>
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-[11px] text-zinc-500">
        <span>Powered by IndexedDB & Immer</span>
        <span className="font-mono bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/50">O(1) Drafts</span>
      </div>
    </div>
  );
}
