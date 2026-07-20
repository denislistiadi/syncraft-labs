import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'getting-started',
    'core-concepts',
    {
      type: 'category',
      label: 'API Reference',
      collapsed: false,
      items: [
        'packages/core',
        'packages/react',
        'packages/vue',
      ],
    },
    {
      type: 'category',
      label: 'Production Guides',
      collapsed: false,
      items: [
        'guides/production-checklist',
        'guides/multi-store-architecture',
        'guides/ssr-nextjs-nuxt',
        'guides/error-handling',
        'guides/sync-strategies',
        'guides/testing',
        'guides/cross-tab-sync',
      ],
    },
  ],
};

export default sidebars;
