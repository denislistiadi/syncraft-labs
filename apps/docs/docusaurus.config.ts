import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Syncraft Labs',
  tagline: 'Local-First State Synchronization Engine for React & Vue',
  favicon: 'img/favicon.ico',

  url: 'https://syncraft-labs.web.id',
  baseUrl: '/',

  organizationName: 'denislistiadi',
  projectName: 'syncraft-labs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/denislistiadi/syncraft-labs/tree/main/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Syncraft Labs',
      logo: {
        alt: 'Syncraft Labs Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/playground',
          label: 'Playground',
          position: 'left',
        },
        {
          href: 'https://github.com/denislistiadi/syncraft-labs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/docs/',
            },
            {
              label: 'React',
              to: '/docs/packages/react',
            },
            {
              label: 'Vue',
              to: '/docs/packages/vue',
            },
          ],
        },
        {
          title: 'Try It',
          items: [
            {
              label: 'Playground',
              to: '/playground',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/denislistiadi/syncraft-labs',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/@syncraft-labs/core',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Syncraft Labs. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['markup', 'markup-templating'],
    },
    metadata: [
      {name: 'keywords', content: 'local-first, state management, react, vue, sync, indexeddb, offline-first'},
      {name: 'description', content: 'Local-First State Synchronization Engine for React & Vue'},
      {name: 'og:image', content: 'https://syncraft-labs.web.id/img/social-card.png'},
      {name: 'twitter:card', content: 'summary_large_image'},
    ],
  } satisfies Preset.ThemeConfig,
};

export default config;

