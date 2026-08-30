import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { addTitleAlias, listTitleAliases, removeTitleAlias } from "@/lib/jobSources/titleAliases";

async function createUser(username: string) {
  return prisma.user.create({ data: { username, passwordHash: "unused" } });
}

describe("user-curated title aliases", () => {
  it("stores aliases normalized and lists them by normalized keyword", async () => {
    const user = await createUser("alias-roundtrip-user");
    await addTitleAlias(user.id, "Network Engineer", "  Infrastructure -- Analyst! ");
    const listed = await listTitleAliases(user.id, "network   engineer");
    expect(listed.map((a) => a.alias)).toEqual(["infrastructure analyst"]);
  });

  it("is idempotent for the same user, keyword, and alias", async () => {
    const user = await createUser("alias-idempotent-user");
    await addTitleAlias(user.id, "network engineer", "noc technician");
    await addTitleAlias(user.id, "Network Engineer", "NOC Technician");
    const listed = await listTitleAliases(user.id, "network engineer");
    expect(listed).toHaveLength(1);
  });

  it("rejects empty keyword or alias", async () => {
    const user = await createUser("alias-empty-user");
    await expect(addTitleAlias(user.id, "  ", "noc technician")).rejects.toThrow();
    await expect(addTitleAlias(user.id, "network engineer", " !! ")).rejects.toThrow();
  });

  it("removes only the owner's alias", async () => {
    const owner = await createUser("alias-owner-user");
    const other = await createUser("alias-other-user");
    const created = await addTitleAlias(owner.id, "network engineer", "noc technician");

    expect(await removeTitleAlias(other.id, created.id)).toBe(false);
    expect(await listTitleAliases(owner.id, "network engineer")).toHaveLength(1);

    expect(await removeTitleAlias(owner.id, created.id)).toBe(true);
    expect(await listTitleAliases(owner.id, "network engineer")).toHaveLength(0);
  });
});
