import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '../src/content/docs');
const PUBLIC_DIR = path.join(__dirname, '../public');

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Pages configuration
const pages = [
  {
    category: 'Overview & Setup',
    file: 'getting-started.md',
    slug: 'getting-started',
    title: 'Getting Started',
    desc: 'Installation and quick start guide for Syncraft Labs in React, Vue, and vanilla JS.',
  },
  {
    category: 'Overview & Setup',
    file: 'core-concepts.md',
    slug: 'core-concepts',
    title: 'Core Concepts',
    desc: 'Learn the mental model behind Syncraft Labs — Architecture, Data Flow, Optimistic Updates, and Storage Schema.',
  },
  {
    category: 'Packages',
    file: 'packages/core.md',
    slug: 'packages/core',
    title: 'Core Package (@syncraft-labs/core)',
    desc: 'Framework-agnostic store engine, storage adapters, and outbox queue management.',
  },
  {
    category: 'Packages',
    file: 'packages/react.md',
    slug: 'packages/react',
    title: 'React Package (@syncraft-labs/react)',
    desc: 'React 18+ hooks, SyncProvider, and state synchronization bindings.',
  },
  {
    category: 'Packages',
    file: 'packages/vue.md',
    slug: 'packages/vue',
    title: 'Vue Package (@syncraft-labs/vue)',
    desc: 'Vue 3 composables, useSync, and Vue plugin integration.',
  },
  {
    category: 'Guides',
    file: 'guides/cross-tab-sync.md',
    slug: 'guides/cross-tab-sync',
    title: 'Cross-Tab Sync',
    desc: 'Real-time multi-tab synchronization using BroadcastChannel and storage events.',
  },
  {
    category: 'Guides',
    file: 'guides/error-handling.md',
    slug: 'guides/error-handling',
    title: 'Error Handling',
    desc: 'Error types, error listeners, retry mechanisms, and fallback strategies.',
  },
  {
    category: 'Guides',
    file: 'guides/sync-strategies.md',
    slug: 'guides/sync-strategies',
    title: 'Sync Strategies',
    desc: 'Optimistic, pessimistic, background, and custom sync strategies.',
  },
  {
    category: 'Guides',
    file: 'guides/multi-store-architecture.md',
    slug: 'guides/multi-store-architecture',
    title: 'Multi-Store Architecture',
    desc: 'Managing multiple stores, domain isolation, and modular state.',
  },
  {
    category: 'Guides',
    file: 'guides/ssr-nextjs-nuxt.md',
    slug: 'guides/ssr-nextjs-nuxt',
    title: 'SSR (Next.js & Nuxt)',
    desc: 'Hydration, server-side rendering, and client-side activation.',
  },
  {
    category: 'Guides',
    file: 'guides/testing.md',
    slug: 'guides/testing',
    title: 'Testing',
    desc: 'Unit testing, mocking storage adapters, and testing offline scenarios.',
  },
  {
    category: 'Guides',
    file: 'guides/production-checklist.md',
    slug: 'guides/production-checklist',
    title: 'Production Checklist',
    desc: 'Security, performance, migration, monitoring, and production readiness.',
  },
  {
    category: 'Security & Advisories',
    file: 'security/policy.md',
    slug: 'security/policy',
    title: 'Security Policy',
    desc: 'Supported version matrix, vulnerability reporting instructions, response SLAs, and safe harbor policy.',
  },
  {
    category: 'Security & Advisories',
    file: 'security/advisory-2026-001.md',
    slug: 'security/advisory-2026-001',
    title: 'Security Advisory: SYNCRAFT-SEC-2026-001',
    desc: 'Official post-mortem and remediation advisory regarding the PolinRider supply-chain attack on v0.4.1.',
  },
];

function cleanMarkdown(content) {
  let text = content.replace(/^---[\s\S]*?---\n*/, '').trim();
  // Transform Starlight callouts into standard markdown blockquotes
  text = text.replace(/:::(danger|warning|caution|note|tip)(?:\[(.*?)\])?\n([\s\S]*?):::/g, (_, type, title, body) => {
    const label = title ? `**[${type.toUpperCase()}: ${title}]**` : `**[${type.toUpperCase()}]**`;
    const formattedBody = body.trim().split('\n').map(line => `> ${line}`).join('\n');
    return `> ${label}\n>\n${formattedBody}`;
  });
  return text;
}

// 1. Generate llms.txt
let llmsTxt = `# Syncraft Labs Documentation

> Local-First State Synchronization Engine for React & Vue. Write instantly, persist automatically, sync eventually.
> Official Website: https://syncraft-labs.web.id
> GitHub Repository: https://github.com/denislistiadi/syncraft-labs
> Sitemap: https://syncraft-labs.web.id/sitemap.xml

`;

const categories = [...new Set(pages.map((p) => p.category))];

for (const cat of categories) {
  llmsTxt += `## ${cat}\n`;
  const catPages = pages.filter((p) => p.category === cat);
  for (const p of catPages) {
    llmsTxt += `- [${p.title}](https://syncraft-labs.web.id/${p.slug}/): ${p.desc}\n`;
  }
  llmsTxt += `\n`;
}

llmsTxt += `## Full Documentation & Sitemaps
- [llms-full.txt](https://syncraft-labs.web.id/llms-full.txt): Complete compiled documentation in a single file for AI agents and LLMs.
- [sitemap.xml](https://syncraft-labs.web.id/sitemap.xml): Full XML sitemap for search engines and crawlers.
`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt, 'utf-8');
console.log('✓ Generated public/llms.txt');

// 2. Generate llms-full.txt
let llmsFullTxt = `# Syncraft Labs - Full Documentation

> Complete documentation for Syncraft Labs (Local-First State Synchronization Engine for React & Vue).
> Generated automatically for AI Agents and LLMs.
> Website: https://syncraft-labs.web.id
> GitHub: https://github.com/denislistiadi/syncraft-labs
> Sitemap: https://syncraft-labs.web.id/sitemap.xml

---

# Table of Contents
`;

for (let i = 0; i < pages.length; i++) {
  const p = pages[i];
  llmsFullTxt += `${i + 1}. [${p.title}](#${p.slug.replace(/\//g, '-')})\n`;
}

llmsFullTxt += `\n---\n\n`;

for (const p of pages) {
  const filePath = path.join(DOCS_DIR, p.file);
  if (fs.existsSync(filePath)) {
    const rawContent = fs.readFileSync(filePath, 'utf-8');
    const cleanContent = cleanMarkdown(rawContent);

    llmsFullTxt += `<a id="${p.slug.replace(/\//g, '-')}"></a>\n`;
    llmsFullTxt += `# ${p.title}\n\n`;
    llmsFullTxt += `> URL: https://syncraft-labs.web.id/${p.slug}/\n\n`;
    llmsFullTxt += cleanContent;
    llmsFullTxt += `\n\n---\n\n`;
  }
}

fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt, 'utf-8');
console.log('✓ Generated public/llms-full.txt');

// 3. Generate sitemap.xml
const now = new Date().toISOString().split('T')[0];
let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://syncraft-labs.web.id/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
`;

for (const p of pages) {
  const priority = p.category === 'Overview & Setup' ? '0.9' : p.category === 'Security & Advisories' ? '0.8' : '0.7';
  sitemapXml += `  <url>
    <loc>https://syncraft-labs.web.id/${p.slug}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>
`;
}

sitemapXml += `  <url>
    <loc>https://syncraft-labs.web.id/playground/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml.trim(), 'utf-8');
console.log('✓ Generated public/sitemap.xml');
