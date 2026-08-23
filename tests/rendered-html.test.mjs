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
  assert.match(html, /A CASA APRENDE SEUS PASSOS/);
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

test("offers pause, resume, and exit controls during a match", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /type Mode = "intro" \| "running" \| "paused"/);
  assert.match(page, /key === "escape"/);
  assert.match(page, /JOGO PAUSADO/);
  assert.match(page, /CONTINUAR/);
  assert.match(page, /SAIR DA PARTIDA/);
  assert.match(page, /gameRef\.current = makeGame\(true\)/);
});

test("shows and implements the hold-breath control", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /SEGURE \[ESPAÇO\] PARA PRENDER A RESPIRAÇÃO/);
  assert.match(page, /event\.code === "Space" \? "space"/);
  assert.match(page, /game\.keys\.has\("space"\)/);
  assert.match(page, /HELD_BREATH_DRAIN = 1/);
  assert.match(page, /RELEASED_BREATH_DRAIN = 2\.4/);
  assert.match(page, /className="breath-button"/);
});

test("keeps doorways traversable and applies the latest difficulty tuning", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function insideDoorwayPassage/);
  assert.match(page, /if \(insideDoorwayPassage\(point, radius\)\) return false/);
  assert.match(page, /if \(!collides\(nextX, radius\)\)/);
  assert.match(page, /INITIAL_FLASHLIGHT_BATTERY = 10/);
  assert.match(page, /FLASHLIGHT_DRAIN_PER_SECOND = 1\.18/);
  assert.match(page, /battery: INITIAL_FLASHLIGHT_BATTERY/);
  assert.match(page, /MONSTER_CHASE_SPEED = 180/);
  assert.match(page, /MONSTER_INVESTIGATE_SPEED = 160/);

  const extractArray = (pattern) => {
    const match = page.match(pattern);
    assert.ok(match, `Não foi possível ler o mapa com ${pattern}`);
    return match[1].replace(/ as const/g, "");
  };
  const hidingSpots = Function(`return ${extractArray(/const HIDING_SPOTS: HidingSpot\[\] = (\[[\s\S]*?\n\]);/)}`)();
  const furniture = Function("HIDING_SPOTS", `return ${extractArray(/const FURNITURE: Furniture\[\] = (\[[\s\S]*?\n\]);/)}`)(hidingSpots);
  const chairs = Function(`return ${extractArray(/const CHAIRS: Chair\[\] = (\[[\s\S]*?\n\]);/)}`)();
  const doorways = Function(`return ${extractArray(/const DOORWAYS: Doorway\[\] = (\[[\s\S]*?\n\]);/)}`)();

  for (const doorway of doorways) {
    const clearance = doorway.axis === "vertical"
      ? { x: doorway.x - 100, y: doorway.y, w: 200, h: doorway.length }
      : { x: doorway.x, y: doorway.y - 100, w: doorway.length, h: 200 };
    for (const item of [...furniture, ...chairs]) {
      const overlapX = Math.min(item.x + item.w, clearance.x + clearance.w) - Math.max(item.x, clearance.x);
      const overlapY = Math.min(item.y + item.h, clearance.y + clearance.h) - Math.max(item.y, clearance.y);
      assert.ok(overlapX <= 0 || overlapY <= 0, `Móvel ${item.kind} próximo demais da porta em ${doorway.x},${doorway.y}`);
    }
  }

  assert.match(page, /\{ kind: "table", x: 1360, y: 690, w: 150, h: 225 \}/);
  assert.match(page, /\{ x: 1415, y: 645, w: 40, h: 40, angle: 0 \}/);
});
