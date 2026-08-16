import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://syncraft-labs.web.id',
  integrations: [
    starlight({
      title: 'Syncraft Labs',
      description: 'Local-First State Synchronization Engine for React & Vue',
      favicon: '/favicon.png',
      logo: {
        src: './src/assets/logo.png',
      },
      social: {
        github: 'https://github.com/denislistiadi/syncraft-labs',
      },
      editLink: {
        baseUrl: 'https://github.com/denislistiadi/syncraft-labs/tree/main/apps/docs/',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { label: 'Getting Started', slug: 'getting-started' },
            { label: 'Core Concepts', slug: 'core-concepts' },
          ],
        },
        {
          label: 'Packages',
          items: [
            { label: 'Core', slug: 'packages/core' },
            { label: 'React', slug: 'packages/react' },
            { label: 'Vue', slug: 'packages/vue' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Cross-Tab Sync', slug: 'guides/cross-tab-sync' },
            { label: 'Error Handling', slug: 'guides/error-handling' },
            { label: 'Testing', slug: 'guides/testing' },
            { label: 'Sync Strategies', slug: 'guides/sync-strategies' },
            { label: 'Multi-Store Architecture', slug: 'guides/multi-store-architecture' },
            { label: 'SSR (Next.js/Nuxt)', slug: 'guides/ssr-nextjs-nuxt' },
            { label: 'Production Checklist', slug: 'guides/production-checklist' },
          ],
        },
      ],
    }),
    react(),
  ],
});
