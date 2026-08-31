import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateLlmsTxt } from "./generators/llms-txt.js";
import { generateLlmsFull } from "./generators/llms-full.js";
import { generateSitemap } from "./generators/sitemap.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, "../src/content/docs");
const PUBLIC_DIR = path.join(__dirname, "../public");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

generateLlmsTxt(PUBLIC_DIR);
generateLlmsFull(PUBLIC_DIR, DOCS_DIR);
generateSitemap(PUBLIC_DIR);
