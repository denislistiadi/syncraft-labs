import fs from "fs";
import path from "path";
import { pages } from "../lib/pages.js";
import { cleanMarkdown } from "../lib/markdown.js";

export function generateLlmsFull(publicDir, docsDir) {
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
    llmsFullTxt += `${i + 1}. [${p.title}](#${p.slug.replace(/\//g, "-")})\n`;
  }

  llmsFullTxt += `\n---\n\n`;

  for (const p of pages) {
    const filePath = path.join(docsDir, p.file);
    if (fs.existsSync(filePath)) {
      const rawContent = fs.readFileSync(filePath, "utf-8");
      const cleanContent = cleanMarkdown(rawContent);
      llmsFullTxt += `<a id="${p.slug.replace(/\//g, "-")}"></a>\n`;
      llmsFullTxt += `# ${p.title}\n\n`;
      llmsFullTxt += `> URL: https://syncraft-labs.web.id/${p.slug}/\n\n`;
      llmsFullTxt += cleanContent;
      llmsFullTxt += `\n\n---\n\n`;
    } else {
      console.warn(`⚠ Skipping missing doc: ${p.file}`);
    }
  }

  fs.writeFileSync(path.join(publicDir, "llms-full.txt"), llmsFullTxt, "utf-8");
  console.log("✓ Generated public/llms-full.txt");
}
