import fs from "fs";
import path from "path";
import { pages } from "../lib/pages.js";

export function generateSitemap(publicDir) {
  const now = new Date().toISOString().split("T")[0];
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
    const priority = p.category === "Overview & Setup" ? "0.9" : p.category === "Security & Advisories" ? "0.8" : "0.7";
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

  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemapXml.trim(), "utf-8");
  console.log("✓ Generated public/sitemap.xml");
}
