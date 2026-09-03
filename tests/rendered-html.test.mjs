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
  assert.match(page, /function safeHidingPosition\(spot: HidingSpot\)/);
  assert.match(page, /const hidingPosition = safeHidingPosition\(spot\)/);
  assert.match(page, /game\.player\.x = hidingPosition\.x/);
  assert.match(page, /game\.player\.y = hidingPosition\.y/);
});

test("flashlight beam alerts the monster to the player", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function flashlightHits\(game: Game, target: Point\)/);
  assert.match(page, /function rayRectDistance\(origin: Point, direction: Point, rect: Rect\)/);
  assert.match(page, /function flashlightBeamPolygon\(game: Game\)/);
  assert.match(page, /for \(const solid of SOLIDS\)/);
  assert.match(page, /const hitDistance = rayRectDistance\(game\.player, direction, solid\)/);
  assert.match(page, /const traceBeamPath = \(target: CanvasRenderingContext2D\)/);
  assert.match(page, /traceBeamPath\(darkness\); darkness\.clip\(\)/);
  assert.match(page, /traceBeamPath\(ctx\); ctx\.clip\(\)/);
  assert.match(page, /Math\.abs\(angleDelta\(targetAngle, game\.aim\)\) < FLASHLIGHT_HALF_ANGLE/);
  assert.match(page, /const monsterInBeam = flashlightHits\(game, monster\)/);
  assert.match(page, /const canSee = canSeePlayer \|\| monsterInBeam/);
  assert.match(page, /A LUZ ENTREGOU SUA POSIÇÃO/);
  assert.doesNotMatch(page, /darkness\.lineTo\(FLASHLIGHT_RANGE/);
  assert.doesNotMatch(page, /const lightBetrays = game\.flashlightOn/);
});

