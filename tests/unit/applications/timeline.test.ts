import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { listApplicationTimeline } from "@/lib/applications/timeline";
import { changeApplicationStatus } from "@/lib/applications/changeStatus";
import { findOrCreateContact, logInteraction } from "@/lib/contacts/contacts";
import { completeTask, createTask } from "@/lib/tasks/tasks";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("listApplicationTimeline", () => {
  it("merges every source into one newest-first history", async () => {
    const user = await prisma.user.create({ data: { username: "timeline-user", passwordHash: "unused" } });
    const trackedAt = new Date(Date.now() - 10 * DAY_MS);
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual", createdAt: trackedAt },
    });

    // Status move (writes the status_changed audit event).
    await changeApplicationStatus(user.id, application.id, "Submitted");

    // Apply run with a started and a submitted moment.
    await prisma.applyRun.create({
      data: {
        applicationId: application.id,
        status: "submitted",
        startedAt: new Date(Date.now() - 8 * DAY_MS),
        submittedAt: new Date(Date.now() - 7 * DAY_MS),
      },
    });

    // A follow-up draft that was later sent.
    await prisma.message.create({
      data: {
        applicationId: application.id,
        type: "FOLLOW_UP",
        draftText: "checking in",
        status: "SENT",
        createdAt: new Date(Date.now() - 6 * DAY_MS),
        sentAt: new Date(Date.now() - 5 * DAY_MS),
      },
    });

    // An interaction tied to this application.
    const contact = await findOrCreateContact(user.id, "Acme", { name: "Rina Patel" });
    await logInteraction(user.id, {
      contactId: contact.id,
      kind: "call",
      direction: "inbound",
      occurredAt: new Date(Date.now() - 4 * DAY_MS),
      notes: "Phone screen scheduled",
      applicationId: application.id,
    });

    // A completed task (open tasks stay off the timeline).
    const done = await createTask(user.id, { title: "Prep phone screen", applicationId: application.id });
    await completeTask(user.id, done!.id);
    await createTask(user.id, { title: "Still open", applicationId: application.id });

    const timeline = await listApplicationTimeline(user.id, application.id);

    expect(timeline).not.toBeNull();
    expect(timeline!.map((entry) => entry.label)).toEqual([
      "Task completed: Prep phone screen",
      "Status changed: Sourced → Submitted",
      "Interaction: call (inbound)",
      "Follow-up sent",
      "Follow-up draft created",
      "Apply run submitted",
      "Apply run started",
      "Application tracked",
    ]);

    // Newest first throughout.
    const times = timeline!.map((entry) => entry.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const interaction = timeline!.find((entry) => entry.kind === "interaction");
    expect(interaction?.detail).toBe("Phone screen scheduled");
    expect(timeline!.at(-1)).toMatchObject({ kind: "tracked", label: "Application tracked" });
    expect(timeline!.at(-1)?.at).toEqual(trackedAt);
  });

  it("returns null for another user's application and excludes other applications' events", async () => {
    const owner = await prisma.user.create({ data: { username: "timeline-owner", passwordHash: "unused" } });
    const intruder = await prisma.user.create({ data: { username: "timeline-intruder", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: owner.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const other = await prisma.application.create({
      data: { userId: owner.id, company: "Beta", role: "Analyst", source: "manual" },
    });
    await changeApplicationStatus(owner.id, other.id, "Submitted");
    const task = await createTask(owner.id, { title: "Elsewhere", applicationId: other.id });
    await completeTask(owner.id, task!.id);

    await expect(listApplicationTimeline(intruder.id, application.id)).resolves.toBeNull();

    const timeline = await listApplicationTimeline(owner.id, application.id);
    expect(timeline!.map((entry) => entry.label)).toEqual(["Application tracked"]);
  });
});
