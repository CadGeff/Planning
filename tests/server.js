// Serveur statique de développement et de test : sert public/ avec les en-têtes de public/_headers,
// comme Cloudflare Pages. Lance aussi, sur le port suivant, une page « tierce » qui tente
// d'afficher l'application dans une iframe (test anti-clickjacking).
//   node tests/server.js            → http://localhost:4173
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** Lit _headers (une seule règle « /* ») ; les lignes « ! Nom » retirent un en-tête ajouté par Cloudflare. */
async function loadHeaders() {
  const text = await readFile(join(ROOT, "_headers"), "utf8");
  return text
    .split("\n")
    .filter((l) => /^\s+[^\s!#]/.test(l))
    .map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
}

const headers = await loadHeaders();

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) || path === "/_headers") {
    res.writeHead(404).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    const body = await readFile(file);
    for (const [k, v] of headers) res.setHeader(k, v);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`Semainier : http://localhost:${PORT}`));

createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    `<!doctype html><title>Site tiers</title><iframe id="victim" src="http://localhost:${PORT}/#demo" width="900" height="600"></iframe>`,
  );
}).listen(PORT + 1);
