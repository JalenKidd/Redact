import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function createLocalDatabase(file = ":memory:") {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("CREATE TABLE IF NOT EXISTS _redact_migrations (name TEXT PRIMARY KEY)");
  const migrations = fileURLToPath(new URL("../drizzle/", import.meta.url));
  for (const name of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
    if (database.prepare("SELECT name FROM _redact_migrations WHERE name = ?").get(name)) continue;
    database.exec("BEGIN");
    try {
      database.exec(readFileSync(migrations + name, "utf8"));
      database.prepare("INSERT INTO _redact_migrations (name) VALUES (?)").run(name);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  function prepare(sql, values = []) {
    const statement = database.prepare(sql);
    return {
      bind(...parameters) { return prepare(sql, parameters); },
      async first() { return statement.get(...values) || null; },
      async all() { return { results: statement.all(...values) }; },
      async run() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
      runSync() { const result = statement.run(...values); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  return {
    prepare,
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.runSync());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() { database.close(); },
  };
}
