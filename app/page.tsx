"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { neon, type GameSessionRecord, type PlayerAccount } from "../lib/neon";

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
type Mode = "intro" | "running" | "won" | "lost";
type MonsterMode = "espreitando" | "investigando" | "caçando" | "procurando";
type AccountView = "signin" | "signup" | "history";

type HidingSpot = Rect & {
  id: string;
  label: string;
  check: Point;
  kind: "armário" | "cama" | "cortina";
};

type Furniture = Rect & {
  kind: "bed" | "wardrobe" | "shelf" | "table" | "sofa" | "crate" | "piano" | "counter" |
    "stairs" | "fireplace" | "stove" | "sink" | "bathtub" | "dresser" | "desk" | "clock";
};

type Doorway = Point & { length: number; axis: "horizontal" | "vertical"; swing: -1 | 1 };
type WindowFrame = Point & { length: number; axis: "horizontal" | "vertical" };
type Chair = Rect & { angle: number };

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
  hidingSeconds: number;
  flashlightSeconds: number;
  visitedRooms: Set<string>;
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
const PLAYER_WALK_SPEED = 130;
const PLAYER_SPRINT_SPEED = 198;
const PLAYER_LIGHT_RADIUS = 300;
const MONSTER_CHASE_SPEED = 142;
const MONSTER_CHASE_ACCELERATION = .03;

const ROOMS = [
  { name: "QUARTO PRINCIPAL", floor: "wood", x: 40, y: 40, w: 560, h: 480 },
  { name: "BIBLIOTECA", floor: "parquet", x: 628, y: 40, w: 572, h: 480 },
  { name: "QUARTO DA CRIANÇA", floor: "wood", x: 1228, y: 40, w: 572, h: 480 },
  { name: "ATELIÊ", floor: "stone", x: 1828, y: 40, w: 532, h: 480 },
  { name: "COZINHA", floor: "tile", x: 40, y: 548, w: 560, h: 502 },
  { name: "HALL CENTRAL", floor: "parquet", x: 628, y: 548, w: 572, h: 502 },
  { name: "SALA DE JANTAR", floor: "wood", x: 1228, y: 548, w: 572, h: 502 },
  { name: "ESCRITÓRIO", floor: "parquet", x: 1828, y: 548, w: 532, h: 502 },
  { name: "DESPENSA", floor: "stone", x: 40, y: 1078, w: 560, h: 482 },
  { name: "PORÃO", floor: "stone", x: 628, y: 1078, w: 572, h: 482 },
  { name: "LAVANDERIA", floor: "tile", x: 1228, y: 1078, w: 572, h: 482 },
  { name: "SALA SELADA", floor: "stone", x: 1828, y: 1078, w: 532, h: 482 },
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
  { kind: "dresser", x: 205, y: 68, w: 125, h: 55 }, { kind: "fireplace", x: 515, y: 300, w: 68, h: 128 },
  { kind: "shelf", x: 925, y: 76, w: 125, h: 52 }, { kind: "fireplace", x: 1088, y: 278, w: 82, h: 128 },
  { kind: "dresser", x: 1252, y: 72, w: 108, h: 54 }, { kind: "crate", x: 1655, y: 388, w: 82, h: 72 },
  { kind: "dresser", x: 1848, y: 70, w: 115, h: 52 }, { kind: "table", x: 2180, y: 390, w: 130, h: 74 },
  { kind: "stove", x: 58, y: 588, w: 86, h: 70 }, { kind: "sink", x: 158, y: 588, w: 86, h: 70 },
  { kind: "stairs", x: 1040, y: 585, w: 118, h: 285 }, { kind: "clock", x: 650, y: 850, w: 54, h: 132 },
  { kind: "dresser", x: 1680, y: 570, w: 88, h: 220 }, { kind: "fireplace", x: 2268, y: 590, w: 68, h: 145 },
  { kind: "shelf", x: 72, y: 1390, w: 210, h: 52 }, { kind: "counter", x: 520, y: 1150, w: 58, h: 220 },
  { kind: "counter", x: 1100, y: 1150, w: 68, h: 220 }, { kind: "bathtub", x: 1535, y: 1110, w: 110, h: 78 },
  { kind: "sink", x: 1655, y: 1450, w: 95, h: 62 }, { kind: "sofa", x: 1895, y: 1120, w: 220, h: 58 },
  { kind: "sofa", x: 1895, y: 1450, w: 220, h: 58 },
];

const RUGS: Rect[] = [
  { x: 210, y: 245, w: 245, h: 92 }, { x: 760, y: 185, w: 315, h: 150 },
  { x: 1328, y: 294, w: 300, h: 118 }, { x: 1918, y: 305, w: 250, h: 118 },
  { x: 690, y: 770, w: 395, h: 165 }, { x: 1334, y: 650, w: 350, h: 200 },
  { x: 1945, y: 800, w: 285, h: 165 }, { x: 820, y: 1225, w: 285, h: 155 },
  { x: 1915, y: 1345, w: 310, h: 128 },
];

const STAINS: (Point & { rx: number; ry: number })[] = [
  { x: 510, y: 460, rx: 55, ry: 19 }, { x: 1090, y: 370, rx: 82, ry: 30 },
  { x: 1545, y: 615, rx: 68, ry: 24 }, { x: 2140, y: 980, rx: 76, ry: 28 },
  { x: 460, y: 1190, rx: 64, ry: 22 }, { x: 1440, y: 1380, rx: 90, ry: 32 },
];

const DOORWAYS: Doorway[] = [
  { x: 614, y: 215, length: 120, axis: "vertical", swing: 1 },
  { x: 614, y: 725, length: 120, axis: "vertical", swing: -1 },
  { x: 614, y: 1210, length: 120, axis: "vertical", swing: 1 },
  { x: 1214, y: 375, length: 120, axis: "vertical", swing: -1 },
  { x: 1214, y: 685, length: 120, axis: "vertical", swing: 1 },
  { x: 1214, y: 1245, length: 120, axis: "vertical", swing: -1 },
  { x: 1814, y: 245, length: 120, axis: "vertical", swing: 1 },
  { x: 1814, y: 735, length: 120, axis: "vertical", swing: -1 },
  { x: 1814, y: 1170, length: 120, axis: "vertical", swing: 1 },
  { x: 285, y: 534, length: 120, axis: "horizontal", swing: -1 },
  { x: 860, y: 534, length: 120, axis: "horizontal", swing: 1 },
  { x: 1440, y: 534, length: 120, axis: "horizontal", swing: -1 },
  { x: 2000, y: 534, length: 120, axis: "horizontal", swing: 1 },
  { x: 405, y: 1064, length: 120, axis: "horizontal", swing: 1 },
  { x: 920, y: 1064, length: 120, axis: "horizontal", swing: -1 },
  { x: 1480, y: 1064, length: 120, axis: "horizontal", swing: 1 },
  { x: 2010, y: 1064, length: 120, axis: "horizontal", swing: -1 },
];

