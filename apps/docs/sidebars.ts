import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Framework Guides',
      collapsed: false,
      items: ['packages/react', 'packages/vue'],
    },
  ],
};

export default sidebars;
