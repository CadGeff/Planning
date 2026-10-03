// Cohérence entre le README et le dépôt, pour ce qui se vérifie mécaniquement.
// Le fond des phrases reste à relire à la main avant chaque version.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const exists = (path) => existsSync(new URL(path, root));

const readme = read("README.md");
const pkg = JSON.parse(read("package.json"));
const modules = readdirSync(new URL("public/js/", root)).filter((f) => f.endsWith(".js"));
/** Bloc de code de la section « Structure ». */
const structure = readme.split("## Structure")[1].split("```")[1];

test("README : la section Structure cite chaque module de public/js", () => {
  const missing = modules.filter((f) => !structure.includes(f));
  assert.deepEqual(missing, [], "modules absents de la section Structure");
});

test("README : chaque module cité dans la section Structure existe", () => {
  const jsBlock = structure.split("  js/")[1].split("  vendor/")[0];
  const cited = [...jsBlock.matchAll(/\b([a-z]+\.js)\b/g)].map((m) => m[1]);
  assert.ok(cited.length >= modules.length);
  assert.deepEqual(
    cited.filter((f) => !modules.includes(f)),
    [],
    "modules cités mais introuvables",
  );
});

test("README : les dossiers et fichiers de la section Structure existent", () => {
  const paths = [
    "public/index.html",
    "public/_headers",
    "public/styles.css",
    "public/theme.js",
    "public/config.js",
    "public/sw.js",
    "public/manifest.webmanifest",
    "public/vendor",
    "public/fonts",
    "public/icons",
    "supabase/schema.sql",
    "tests/unit",
    "tests/e2e",
    "tests/server.js",
    ".github",
    "types",
    "docs",
  ];
  for (const p of paths) {
    const name = p.replace(/^public\//, "");
    assert.ok(structure.includes(name.split("/").pop()), `${p} n'est pas cité`);
    assert.ok(exists(p), `${p} est cité mais n'existe pas`);
  }
});

test("README : les images et les liens vers des fichiers du dépôt existent", () => {
  const targets = [
    ...[...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]),
    ...[...readme.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]),
    ...[...readme.matchAll(/\]\(([^)#]+)\)/g)].map((m) => m[1]),
  ].filter((t) => !/^https?:/.test(t));
  assert.ok(targets.length >= 5);
  for (const t of new Set(targets)) assert.ok(exists(t), `${t} est référencé mais n'existe pas`);
});

test("README : la version de supabase-js annoncée est celle du dossier vendor", () => {
  const announced = structure.match(/supabase-js (\d+\.\d+\.\d+)/)[1];
  assert.ok(exists(`public/vendor/supabase-${announced}.js`));
  assert.ok(read("public/index.html").includes(`vendor/supabase-${announced}.js`));
});

test("README : la version de Node annoncée est celle de package.json", () => {
  const announced = readme.match(/Node (\d+) ou plus/)[1];
  assert.equal(pkg.engines.node, `>=${announced}`);
});

test("service worker : chaque module de public/js est mis en cache", () => {
  const sw = read("public/sw.js");
  assert.deepEqual(
    modules.filter((f) => !sw.includes(`"js/${f}"`)),
    [],
    "modules absents de la liste SHELL",
  );
});
