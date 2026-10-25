import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function columns(value) {
  return value.split(",").map((column) => column.trim());
}

function parseTables(sql) {
  const tables = new Map();
  const tablePattern = /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;

  for (const match of sql.matchAll(tablePattern)) {
    const [, tableName, definition] = match;
    const keys = [];

    for (const keyMatch of definition.matchAll(/\b(primary\s+key|unique)\s*\(([^)]+)\)/gi)) {
      keys.push(columns(keyMatch[2]));
    }
    for (const columnMatch of definition.matchAll(/^\s*\w+\s+\w+(?:\([^)]*\))?\s+[^,\n]*\bprimary\s+key\b/gim)) {
      keys.push([columnMatch[0].trim().split(/\s+/)[0]]);
    }

    tables.set(tableName, { definition, keys });
  }

  return tables;
}

describe("migration composite foreign keys", () => {
  it("references an existing primary or unique key for every composite foreign key", async () => {
    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const sql = (await Promise.all(migrationFiles.map((file) =>
      readFile(path.join(migrationsDirectory, file), "utf8"),
    ))).join("\n");
    const tables = parseTables(sql);
    const invalidReferences = [];
    const foreignKeyPattern =
      /foreign\s+key\s*\(([^)]+)\)\s*references\s+public\.(\w+)\s*\(([^)]+)\)/gi;

    for (const source of tables.values()) {
      for (const match of source.definition.matchAll(foreignKeyPattern)) {
        const sourceColumns = columns(match[1]);
        if (sourceColumns.length < 2) continue;

        const targetName = match[2];
        const targetColumns = columns(match[3]);
        const target = tables.get(targetName);
        if (!target || !target.keys.some((key) => key.length === targetColumns.length
          && key.every((column, index) => column === targetColumns[index]))) {
          invalidReferences.push(`${targetName}(${targetColumns.join(", ")})`);
        }
      }
    }

    expect(invalidReferences).toEqual([]);
  });
});
