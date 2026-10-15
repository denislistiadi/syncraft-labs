import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import mermaid from 'astro-mermaid';
import { sidebarGroups } from './scripts/lib/pages.js';

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
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/denislistiadi/syncraft-labs' },
      ],
      editLink: {
        baseUrl: 'https://github.com/denislistiadi/syncraft-labs/tree/main/apps/docs/',
      },
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'google-site-verification',
            content: 'At-3D8gAIF9if6cRDIAJC302O9nmaXEDyPKR6zTtxvQ',
          },
        },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: sidebarGroups,
    }),

    mermaid(),
    react(),
  ],
});