const WINDOWS: WindowFrame[] = [
  { x: 190, y: 20, length: 145, axis: "horizontal" }, { x: 770, y: 20, length: 150, axis: "horizontal" },
  { x: 1400, y: 20, length: 145, axis: "horizontal" }, { x: 2020, y: 20, length: 145, axis: "horizontal" },
  { x: 190, y: 1580, length: 145, axis: "horizontal" }, { x: 760, y: 1580, length: 145, axis: "horizontal" },
  { x: 1420, y: 1580, length: 145, axis: "horizontal" }, { x: 2050, y: 1580, length: 145, axis: "horizontal" },
  { x: 20, y: 260, length: 130, axis: "vertical" }, { x: 20, y: 735, length: 145, axis: "vertical" },
  { x: 2380, y: 260, length: 130, axis: "vertical" }, { x: 2380, y: 760, length: 145, axis: "vertical" },
];

const CHAIRS: Chair[] = [
  { x: 815, y: 185, w: 36, h: 36, angle: 0 }, { x: 1010, y: 245, w: 36, h: 36, angle: Math.PI / 2 },
  { x: 200, y: 770, w: 38, h: 38, angle: 0 }, { x: 395, y: 842, w: 38, h: 38, angle: Math.PI / 2 },
  { x: 1420, y: 654, w: 40, h: 40, angle: 0 }, { x: 1510, y: 654, w: 40, h: 40, angle: 0 },
  { x: 1600, y: 654, w: 40, h: 40, angle: 0 }, { x: 1420, y: 810, w: 40, h: 40, angle: Math.PI },
  { x: 1510, y: 810, w: 40, h: 40, angle: Math.PI }, { x: 1600, y: 810, w: 40, h: 40, angle: Math.PI },
  { x: 1340, y: 735, w: 40, h: 40, angle: -Math.PI / 2 }, { x: 1672, y: 735, w: 40, h: 40, angle: Math.PI / 2 },
  { x: 1938, y: 715, w: 38, h: 38, angle: 0 }, { x: 2150, y: 780, w: 38, h: 38, angle: Math.PI / 2 },
];

const PORTRAITS: Rect[] = [
  { x: 410, y: 54, w: 58, h: 38 }, { x: 1055, y: 53, w: 52, h: 36 },
  { x: 1540, y: 55, w: 58, h: 38 }, { x: 2100, y: 55, w: 55, h: 38 },
  { x: 645, y: 570, w: 38, h: 58 }, { x: 1740, y: 568, w: 40, h: 56 },
  { x: 2290, y: 820, w: 38, h: 58 }, { x: 1838, y: 1180, w: 38, h: 58 },
];

const HOUSE_LIGHTS: Point[] = [
  { x: 290, y: 155 }, { x: 900, y: 160 }, { x: 1500, y: 130 }, { x: 2050, y: 135 },
  { x: 340, y: 700 }, { x: 820, y: 620 }, { x: 1515, y: 620 }, { x: 2090, y: 620 },
  { x: 340, y: 1140 }, { x: 890, y: 1140 }, { x: 1480, y: 1140 }, { x: 2070, y: 1140 },
];

const SOLIDS: Rect[] = [...WALLS, ...FURNITURE];

