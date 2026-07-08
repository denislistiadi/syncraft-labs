import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Syncraft Labs',
  tagline: 'Local-First State Synchronization Engine for React & Vue',
  favicon: 'img/favicon.ico',

  url: 'https://docs.syncraft-labs.com',
  baseUrl: '/',

  organizationName: 'denislistiadi',
  projectName: 'syncraft-labs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/denislistiadi/syncraft-labs/tree/main/apps/docs/',
        },
        blog: false, // Disable the blog for now
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
          label: 'Documentation',
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
              to: '/docs/intro',
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
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
