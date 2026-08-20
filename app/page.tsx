"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
type Mode = "intro" | "running" | "won" | "lost";
type MonsterMode = "espreitando" | "investigando" | "caçando" | "procurando";

type HidingSpot = Rect & {
  id: string;
  label: string;
  check: Point;
  kind: "armário" | "cama" | "cortina";
};

type Furniture = Rect & {
  kind: "bed" | "wardrobe" | "shelf" | "table" | "sofa" | "crate" | "piano" | "counter";
};

type Battery = Point & { taken: boolean };

type Monster = Point & {
  mode: MonsterMode;
  angle: number;
  target: Point;
  lastSeen: Point;
  path: Point[];
  pathIndex: number;
  repathIn: number;
  searchUntil: number;
  lastCheckedSpot: string | null;
};

type Game = {
  mode: Mode;
  elapsed: number;
  player: Point;
  monster: Monster;
  aim: number;
  camera: Point;
  keys: Set<string>;
  flashlightOn: boolean;
  battery: number;
  stamina: number;
  hiddenSpot: string | null;
  hideRemaining: number;
  hideCooldown: number;
  hideUses: Record<string, number>;
  roomHeat: Record<string, number>;
  heatClock: number;
  noiseIndex: number;
  noisePulse: (Point & { life: number }) | null;
  batteries: Battery[];
  collected: number;
  message: string;
  messageUntil: number;
  hudClock: number;
  lastFrame: number;
  audio: AudioContext | null;
};

type Hud = {
  remaining: number;
  battery: number;
  stamina: number;
  room: string;
  monster: MonsterMode;
  noiseIn: number;
  hidden: boolean;
  hideRemaining: number;
  cooldown: number;
  prompt: string;
  message: string;
  memory: number;
  collected: number;
};

const MAP_W = 2400;
const MAP_H = 1600;
const PLAYER_RADIUS = 14;

const ROOMS = [
  { name: "QUARTO VAZIO", x: 40, y: 40, w: 560, h: 480 },
  { name: "BIBLIOTECA", x: 628, y: 40, w: 572, h: 480 },
  { name: "QUARTO DA CRIANÇA", x: 1228, y: 40, w: 572, h: 480 },
  { name: "ATELIÊ", x: 1828, y: 40, w: 532, h: 480 },
  { name: "COZINHA", x: 40, y: 548, w: 560, h: 502 },
  { name: "HALL CENTRAL", x: 628, y: 548, w: 572, h: 502 },
  { name: "SALA DE JANTAR", x: 1228, y: 548, w: 572, h: 502 },
  { name: "ESCRITÓRIO", x: 1828, y: 548, w: 532, h: 502 },
  { name: "DESPENSA", x: 40, y: 1078, w: 560, h: 482 },
  { name: "PORÃO", x: 628, y: 1078, w: 572, h: 482 },
  { name: "LAVANDERIA", x: 1228, y: 1078, w: 572, h: 482 },
  { name: "SALA SELADA", x: 1828, y: 1078, w: 532, h: 482 },
];

const WALLS: Rect[] = [
  { x: 0, y: 0, w: MAP_W, h: 40 }, { x: 0, y: MAP_H - 40, w: MAP_W, h: 40 },
  { x: 0, y: 0, w: 40, h: MAP_H }, { x: MAP_W - 40, y: 0, w: 40, h: MAP_H },
  { x: 600, y: 40, w: 28, h: 175 }, { x: 600, y: 335, w: 28, h: 390 },
  { x: 600, y: 845, w: 28, h: 365 }, { x: 600, y: 1330, w: 28, h: 230 },
  { x: 1200, y: 40, w: 28, h: 335 }, { x: 1200, y: 495, w: 28, h: 190 },
  { x: 1200, y: 805, w: 28, h: 440 }, { x: 1200, y: 1365, w: 28, h: 195 },
  { x: 1800, y: 40, w: 28, h: 205 }, { x: 1800, y: 365, w: 28, h: 370 },
  { x: 1800, y: 855, w: 28, h: 315 }, { x: 1800, y: 1290, w: 28, h: 270 },
  { x: 40, y: 520, w: 245, h: 28 }, { x: 405, y: 520, w: 455, h: 28 },
  { x: 980, y: 520, w: 460, h: 28 }, { x: 1560, y: 520, w: 440, h: 28 },
  { x: 2120, y: 520, w: 240, h: 28 },
  { x: 40, y: 1050, w: 365, h: 28 }, { x: 525, y: 1050, w: 395, h: 28 },
  { x: 1040, y: 1050, w: 440, h: 28 }, { x: 1600, y: 1050, w: 410, h: 28 },
  { x: 2130, y: 1050, w: 230, h: 28 },
];

