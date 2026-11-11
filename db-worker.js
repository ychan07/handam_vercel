/* global initSqlJs */
importScripts("https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js");

let SQL;
let db;

function exportedBinaryArray() {
  const data = db.export();
  return Array.from(data);
}

function listRows() {
  const rows = [];
  const result = db.exec(
    "SELECT id, title, body, mood, summary, createdAt, entryDate, tags FROM diaries ORDER BY createdAt DESC"
  );
  if (!result[0]) return rows;
  const columns = result[0].columns;
  for (const values of result[0].values) {
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    row.tags = parseTags(row.tags);
    rows.push(row);
  }
  return rows;
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_e) {
    return [];
  }
}

function serializeTags(tags) {
  return JSON.stringify(Array.isArray(tags) ? tags.map(String).slice(0, 10) : []);
}

async function setup() {
  SQL = await initSqlJs({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
  });
  const raw = Array.isArray(self._seedData) ? self._seedData : null;
  if (raw) {
    const bytes = new Uint8Array(raw);
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS diaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      mood TEXT NOT NULL,
      summary TEXT,
      createdAt TEXT NOT NULL,
      entryDate TEXT
    );
  `);
  for (const column of ["entryDate TEXT", "tags TEXT"]) {
    try {
      db.run(`ALTER TABLE diaries ADD COLUMN ${column}`);
    } catch (_e) {
      /* column already exists */
    }
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "init") {
      self._seedData = payload.serialized || null;
      await setup();
      self.postMessage({ id, data: { ok: true, serialized: exportedBinaryArray() } });
      return;
    }
    if (!db) throw new Error("DB not initialized");

    if (type === "insert") {
      const entryDate =
        payload.entryDate ||
        (typeof payload.createdAt === "string" ? payload.createdAt.slice(0, 10) : "");
      db.run(
        "INSERT INTO diaries (title, body, mood, summary, createdAt, entryDate, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          payload.title,
          payload.body,
          payload.mood,
          payload.summary || "",
          payload.createdAt,
          entryDate,
          serializeTags(payload.tags),
        ]
      );
      self.postMessage({ id, data: { ok: true, serialized: exportedBinaryArray() } });
      return;
    }

    if (type === "update") {
      db.run(
        "UPDATE diaries SET title = ?, body = ?, mood = ?, summary = ?, entryDate = ?, tags = ? WHERE id = ?",
        [
          payload.title,
          payload.body,
          payload.mood,
          payload.summary || "",
          payload.entryDate,
          serializeTags(payload.tags),
          payload.id,
        ]
      );
      self.postMessage({ id, data: { ok: true, serialized: exportedBinaryArray() } });
      return;
    }

    if (type === "delete") {
      db.run("DELETE FROM diaries WHERE id = ?", [payload.id]);
      self.postMessage({ id, data: { ok: true, serialized: exportedBinaryArray() } });
      return;
    }

    if (type === "list") {
      self.postMessage({ id, data: listRows() });
      return;
    }

    throw new Error(`Unknown worker command: ${type}`);
  } catch (error) {
    self.postMessage({ id, error: error.message || "Worker error" });
  }
};
