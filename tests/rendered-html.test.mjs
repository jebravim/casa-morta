import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Casa Morta with account access", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Casa Morta/);
  assert.match(html, /NÃO DEIXE QUE ELA/);
  assert.match(html, /ENTRAR NA CASA/);
  assert.match(html, /ENTRAR PARA SALVAR DESEMPENHO/);
  assert.match(html, /class="account-trigger"/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("connects authenticated players to protected session history", async () => {
  const [page, neonClient] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/neon.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /neon\.auth\.signUp\.email/);
  assert.match(page, /neon\.auth\.signIn\.email/);
  assert.match(page, /neon\.from\("game_sessions"\)\.insert/);
  assert.match(page, /\.order\("played_at", \{ ascending: false \}\)/);
  assert.match(page, /\.limit\(8\)/);
  assert.match(neonClient, /neonauth/);
  assert.match(neonClient, /apirest/);
  assert.doesNotMatch(neonClient, /postgres(?:ql)?:\/\//i);
});
