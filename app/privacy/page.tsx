import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | Serpo",
  description: "How Serpo stores data locally, uses external services, runs automation and handles deletion.",
};

export default function PrivacyPage() {
  return (
    <div>
      <div className="page-heading mb-6">
        <div>
          <h1 id="privacy-heading" className="mb-1 text-2xl font-extrabold text-heading">Privacy and data use</h1>
          <p className="page-lede mb-0">
            Serpo is a local-first, password-free workspace, not a network-free app. Your records are stored on this
            device, but searches, enabled research and application assistance can disclose data externally—sometimes
            in the background, without a separate review dialog.
          </p>
        </div>
      </div>

      <article aria-labelledby="privacy-heading" className="max-w-3xl text-base text-foreground-muted [&_code]:break-all">
        <nav aria-label="Privacy topics" className="mb-10">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li><a href="#local-storage" className="link-accent">Local storage</a></li>
            <li><a href="#external-services" className="link-accent">External services</a></li>
            <li><a href="#automation" className="link-accent">Triggers and controls</a></li>
            <li><a href="#offline" className="link-accent">Offline and tooling</a></li>
            <li><a href="#deletion" className="link-accent">Deletion limits</a></li>
            <li><a href="#device-trust" className="link-accent">Device and backups</a></li>
            <li><a href="#terms" className="link-accent">Costs and terms</a></li>
          </ul>
        </nav>

        <section aria-labelledby="local-storage" className="mb-10 space-y-3">
          <h2 id="local-storage" className="text-lg font-bold text-heading">What stays on this device</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Database:</strong> the default SQLite file is <code>data/app.db</code>
              {" "}(or the location in <code>DATABASE_URL</code>). It stores applications, job descriptions and notes,
              contacts and interactions, tasks, message drafts, extracted résumé text and generated résumé workspaces,
              saved form answers, saved searches and listing snapshots, lead reports, automation jobs/errors and audit history.
              It also keeps your last 50 manual searches (keywords and location), the industries you pick on Companies and the
              companies you mark Not interested, which are used only to suggest companies. Saved-search runs are not recorded;
              Companies → Clear search history removes the history at any time.
            </li>
            <li>
              <strong className="text-foreground">Separate files:</strong> tailored DOCX files live in <code>data/resumes</code>;
              AI Scout lead exports live in <code>data/raekwon-archive</code>. JobSpy request/cooldown state lives beside
              the database, normally <code>data/app.db.jobspy-state.json</code>. Migration backups and portable/recovery
              copies are additional copies, not part of the live database.
            </li>
            <li>
              <strong className="text-foreground">Credentials:</strong> standard provider keys and configuration live in
              the project&apos;s <code>.env.local</code> file and are used by the server. They are not encrypted by Serpo.
              The Anthropic SDK may also use separately configured credential profiles or an auth token.
            </li>
            <li>
              <strong className="text-foreground">Browser and logs:</strong> the Windows desktop launcher uses a persistent
              profile in <code className="break-words">%LOCALAPPDATA%\Serpo\browser-profile</code>. Browser cookies, history
              and other state can remain there; an ordinary browser keeps its own state instead. Theme, motion and navigation
              preferences use browser localStorage. Launcher/server/setup logs and control-state files live under
              <code className="break-words"> %LOCALAPPDATA%\Serpo</code>; control state can contain a local shutdown token.
              Treat logs, browser profiles and these files as sensitive.
            </li>
          </ul>
          <p>
            Uploading a résumé extracts and stores its text locally; upload alone does not call AI. The original file
            you selected and copies downloaded to your browser&apos;s download folder are separate from Serpo-managed artifacts.
          </p>
        </section>

        <section aria-labelledby="external-services" className="mb-10 space-y-3">
          <h2 id="external-services" className="text-lg font-bold text-heading">External recipients and the data they receive</h2>
          <p>
            Requests can expose connection metadata such as your network IP address. Keyed APIs also receive their configured
            authentication credentials. Provider-side processing, retention and onward sharing follow their own terms, not
            Serpo&apos;s local-storage behavior.
          </p>

          <h3 className="pt-2 font-bold text-foreground">Anthropic: résumé and research assistance</h3>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Improved/Touch-Up and apply-tailoring requests send your full stored source résumé text, including personal
              details in it, plus applicable target company, role and job description. Benchmark generation sends target
              company, role and description, not your source résumé. Melded generation sends the two chosen résumé source
              texts and target company/role. Opening a sourcing result&apos;s Resume workspace can start generation immediately;
              uploading a template or opening the general Résumé page alone does not.
            </li>
            <li>
              Outreach and follow-up prompts send company, role, your application notes, and the selected linked contact&apos;s
              name/title when available; follow-ups add elapsed days. They do not automatically include your résumé or the
              contact&apos;s email address, but sensitive information you put in notes is included. Generated drafts are saved locally.
            </li>
            <li>
              AI Scout (Raekwon) sends search criteria and candidate listings, including company, role, location, URL, source
              and description excerpts. Gather resources sends your resource query; an integration guide sends the selected
              resource&apos;s name, URL and category. AI Scout and Gather resources enable Anthropic-hosted web search: its tool
              queries and downstream search recipients are controlled by the provider, not enumerated by Serpo.
            </li>
          </ul>
          <p>
            These AI requests require <code>ENABLE_AI_ASSISTANCE=true</code> and usable provider credentials. The standard
            setup uses <code>ANTHROPIC_API_KEY</code>; the SDK also supports auth-token/credential configuration. Its default
            endpoint is Anthropic&apos;s API, but <code>ANTHROPIC_BASE_URL</code> or an SDK credential profile can change the
            recipient. Only configure credentials and endpoints you trust.
          </p>

          <h3 className="pt-2 font-bold text-foreground">Hunter: employer contact lookup</h3>
          <p>
            With <code>HUNTER_API_KEY</code> configured, manual Research contacts sends the domain you confirm to Hunter.
            Submitted-triggered preparation instead sends the stored company name, without that domain dialog. Returned
            names, titles, emails, confidence and source information are saved locally. Hunter lookup does not require AI
            assistance or saved-search automation to be on.
          </p>

          <h3 className="pt-2 font-bold text-foreground">Job boards and JobSpy</h3>
          <p>
            A live search queries configured sources and live-pinned company boards; it does not require AI or API keys for
            keyless sources. Opening Sourcing with search keywords in the URL can run the search automatically. Fresh cache
            hits may avoid an external fetch, but a search is not guaranteed to stay local.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Keyless feeds:</strong> Himalayas and Jobicy receive searched keywords;
              Himalayas also receives supported contract filters. Arbeitnow and RemoteOK return general feeds without
              receiving your keywords or location.
            </li>
            <li>
              <strong className="text-foreground">Keyed APIs:</strong> Adzuna, USAJobs, Jooble and Careerjet receive
              keywords, location and remote/employment filters where supported. USAJobs also receives the configured
              User-Agent email. Each requires its corresponding credentials; leaving those unset skips that keyed source.
            </li>
            <li>
              <strong className="text-foreground">Company boards:</strong> Greenhouse, Lever, Ashby and SmartRecruiters receive
              the identifier of each board you follow or pin and return its postings; your keyword/location filtering is
              local. Adding a board to the search pool, including Follow on Companies, also verifies its ATS endpoint or
              visits the resource URL. Company suggestions are worked out on this computer; your searches and picked
              industries are not sent anywhere to produce them.
            </li>
            <li>
              <strong className="text-foreground">JobSpy:</strong> the optional local Python helper contacts selected
              Indeed, LinkedIn, ZipRecruiter, Glassdoor and Google Jobs services. Requests include keywords, location,
              remote/employment filters, radius or pagination where supported. It can also request cookies, location
              resolution and listing details. The pinned package&apos;s ZipRecruiter integration sends a session event with
              package-hardcoded device/session properties and identifiers—not measurements of your actual device or résumé.
              One result does not mean one HTTP request.
            </li>
          </ul>
          <p>
            Manual searches default to all five JobSpy boards, including Google, when the helper is available. Clear boards
            in the search form to exclude them. AI Scout first queries configured job sources, including available JobSpy
            boards, before its AI step; disabling AI alone does not prevent those preliminary searches.
          </p>

          <h3 className="pt-2 font-bold text-foreground">Employer websites, external links and email</h3>
          <p>
            Tailor &amp; fill form sends résumé/target context for AI tailoring, then opens the employer website in a separate
            browser and attaches the generated résumé and fills matching saved answers. The site can access selected files
            and filled values before you click Submit. Serpo does not click Submit, but its review pause is not a guarantee
            that the website has received no data. Employer pages control their own redirects, third-party scripts and requests.
          </p>
          <p>
            Opening job/resource links visits those websites under their own policies; URL validation can also resolve
            hostnames through your device&apos;s DNS resolver. Serpo does not deliver outreach messages automatically. Copy uses
            your clipboard; Open in email passes the draft to your email app. Approve and Mark sent update local records,
            rather than sending a message.
          </p>
        </section>

        <section aria-labelledby="automation" className="mb-10 space-y-3">
          <h2 id="automation" className="text-lg font-bold text-heading">Defaults, background triggers and how to disable them</h2>
          <p>
            The example configuration leaves provider keys empty and AI assistance off. Unattended saved-search automation
            is off in a fresh workspace. Individual saved searches start enabled and immediately due, but only run unattended
            when the account switch is on. Existing installations keep their saved settings.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Submitted:</strong> moving an application into Submitted or confirming a
              submitted apply run can queue contact research and an immediate AI draft. Configured Hunter can research the
              company when no contacts are already linked; enabled AI can draft independently. No additional provider-review
              dialog is required. Queued preparation can still run after a later stage change; changing stage is not cancellation.
            </li>
            <li>
              <strong className="text-foreground">Daily scans:</strong> stale checks are local. AI-enabled follow-up jobs can
              generate a draft for a confirmed Submitted application after seven days, even with saved-search automation off.
            </li>
            <li>
              <strong className="text-foreground">Saved searches:</strong> when enabled, due searches query external sources
              while the server runs and catch up once after a restart, rather than replaying every missed slot. Automatic
              JobSpy runs use the intersection of the search&apos;s boards and Settings permissions. Default automatic permissions
              include Indeed, LinkedIn, ZipRecruiter and Glassdoor, not Google. These permissions do not restrict other sources.
            </li>
          </ul>
          <p>
            Scheduled jobs run while Serpo&apos;s server is running, not only while a browser tab is visible. They can retry
            failures. Automation does not track jobs, apply, or send outreach; researching, searching and drafting can still
            transmit data and use paid APIs.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              In <Link href="/settings" className="link-accent">Settings → Automation</Link>, turn off Run saved searches
              automatically and save; or pause/delete individual searches in Sourcing. This blocks future unattended searches,
              including queued searches that have not started, not Submitted research or AI follow-up jobs.
            </li>
            <li>
              Uncheck automatic JobSpy permissions and save to restrict unattended scraping. Manual Search and Run now use
              the boards selected on that search, regardless of the account switch, per-search pause or automatic permissions.
            </li>
            <li>
              Set <code>ENABLE_AI_ASSISTANCE=false</code> to disable Serpo&apos;s AI requests. Remove <code>HUNTER_API_KEY</code>
              to disable Hunter research; the AI flag alone does not disable it. Remove other provider keys to disable their
              keyed job sources. Restart Serpo after environment changes. Keyless searches still work if you request them.
            </li>
            <li>
              Quit the managed desktop app to stop its server, or stop any separately started development/CLI server too.
              Changing settings does not cancel requests already in progress or retrieve data already sent. Avoid manual
              searches, AI Scout, resource verification and external links if you do not want their network activity.
            </li>
          </ol>
        </section>

        <section aria-labelledby="offline" className="mb-10 space-y-3">
          <h2 id="offline" className="text-lg font-bold text-heading">Offline use and software network traffic</h2>
          <p>
            With required software installed, local records and existing files remain usable without live providers.
            Offline use does not supply live job results, AI generation, Hunter lookup or access to employer sites.
            Cached listings can be stale, and scheduled provider work may fail and retry when connectivity returns.
          </p>
          <p>
            Installation, setup and upgrades can download Node.js, npm dependencies, and optional JobSpy/uv/Python packages
            from distribution servers, package registries and GitHub. Browser-test tooling can download browser binaries.
            These are external requests separate from job-search data processing; an incomplete installation may need internet
            access before Serpo can start.
          </p>
          <p>
            Next.js has optional framework usage/build telemetry sent to Vercel. This is not a promise of no telemetry from
            installed tooling. To opt out, set <code>NEXT_TELEMETRY_DISABLED=1</code> in the environment used for setup, builds
            and development, or run <code className="break-words">npx next telemetry disable</code> in an installed checkout.
            See the <a href="https://nextjs.org/telemetry" className="link-accent">Next.js telemetry notice</a> for its data
            description and controls. Browser/OS telemetry follows their own settings.
          </p>
        </section>

        <section aria-labelledby="deletion" className="mb-10 space-y-3">
          <h2 id="deletion" className="text-lg font-bold text-heading">What Wipe deletes—and what it leaves</h2>
          <p>
            <Link href="/settings" className="link-accent">Settings → Wipe all my data</Link> is an account-scoped database
            purge followed by best-effort file cleanup. It is not deletion of the database file, every workspace row or every
            copy on disk, and it is not secure erasure.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Database records removed:</strong> this owner&apos;s applications and apply
              runs, messages, contacts and links, interactions, tasks, résumé templates/workspaces, saved answers, lead
              reports/leads, saved searches/hits, search history, picked industries and hidden company suggestions,
              automation jobs/settings, audit events, title aliases, eliminated jobs, board pins and private job-board
              resources, including followed companies. Deleting automation settings restores fresh defaults on later use.
            </li>
            <li>
              <strong className="text-foreground">Files attempted:</strong> recorded application DOCX paths and legacy files
              for applications still in the database, plus this account&apos;s lead-report archive and known legacy report
              entries. Résumé cleanup only accepts owned DOCX paths under the current résumé directory; it does not sweep all
              files there. Orphaned files or artifacts from applications removed earlier can remain.
            </li>
            <li>
              <strong className="text-foreground">Retained database state:</strong> the local owner row, any other owners&apos;
              records, curated shared job boards, shared job-source caches and deduplication fingerprints. Cached listing
              snapshots remain; freshness expiry is not a physical-deletion deadline. The SQLite file itself remains.
            </li>
            <li>
              <strong className="text-foreground">Other retained copies:</strong> migration, portable and recovery backups,
              previous installations, original uploads, browser downloads/exports, credentials/configuration, browser profile
              and preferences, logs/control state, JobSpy request state, and OS/cloud/sync backups. Wipe does not revoke API
              keys, cancel provider subscriptions or ask external recipients to delete what they received.
            </li>
          </ul>
          <p>
            Database deletion commits before file cleanup. If cleanup fails, the database records stay deleted, and repeating
            Wipe may no longer find the old artifact paths/report IDs. Even a result without cleanup warnings is not proof
            that every copy is gone. Stop Serpo and other servers before reviewing remaining <code>data/resumes</code>,
            <code> data/raekwon-archive</code>, exports, backups and browser/log storage; remove unwanted copies separately.
            Secure erasure depends on your filesystem, device and backup provider, not this button.
          </p>
          <p>
            Other deletion controls are narrower. Remove on a stale application deletes that application&apos;s linked records,
            but leaves reusable contacts, interaction/audit history and résumé files. Delete research removes that application&apos;s
            contact links—including manually attached links—and only deletes contacts with no other application links,
            interactions or messages. It leaves the application and drafts, and does not erase provider-side copies.
          </p>
        </section>

        <section aria-labelledby="device-trust" className="mb-10 space-y-3">
          <h2 id="device-trust" className="text-lg font-bold text-heading">Device, sync and backup trust boundaries</h2>
          <p>
            There is no Serpo login or password protection. The supported server binds to <code>127.0.0.1</code>, but loopback
            is not a security boundary against other people or software with access to this device. Do not expose the server
            publicly or use an untrusted shared OS account. Serpo does not provide its own database or backup encryption;
            use device encryption, appropriate file permissions and trusted storage.
          </p>
          <p>
            A folder under Documents can be synced or backed up by your OS or another service. Git-ignore rules do not prevent
            that. Those services, exported files and separately synced browser state are outside Wipe&apos;s control. Backups,
            including recovery/previous-version copies, can retain sensitive data until you remove them separately.
          </p>
          <p>
            A portable workspace backup contains database records, résumé artifacts, lead archives and JobSpy state; credentials,
            browser profiles, logs and existing backups are separate. Protect those separately if you need them. A database-only
            migration backup is not a complete copy of the workspace. Default uninstall preserves personal data/configuration
            and shared desktop state; uninstall is not Wipe. Do not share databases, backups, résumés, browser profiles,
            <code> .env.local</code>, or unsanitized logs/screenshots in public support reports.
          </p>
        </section>

        <section aria-labelledby="terms" className="space-y-3">
          <h2 id="terms" className="text-lg font-bold text-heading">Provider costs, terms and source</h2>
          <p>
            Your provider accounts&apos; pricing and limits apply, including AI tokens/web search, Hunter credits, and automatic
            or retried work. Do not assume a listed free tier remains free or that requests are approved by a job board.
            JobSpy scraping can be restricted by a site&apos;s terms; Serpo&apos;s pacing is not permission or a guaranteed safe rate.
            Review each service&apos;s current terms and privacy rules before enabling it.
          </p>
          <p>
            Read <a href="https://www.anthropic.com/legal/commercial-terms" className="link-accent">Anthropic&apos;s API terms</a>
            {" "}(including linked data-processing terms and pricing) and <a href="https://hunter.io/terms-of-service" className="link-accent">Hunter&apos;s terms</a>
            {" "}(including its privacy and payment rules). Job-board, employer, browser and download-provider policies apply
            to their own requests. Serpo cannot promise their retention periods, deletion, training practices or onward recipients.
          </p>
          <p className="border-t border-border-soft pt-4 text-sm">
            Serpo is licensed <strong className="text-foreground">AGPL-3.0-only</strong> and provided without warranty.{" "}
            <a href="https://github.com/Darius-PJ/Serpo" className="link-accent">Source code</a> ·{" "}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" className="link-accent">Full license terms</a>.
          </p>
        </section>
      </article>
    </div>
  );
}