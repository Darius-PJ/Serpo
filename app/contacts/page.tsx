import Link from "next/link";
import { requireUserIdForPage } from "@/lib/auth/session";
import { listContactsByCompany } from "@/lib/contacts/contacts";
import { ContactAddForm } from "@/components/ContactAddForm";
import { InteractionLogForm } from "@/components/InteractionLogForm";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const userId = await requireUserIdForPage();
  const groups = await listContactsByCompany(userId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-heading">Contacts</h1>
      <p className="page-lede">People you have met or found, grouped by company, with what was said and when. Follow-ups start here.</p>
      <ContactAddForm />

      {groups.length === 0 ? (
        <p className="card-soft p-3 text-base text-foreground-muted">
          No contacts yet. Add one above, or research contacts from an application page.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.company} aria-label={`Contacts at ${group.company}`} className="mb-6">
            <h2 className="mb-2 text-base font-bold text-heading">{group.company}</h2>
            <ul className="space-y-3">
              {group.contacts.map((contact) => (
                <li key={contact.id} className="card-soft p-3 text-base">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-foreground">{contact.name ?? "Name not provided"}</span>
                    {contact.title && <span className="text-foreground-muted">{contact.title}</span>}
                    {contact.email && <span className="break-all text-foreground-muted">{contact.email}</span>}
                  </div>

                  {contact.applications.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-sm">
                      {contact.applications.map((application) => (
                        <Link
                          key={application.id}
                          href={`/applications/${application.id}`}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-foreground-muted hover:text-primary-dark"
                        >
                          {application.company} — {application.role}
                        </Link>
                      ))}
                    </div>
                  )}

                  {contact.interactions.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-border-soft pl-3 text-sm text-foreground-muted">
                      {contact.interactions.map((interaction) => (
                        <li key={interaction.id}>
                          <span className="font-medium text-foreground">
                            {interaction.kind} ({interaction.direction})
                          </span>{" "}
                          {interaction.occurredAt.toLocaleDateString()}
                          {interaction.notes && <span> — {interaction.notes}</span>}
                        </li>
                      ))}
                    </ul>
                  )}

                  <InteractionLogForm contactId={contact.id} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
