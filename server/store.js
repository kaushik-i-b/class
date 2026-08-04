import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'db.json');

const EMPTY_DB = {
  campaigns: [],
  leads: [],
  messages: [],
  meta: { version: 2, seededAt: null },
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

export function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  for (const key of Object.keys(EMPTY_DB)) {
    if (db[key] == null) db[key] = EMPTY_DB[key];
  }
  return db;
}

export function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function updateDb(mutator) {
  const db = readDb();
  const next = mutator(db) || db;
  writeDb(next);
  return next;
}

export function id() {
  return randomUUID();
}

export function now() {
  return new Date().toISOString();
}

export function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
