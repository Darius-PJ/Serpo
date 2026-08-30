import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_NAME = "20260830210000_contacts_promotion";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all(): Record<string, unknown>[]; get(): Record<string, unknown> | undefined };
  close(): void;
};
const testRequire = createRequire(import.meta.url);
const BetterSqlite3 = testRequire("better-sqlite3") as new (filename: string) => SqliteDatabase;

/**
 * The contacts promotion rewrites real user data, so it gets a direct test:
 * seed DecisionMaker rows on a database migrated up to the promotion, apply
 * it, and assert the merge produced exactly the contacts the user approved —
 * auto-merge on exact name+company within one account, nameless rows kept
 * separate, provenance preserved per application on link rows.
 */
describe("contacts promotion migration", () => {
  it("merges same-name-same-company rows per user, keeps everything else separate, and preserves provenance", () => {
    const migrationsPath = path.join(process.cwd(), "prisma", "migrations");
    const names = readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const target = names.indexOf(MIGRATION_NAME);
    expect(target, `migration ${MIGRATION_NAME} must exist`).toBeGreaterThan(-1);

    const db = new BetterSqlite3(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON;");
      for (const name of names.slice(0, target)) {
        db.exec(readFileSync(path.join(migrationsPath, name, "migration.sql"), "utf8"));
      }

      db.exec(`
        INSERT INTO "User" ("id", "username", "passwordHash") VALUES
          ('u1', 'promo-user-1', 'unused'),
          ('u2', 'promo-user-2', 'unused');
        INSERT INTO "Application" ("id", "userId", "company", "role", "source", "lastStatusChangeAt") VALUES
          ('a1', 'u1', 'Acme', 'Engineer', 'manual', CURRENT_TIMESTAMP),
          ('a2', 'u1', 'Acme', 'Analyst', 'manual', CURRENT_TIMESTAMP),
          ('a3', 'u1', 'Beta Corp', 'Engineer', 'manual', CURRENT_TIMESTAMP),
          ('a4', 'u2', 'Acme', 'Engineer', 'manual', CURRENT_TIMESTAMP);
        INSERT INTO "DecisionMaker" ("id", "applicationId", "name", "title", "email", "sourceTool", "confidence", "foundAt") VALUES
          ('d1', 'a1', 'Rina Patel', NULL, NULL, 'theharvester', NULL, '2026-08-01 10:00:00'),
          ('d2', 'a2', 'rina patel', 'Recruiter', 'rina@acme.example', 'theharvester', 'high', '2026-08-05 10:00:00'),
          ('d3', 'a3', 'Rina Patel', NULL, NULL, 'theharvester', NULL, '2026-08-06 10:00:00'),
          ('d4', 'a4', 'Rina Patel', NULL, NULL, 'theharvester', NULL, '2026-08-07 10:00:00'),
          ('d5', 'a1', NULL, NULL, 'info@acme.example', 'theharvester', NULL, '2026-08-08 10:00:00'),
          ('d6', 'a2', NULL, NULL, 'info@acme.example', 'theharvester', NULL, '2026-08-09 10:00:00');
      `);

      db.exec(readFileSync(path.join(migrationsPath, MIGRATION_NAME, "migration.sql"), "utf8"));

      // 1 merged (u1/Acme/Rina) + 1 (u1/Beta) + 1 (u2/Acme) + 2 nameless = 5.
      const contacts = db.prepare('SELECT * FROM "Contact" ORDER BY "userId", "company"').all();
      expect(contacts).toHaveLength(5);

      const merged = db
        .prepare(
          `SELECT * FROM "Contact" WHERE "userId" = 'u1' AND "company" = 'Acme' AND lower(trim("name")) = 'rina patel'`,
        )
        .all();
      expect(merged).toHaveLength(1);
      // The merge keeps the richest values and the earliest discovery time.
      expect(merged[0].title).toBe("Recruiter");
      expect(merged[0].email).toBe("rina@acme.example");
      expect(merged[0].createdAt).toBe("2026-08-01 10:00:00");

      // One link per application, provenance intact.
      const links = db
        .prepare(
          `SELECT "applicationId", "sourceTool", "foundAt" FROM "ContactApplication" WHERE "contactId" = '${merged[0].id}' ORDER BY "applicationId"`,
        )
        .all();
      expect(links).toEqual([
        { applicationId: "a1", sourceTool: "theharvester", foundAt: "2026-08-01 10:00:00" },
        { applicationId: "a2", sourceTool: "theharvester", foundAt: "2026-08-05 10:00:00" },
      ]);

      // Nameless rows never auto-merge, even with matching emails.
      const nameless = db.prepare('SELECT * FROM "Contact" WHERE "name" IS NULL').all();
      expect(nameless).toHaveLength(2);

      // The old table is gone; Message gained its optional contactId.
      const dmTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='DecisionMaker'").get();
      expect(dmTable).toBeUndefined();
      const messageColumns = db.prepare('PRAGMA table_info("Message")').all().map((column) => column.name);
      expect(messageColumns).toContain("contactId");
    } finally {
      db.close();
    }
  });
});
