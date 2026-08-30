import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { completeTask, createTask, listDueTasks, listOpenTasks, snoozeTask } from "@/lib/tasks/tasks";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("createTask", () => {
  it("creates a standalone task and an application-linked task for the owner", async () => {
    const user = await prisma.user.create({ data: { username: "task-create-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    const standalone = await createTask(user.id, { title: "  Update resume  " });
    expect(standalone).toMatchObject({ title: "Update resume", applicationId: null, dueAt: null, completedAt: null });

    const due = new Date(Date.now() + DAY_MS);
    const linked = await createTask(user.id, { title: "Prep phone screen", dueAt: due, applicationId: application.id });
    expect(linked).toMatchObject({ title: "Prep phone screen", applicationId: application.id });
    expect(linked?.dueAt).toEqual(due);
  });

  it("rejects a blank title and an application another user owns", async () => {
    const user = await prisma.user.create({ data: { username: "task-reject-user", passwordHash: "unused" } });
    const other = await prisma.user.create({ data: { username: "task-reject-other", passwordHash: "unused" } });
    const foreign = await prisma.application.create({
      data: { userId: other.id, company: "Hidden Co", role: "Engineer", source: "manual" },
    });

    await expect(createTask(user.id, { title: "   " })).resolves.toBeNull();
    await expect(createTask(user.id, { title: "Spy", applicationId: foreign.id })).resolves.toBeNull();
    await expect(prisma.task.count({ where: { userId: user.id } })).resolves.toBe(0);
  });
});

describe("completeTask and snoozeTask", () => {
  it("completes a task once and keeps the original completion time on repeat calls", async () => {
    const user = await prisma.user.create({ data: { username: "task-complete-user", passwordHash: "unused" } });
    const task = await createTask(user.id, { title: "Send thank-you note" });

    const completed = await completeTask(user.id, task!.id);
    expect(completed?.completedAt).toBeInstanceOf(Date);

    const again = await completeTask(user.id, task!.id);
    expect(again?.completedAt).toEqual(completed?.completedAt);
  });

  it("snoozes a task until the given time", async () => {
    const user = await prisma.user.create({ data: { username: "task-snooze-user", passwordHash: "unused" } });
    const task = await createTask(user.id, { title: "Chase recruiter" });
    const until = new Date(Date.now() + 2 * DAY_MS);

    const snoozed = await snoozeTask(user.id, task!.id, until);
    expect(snoozed?.snoozedUntil).toEqual(until);
  });

  it("returns null for another user's task without touching it", async () => {
    const owner = await prisma.user.create({ data: { username: "task-owner-user", passwordHash: "unused" } });
    const intruder = await prisma.user.create({ data: { username: "task-intruder-user", passwordHash: "unused" } });
    const task = await createTask(owner.id, { title: "Private task" });

    await expect(completeTask(intruder.id, task!.id)).resolves.toBeNull();
    await expect(snoozeTask(intruder.id, task!.id, new Date())).resolves.toBeNull();
    const untouched = await prisma.task.findUnique({ where: { id: task!.id } });
    expect(untouched).toMatchObject({ completedAt: null, snoozedUntil: null });
  });
});

describe("listOpenTasks", () => {
  it("lists open tasks due-date first (undated last), scoped to the user and optionally one application", async () => {
    const user = await prisma.user.create({ data: { username: "task-list-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });

    await createTask(user.id, { title: "Undated" });
    await createTask(user.id, { title: "Due later", dueAt: new Date(Date.now() + 2 * DAY_MS) });
    await createTask(user.id, { title: "Due soon", dueAt: new Date(Date.now() + DAY_MS), applicationId: application.id });
    const done = await createTask(user.id, { title: "Finished" });
    await completeTask(user.id, done!.id);

    const other = await prisma.user.create({ data: { username: "task-list-other", passwordHash: "unused" } });
    await createTask(other.id, { title: "Someone else's" });

    const all = await listOpenTasks(user.id);
    expect(all.map((task) => task.title)).toEqual(["Due soon", "Due later", "Undated"]);

    const scoped = await listOpenTasks(user.id, application.id);
    expect(scoped.map((task) => task.title)).toEqual(["Due soon"]);
  });
});

describe("listDueTasks", () => {
  it("returns open tasks that are undated or due, excluding snoozed and future-dated ones, with application context", async () => {
    const user = await prisma.user.create({ data: { username: "task-due-user", passwordHash: "unused" } });
    const application = await prisma.application.create({
      data: { userId: user.id, company: "Acme", role: "Engineer", source: "manual" },
    });
    const now = new Date();

    await createTask(user.id, { title: "Undated backlog" });
    await createTask(user.id, { title: "Overdue", dueAt: new Date(now.getTime() - DAY_MS), applicationId: application.id });
    await createTask(user.id, { title: "Not due yet", dueAt: new Date(now.getTime() + DAY_MS) });
    const snoozed = await createTask(user.id, { title: "Snoozed away" });
    await snoozeTask(user.id, snoozed!.id, new Date(now.getTime() + DAY_MS));
    const woken = await createTask(user.id, { title: "Snooze expired" });
    await snoozeTask(user.id, woken!.id, new Date(now.getTime() - DAY_MS));

    const due = await listDueTasks(user.id, now);
    expect(due.map((task) => task.title).sort()).toEqual(["Overdue", "Snooze expired", "Undated backlog"]);
    const overdue = due.find((task) => task.title === "Overdue");
    expect(overdue?.application).toMatchObject({ id: application.id, company: "Acme", role: "Engineer" });
    const undated = due.find((task) => task.title === "Undated backlog");
    expect(undated?.application).toBeNull();
  });
});