const HIDING_SPOTS: HidingSpot[] = [
  { id: "wardrobe-bedroom", label: "roupeiro antigo", kind: "armário", x: 82, y: 82, w: 76, h: 112, check: { x: 185, y: 140 } },
  { id: "bed-bedroom", label: "debaixo da cama", kind: "cama", x: 352, y: 132, w: 158, h: 86, check: { x: 430, y: 260 } },
  { id: "library-curtain", label: "atrás da cortina", kind: "cortina", x: 1082, y: 74, w: 78, h: 122, check: { x: 1048, y: 150 } },
  { id: "child-bed", label: "cama infantil", kind: "cama", x: 1385, y: 170, w: 142, h: 78, check: { x: 1455, y: 286 } },
  { id: "atelier-wardrobe", label: "armário de telas", kind: "armário", x: 2240, y: 330, w: 76, h: 122, check: { x: 2205, y: 390 } },
  { id: "kitchen-pantry", label: "despensa estreita", kind: "armário", x: 72, y: 740, w: 92, h: 130, check: { x: 195, y: 805 } },
  { id: "hall-curtain", label: "cortina do hall", kind: "cortina", x: 650, y: 575, w: 74, h: 130, check: { x: 755, y: 640 } },
  { id: "office-desk", label: "embaixo da escrivaninha", kind: "cama", x: 2010, y: 745, w: 162, h: 82, check: { x: 2090, y: 870 } },
  { id: "storage-crates", label: "atrás das caixas", kind: "armário", x: 390, y: 1320, w: 120, h: 112, check: { x: 350, y: 1375 } },
  { id: "basement-locker", label: "armário do porão", kind: "armário", x: 668, y: 1370, w: 80, h: 126, check: { x: 780, y: 1435 } },
  { id: "laundry-sheet", label: "lençóis pendurados", kind: "cortina", x: 1670, y: 1280, w: 78, h: 140, check: { x: 1635, y: 1350 } },
  { id: "sealed-wardrobe", label: "confessionário", kind: "armário", x: 2250, y: 1120, w: 74, h: 128, check: { x: 2210, y: 1185 } },
];

const FURNITURE: Furniture[] = [
  ...HIDING_SPOTS.map((spot) => ({ ...spot, kind: spot.kind === "cama" ? "bed" as const : "wardrobe" as const })),
  { kind: "piano", x: 210, y: 360, w: 178, h: 70 },
  { kind: "shelf", x: 680, y: 78, w: 230, h: 52 }, { kind: "shelf", x: 680, y: 402, w: 210, h: 52 },
  { kind: "table", x: 830, y: 225, w: 170, h: 92 }, { kind: "crate", x: 1640, y: 86, w: 92, h: 92 },
  { kind: "table", x: 1945, y: 170, w: 185, h: 92 }, { kind: "crate", x: 2155, y: 100, w: 72, h: 72 },
  { kind: "counter", x: 260, y: 590, w: 250, h: 62 }, { kind: "counter", x: 470, y: 690, w: 70, h: 230 },
  { kind: "table", x: 220, y: 820, w: 170, h: 98 }, { kind: "sofa", x: 790, y: 715, w: 210, h: 76 },
  { kind: "table", x: 820, y: 900, w: 150, h: 70 }, { kind: "table", x: 1390, y: 705, w: 270, h: 100 },
  { kind: "shelf", x: 1280, y: 930, w: 190, h: 54 }, { kind: "shelf", x: 1880, y: 590, w: 54, h: 250 },
  { kind: "sofa", x: 2190, y: 900, w: 120, h: 70 }, { kind: "crate", x: 80, y: 1150, w: 105, h: 105 },
  { kind: "crate", x: 220, y: 1260, w: 92, h: 92 }, { kind: "shelf", x: 810, y: 1120, w: 260, h: 54 },
  { kind: "table", x: 930, y: 1280, w: 150, h: 90 }, { kind: "counter", x: 1280, y: 1125, w: 220, h: 62 },
  { kind: "counter", x: 1280, y: 1460, w: 290, h: 60 }, { kind: "table", x: 1950, y: 1270, w: 170, h: 100 },
];

const SOLIDS: Rect[] = [...WALLS, ...FURNITURE];

const BATTERY_POSITIONS: Point[] = [
  { x: 275, y: 275 }, { x: 1015, y: 365 }, { x: 1575, y: 345 }, { x: 2090, y: 420 },
  { x: 545, y: 970 }, { x: 1100, y: 780 }, { x: 1740, y: 920 }, { x: 2200, y: 680 },
  { x: 285, y: 1465 }, { x: 1130, y: 1430 }, { x: 1510, y: 1210 }, { x: 2140, y: 1460 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointIn = (point: Point, rect: Rect, pad = 0) => point.x > rect.x - pad && point.x < rect.x + rect.w + pad && point.y > rect.y - pad && point.y < rect.y + rect.h + pad;
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function collides(point: Point, radius = PLAYER_RADIUS) {
  return SOLIDS.some((rect) => pointIn(point, rect, radius));
}

function lineBlocked(a: Point, b: Point) {
  const steps = Math.ceil(distance(a, b) / 18);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sample = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (SOLIDS.some((rect) => pointIn(sample, rect, 2))) return true;
  }
  return false;
}

function currentRoom(point: Point) {
  return ROOMS.find((room) => pointIn(point, room)) ?? { name: "ENTRE AS PAREDES", x: point.x, y: point.y, w: 0, h: 0 };
}

function nearestSpot(point: Point, maxDistance = 82) {
  let best: HidingSpot | null = null;
  let bestDistance = maxDistance;
  for (const spot of HIDING_SPOTS) {
    const d = distance(point, spot.check);
    if (d < bestDistance) { best = spot; bestDistance = d; }
  }
  return best;
}

function nearestFreeCell(col: number, row: number, cols: number, rows: number, grid: number) {
  for (let radius = 0; radius < 6; radius++) {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const c = clamp(col + x, 0, cols - 1);
        const r = clamp(row + y, 0, rows - 1);
        const point = { x: c * grid + grid / 2, y: r * grid + grid / 2 };
        if (!collides(point, 18)) return { col: c, row: r };
      }
    }
  }
  return { col, row };
}

