import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { TaskActions } from "@/components/TaskActions";

export const dynamic = "force-dynamic";

export default async function WorkQueuePage() {
  const userId = await requireUserIdForPage();
  const [tasks, outreach, contacts] = await Promise.all([
    prisma.task.findMany({
      where: { userId, completedAt: null },
      include: { application: { select: { id: true, company: true, role: true } } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.message.findMany({
      where: { status: { in: ["DRAFT", "APPROVED"] }, application: { userId } },
      include: {
        application: { select: { id: true, company: true, role: true } },
        contact: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId },
      include: {
        interactions: { orderBy: { occurredAt: "desc" }, take: 1 },
        applications: { include: { application: { select: { id: true, company: true, role: true } } } },
      },
      orderBy: [{ company: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-extrabold text-foreground">Work queue</h1>
      <p className="mb-6 text-sm text-foreground-muted">Your next actions, unsent outreach, and relationship recency in one place.</p>

      <section className="card-soft mb-6 p-4" aria-labelledby="open-tasks">
        <h2 id="open-tasks" className="mb-3 font-bold text-foreground">Open tasks</h2>
        {tasks.length === 0 ? <p className="text-sm text-foreground-muted">No open tasks.</p> : (
          <ul className="divide-y divide-border-soft">
            {tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{task.title}</span>
                  {task.application && (
                    <Link href={`/applications/${task.application.id}`} className="block text-xs text-primary-dark hover:underline">
                      {task.application.company} — {task.application.role}
                    </Link>
                  )}
                  {task.dueAt && <span className="text-xs text-foreground-muted">Due {task.dueAt.toLocaleDateString()}</span>}
                </span>
                <TaskActions taskId={task.id} title={task.title} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-soft mb-6 p-4" aria-labelledby="outreach-queue">
        <h2 id="outreach-queue" className="mb-3 font-bold text-foreground">Outreach</h2>
        {outreach.length === 0 ? <p className="text-sm text-foreground-muted">No draft or approved outreach waiting.</p> : (
          <ul className="divide-y divide-border-soft">
            {outreach.map((message) => (
              <li key={message.id} className="py-2 text-sm">
                <Link href={`/applications/${message.application.id}`} className="font-semibold text-primary-dark hover:underline">
                  {message.application.company} — {message.application.role}
                </Link>
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary-dark">{message.status.toLowerCase()}</span>
                <p className="mt-1 text-xs text-foreground-muted">
                  To {message.contact?.name ?? message.contact?.email ?? "contact not selected"} · {message.type === "FOLLOW_UP" ? "Follow-up" : "Initial outreach"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-soft p-4" aria-labelledby="contact-recency">
        <h2 id="contact-recency" className="mb-3 font-bold text-foreground">Contact recency</h2>
        {contacts.length === 0 ? <p className="text-sm text-foreground-muted">No contacts yet.</p> : (
          <ul className="divide-y divide-border-soft">
            {contacts.map((contact) => {
              const lastTouch = contact.interactions[0];
              return (
                <li key={contact.id} className="py-2 text-sm">
                  <div className="font-semibold">{contact.name ?? contact.email ?? "Unnamed contact"} <span className="font-normal text-foreground-muted">at {contact.company}</span></div>
                  <p className="text-xs text-foreground-muted">
                    {lastTouch ? `Last touch ${lastTouch.occurredAt.toLocaleDateString()} · ${lastTouch.kind}` : "No touches logged"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {contact.applications.map((link) => (
                      <Link key={link.application.id} href={`/applications/${link.application.id}`} className="text-xs text-primary-dark hover:underline">
                        {link.application.role}
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
