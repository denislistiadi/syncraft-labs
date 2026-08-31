export const pages = [
  {
    category: "Overview & Setup",
    file: "getting-started.md",
    slug: "getting-started",
    title: "Getting Started",
    desc: "Installation and quick start guide for Syncraft Labs in React, Vue, and vanilla JS.",
  },
  {
    category: "Overview & Setup",
    file: "core-concepts.md",
    slug: "core-concepts",
    title: "Core Concepts",
    desc: "Learn the mental model behind Syncraft Labs — Architecture, Data Flow, Optimistic Updates, and Storage Schema.",
  },
  {
    category: "Packages",
    file: "packages/core.md",
    slug: "packages/core",
    title: "Core Package (@syncraft-labs/core)",
    desc: "Framework-agnostic store engine, storage adapters, and outbox queue management.",
  },
  {
    category: "Packages",
    file: "packages/react.md",
    slug: "packages/react",
    title: "React Package (@syncraft-labs/react)",
    desc: "React 18+ hooks, SyncProvider, and state synchronization bindings.",
  },
  {
    category: "Packages",
    file: "packages/vue.md",
    slug: "packages/vue",
    title: "Vue Package (@syncraft-labs/vue)",
    desc: "Vue 3 composables, useSync, and Vue plugin integration.",
  },
  {
    category: "Guides",
    file: "guides/cross-tab-sync.md",
    slug: "guides/cross-tab-sync",
    title: "Cross-Tab Sync",
    desc: "Real-time multi-tab synchronization using BroadcastChannel and storage events.",
  },
  {
    category: "Guides",
    file: "guides/error-handling.md",
    slug: "guides/error-handling",
    title: "Error Handling",
    desc: "Error types, error listeners, retry mechanisms, and fallback strategies.",
  },
  {
    category: "Guides",
    file: "guides/sync-strategies.md",
    slug: "guides/sync-strategies",
    title: "Sync Strategies",
    desc: "Optimistic, pessimistic, background, and custom sync strategies.",
  },
  {
    category: "Guides",
    file: "guides/multi-store-architecture.md",
    slug: "guides/multi-store-architecture",
    title: "Multi-Store Architecture",
    desc: "Managing multiple stores, domain isolation, and modular state.",
  },
  {
    category: "Guides",
    file: "guides/ssr-nextjs-nuxt.md",
    slug: "guides/ssr-nextjs-nuxt",
    title: "SSR (Next.js & Nuxt)",
    desc: "Hydration, server-side rendering, and client-side activation.",
  },
  {
    category: "Guides",
    file: "guides/testing.md",
    slug: "guides/testing",
    title: "Testing",
    desc: "Unit testing, mocking storage adapters, and testing offline scenarios.",
  },
  {
    category: "Guides",
    file: "guides/production-checklist.md",
    slug: "guides/production-checklist",
    title: "Production Checklist",
    desc: "Security, performance, migration, monitoring, and production readiness.",
  },
  {
    category: "Security & Advisories",
    file: "security/policy.md",
    slug: "security/policy",
    title: "Security Policy",
    desc: "Supported version matrix, vulnerability reporting instructions, response SLAs, and safe harbor policy.",
  },
  {
    category: "Security & Advisories",
    file: "security/advisory-2026-001.md",
    slug: "security/advisory-2026-001",
    title: "Security Advisory: SYNCRAFT-SEC-2026-001",
    desc: "Official post-mortem and remediation advisory regarding the PolinRider supply-chain attack on v0.4.1.",
  },
];

export const sidebarGroups = [
  {
    label: "Start Here",
    items: [
      { label: "Getting Started", slug: "getting-started" },
      { label: "Core Concepts", slug: "core-concepts" },
    ],
  },
  {
    label: "Packages",
    items: [
      { label: "Core", slug: "packages/core" },
      { label: "React", slug: "packages/react" },
      { label: "Vue", slug: "packages/vue" },
    ],
  },
  {
    label: "Guides",
    items: [
      { label: "Cross-Tab Sync", slug: "guides/cross-tab-sync" },
      { label: "Error Handling", slug: "guides/error-handling" },
      { label: "Testing", slug: "guides/testing" },
      { label: "Sync Strategies", slug: "guides/sync-strategies" },
      { label: "Multi-Store Architecture", slug: "guides/multi-store-architecture" },
      { label: "SSR (Next.js/Nuxt)", slug: "guides/ssr-nextjs-nuxt" },
      { label: "Production Checklist", slug: "guides/production-checklist" },
    ],
  },
  {
    label: "Security & Advisories",
    items: [
      { label: "Security Policy", slug: "security/policy" },
      { label: "Advisory SYNCRAFT-SEC-2026-001", slug: "security/advisory-2026-001" },
    ],
  },
];