function findPath(start: Point, goal: Point) {
  const grid = 64;
  const cols = Math.ceil(MAP_W / grid);
  const rows = Math.ceil(MAP_H / grid);
  const startCell = nearestFreeCell(Math.floor(start.x / grid), Math.floor(start.y / grid), cols, rows, grid);
  const goalCell = nearestFreeCell(Math.floor(goal.x / grid), Math.floor(goal.y / grid), cols, rows, grid);
  const startKey = `${startCell.col},${startCell.row}`;
  const goalKey = `${goalCell.col},${goalCell.row}`;
  const open = [{ ...startCell, score: 0 }];
  const came = new Map<string, string>();
  const cost = new Map<string, number>([[startKey, 0]]);
  const positions = new Map<string, { col: number; row: number }>([[startKey, startCell]]);

  while (open.length) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift()!;
    const key = `${current.col},${current.row}`;
    if (key === goalKey) {
      const result: Point[] = [];
      let cursor: string | undefined = key;
      while (cursor && cursor !== startKey) {
        const cell = positions.get(cursor)!;
        result.unshift({ x: cell.col * grid + grid / 2, y: cell.row * grid + grid / 2 });
        cursor = came.get(cursor);
      }
      result.push(goal);
      return result;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = current.col + dx;
      const row = current.row + dy;
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      const point = { x: col * grid + grid / 2, y: row * grid + grid / 2 };
      if (collides(point, 18)) continue;
      const nextKey = `${col},${row}`;
      const nextCost = (cost.get(key) ?? 0) + 1;
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, nextCost);
      came.set(nextKey, key);
      positions.set(nextKey, { col, row });
      const heuristic = Math.abs(col - goalCell.col) + Math.abs(row - goalCell.row);
      open.push({ col, row, score: nextCost + heuristic });
    }
  }
  return [];
}

function makeGame(): Game {
  const roomHeat = Object.fromEntries(ROOMS.map((room) => [room.name, 0]));
  const hideUses = Object.fromEntries(HIDING_SPOTS.map((spot) => [spot.id, 0]));
  return {
    mode: "intro", elapsed: 0, player: { x: 925, y: 1450 }, aim: -Math.PI / 2,
    camera: { x: 0, y: 0 }, keys: new Set(), flashlightOn: true, battery: 68, stamina: 100,
    hiddenSpot: null, hideRemaining: 8, hideCooldown: 0, hideUses, roomHeat, heatClock: 0,
    noiseIndex: 0, noisePulse: null, collected: 0, batteries: BATTERY_POSITIONS.map((point) => ({ ...point, taken: false })),
    message: "", messageUntil: 0, hudClock: 0, lastFrame: performance.now(), audio: null,
    monster: {
      x: 210, y: 280, mode: "espreitando", angle: 0, target: { x: 930, y: 270 },
      lastSeen: { x: 925, y: 1450 }, path: [], pathIndex: 0, repathIn: 0, searchUntil: 0, lastCheckedSpot: null,
    },
  };
}

const initialHud: Hud = {
  remaining: 150, battery: 68, stamina: 100, room: "PORÃO", monster: "espreitando",
  noiseIn: 20, hidden: false, hideRemaining: 8, cooldown: 0, prompt: "", message: "", memory: 0, collected: 0,
};

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function message(game: Game, text: string, duration = 2.6) {
  game.message = text;
  game.messageUntil = game.elapsed + duration;
}

function tone(game: Game, frequency: number, duration: number, volume: number, type: OscillatorType = "sine") {
  if (!game.audio) return;
  try {
    const oscillator = game.audio.createOscillator();
    const gain = game.audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, game.audio.currentTime);
    gain.gain.setValueAtTime(volume, game.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, game.audio.currentTime + duration);
    oscillator.connect(gain).connect(game.audio.destination);
    oscillator.start();
    oscillator.stop(game.audio.currentTime + duration);
  } catch { /* Som é apenas uma camada opcional. */ }
}

function learnedTarget(game: Game) {
  const usedSpots = HIDING_SPOTS.filter((spot) => game.hideUses[spot.id] > 0)
    .sort((a, b) => game.hideUses[b.id] - game.hideUses[a.id]);
  if (usedSpots.length && Math.random() < Math.min(0.78, 0.35 + game.hideUses[usedSpots[0].id] * 0.16)) {
    message(game, "A PRESENÇA ESTÁ CHECANDO SEUS ESCONDERIJOS", 3.2);
    return { ...usedSpots[0].check };
  }
  const visitedRooms = [...ROOMS].sort((a, b) => game.roomHeat[b.name] - game.roomHeat[a.name]);
  const pool = visitedRooms.slice(0, 4);
  const room = pool[Math.floor(Math.random() * pool.length)] ?? ROOMS[Math.floor(Math.random() * ROOMS.length)];
  return { x: room.x + room.w / 2 + (Math.random() - .5) * 180, y: room.y + room.h / 2 + (Math.random() - .5) * 140 };
}

