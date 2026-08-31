import fs from "fs";
import path from "path";
import { pages } from "../lib/pages.js";

export function generateLlmsTxt(publicDir) {
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

  fs.writeFileSync(path.join(publicDir, "llms.txt"), llmsTxt, "utf-8");
  console.log("✓ Generated public/llms.txt");
}