test("uses an analog digital joystick on mobile", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /joystick: Point/);
  assert.match(page, /game\.joystick = \{ x: x \/ maxTravel, y: y \/ maxTravel \}/);
  assert.match(page, /className=\{`digital-joystick/);
  assert.match(page, /onPointerMove=\{moveJoystick\}/);
  assert.doesNotMatch(page, /className="dpad"/);
  assert.match(styles, /\.digital-joystick/);
  assert.match(styles, /\.joystick-knob/);
});

test("keeps the monster from getting trapped against walls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function safeSpawnPoint\(preferred: Point, radius: number\)/);
  assert.match(page, /if \(!collides\(bounded, clearance\)\) return bounded/);
  assert.match(page, /function connectedSpawnPoint\(preferred: Point, radius: number, destination: Point\)/);
  assert.match(page, /const MONSTER_RADIUS = 16/);
  assert.match(page, /const MONSTER_PATH_CLEARANCE = 20/);
  assert.match(page, /const MONSTER_RECOVERY_CLEARANCE = 24/);
  assert.match(page, /const monsterStart = connectedSpawnPoint\(preview \? \{ x: 1600, y: 860 \} : \{ x: 880, y: 640 \}, MONSTER_RADIUS, patrolStart\)/);
  assert.doesNotMatch(page, /monsterStart = preview \? \{ x: 1520, y: 860 \} : \{ x: 210, y: 280 \}/);
  assert.match(page, /nearestFreeCell\([^\n]+origin: Point\)/);
  assert.match(page, /candidates\.find\(\(candidate\) => !movementBlocked\(origin, candidate\.point, MONSTER_RADIUS\)\)/);
  assert.match(page, /if \(!collides\(goal, MONSTER_PATH_CLEARANCE\) && !movementBlocked\(start, goal, MONSTER_PATH_CLEARANCE\)\)/);
  assert.match(page, /monster\.path = plannedPath\.length \? plannedPath : recoveryPath\(monster, monster\.target\)/);
  assert.match(page, /if \(movementBlocked\(monster, waypoint, MONSTER_PATH_CLEARANCE\)\)/);
  assert.match(page, /monster\.recoverUntil = game\.elapsed \+ 1\.35/);
  assert.match(page, /const progress = length - distance\(monster, waypoint\)/);
  assert.match(page, /const NAV_DIRECTIONS: \[number, number, number\]\[\]/);
  assert.match(page, /movementBlocked\(currentPoint, point, MONSTER_PATH_CLEARANCE\)/);
  assert.match(page, /if \(distance\(start, startCellPoint\) > 6\) result\.unshift\(startCellPoint\)/);
  assert.match(page, /monster\.pathIndex = furthestReachablePathIndex\(monster, monster\.path, monster\.pathIndex\)/);
  assert.match(page, /if \(monster\.mode !== "caçando" && distance\(monster, monster\.target\) < 34\)/);
  assert.match(page, /const directCloseChase = monster\.mode === "caçando" && playerDistance < 150/);
  assert.match(page, /function moveMonsterWithSteering\(monster: Monster, waypoint: Point, step: number\)/);
  assert.match(page, /const steeringAngles = \[0, \.3, -\.3, \.58, -\.58, \.86, -\.86, 1\.15, -1\.15, Math\.PI \/ 2, -Math\.PI \/ 2\]/);
  assert.match(page, /monster\.angle = Math\.atan2\(best\.y - monster\.y, best\.x - monster\.x\)/);
  assert.match(page, /const movedDistance = moveMonsterWithSteering\(monster, waypoint, intendedStep\)/);
  assert.match(page, /movedDistance < intendedStep \* \.35 \|\| progress < minimumProgress/);
  assert.match(page, /if \(monster\.stuckFor > \.42\)/);
  assert.match(page, /function repositionStuckMonster\(monster: Monster, goal: Point, elapsed: number\)/);
  assert.match(page, /for \(const doorway of DOORWAYS\)/);
  assert.match(page, /if \(!repositionStuckMonster\(monster, monster\.target, game\.elapsed\)\)/);
  assert.match(page, /monster\.x = selected\.x/);
  assert.match(page, /monster\.recoverUntil = elapsed \+ \.8/);
  assert.match(page, /function setAutonomousRoamTarget\(game: Game\)/);
  assert.match(page, /monster\.mode === "espreitando" && game\.elapsed >= monster\.roamChangeAt/);
  assert.match(page, /setAutonomousRoamTarget\(game\)/);
});

test("running creates noise that attracts a nearby monster", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const RUN_NOISE_INTERVAL = \.82/);
  assert.match(page, /const RUN_NOISE_RANGE = 900/);
  assert.match(page, /if \(sprinting\) \{\s+game\.runNoiseIn -= dt/);
  assert.match(page, /game\.noiseEvents \+= 1/);
  assert.match(page, /distance\(game\.monster, game\.player\) < RUN_NOISE_RANGE/);
  assert.match(page, /CORRER FAZ BARULHO — ELA PODE OUVIR/);
  assert.match(page, /noise_events: game\.noiseEvents/);
  assert.match(page, /CORRER \(FAZ BARULHO\)/);
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
  const walls = Function("MAP_W", "MAP_H", `return ${extractArray(/const WALLS: Rect\[\] = (\[[\s\S]*?\n\]);/)}`)(2400, 1600);
  const rooms = Function(`return ${extractArray(/const ROOMS = (\[[\s\S]*?\n\]);/)}`)();

  const mapItems = [...furniture, ...chairs.map((chair) => ({ ...chair, kind: "chair" }))];
  for (let first = 0; first < mapItems.length; first++) {
    for (let second = first + 1; second < mapItems.length; second++) {
      const item = mapItems[first];
      const other = mapItems[second];
      const overlapX = Math.min(item.x + item.w, other.x + other.w) - Math.max(item.x, other.x);
      const overlapY = Math.min(item.y + item.h, other.y + other.h) - Math.max(item.y, other.y);
      assert.ok(overlapX <= 0 || overlapY <= 0, `${item.kind} sobreposto a ${other.kind}`);
    }
  }

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

  const pointInRect = (point, rect, padding = 0) => point.x > rect.x - padding &&
    point.x < rect.x + rect.w + padding && point.y > rect.y - padding && point.y < rect.y + rect.h + padding;
  const blocked = (point) => [...walls, ...furniture].some((rect) => pointInRect(point, rect, 18));
  const blockedForMonster = (point) => [...walls, ...furniture].some((rect) => pointInRect(point, rect, 20));
  for (const spot of hidingSpots) {
    assert.equal(blocked(spot.check), false, `Saída do esconderijo ${spot.id} está bloqueada por um móvel ou parede`);
  }
  for (const room of rooms) {
    const cells = [];
    for (let y = room.y + 20; y < room.y + room.h; y += 40) {
      for (let x = room.x + 20; x < room.x + room.w; x += 40) {
        if (!blockedForMonster({ x, y })) cells.push({ x, y });
      }
    }
    const cellKeys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    const visited = new Set();
    let components = 0;
    for (const cell of cells) {
      const startKey = `${cell.x},${cell.y}`;
      if (visited.has(startKey)) continue;
      components += 1;
      const pending = [cell];
      visited.add(startKey);
      while (pending.length) {
        const current = pending.shift();
        for (const [dx, dy] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) {
          const next = { x: current.x + dx, y: current.y + dy };
          const nextKey = `${next.x},${next.y}`;
          if (cellKeys.has(nextKey) && !visited.has(nextKey)) {
            visited.add(nextKey);
            pending.push(next);
          }
        }
      }
    }
    assert.equal(components, 1, `${room.name} possui áreas bloqueadas pelos móveis`);
  }

  assert.match(page, /\{ kind: "table", x: 1360, y: 690, w: 150, h: 225 \}/);
  assert.match(page, /\{ x: 1415, y: 645, w: 40, h: 40, angle: 0 \}/);
  assert.match(page, /\{ id: "bed-bedroom"[^\n]+x: 245, y: 82, w: 205, h: 104/);
  assert.match(page, /\{ kind: "piano", x: 70, y: 390, w: 190, h: 65 \}/);
  assert.match(page, /\{ id: "storage-crates"[^\n]+check: \{ x: 450, y: 1275 \}/);
  assert.match(page, /\{ kind: "stairs", x: 980, y: 635, w: 88, h: 285 \}/);
});