function moveWithCollision(point: Point, dx: number, dy: number, radius: number) {
  const nextX = { x: point.x + dx, y: point.y };
  if (!SOLIDS.some((rect) => pointIn(nextX, rect, radius))) point.x = nextX.x;
  const nextY = { x: point.x, y: point.y + dy };
  if (!SOLIDS.some((rect) => pointIn(nextY, rect, radius))) point.y = nextY.y;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const animationRef = useRef<number>(0);
  const [mode, setMode] = useState<Mode>("intro");
  const [hud, setHud] = useState<Hud>(initialHud);

  if (gameRef.current === null && typeof window !== "undefined") gameRef.current = makeGame();

  const toggleFlashlight = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.mode !== "running" || game.hiddenSpot) return;
    if (game.battery <= 0) { message(game, "A LANTERNA ESTÁ SEM CARGA"); return; }
    game.flashlightOn = !game.flashlightOn;
    tone(game, game.flashlightOn ? 520 : 260, .05, .025, "square");
  }, []);

  const interact = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.mode !== "running") return;
    if (game.hiddenSpot) {
      game.hiddenSpot = null;
      game.hideCooldown = 14;
      game.hideRemaining = 8;
      message(game, "RECUPERE O FÔLEGO ANTES DE SE ESCONDER DE NOVO");
      return;
    }
    const spot = nearestSpot(game.player);
    if (!spot) { message(game, "NÃO HÁ ONDE SE ESCONDER AQUI", 1.4); return; }
    if (game.hideCooldown > 0) { message(game, `SEM FÔLEGO — AGUARDE ${Math.ceil(game.hideCooldown)}s`); return; }
    game.hiddenSpot = spot.id;
    game.hideRemaining = 8;
    game.flashlightOn = false;
    game.hideUses[spot.id] += 1;
    game.player.x = spot.check.x;
    game.player.y = spot.check.y;
    const uses = game.hideUses[spot.id];
    message(game, uses > 1 ? "ELA SE LEMBRA DESTE LUGAR" : "SEGURE A RESPIRAÇÃO — 8 SEGUNDOS");
    tone(game, 92, .45, .04, "triangle");
  }, []);

  const startGame = useCallback(() => {
    const fresh = makeGame();
    fresh.mode = "running";
    fresh.lastFrame = performance.now();
    try {
      fresh.audio = new AudioContext();
      tone(fresh, 58, 1.2, .035, "sine");
    } catch { fresh.audio = null; }
    gameRef.current = fresh;
    setHud(initialHud);
    setMode("running");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const keyDown = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
        event.preventDefault();
        game.keys.add(key);
      }
      if (!event.repeat && key === "f") toggleFlashlight();
      if (!event.repeat && key === "e") interact();
    };
    const keyUp = (event: KeyboardEvent) => gameRef.current?.keys.delete(event.key.toLowerCase());
    const pointerMove = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game || !canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const screenPlayer = { x: game.player.x - game.camera.x, y: game.player.y - game.camera.y };
      game.aim = Math.atan2(event.clientY - bounds.top - screenPlayer.y, event.clientX - bounds.left - screenPlayer.x);
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    canvas.addEventListener("pointermove", pointerMove);

    const finish = (game: Game, result: "won" | "lost") => {
      if (game.mode !== "running") return;
      game.mode = result;
      game.keys.clear();
      setMode(result);
      tone(game, result === "won" ? 420 : 46, result === "won" ? 1.2 : 1.8, .075, result === "won" ? "sine" : "sawtooth");
    };

    const update = (game: Game, dt: number) => {
      game.elapsed += dt;
      if (game.elapsed >= 150) { finish(game, "won"); return; }

      if (game.message && game.elapsed > game.messageUntil) game.message = "";
      if (game.noisePulse) {
        game.noisePulse.life -= dt;
        if (game.noisePulse.life <= 0) game.noisePulse = null;
      }

      game.hideCooldown = Math.max(0, game.hideCooldown - dt);
      if (game.hiddenSpot) {
        game.hideRemaining -= dt;
        if (game.hideRemaining <= 0) {
          game.hiddenSpot = null;
          game.hideRemaining = 8;
          game.hideCooldown = 15;
          game.noisePulse = { ...game.player, life: 1.25 };
          game.monster.mode = "investigando";
          game.monster.target = { ...game.player };
          game.monster.repathIn = 0;
          message(game, "VOCÊ PERDEU O AR — ELA OUVIU", 3.2);
          tone(game, 68, .8, .08, "sawtooth");
        }
      } else {
        let x = 0;
        let y = 0;
        if (game.keys.has("w") || game.keys.has("arrowup")) y -= 1;
        if (game.keys.has("s") || game.keys.has("arrowdown")) y += 1;
        if (game.keys.has("a") || game.keys.has("arrowleft")) x -= 1;
        if (game.keys.has("d") || game.keys.has("arrowright")) x += 1;
        const moving = x !== 0 || y !== 0;
        const sprinting = moving && game.keys.has("shift") && game.stamina > 2;
        const speed = sprinting ? 198 : 130;
        if (moving) {
          const length = Math.hypot(x, y);
          x /= length; y /= length;
          moveWithCollision(game.player, x * speed * dt, y * speed * dt, PLAYER_RADIUS);
          if (sprinting) game.stamina = Math.max(0, game.stamina - 25 * dt);
          else game.stamina = Math.min(100, game.stamina + 11 * dt);
          if (!canvas.matches(":hover")) game.aim = Math.atan2(y, x);
        } else game.stamina = Math.min(100, game.stamina + 17 * dt);
      }

      if (game.flashlightOn && game.battery > 0 && !game.hiddenSpot) {
        game.battery = Math.max(0, game.battery - .78 * dt);
        if (game.battery === 0) { game.flashlightOn = false; message(game, "A LUZ MORREU"); }
      }

      for (const battery of game.batteries) {
        if (!battery.taken && !game.hiddenSpot && distance(game.player, battery) < 30) {
          battery.taken = true;
          game.collected += 1;
          game.battery = Math.min(100, game.battery + 34);
          message(game, "+34% DE CARGA ENCONTRADA");
          tone(game, 620, .12, .04, "square");
        }
      }

      game.heatClock += dt;
      if (game.heatClock >= 1) {
        game.heatClock = 0;
        const room = currentRoom(game.player);
        if (game.roomHeat[room.name] !== undefined) game.roomHeat[room.name] += 1;
      }

      const noiseIndex = Math.floor(game.elapsed / 20);
      if (noiseIndex > game.noiseIndex) {
        game.noiseIndex = noiseIndex;
        game.noisePulse = { ...game.player, life: 1.5 };
        if (game.monster.mode !== "caçando") {
          game.monster.mode = "investigando";
          game.monster.target = { ...game.player };
          game.monster.repathIn = 0;
        }
        message(game, "SEU CORPO FEZ BARULHO — CORRA", 3.3);
        tone(game, 74, .8, .09, "sawtooth");
      }

      const monster = game.monster;
      const playerDistance = distance(monster, game.player);
      const sightAngle = Math.atan2(game.player.y - monster.y, game.player.x - monster.x);
      const coneSight = Math.abs(angleDelta(sightAngle, monster.angle)) < 1.15;
      const lightBetrays = game.flashlightOn && playerDistance < 650;
      const canSee = !game.hiddenSpot && !lineBlocked(monster, game.player) &&
        ((coneSight && playerDistance < (monster.mode === "caçando" ? 600 : 410)) || lightBetrays);

      if (canSee) {
        if (monster.mode !== "caçando") { message(game, "ELA VIU VOCÊ", 1.8); tone(game, 45, .65, .07, "sawtooth"); }
        monster.mode = "caçando";
        monster.lastSeen = { ...game.player };
        monster.target = { ...game.player };
      } else if (monster.mode === "caçando") {
        monster.mode = "procurando";
        monster.target = { ...monster.lastSeen };
        monster.searchUntil = game.elapsed + 7;
        monster.repathIn = 0;
      }

      if (monster.mode === "caçando") monster.target = { ...game.player };
      if (distance(monster, monster.target) < 34) {
        if (monster.mode === "investigando") {
          monster.mode = "procurando";
          monster.searchUntil = game.elapsed + 8;
          monster.target = learnedTarget(game);
        } else if (monster.mode === "procurando") {
          monster.target = learnedTarget(game);
          monster.searchUntil = Math.max(monster.searchUntil, game.elapsed + 3.5);
        } else if (monster.mode === "espreitando") monster.target = learnedTarget(game);
        monster.repathIn = 0;
      }
      if (monster.mode === "procurando" && game.elapsed > monster.searchUntil) {
        monster.mode = "espreitando";
        monster.target = learnedTarget(game);
        monster.repathIn = 0;
      }

      monster.repathIn -= dt;
      if (monster.repathIn <= 0) {
        monster.path = findPath(monster, monster.target);
        monster.pathIndex = 0;
        monster.repathIn = monster.mode === "caçando" ? .45 : 1.05;
      }
      const waypoint = monster.path[monster.pathIndex] ?? monster.target;
      const dx = waypoint.x - monster.x;
      const dy = waypoint.y - monster.y;
      const length = Math.hypot(dx, dy);
      if (length < 16 && monster.pathIndex < monster.path.length - 1) monster.pathIndex += 1;
      else if (length > 1) {
        monster.angle = Math.atan2(dy, dx);
        const speed = monster.mode === "caçando" ? 148 + game.elapsed * .18 : monster.mode === "investigando" ? 116 : 88 + game.elapsed * .06;
        moveWithCollision(monster, dx / length * speed * dt, dy / length * speed * dt, 16);
      }

      if (!game.hiddenSpot && distance(monster, game.player) < 27) { finish(game, "lost"); return; }
      if (game.hiddenSpot) {
        const spot = HIDING_SPOTS.find((entry) => entry.id === game.hiddenSpot)!;
        if (distance(monster, spot.check) < 43 && monster.lastCheckedSpot !== spot.id) {
          monster.lastCheckedSpot = spot.id;
          const uses = game.hideUses[spot.id];
          const learnedChance = Math.min(.92, .18 + uses * .23 + game.elapsed / 500);
          if (Math.random() < learnedChance) { finish(game, "lost"); return; }
          message(game, "ELA PAROU DO OUTRO LADO. NÃO RESPIRE.", 2.6);
        }
        if (distance(monster, spot.check) > 120 && monster.lastCheckedSpot === spot.id) monster.lastCheckedSpot = null;
      }

      game.hudClock -= dt;
      if (game.hudClock <= 0) {
        game.hudClock = .1;
        const spot = nearestSpot(game.player);
        const totalHideUses = Object.values(game.hideUses).reduce((sum, uses) => sum + uses, 0);
        const topRoomHeat = Math.max(0, ...Object.values(game.roomHeat));
        const memory = clamp(Math.floor(totalHideUses / 2) + Math.floor(topRoomHeat / 35), 0, 3);
        let prompt = "";
        if (game.hiddenSpot) prompt = `[E] SAIR — FÔLEGO ${game.hideRemaining.toFixed(1)}s`;
        else if (spot) prompt = game.hideCooldown > 0 ? `SEM FÔLEGO — ${Math.ceil(game.hideCooldown)}s` : `[E] ESCONDER — ${spot.label.toUpperCase()}`;
        setHud({
          remaining: 150 - game.elapsed, battery: game.battery, stamina: game.stamina,
          room: currentRoom(game.player).name, monster: monster.mode, noiseIn: 20 - (game.elapsed % 20),
          hidden: Boolean(game.hiddenSpot), hideRemaining: game.hideRemaining, cooldown: game.hideCooldown,
          prompt, message: game.message, memory, collected: game.collected,
        });
      }
    };

    const drawFurniture = (item: Furniture) => {
      ctx.save();
      ctx.fillStyle = "#171b17";
      ctx.fillRect(item.x + 7, item.y + 9, item.w, item.h);
      if (item.kind === "bed") {
        ctx.fillStyle = "#59423a"; ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.fillStyle = "#746253"; ctx.fillRect(item.x + 8, item.y + 7, Math.min(42, item.w - 16), item.h - 14);
        ctx.fillStyle = "#402b2b"; ctx.fillRect(item.x + Math.min(52, item.w / 3), item.y + 8, item.w - Math.min(62, item.w / 3), item.h - 16);
      } else if (item.kind === "wardrobe") {
        ctx.fillStyle = "#493b2c"; ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.strokeStyle = "#756246"; ctx.lineWidth = 3; ctx.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        ctx.fillStyle = "#b1a06c"; ctx.fillRect(item.x + item.w / 2 - 2, item.y + item.h / 2, 4, 4);
      } else if (item.kind === "shelf") {
        ctx.fillStyle = "#473927"; ctx.fillRect(item.x, item.y, item.w, item.h);
        for (let x = item.x + 8; x < item.x + item.w - 8; x += 16) { ctx.fillStyle = x % 32 ? "#6b3d35" : "#4d573c"; ctx.fillRect(x, item.y + 7, 9, item.h - 14); }
      } else if (item.kind === "sofa") {
        ctx.fillStyle = "#344438"; ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.strokeStyle = "#53634e"; ctx.lineWidth = 4; ctx.strokeRect(item.x + 6, item.y + 6, item.w - 12, item.h - 12);
      } else if (item.kind === "crate") {
        ctx.fillStyle = "#57462f"; ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.strokeStyle = "#816945"; ctx.lineWidth = 5; ctx.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        ctx.beginPath(); ctx.moveTo(item.x + 8, item.y + 8); ctx.lineTo(item.x + item.w - 8, item.y + item.h - 8); ctx.stroke();
      } else {
        ctx.fillStyle = item.kind === "counter" ? "#4e5143" : item.kind === "piano" ? "#29251f" : "#534633";
        ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.strokeStyle = "#77705a"; ctx.lineWidth = 3; ctx.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
      }
      ctx.restore();
    };

    const draw = (game: Game, width: number, height: number) => {
      const cameraTargetX = clamp(game.player.x - width / 2, 0, Math.max(0, MAP_W - width));
      const cameraTargetY = clamp(game.player.y - height / 2, 0, Math.max(0, MAP_H - height));
      game.camera.x += (cameraTargetX - game.camera.x) * .13;
      game.camera.y += (cameraTargetY - game.camera.y) * .13;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#060806";
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(-game.camera.x, -game.camera.y);

      ctx.fillStyle = "#22251e";
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      const tile = 40;
      for (let y = 40; y < MAP_H - 40; y += tile) {
        for (let x = 40; x < MAP_W - 40; x += tile) {
          const seed = ((x / tile) * 13 + (y / tile) * 7) % 5;
          ctx.fillStyle = seed === 0 ? "#2b2d24" : seed === 1 ? "#272920" : "#25271f";
          ctx.fillRect(x, y, tile - 1, tile - 1);
          ctx.fillStyle = "rgba(10,12,10,.12)"; ctx.fillRect(x + 8, y, 2, tile);
        }
      }
      for (const room of ROOMS) {
        ctx.font = "700 14px monospace";
        ctx.fillStyle = "rgba(151,151,120,.16)";
        ctx.textAlign = "center";
        ctx.fillText(room.name, room.x + room.w / 2, room.y + 34);
      }

      for (const wall of WALLS) {
        ctx.fillStyle = "#161815"; ctx.fillRect(wall.x + 7, wall.y + 8, wall.w, wall.h);
        ctx.fillStyle = "#3c372d"; ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.fillStyle = "#5a4d39";
        if (wall.w > wall.h) { for (let x = wall.x; x < wall.x + wall.w; x += 42) ctx.fillRect(x, wall.y + 5, 28, 4); }
        else { for (let y = wall.y; y < wall.y + wall.h; y += 42) ctx.fillRect(wall.x + 5, y, 4, 28); }
      }
      FURNITURE.forEach(drawFurniture);

      for (const spot of HIDING_SPOTS) {
        const close = !game.hiddenSpot && distance(game.player, spot.check) < 82;
        if (close) {
          ctx.strokeStyle = game.hideCooldown > 0 ? "#7f4b43" : "#b9c76b";
          ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.strokeRect(spot.x - 6, spot.y - 6, spot.w + 12, spot.h + 12); ctx.setLineDash([]);
        }
      }

      for (const battery of game.batteries) {
        if (battery.taken) continue;
        const flicker = .55 + Math.sin(performance.now() / 220 + battery.x) * .25;
        ctx.fillStyle = `rgba(200,218,115,${.1 + flicker * .15})`; ctx.fillRect(battery.x - 20, battery.y - 20, 40, 40);
        ctx.fillStyle = "#c9da72"; ctx.fillRect(battery.x - 8, battery.y - 11, 16, 22);
        ctx.fillStyle = "#151914"; ctx.fillRect(battery.x - 4, battery.y - 6, 8, 12);
        ctx.fillStyle = "#d8e58d"; ctx.fillRect(battery.x - 3, battery.y - 14, 6, 4);
      }

      if (game.noisePulse) {
        const progress = 1 - game.noisePulse.life / 1.5;
        ctx.strokeStyle = `rgba(170,65,56,${game.noisePulse.life / 1.5})`;
        ctx.lineWidth = 6 * (1 - progress) + 1;
        ctx.beginPath(); ctx.arc(game.noisePulse.x, game.noisePulse.y, 30 + progress * 260, 0, Math.PI * 2); ctx.stroke();
      }

      const monster = game.monster;
      ctx.save();
      ctx.translate(monster.x, monster.y);
      ctx.rotate(monster.angle);
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.ellipse(-5, 12, 28, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#321919"; ctx.lineWidth = 5;
      for (const offset of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(-8, offset); ctx.lineTo(-32, offset + Math.sin(performance.now() / 130 + offset) * 8); ctx.stroke(); }
      ctx.fillStyle = monster.mode === "caçando" ? "#782822" : "#4d2724"; ctx.fillRect(-14, -20, 28, 42);
      ctx.fillStyle = "#0a0808"; ctx.fillRect(-10, -17, 20, 14);
      ctx.fillStyle = "#e94b3e"; ctx.fillRect(2, -14, 5, 5);
      ctx.restore();

      if (!game.hiddenSpot) {
        ctx.save(); ctx.translate(game.player.x, game.player.y);
        ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(2, 13, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#aeb880"; ctx.fillRect(-10, -14, 20, 25);
        ctx.fillStyle = "#d0c6a1"; ctx.fillRect(-7, -20, 14, 9);
        ctx.fillStyle = "#596044"; ctx.fillRect(-9, 11, 7, 10); ctx.fillRect(2, 11, 7, 10);
        ctx.rotate(game.aim); ctx.fillStyle = "#c8d37b"; ctx.fillRect(8, -3, 15, 6); ctx.restore();
      }
      ctx.restore();

      const playerScreen = { x: game.player.x - game.camera.x, y: game.player.y - game.camera.y };
      ctx.save();
      ctx.fillStyle = game.hiddenSpot ? "rgba(0,0,0,.975)" : "rgba(0,0,0,.94)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "destination-out";
      const glowRadius = game.hiddenSpot ? 42 : 112;
      const glow = ctx.createRadialGradient(playerScreen.x, playerScreen.y, 16, playerScreen.x, playerScreen.y, glowRadius);
      glow.addColorStop(0, "rgba(0,0,0,.98)"); glow.addColorStop(.62, "rgba(0,0,0,.72)"); glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(playerScreen.x, playerScreen.y, glowRadius, 0, Math.PI * 2); ctx.fill();
      if (game.flashlightOn && game.battery > 0 && !game.hiddenSpot) {
        ctx.save(); ctx.translate(playerScreen.x, playerScreen.y); ctx.rotate(game.aim);
        ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(500, -155); ctx.lineTo(500, 155); ctx.closePath(); ctx.clip();
        const beam = ctx.createRadialGradient(0, 0, 18, 0, 0, 510);
        beam.addColorStop(0, "rgba(0,0,0,.98)"); beam.addColorStop(.5, "rgba(0,0,0,.8)"); beam.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = beam; ctx.fillRect(0, -190, 520, 380); ctx.restore();
      }
      ctx.restore();

      const danger = clamp(1 - distance(game.monster, game.player) / 420, 0, 1);
      if (danger > 0) {
        const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .2, width / 2, height / 2, Math.max(width, height) * .7);
        vignette.addColorStop(0, "rgba(80,0,0,0)"); vignette.addColorStop(1, `rgba(100,9,5,${danger * .48})`);
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
      }
    };

    const loop = (now: number) => {
      const game = gameRef.current;
      if (!game) { animationRef.current = requestAnimationFrame(loop); return; }
      const dt = Math.min(.04, Math.max(0, (now - game.lastFrame) / 1000));
      game.lastFrame = now;
      if (game.mode === "running") update(game, dt);
      const bounds = canvas.getBoundingClientRect();
      draw(game, bounds.width, bounds.height);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationRef.current);
      observer.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      canvas.removeEventListener("pointermove", pointerMove);
      gameRef.current?.audio?.close().catch(() => undefined);
    };
  }, [interact, toggleFlashlight]);

  const holdKey = (key: string, active: boolean) => {
    const game = gameRef.current;
    if (!game) return;
    if (active) game.keys.add(key); else game.keys.delete(key);
  };

  const statusLabel = hud.monster === "caçando" ? "PERSEGUIÇÃO" : hud.monster === "investigando" ? "ELA OUVIU" : hud.monster === "procurando" ? "PROCURANDO VOCÊ" : "PRESENÇA À ESPREITA";

  return (
    <main className={`game-shell mode-${mode}`}>
      <header className="topbar">
        <div className="brand"><span>▲</span> CASA MORTA <small>UM CONTO DE SOBREVIVÊNCIA</small></div>
        <div className="timer"><small>SOBREVIVA</small>{formatTime(hud.remaining)}</div>
        <div className={`status status-${hud.monster}`}><span className="status-dot" />{statusLabel}</div>
      </header>

      <section className="game-stage" aria-label="Jogo Casa Morta">
        <canvas ref={canvasRef} aria-label="Mapa da mansão visto de cima" />

        {mode === "running" && <>
          <div className="room-tag">LOCALIZAÇÃO <b>{hud.room}</b></div>
          <div className="memory-panel"><span>MEMÓRIA DA PRESENÇA</span><i>{[0, 1, 2].map((level) => <em className={level < hud.memory ? "filled" : ""} key={level} />)}</i><small>{hud.memory === 0 ? "OBSERVANDO ROTAS" : hud.memory < 3 ? "APRENDENDO HÁBITOS" : "PADRÃO IDENTIFICADO"}</small></div>
          <div className={`noise-clock ${hud.noiseIn < 5 ? "urgent" : ""}`}><span>PRÓXIMO RUÍDO</span><b>{Math.ceil(hud.noiseIn)}s</b></div>
          {hud.message && <div className="game-message">{hud.message}</div>}
          {hud.prompt && <div className="interaction-prompt">{hud.prompt}</div>}
          {hud.hidden && <div className="breath-meter"><span>FÔLEGO</span><i><em style={{ width: `${hud.hideRemaining / 8 * 100}%` }} /></i></div>}
          <aside className="objective"><b>OBJETIVO</b><span>Sobreviva até o amanhecer</span><small>{hud.collected}/12 cargas encontradas</small></aside>
          <aside className="charge"><div><b>{Math.round(hud.battery)}%</b><span>LANTERNA <kbd>F</kbd></span></div><i><em style={{ width: `${hud.battery}%` }} /></i></aside>
          <aside className="stamina"><span>FÔLEGO DE CORRIDA</span><i><em style={{ width: `${hud.stamina}%` }} /></i></aside>
        </>}

        {mode === "intro" && <div className="intro-card overlay-card">
          <p className="eyebrow">A CASA ESCUTA</p>
          <h1>NÃO DEIXE QUE ELA<br />APRENDA VOCÊ.</h1>
          <p>Sobreviva por 2 minutos e 30 segundos. A cada 20 segundos seu corpo denuncia sua posição — e a criatura memoriza as salas e esconderijos que você prefere.</p>
          <div className="rules"><span><b>8s</b> limite escondido</span><span><b>14s</b> para recuperar o fôlego</span><span><b>12</b> cargas espalhadas</span></div>
          <button type="button" onClick={startGame}>ENTRAR NA CASA <span>→</span></button>
          <div className="keys"><span><kbd>WASD</kbd> MOVER</span><span><kbd>SHIFT</kbd> CORRER</span><span><kbd>MOUSE</kbd> MIRAR</span><span><kbd>F</kbd> LUZ</span><span><kbd>E</kbd> ESCONDER</span></div>
        </div>}

        {mode === "won" && <div className="result-card result-win">
          <p className="eyebrow">02:30 — AMANHECER</p><h2>VOCÊ SOBREVIVEU.</h2>
          <p>A porta finalmente cedeu. A casa conhece seus passos agora, mas não conseguiu guardá-los.</p>
          <button type="button" onClick={startGame}>JOGAR NOVAMENTE <span>↻</span></button>
        </div>}

        {mode === "lost" && <div className="result-card result-lose">
          <p className="eyebrow">A CASA APRENDEU</p><h2>ELA ENCONTROU VOCÊ.</h2>
          <p>Repita menos suas rotas. Apague a lanterna quando puder. Nunca confie duas vezes no mesmo esconderijo.</p>
          <button type="button" onClick={startGame}>TENTAR NOVAMENTE <span>↻</span></button>
        </div>}

        {mode === "running" && <div className="mobile-controls" aria-label="Controles de toque">
          <div className="dpad">
            <button aria-label="Mover para cima" onPointerDown={() => holdKey("w", true)} onPointerUp={() => holdKey("w", false)} onPointerCancel={() => holdKey("w", false)}>▲</button>
            <button aria-label="Mover para esquerda" onPointerDown={() => holdKey("a", true)} onPointerUp={() => holdKey("a", false)} onPointerCancel={() => holdKey("a", false)}>◀</button>
            <button aria-label="Mover para baixo" onPointerDown={() => holdKey("s", true)} onPointerUp={() => holdKey("s", false)} onPointerCancel={() => holdKey("s", false)}>▼</button>
            <button aria-label="Mover para direita" onPointerDown={() => holdKey("d", true)} onPointerUp={() => holdKey("d", false)} onPointerCancel={() => holdKey("d", false)}>▶</button>
          </div>
          <div className="action-buttons"><button aria-label="Ligar ou desligar lanterna" onClick={toggleFlashlight}>LUZ</button><button aria-label="Interagir com esconderijo" onClick={interact}>E</button></div>
        </div>}
      </section>
    </main>
  );
}