const BATTERY_POSITIONS: Point[] = [
  { x: 275, y: 275 }, { x: 1015, y: 365 }, { x: 1575, y: 345 }, { x: 2090, y: 420 },
  { x: 545, y: 970 }, { x: 940, y: 640 }, { x: 1740, y: 920 }, { x: 2200, y: 680 },
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

function makeGame(preview = false): Game {
  const roomHeat = Object.fromEntries(ROOMS.map((room) => [room.name, 0]));
  const hideUses = Object.fromEntries(HIDING_SPOTS.map((spot) => [spot.id, 0]));
  const playerStart = preview ? { x: 1350, y: 860 } : { x: 925, y: 1450 };
  const monsterStart = preview ? { x: 1520, y: 860 } : { x: 210, y: 280 };
  return {
    mode: "intro", elapsed: 0, player: playerStart, aim: preview ? 0 : -Math.PI / 2,
    camera: { x: 0, y: 0 }, keys: new Set(), flashlightOn: true, battery: 68, stamina: 100,
    hiddenSpot: null, hideRemaining: 8, hideCooldown: 0, hideUses, roomHeat, heatClock: 0,
    noiseIndex: 0, noisePulse: null, collected: 0, hidingSeconds: 0, flashlightSeconds: 0,
    visitedRooms: new Set(["PORÃO"]), batteries: BATTERY_POSITIONS.map((point) => ({ ...point, taken: false })),
    message: "", messageUntil: 0, hudClock: 0, lastFrame: performance.now(), audio: null,
    monster: {
      ...monsterStart, mode: "espreitando", angle: preview ? Math.PI : 0, target: { x: 930, y: 270 },
      lastSeen: { ...playerStart }, path: [], pathIndex: 0, repathIn: 0, searchUntil: 0, lastCheckedSpot: null,
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

function formatPlayedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function friendlyAuthError(rawMessage: string, view: AccountView) {
  const message = rawMessage.toLowerCase();
  if (message.includes("invalid") || message.includes("credential")) return "E-mail ou senha incorretos.";
  if (message.includes("already") || message.includes("exist")) return "Este e-mail já possui uma conta.";
  if (message.includes("password")) return "Use uma senha com pelo menos 8 caracteres.";
  return view === "signup" ? "Não foi possível criar a conta agora." : "Não foi possível entrar agora.";
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
  const userRef = useRef<PlayerAccount | null>(null);
  const saveGameSessionRef = useRef<(game: Game, result: "won" | "lost") => void>(() => undefined);
  const [mode, setMode] = useState<Mode>("intro");
  const [hud, setHud] = useState<Hud>(initialHud);
  const [user, setUser] = useState<PlayerAccount | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountView, setAccountView] = useState<AccountView>("signin");
  const [authChecking, setAuthChecking] = useState(true);
  const [accountBusy, setAccountBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [history, setHistory] = useState<GameSessionRecord[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (gameRef.current === null) gameRef.current = makeGame(true);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!userRef.current) return;
    setHistoryLoading(true);
    const { data, error } = await neon
      .from("game_sessions")
      .select("id, played_at, result, survival_seconds, batteries_collected, noise_events, hiding_seconds, flashlight_seconds, rooms_visited")
      .order("played_at", { ascending: false })
      .limit(8);
    if (error) setAuthError("Não foi possível carregar seu histórico agora.");
    else setHistory((data ?? []) as GameSessionRecord[]);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    neon.auth.getSession().then((result) => {
      if (!active) return;
      const authData = result.data as { user?: PlayerAccount; session?: unknown } | null;
      const nextUser = authData?.session && authData.user ? authData.user : null;
      userRef.current = nextUser;
      setUser(nextUser);
      setAccountView(nextUser ? "history" : "signin");
      setAuthChecking(false);
      if (nextUser) void loadHistory();
    }).catch(() => {
      if (active) setAuthChecking(false);
    });
    return () => { active = false; };
  }, [loadHistory]);

  const openAccount = useCallback(() => {
    setAuthError("");
    setAccountView(userRef.current ? "history" : "signin");
    setAccountOpen(true);
    if (userRef.current) void loadHistory();
  }, [loadHistory]);

  const handleAuthSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccountBusy(true);
    setAuthError("");
    try {
      const result = accountView === "signup"
        ? await neon.auth.signUp.email({ name: playerName.trim() || email.split("@")[0] || "Sobrevivente", email: email.trim(), password })
        : await neon.auth.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setAuthError(friendlyAuthError(result.error.message || "", accountView));
        return;
      }
      const sessionResult = await neon.auth.getSession();
      const authData = sessionResult.data as { user?: PlayerAccount; session?: unknown } | null;
      if (!authData?.session || !authData.user) {
        setAccountView("signin");
        setAuthError("Conta criada. Verifique seu e-mail e entre para continuar.");
        return;
      }
      userRef.current = authData.user;
      setUser(authData.user);
      setAccountView("history");
      setPassword("");
      await loadHistory();
    } catch {
      setAuthError("A casa bloqueou a conexão. Tente novamente em instantes.");
    } finally {
      setAccountBusy(false);
    }
  }, [accountView, email, loadHistory, password, playerName]);

  const signOut = useCallback(async () => {
    setAccountBusy(true);
    const result = await neon.auth.signOut();
    if (result.error) {
      setAuthError(result.error.message || "Não foi possível sair agora.");
    } else {
      userRef.current = null;
      setUser(null);
      setHistory([]);
      setAccountView("signin");
      setAccountOpen(false);
    }
    setAccountBusy(false);
  }, []);

  const saveGameSession = useCallback((game: Game, result: "won" | "lost") => {
    if (!userRef.current) return;
    setSaveState("saving");
    void (async () => {
      try {
        const { error } = await neon.from("game_sessions").insert({
          result,
          survival_seconds: Math.min(150, Math.max(0, Math.round(game.elapsed))),
          batteries_collected: game.collected,
          noise_events: game.noiseIndex,
          hiding_seconds: Number(game.hidingSeconds.toFixed(2)),
          flashlight_seconds: Number(game.flashlightSeconds.toFixed(2)),
          rooms_visited: Math.max(1, game.visitedRooms.size),
        });
        if (error) {
          setSaveState("error");
          return;
        }
        setSaveState("saved");
        void loadHistory();
      } catch {
        setSaveState("error");
      }
    })();
  }, [loadHistory]);

  useEffect(() => {
    saveGameSessionRef.current = saveGameSession;
  }, [saveGameSession]);

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
    setSaveState("idle");
    setMode("running");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const survivorSprite = new Image();
    survivorSprite.src = "/assets/sobrevivente.png";
    const presenceSprite = new Image();
    presenceSprite.src = "/assets/presenca.png";

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
      saveGameSessionRef.current(game, result);
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
        game.hidingSeconds += dt;
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
        const speed = sprinting ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
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
        game.flashlightSeconds += dt;
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
        if (game.roomHeat[room.name] !== undefined) {
          game.visitedRooms.add(room.name);
          game.roomHeat[room.name] += 1;
        }
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
        const speed = monster.mode === "caçando"
          ? MONSTER_CHASE_SPEED + game.elapsed * MONSTER_CHASE_ACCELERATION
          : monster.mode === "investigando" ? 116 : 88 + game.elapsed * .06;
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

    const drawFurniture = (target: CanvasRenderingContext2D, item: Furniture) => {
      target.save();
      target.fillStyle = "rgba(0,0,0,.58)";
      target.fillRect(item.x + 9, item.y + 12, item.w, item.h);
      if (item.kind === "bed") {
        target.fillStyle = "#332720"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#67594a"; target.fillRect(item.x + 6, item.y + 6, item.w - 12, item.h - 12);
        target.fillStyle = "#8a806c"; target.fillRect(item.x + 10, item.y + 10, Math.min(42, item.w - 20), item.h - 20);
        target.fillStyle = "#45312d"; target.fillRect(item.x + Math.min(52, item.w / 3), item.y + 11, item.w - Math.min(66, item.w / 3), item.h - 22);
        target.strokeStyle = "#241a18"; target.lineWidth = 3; target.strokeRect(item.x + 4, item.y + 4, item.w - 8, item.h - 8);
        target.fillStyle = "rgba(129,37,31,.34)"; target.fillRect(item.x + item.w * .56, item.y + 13, item.w * .24, item.h - 26);
      } else if (item.kind === "wardrobe") {
        target.fillStyle = "#392d22"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#54412d"; target.fillRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        target.strokeStyle = "#766044"; target.lineWidth = 3; target.strokeRect(item.x + 8, item.y + 8, item.w - 16, item.h - 16);
        target.beginPath(); target.moveTo(item.x + item.w / 2, item.y + 8); target.lineTo(item.x + item.w / 2, item.y + item.h - 8); target.stroke();
        target.fillStyle = "#b49a5d"; target.fillRect(item.x + item.w / 2 - 5, item.y + item.h / 2, 3, 4); target.fillRect(item.x + item.w / 2 + 3, item.y + item.h / 2, 3, 4);
      } else if (item.kind === "shelf") {
        target.fillStyle = "#302419"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#5a452e"; target.fillRect(item.x + 4, item.y + 4, item.w - 8, item.h - 8);
        for (let x = item.x + 8; x < item.x + item.w - 8; x += 16) { target.fillStyle = x % 48 ? "#633a33" : "#3f4b3a"; target.fillRect(x, item.y + 8, 10, item.h - 16); }
        target.fillStyle = "#251b14"; target.fillRect(item.x + 3, item.y + item.h / 2 - 2, item.w - 6, 4);
      } else if (item.kind === "sofa") {
        target.fillStyle = "#29362d"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#3d4b3d"; target.fillRect(item.x + 7, item.y + 8, item.w - 14, item.h - 16);
        target.strokeStyle = "#59634f"; target.lineWidth = 4; target.strokeRect(item.x + 6, item.y + 6, item.w - 12, item.h - 12);
        target.fillStyle = "rgba(15,18,15,.35)"; target.fillRect(item.x + item.w / 2 - 2, item.y + 8, 4, item.h - 16);
      } else if (item.kind === "crate") {
        target.fillStyle = "#493721"; target.fillRect(item.x, item.y, item.w, item.h);
        target.strokeStyle = "#72583a"; target.lineWidth = 5; target.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        target.beginPath(); target.moveTo(item.x + 8, item.y + 8); target.lineTo(item.x + item.w - 8, item.y + item.h - 8); target.moveTo(item.x + item.w - 8, item.y + 8); target.lineTo(item.x + 8, item.y + item.h - 8); target.stroke();
      } else if (item.kind === "stairs") {
        target.fillStyle = "#211b16"; target.fillRect(item.x, item.y, item.w, item.h);
        target.strokeStyle = "#6d5a40"; target.lineWidth = 4; target.strokeRect(item.x + 4, item.y + 4, item.w - 8, item.h - 8);
        const steps = 11;
        for (let step = 0; step < steps; step++) {
          const y = item.y + 9 + step * ((item.h - 18) / steps);
          target.fillStyle = step % 2 ? "#463728" : "#51402e";
          target.fillRect(item.x + 10, y, item.w - 20, (item.h - 24) / steps - 2);
          target.fillStyle = "rgba(164,133,88,.18)"; target.fillRect(item.x + 13, y + 2, item.w - 26, 2);
        }
        target.strokeStyle = "#8a704d"; target.lineWidth = 5;
        target.beginPath(); target.moveTo(item.x + 8, item.y + 6); target.lineTo(item.x + 8, item.y + item.h - 6); target.moveTo(item.x + item.w - 8, item.y + 6); target.lineTo(item.x + item.w - 8, item.y + item.h - 6); target.stroke();
      } else if (item.kind === "fireplace") {
        target.fillStyle = "#4c473b"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#24211c"; target.fillRect(item.x + 11, item.y + 20, item.w - 22, item.h - 34);
        target.strokeStyle = "#766b56"; target.lineWidth = 5; target.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        target.fillStyle = "#3f1712"; target.fillRect(item.x + 17, item.y + item.h - 45, item.w - 34, 22);
        target.fillStyle = "#b34b26"; target.fillRect(item.x + 23, item.y + item.h - 37, item.w - 46, 7);
        target.fillStyle = "#8b7858"; target.fillRect(item.x - 5, item.y, item.w + 10, 12);
      } else if (item.kind === "stove") {
        target.fillStyle = "#3b3c37"; target.fillRect(item.x, item.y, item.w, item.h);
        target.strokeStyle = "#79786d"; target.lineWidth = 3; target.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        for (const [ox, oy] of [[.28, .32], [.7, .32], [.28, .7], [.7, .7]]) {
          target.fillStyle = "#191a18"; target.beginPath(); target.arc(item.x + item.w * ox, item.y + item.h * oy, 9, 0, Math.PI * 2); target.fill();
          target.strokeStyle = "#66645a"; target.lineWidth = 2; target.stroke();
        }
      } else if (item.kind === "sink") {
        target.fillStyle = "#4b4b43"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#232a28"; target.fillRect(item.x + 11, item.y + 12, item.w - 22, item.h - 25);
        target.strokeStyle = "#858477"; target.lineWidth = 3; target.strokeRect(item.x + 8, item.y + 8, item.w - 16, item.h - 16);
        target.fillStyle = "#aba890"; target.fillRect(item.x + item.w / 2 - 3, item.y + 5, 6, 16);
      } else if (item.kind === "bathtub") {
        target.fillStyle = "#77776c"; target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "#303633"; target.fillRect(item.x + 10, item.y + 10, item.w - 20, item.h - 20);
        target.strokeStyle = "#a29f88"; target.lineWidth = 4; target.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        target.fillStyle = "#b1aa86"; target.fillRect(item.x + item.w - 20, item.y + 7, 5, 13);
      } else if (item.kind === "dresser" || item.kind === "desk") {
        target.fillStyle = item.kind === "desk" ? "#30251a" : "#493523"; target.fillRect(item.x, item.y, item.w, item.h);
        target.strokeStyle = "#6f5738"; target.lineWidth = 3; target.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        const divisions = item.w > item.h ? 3 : 2;
        for (let part = 1; part < divisions; part++) {
          const x = item.x + part * item.w / divisions;
          target.fillStyle = "#241a13"; target.fillRect(x - 1, item.y + 7, 2, item.h - 14);
        }
        target.fillStyle = "#a58a55";
        for (let part = 0; part < divisions; part++) target.fillRect(item.x + (part + .5) * item.w / divisions - 2, item.y + item.h / 2, 4, 4);
      } else if (item.kind === "clock") {
        target.fillStyle = "#352619"; target.fillRect(item.x, item.y, item.w, item.h);
        target.strokeStyle = "#715438"; target.lineWidth = 4; target.strokeRect(item.x + 4, item.y + 4, item.w - 8, item.h - 8);
        target.fillStyle = "#aaa078"; target.beginPath(); target.arc(item.x + item.w / 2, item.y + 28, 16, 0, Math.PI * 2); target.fill();
        target.fillStyle = "#28231d"; target.fillRect(item.x + item.w / 2 - 1, item.y + 16, 2, 13); target.fillRect(item.x + item.w / 2, item.y + 27, 9, 2);
        target.fillStyle = "#8f7448"; target.fillRect(item.x + item.w / 2 - 3, item.y + 54, 6, 49);
      } else {
        target.fillStyle = item.kind === "counter" ? "#3f4036" : item.kind === "piano" ? "#201c18" : "#483824";
        target.fillRect(item.x, item.y, item.w, item.h);
        target.fillStyle = "rgba(151,130,91,.18)"; target.fillRect(item.x + 6, item.y + 6, item.w - 12, 7);
        target.strokeStyle = "#6d624d"; target.lineWidth = 3; target.strokeRect(item.x + 5, item.y + 5, item.w - 10, item.h - 10);
        if (item.kind === "piano") {
          for (let x = item.x + 10; x < item.x + item.w - 9; x += 9) { target.fillStyle = x % 27 ? "#c1bba3" : "#312b25"; target.fillRect(x, item.y + item.h - 21, 7, 14); }
        }
      }
      target.restore();
    };

    const mansionLayer = document.createElement("canvas");
    mansionLayer.width = MAP_W;
    mansionLayer.height = MAP_H;
    const mansion = mansionLayer.getContext("2d")!;
    mansion.imageSmoothingEnabled = false;
    mansion.fillStyle = "#100f0c";
    mansion.fillRect(0, 0, MAP_W, MAP_H);

    ROOMS.forEach((room, roomIndex) => {
      mansion.fillStyle = room.floor === "tile" ? "#292a24" : room.floor === "stone" ? "#252621" : "#302b22";
      mansion.fillRect(room.x, room.y, room.w, room.h);
      if (room.floor === "tile") {
        const tile = 34;
        for (let y = room.y; y < room.y + room.h; y += tile) {
          for (let x = room.x; x < room.x + room.w; x += tile) {
            const tone = (Math.floor(x / tile) + Math.floor(y / tile)) % 2;
            mansion.fillStyle = tone ? "#37382f" : "#252821";
            mansion.fillRect(x + 1, y + 1, tile - 2, tile - 2);
            mansion.fillStyle = "rgba(0,0,0,.2)"; mansion.fillRect(x + tile - 3, y + 2, 2, tile - 3);
          }
        }
      } else if (room.floor === "stone") {
        const blockW = 72;
        const blockH = 48;
        for (let y = room.y; y < room.y + room.h; y += blockH) {
          const offset = (Math.floor(y / blockH) % 2) * (blockW / 2);
          for (let x = room.x - offset; x < room.x + room.w; x += blockW) {
            const seed = Math.abs((x * 11 + y * 7 + roomIndex * 19) % 4);
            mansion.fillStyle = ["#30312a", "#34342c", "#292c27", "#38372e"][seed];
            mansion.fillRect(x + 2, y + 2, blockW - 4, blockH - 4);
            mansion.fillStyle = "rgba(123,118,92,.1)"; mansion.fillRect(x + 8, y + 7, blockW - 22, 3);
          }
        }
      } else if (room.floor === "parquet") {
        const parquet = 38;
        for (let y = room.y; y < room.y + room.h; y += parquet) {
          for (let x = room.x; x < room.x + room.w; x += parquet) {
            const alternate = (Math.floor(x / parquet) + Math.floor(y / parquet)) % 2 === 0;
            mansion.fillStyle = alternate ? "#3d3124" : "#46372a";
            mansion.fillRect(x + 1, y + 1, parquet - 2, parquet - 2);
            mansion.strokeStyle = "rgba(148,116,77,.22)"; mansion.lineWidth = 2;
            mansion.beginPath();
            if (alternate) { mansion.moveTo(x + 5, y + parquet - 5); mansion.lineTo(x + parquet - 5, y + 5); }
            else { mansion.moveTo(x + 5, y + 5); mansion.lineTo(x + parquet - 5, y + parquet - 5); }
            mansion.stroke();
          }
        }
      } else {
        const plankH = 28;
        for (let y = room.y; y < room.y + room.h; y += plankH) {
          const offset = (Math.floor(y / plankH) % 2) * 54;
          for (let x = room.x - offset; x < room.x + room.w; x += 108) {
            const seed = Math.abs((x * 17 + y * 29 + roomIndex * 41) % 5);
            mansion.fillStyle = ["#3b3125", "#423629", "#362d23", "#46382a", "#392f25"][seed];
            mansion.fillRect(x + 1, y + 1, 106, plankH - 2);
            mansion.fillStyle = "rgba(134,113,80,.13)"; mansion.fillRect(x + 8, y + 5, 72, 2);
            mansion.fillStyle = "rgba(0,0,0,.22)"; mansion.fillRect(x + 105, y + 2, 2, plankH - 3);
          }
        }
      }
      mansion.font = "700 13px monospace";
      mansion.fillStyle = "rgba(178,164,121,.12)";
      mansion.textAlign = "center";
      mansion.fillText(room.name, room.x + room.w / 2, room.y + 32);
    });

    for (const rug of RUGS) {
      mansion.fillStyle = "rgba(16,10,9,.68)"; mansion.fillRect(rug.x + 7, rug.y + 9, rug.w, rug.h);
      mansion.fillStyle = "#4d2824"; mansion.fillRect(rug.x, rug.y, rug.w, rug.h);
      mansion.strokeStyle = "#755143"; mansion.lineWidth = 4; mansion.strokeRect(rug.x + 8, rug.y + 8, rug.w - 16, rug.h - 16);
      mansion.strokeStyle = "#241a18"; mansion.lineWidth = 2; mansion.strokeRect(rug.x + 17, rug.y + 17, rug.w - 34, rug.h - 34);
      mansion.fillStyle = "rgba(138,100,67,.34)";
      for (let x = rug.x + 24; x < rug.x + rug.w - 18; x += 30) mansion.fillRect(x, rug.y + rug.h / 2 - 3, 14, 6);
    }

    for (const stain of STAINS) {
      mansion.fillStyle = "rgba(69,18,16,.58)";
      mansion.beginPath(); mansion.ellipse(stain.x, stain.y, stain.rx, stain.ry, -.18, 0, Math.PI * 2); mansion.fill();
      mansion.fillStyle = "rgba(21,10,9,.32)";
      mansion.beginPath(); mansion.ellipse(stain.x + stain.rx * .28, stain.y - 2, stain.rx * .38, stain.ry * .42, .25, 0, Math.PI * 2); mansion.fill();
    }

    ROOMS.forEach((room, index) => {
      for (let piece = 0; piece < 5; piece++) {
        const x = room.x + 55 + ((piece * 127 + index * 73) % Math.max(90, room.w - 110));
        const y = room.y + 62 + ((piece * 83 + index * 47) % Math.max(90, room.h - 124));
        mansion.save(); mansion.translate(x, y); mansion.rotate(((piece + index) % 5 - 2) * .08);
        mansion.fillStyle = "rgba(153,142,111,.36)"; mansion.fillRect(-9, -6, 18, 12);
        mansion.fillStyle = "rgba(55,48,37,.4)"; mansion.fillRect(-5, -2, 10, 1); mansion.fillRect(-4, 2, 7, 1);
        mansion.restore();
      }

      mansion.strokeStyle = "rgba(130,111,77,.32)";
      mansion.lineWidth = 5;
      mansion.strokeRect(room.x + 7, room.y + 7, room.w - 14, room.h - 14);
      mansion.strokeStyle = "rgba(18,16,13,.58)";
      mansion.lineWidth = 2;
      mansion.strokeRect(room.x + 14, room.y + 14, room.w - 28, room.h - 28);
    });

    for (const chair of CHAIRS) {
      mansion.save();
      mansion.translate(chair.x + chair.w / 2, chair.y + chair.h / 2);
      mansion.rotate(chair.angle);
      mansion.fillStyle = "rgba(0,0,0,.5)"; mansion.fillRect(-chair.w / 2 + 5, -chair.h / 2 + 7, chair.w, chair.h);
      mansion.fillStyle = "#453421"; mansion.fillRect(-chair.w / 2, -chair.h / 2, chair.w, chair.h);
      mansion.fillStyle = "#633f34"; mansion.fillRect(-chair.w / 2 + 6, -chair.h / 2 + 7, chair.w - 12, chair.h - 15);
      mansion.strokeStyle = "#775b3b"; mansion.lineWidth = 3; mansion.strokeRect(-chair.w / 2 + 3, -chair.h / 2 + 3, chair.w - 6, chair.h - 6);
      mansion.fillStyle = "#2e2118"; mansion.fillRect(-chair.w / 2, -chair.h / 2, chair.w, 6);
      mansion.restore();
    }

    for (const wall of WALLS) {
      mansion.fillStyle = "rgba(0,0,0,.72)"; mansion.fillRect(wall.x + 10, wall.y + 12, wall.w, wall.h);
      mansion.fillStyle = "#24231d"; mansion.fillRect(wall.x, wall.y, wall.w, wall.h);
      mansion.fillStyle = "#4f4b3d"; mansion.fillRect(wall.x + 3, wall.y + 3, wall.w - 6, wall.h - 6);
      mansion.fillStyle = "#6a6250";
      if (wall.w > wall.h) {
        mansion.fillRect(wall.x, wall.y + 4, wall.w, 4);
        for (let x = wall.x + 10; x < wall.x + wall.w - 8; x += 42) mansion.fillRect(x, wall.y + 12, 27, 3);
      } else {
        mansion.fillRect(wall.x + 4, wall.y, 4, wall.h);
        for (let y = wall.y + 10; y < wall.y + wall.h - 8; y += 42) mansion.fillRect(wall.x + 12, y, 3, 27);
      }
      mansion.fillStyle = "rgba(11,12,10,.48)";
      if (wall.w > wall.h) mansion.fillRect(wall.x, wall.y + wall.h - 7, wall.w, 7);
      else mansion.fillRect(wall.x + wall.w - 7, wall.y, 7, wall.h);
    }

    for (const windowFrame of WINDOWS) {
      const centerX = windowFrame.axis === "horizontal" ? windowFrame.x + windowFrame.length / 2 : windowFrame.x;
      const centerY = windowFrame.axis === "vertical" ? windowFrame.y + windowFrame.length / 2 : windowFrame.y;
      const windowGlow = mansion.createRadialGradient(centerX, centerY, 8, centerX, centerY, 125);
      windowGlow.addColorStop(0, "rgba(104,127,116,.2)"); windowGlow.addColorStop(1, "rgba(104,127,116,0)");
      mansion.fillStyle = windowGlow; mansion.beginPath(); mansion.arc(centerX, centerY, 125, 0, Math.PI * 2); mansion.fill();
      if (windowFrame.axis === "horizontal") {
        mansion.fillStyle = "#151b1a"; mansion.fillRect(windowFrame.x, windowFrame.y - 10, windowFrame.length, 20);
        mansion.fillStyle = "#52635d"; mansion.fillRect(windowFrame.x + 7, windowFrame.y - 5, windowFrame.length - 14, 10);
        mansion.fillStyle = "#1d2522"; mansion.fillRect(windowFrame.x + windowFrame.length / 2 - 3, windowFrame.y - 7, 6, 14);
        mansion.strokeStyle = "#867a61"; mansion.lineWidth = 4; mansion.strokeRect(windowFrame.x - 3, windowFrame.y - 12, windowFrame.length + 6, 24);
      } else {
        mansion.fillStyle = "#151b1a"; mansion.fillRect(windowFrame.x - 10, windowFrame.y, 20, windowFrame.length);
        mansion.fillStyle = "#52635d"; mansion.fillRect(windowFrame.x - 5, windowFrame.y + 7, 10, windowFrame.length - 14);
        mansion.fillStyle = "#1d2522"; mansion.fillRect(windowFrame.x - 7, windowFrame.y + windowFrame.length / 2 - 3, 14, 6);
        mansion.strokeStyle = "#867a61"; mansion.lineWidth = 4; mansion.strokeRect(windowFrame.x - 12, windowFrame.y - 3, 24, windowFrame.length + 6);
      }
    }

    for (const doorway of DOORWAYS) {
      mansion.save();
      mansion.fillStyle = "#7a6646";
      mansion.strokeStyle = "#aa9165";
      mansion.lineWidth = 3;
      if (doorway.axis === "vertical") {
        mansion.fillRect(doorway.x - 16, doorway.y, 32, doorway.length);
        mansion.fillStyle = "#31251a"; mansion.fillRect(doorway.x - 11, doorway.y + 7, 22, doorway.length - 14);
        mansion.fillStyle = "#8b744e"; mansion.fillRect(doorway.x - 19, doorway.y, 38, 10); mansion.fillRect(doorway.x - 19, doorway.y + doorway.length - 10, 38, 10);
        const hingeY = doorway.swing > 0 ? doorway.y + 11 : doorway.y + doorway.length - 11;
        mansion.translate(doorway.x, hingeY); mansion.rotate(doorway.swing * .78);
        mansion.fillStyle = "#4d3522"; mansion.fillRect(-5, doorway.swing > 0 ? 0 : -74, 10, 74);
        mansion.strokeRect(-5, doorway.swing > 0 ? 0 : -74, 10, 74);
        mansion.fillStyle = "#b59a61"; mansion.fillRect(1, doorway.swing > 0 ? 57 : -61, 4, 4);
      } else {
        mansion.fillRect(doorway.x, doorway.y - 16, doorway.length, 32);
        mansion.fillStyle = "#31251a"; mansion.fillRect(doorway.x + 7, doorway.y - 11, doorway.length - 14, 22);
        mansion.fillStyle = "#8b744e"; mansion.fillRect(doorway.x, doorway.y - 19, 10, 38); mansion.fillRect(doorway.x + doorway.length - 10, doorway.y - 19, 10, 38);
        const hingeX = doorway.swing > 0 ? doorway.x + 11 : doorway.x + doorway.length - 11;
        mansion.translate(hingeX, doorway.y); mansion.rotate(doorway.swing * .78);
        mansion.fillStyle = "#4d3522"; mansion.fillRect(doorway.swing > 0 ? 0 : -74, -5, 74, 10);
        mansion.strokeRect(doorway.swing > 0 ? 0 : -74, -5, 74, 10);
        mansion.fillStyle = "#b59a61"; mansion.fillRect(doorway.swing > 0 ? 57 : -61, 1, 4, 4);
      }
      mansion.restore();
    }

    for (const portrait of PORTRAITS) {
      mansion.fillStyle = "rgba(0,0,0,.62)"; mansion.fillRect(portrait.x + 5, portrait.y + 7, portrait.w, portrait.h);
      mansion.fillStyle = "#765c37"; mansion.fillRect(portrait.x, portrait.y, portrait.w, portrait.h);
      mansion.fillStyle = "#201b16"; mansion.fillRect(portrait.x + 6, portrait.y + 6, portrait.w - 12, portrait.h - 12);
      mansion.fillStyle = "#71614b"; mansion.beginPath(); mansion.ellipse(portrait.x + portrait.w / 2, portrait.y + portrait.h / 2, 7, 10, 0, 0, Math.PI * 2); mansion.fill();
      mansion.fillStyle = "#171410"; mansion.fillRect(portrait.x + portrait.w / 2 - 7, portrait.y + portrait.h / 2 + 7, 14, 7);
    }

    for (const light of HOUSE_LIGHTS) {
      const lampGlow = mansion.createRadialGradient(light.x, light.y, 2, light.x, light.y, 54);
      lampGlow.addColorStop(0, "rgba(190,145,72,.22)"); lampGlow.addColorStop(1, "rgba(190,145,72,0)");
      mansion.fillStyle = lampGlow; mansion.beginPath(); mansion.arc(light.x, light.y, 54, 0, Math.PI * 2); mansion.fill();
      mansion.fillStyle = "#9c7d49"; mansion.fillRect(light.x - 3, light.y - 7, 6, 14);
      mansion.fillStyle = "#d1ad66"; mansion.fillRect(light.x - 7, light.y - 3, 14, 6);
    }
    FURNITURE.forEach((item) => drawFurniture(mansion, item));

    const draw = (game: Game, width: number, height: number) => {
      const focusX = game.mode === "intro" ? width * .72 : width / 2;
      const focusY = game.mode === "intro" ? height * .54 : height / 2;
      const cameraTargetX = clamp(game.player.x - focusX, 0, Math.max(0, MAP_W - width));
      const cameraTargetY = clamp(game.player.y - focusY, 0, Math.max(0, MAP_H - height));
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
      ctx.drawImage(mansionLayer, 0, 0);

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
      ctx.rotate(monster.angle - Math.PI);
      const creaturePulse = Math.sin(performance.now() / 155) * 2;
      ctx.fillStyle = "rgba(0,0,0,.68)"; ctx.beginPath(); ctx.ellipse(4, 19, 46, 19, 0, 0, Math.PI * 2); ctx.fill();
      if (presenceSprite.complete && presenceSprite.naturalWidth > 0) {
        ctx.drawImage(presenceSprite, -61, -40 + creaturePulse * .2, 122, 81);
      } else {
        ctx.strokeStyle = "#392c23"; ctx.lineWidth = 5;
        for (const offset of [-13, 0, 13]) { ctx.beginPath(); ctx.moveTo(-6, offset); ctx.lineTo(-38, offset + creaturePulse); ctx.stroke(); }
        ctx.fillStyle = "#0a0908"; ctx.fillRect(-18, -17, 36, 35);
      }
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = monster.mode === "caçando" ? "rgba(255,48,24,.82)" : "rgba(211,50,28,.52)";
      ctx.beginPath(); ctx.arc(-30, -10, monster.mode === "caçando" ? 8 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.restore();

      const playerScreen = { x: game.player.x - game.camera.x, y: game.player.y - game.camera.y };
      ctx.save();
      ctx.fillStyle = game.hiddenSpot ? "rgba(0,0,0,.965)" : "rgba(0,0,0,.62)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "destination-out";
      const glowRadius = game.hiddenSpot ? 48 : PLAYER_LIGHT_RADIUS;
      const glow = ctx.createRadialGradient(playerScreen.x, playerScreen.y, 16, playerScreen.x, playerScreen.y, glowRadius);
      glow.addColorStop(0, "rgba(0,0,0,1)"); glow.addColorStop(.76, "rgba(0,0,0,1)"); glow.addColorStop(.9, "rgba(0,0,0,.72)"); glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(playerScreen.x, playerScreen.y, glowRadius, 0, Math.PI * 2); ctx.fill();
      if (!game.hiddenSpot) {
        for (const light of HOUSE_LIGHTS) {
          const lightX = light.x - game.camera.x;
          const lightY = light.y - game.camera.y;
          if (lightX < -95 || lightY < -95 || lightX > width + 95 || lightY > height + 95) continue;
          const lampCutout = ctx.createRadialGradient(lightX, lightY, 2, lightX, lightY, 92);
          lampCutout.addColorStop(0, "rgba(0,0,0,.34)"); lampCutout.addColorStop(.45, "rgba(0,0,0,.18)"); lampCutout.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = lampCutout; ctx.beginPath(); ctx.arc(lightX, lightY, 92, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (game.flashlightOn && game.battery > 0 && !game.hiddenSpot) {
        ctx.save(); ctx.translate(playerScreen.x, playerScreen.y); ctx.rotate(game.aim);
        ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(655, -215); ctx.lineTo(655, 215); ctx.closePath(); ctx.clip();
        const beam = ctx.createRadialGradient(0, 0, 18, 0, 0, 670);
        beam.addColorStop(0, "rgba(0,0,0,.995)"); beam.addColorStop(.48, "rgba(0,0,0,.96)"); beam.addColorStop(.78, "rgba(0,0,0,.58)"); beam.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = beam; ctx.fillRect(0, -230, 680, 460); ctx.restore();
      }
      ctx.restore();

      if (!game.hiddenSpot) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const light of HOUSE_LIGHTS) {
          const lightX = light.x - game.camera.x;
          const lightY = light.y - game.camera.y;
          if (lightX < -95 || lightY < -95 || lightX > width + 95 || lightY > height + 95) continue;
          const lampWarmth = ctx.createRadialGradient(lightX, lightY, 1, lightX, lightY, 82);
          lampWarmth.addColorStop(0, "rgba(205,153,74,.12)"); lampWarmth.addColorStop(1, "rgba(205,153,74,0)");
          ctx.fillStyle = lampWarmth; ctx.beginPath(); ctx.arc(lightX, lightY, 82, 0, Math.PI * 2); ctx.fill();
        }
        if (game.flashlightOn && game.battery > 0) {
          ctx.translate(playerScreen.x, playerScreen.y); ctx.rotate(game.aim);
          ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(655, -215); ctx.lineTo(655, 215); ctx.closePath(); ctx.clip();
          const warmBeam = ctx.createRadialGradient(0, 0, 18, 0, 0, 670);
          warmBeam.addColorStop(0, "rgba(255,232,157,.3)"); warmBeam.addColorStop(.52, "rgba(230,205,134,.18)"); warmBeam.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = warmBeam; ctx.fillRect(0, -230, 680, 460);
        }
        ctx.restore();

        const monsterScreen = { x: game.monster.x - game.camera.x, y: game.monster.y - game.camera.y };
        const monsterAngleFromPlayer = Math.atan2(game.monster.y - game.player.y, game.monster.x - game.player.x);
        const monsterInBeam = game.flashlightOn && game.battery > 0 && distance(game.monster, game.player) < 670 &&
          Math.abs(angleDelta(monsterAngleFromPlayer, game.aim)) < .38 && !lineBlocked(game.player, game.monster);
        if (game.mode === "intro" || monsterInBeam) {
          ctx.save(); ctx.translate(monsterScreen.x, monsterScreen.y); ctx.rotate(game.monster.angle - Math.PI);
          ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.beginPath(); ctx.ellipse(4, 19, 48, 19, 0, 0, Math.PI * 2); ctx.fill();
          if (presenceSprite.complete && presenceSprite.naturalWidth > 0) ctx.drawImage(presenceSprite, -66, -44, 132, 88);
          ctx.globalCompositeOperation = "screen";
          ctx.shadowColor = "#ff2d18"; ctx.shadowBlur = game.monster.mode === "caçando" ? 18 : 10;
          ctx.fillStyle = game.monster.mode === "caçando" ? "#ff3a20" : "#bd321f";
          ctx.fillRect(-37, -12, 5, 5); ctx.fillRect(-27, -12, 5, 5);
          ctx.restore();
        }

        ctx.save();
        ctx.translate(playerScreen.x, playerScreen.y);
        const facingLeft = Math.cos(game.aim) < 0;
        const stride = Math.sin(performance.now() / 95) * (game.keys.size ? 1.5 : .35);
        ctx.fillStyle = "rgba(0,0,0,.58)"; ctx.beginPath(); ctx.ellipse(1, 22, 23, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.scale(facingLeft ? -1 : 1, 1);
        if (survivorSprite.complete && survivorSprite.naturalWidth > 0) ctx.drawImage(survivorSprite, -40, -52 + stride, 80, 90);
        ctx.restore();
        ctx.rotate(game.aim);
        ctx.fillStyle = "#2b2820"; ctx.fillRect(11, -3, 20, 6);
        ctx.fillStyle = "#fff0a7"; ctx.fillRect(27, -2, 6, 4);
        ctx.shadowColor = "#ffe991"; ctx.shadowBlur = 12; ctx.fillRect(30, -1, 3, 2);
        ctx.restore();
      }

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
  const victories = history.filter((entry) => entry.result === "won").length;
  const bestSurvival = history.reduce((best, entry) => Math.max(best, entry.survival_seconds), 0);

  return (
    <main className={`game-shell mode-${mode}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">CASA <b>MORTA</b></span><small>A CASA APRENDE SEUS PASSOS</small></div>
        <div className="timer"><small>SOBREVIVA</small>{formatTime(hud.remaining)}</div>
        <div className="top-actions">
          <div className={`status status-${hud.monster}`}><span className="status-dot" />{statusLabel}</div>
          <button className="account-trigger" type="button" onClick={openAccount} disabled={authChecking || mode === "running"}>
            <span className={user ? "account-dot online" : "account-dot"} />
            {authChecking ? "CONECTANDO" : user ? (user.name || user.email.split("@")[0]).slice(0, 16) : "CONTA"}
          </button>
        </div>
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
          <p className="eyebrow">A CASA APRENDE SEUS PASSOS</p>
          <h1><span>CASA</span><strong>MORTA</strong></h1>
          <p>Não deixe que ela aprenda você. Sobreviva por 2 minutos e 30 segundos enquanto a criatura memoriza suas rotas, seus ruídos e os esconderijos que você prefere.</p>
          <div className="rules"><span><b>8s</b> limite escondido</span><span><b>14s</b> para recuperar o fôlego</span><span><b>12</b> cargas espalhadas</span></div>
          <button type="button" onClick={startGame}>ENTRAR NA CASA <span>→</span></button>
          <button className="account-cta" type="button" onClick={openAccount}>{user ? "VER MEU HISTÓRICO" : "ENTRAR PARA SALVAR DESEMPENHO"}</button>
          <div className="keys"><span><kbd>WASD</kbd> MOVER</span><span><kbd>SHIFT</kbd> CORRER</span><span><kbd>MOUSE</kbd> MIRAR</span><span><kbd>F</kbd> LUZ</span><span><kbd>E</kbd> ESCONDER</span></div>
        </div>}

        {mode === "won" && <div className="result-card result-win">
          <p className="eyebrow">02:30 — AMANHECER</p><h2>VOCÊ SOBREVIVEU.</h2>
          <p>A porta finalmente cedeu. A casa conhece seus passos agora, mas não conseguiu guardá-los.</p>
          {user ? <p className={`save-status save-${saveState}`}>{saveState === "saving" ? "SALVANDO ESTA SESSÃO..." : saveState === "saved" ? "SESSÃO SALVA NO SEU HISTÓRICO" : saveState === "error" ? "NÃO FOI POSSÍVEL SALVAR ESTA SESSÃO" : ""}</p> : <button className="account-cta" type="button" onClick={openAccount}>ENTRAR PARA SALVAR AS PRÓXIMAS PARTIDAS</button>}
          <button type="button" onClick={startGame}>JOGAR NOVAMENTE <span>↻</span></button>
        </div>}

        {mode === "lost" && <div className="result-card result-lose">
          <p className="eyebrow">A CASA APRENDEU</p><h2>ELA ENCONTROU VOCÊ.</h2>
          <p>Repita menos suas rotas. Apague a lanterna quando puder. Nunca confie duas vezes no mesmo esconderijo.</p>
          {user ? <p className={`save-status save-${saveState}`}>{saveState === "saving" ? "SALVANDO ESTA SESSÃO..." : saveState === "saved" ? "SESSÃO SALVA NO SEU HISTÓRICO" : saveState === "error" ? "NÃO FOI POSSÍVEL SALVAR ESTA SESSÃO" : ""}</p> : <button className="account-cta" type="button" onClick={openAccount}>ENTRAR PARA SALVAR AS PRÓXIMAS PARTIDAS</button>}
          <button type="button" onClick={startGame}>TENTAR NOVAMENTE <span>↻</span></button>
        </div>}

        {accountOpen && <div className="account-overlay">
          <section className="account-card" role="dialog" aria-modal="true" aria-labelledby="account-title">
            <button className="account-close" type="button" aria-label="Fechar conta" onClick={() => setAccountOpen(false)}>×</button>
            {accountView === "history" && user ? <>
              <p className="eyebrow">ARQUIVO DO SOBREVIVENTE</p>
              <h2 id="account-title">SEU HISTÓRICO</h2>
              <p className="account-email">{user.email}</p>
              <div className="account-summary">
                <span><b>{history.length}</b> sessões recentes</span>
                <span><b>{victories}</b> sobrevivências</span>
                <span><b>{formatTime(bestSurvival)}</b> melhor tempo</span>
              </div>
              <div className="history-list" aria-live="polite">
                {historyLoading && <p className="history-empty">BUSCANDO REGISTROS...</p>}
                {!historyLoading && history.length === 0 && <p className="history-empty">Nenhuma partida salva. A casa ainda não conhece seu nome.</p>}
                {!historyLoading && history.map((entry) => <article className={`history-row history-${entry.result}`} key={entry.id}>
                  <div><b>{entry.result === "won" ? "SOBREVIVEU" : "ENCONTRADO"}</b><time dateTime={entry.played_at}>{formatPlayedAt(entry.played_at)}</time></div>
                  <dl>
                    <div><dt>TEMPO</dt><dd>{formatTime(entry.survival_seconds)}</dd></div>
                    <div><dt>CARGAS</dt><dd>{entry.batteries_collected}/12</dd></div>
                    <div><dt>SALAS</dt><dd>{entry.rooms_visited}/12</dd></div>
                    <div><dt>ESCONDIDO</dt><dd>{Math.round(Number(entry.hiding_seconds))}s</dd></div>
                  </dl>
                </article>)}
              </div>
              {authError && <p className="auth-error">{authError}</p>}
              <button className="account-secondary" type="button" disabled={accountBusy} onClick={signOut}>SAIR DA CONTA</button>
            </> : <>
              <p className="eyebrow">REGISTRE SEUS PASSOS</p>
              <h2 id="account-title">{accountView === "signup" ? "CRIAR CONTA" : "ENTRAR"}</h2>
              <p className="account-copy">Salve cada fuga e acompanhe como você melhora contra a Presença.</p>
              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {accountView === "signup" && <label>NOME DE SOBREVIVENTE<input value={playerName} onChange={(event) => setPlayerName(event.target.value)} autoComplete="name" maxLength={40} /></label>}
                <label>E-MAIL<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                <label>SENHA<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={accountView === "signup" ? "new-password" : "current-password"} minLength={8} required /></label>
                {authError && <p className="auth-error">{authError}</p>}
                <button className="account-primary" type="submit" disabled={accountBusy}>{accountBusy ? "AGUARDE..." : accountView === "signup" ? "CRIAR E ENTRAR" : "ENTRAR NA CONTA"}</button>
              </form>
              <button className="account-switch" type="button" onClick={() => { setAuthError(""); setAccountView(accountView === "signup" ? "signin" : "signup"); }}>
                {accountView === "signup" ? "JÁ TENHO CONTA" : "CRIAR UMA CONTA"}
              </button>
            </>}
          </section>
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
