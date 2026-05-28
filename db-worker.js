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
    "SELECT id, title, body, mood, summary, createdAt FROM diaries ORDER BY createdAt DESC"
  );
  if (!result[0]) return rows;
  const columns = result[0].columns;
  for (const values of result[0].values) {
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    rows.push(row);
  }
  return rows;
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
      createdAt TEXT NOT NULL
    );
  `);
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
      db.run(
        "INSERT INTO diaries (title, body, mood, summary, createdAt) VALUES (?, ?, ?, ?, ?)",
        [payload.title, payload.body, payload.mood, payload.summary || "", payload.createdAt]
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
