import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

const generateMessageMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generateMessage", () => ({ generateMessage: generateMessageMock }));

import { draftDueFollowUps } from "@/lib/outreach/followUpDrafts";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";

const DAY_MS = 24 * 60 * 60 * 1000;

let seq = 0;
async function makeUser() {
  seq++;
  return prisma.user.create({ data: { username: `follow-up-draft-user-${seq}`, passwordHash: "unused" } });
}

// Submitted and confirmed eight days ago: the 7-day follow-up window is open.
function makeDueApplication(userId: string, company: string) {
  return prisma.application.create({
    data: {
      userId,
      company,
      role: "Engineer",
      source: "manual",
      status: "Submitted",
      submissionState: "confirmed",
      appliedAt: new Date(Date.now() - 8 * DAY_MS),
    },
  });
}

function followUpGeneratedAt(applicationId: string) {
  return prisma.application.findUniqueOrThrow({ where: { id: applicationId } }).then((row) => row.followUpGeneratedAt);
}

describe("draftDueFollowUps", () => {
  beforeEach(() => {
    generateMessageMock.mockReset();
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("drafts the follow-up for a due application once", async () => {
    const user = await makeUser();
    const application = await makeDueApplication(user.id, "Acme");
    generateMessageMock.mockResolvedValue({ id: "draft-1" });

    await expect(draftDueFollowUps(user.id)).resolves.toBe(1);
    expect(generateMessageMock).toHaveBeenCalledWith(application.id, "FOLLOW_UP");
    await expect(followUpGeneratedAt(application.id)).resolves.toBeInstanceOf(Date);

    await expect(draftDueFollowUps(user.id)).resolves.toBe(0);
    expect(generateMessageMock).toHaveBeenCalledTimes(1);
  });

  it("calls no model without AI assistance, and the follow-up stays due", async () => {
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "false");
    const user = await makeUser();
    const application = await makeDueApplication(user.id, "Acme");

    await expect(draftDueFollowUps(user.id)).resolves.toBe(0);

    expect(generateMessageMock).not.toHaveBeenCalled();
    await expect(listFollowUpDue(user.id)).resolves.toMatchObject([{ id: application.id }]);
  });

  it("releases the application and rethrows when drafting fails, so a later scan tries again", async () => {
    const user = await makeUser();
    const application = await makeDueApplication(user.id, "Acme");
    const failure = new Error("model overloaded");
    generateMessageMock.mockRejectedValueOnce(failure).mockResolvedValueOnce({ id: "draft-2" });

    await expect(draftDueFollowUps(user.id)).rejects.toBe(failure);
    await expect(followUpGeneratedAt(application.id)).resolves.toBeNull();

    await expect(draftDueFollowUps(user.id)).resolves.toBe(1);
    expect(generateMessageMock).toHaveBeenLastCalledWith(application.id, "FOLLOW_UP");
  });

  it("keeps drafting past a failing application, then throws the retryable failure over a permanent one", async () => {
    const user = await makeUser();
    const [broken, flaky, healthy] = await Promise.all(
      ["Broken", "Flaky", "Healthy"].map((company) => makeDueApplication(user.id, company)),
    );
    const permanent = Object.assign(new Error("bad request"), { status: 400 });
    const retryable = Object.assign(new Error("overloaded"), { status: 529 });
    generateMessageMock.mockImplementation(async (applicationId: string) => {
      if (applicationId === broken.id) throw permanent;
      if (applicationId === flaky.id) throw retryable;
      return { id: "draft-healthy" };
    });

    await expect(draftDueFollowUps(user.id)).rejects.toBe(retryable);
    await expect(followUpGeneratedAt(healthy.id)).resolves.toBeInstanceOf(Date);
    await expect(followUpGeneratedAt(broken.id)).resolves.toBeNull();
    await expect(followUpGeneratedAt(flaky.id)).resolves.toBeNull();
  });

  it("skips an application whose follow-up the user drafted by hand while the scan ran", async () => {
    const user = await makeUser();
    const first = await makeDueApplication(user.id, "Acme");
    const second = await makeDueApplication(user.id, "Beta");
    const draftedByHandAt = new Date(Date.now() - 1000);
    generateMessageMock.mockImplementation(async (applicationId: string) => {
      // While the scan drafts one, the user drafts the other from its page.
      const other = applicationId === first.id ? second : first;
      await prisma.application.update({ where: { id: other.id }, data: { followUpGeneratedAt: draftedByHandAt } });
      return { id: `draft-${applicationId}` };
    });

    await expect(draftDueFollowUps(user.id)).resolves.toBe(1);

    expect(generateMessageMock).toHaveBeenCalledTimes(1);
    const handDrafted = generateMessageMock.mock.calls[0][0] === first.id ? second : first;
    await expect(followUpGeneratedAt(handDrafted.id)).resolves.toEqual(draftedByHandAt);
  });
});
