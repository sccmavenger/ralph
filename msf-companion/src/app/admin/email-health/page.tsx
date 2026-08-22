import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { getEmailHealth } from "@/lib/email-health";

export const dynamic = "force-dynamic";

export default async function EmailHealthPage() {
  const session = await getAdminSession();
  if (!session.isAdmin) redirect("/admin");
  const health = await getEmailHealth();

  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-6 text-[var(--color-foreground)]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Email health</h1>
            <p className="text-xs text-[var(--color-muted)]">Last {health.periodDays} days · mode: {health.automationMode}</p>
          </div>
          <a href="/admin/dashboard" className="text-sm text-[var(--color-accent)]">Back to admin</a>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tracked", health.totals.total],
            ["Failures", health.totals.failures],
            ["Failure rate", `${health.totals.failureRate}%`],
            ["Email audience", health.audience.total],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[var(--color-surface)] p-4">
              <p className="text-xs text-[var(--color-muted)]">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 text-sm font-bold">Delivery status</h2>
            <dl className="space-y-2 text-sm">
              {Object.entries(health.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between"><dt>{status}</dt><dd className="font-semibold">{count}</dd></div>
              ))}
              {!Object.keys(health.byStatus).length && <p className="text-xs text-[var(--color-muted)]">No tracked deliveries yet.</p>}
            </dl>
          </section>
          <section className="rounded-xl bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 text-sm font-bold">Configured safeguards</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Resend provider</dt><dd>{health.providerConfigured ? "Configured" : "Missing"}</dd></div>
              <div className="flex justify-between"><dt>Delivery webhook</dt><dd>{health.webhookConfigured ? "Configured" : "Missing"}</dd></div>
              <div className="flex justify-between"><dt>Weekly opt-ins</dt><dd>{health.audience.weeklyDigest}</dd></div>
              <div className="flex justify-between"><dt>Character opt-ins</dt><dd>{health.audience.newCharacters}</dd></div>
              <div className="flex justify-between"><dt>Announcement opt-ins</dt><dd>{health.audience.announcements}</dd></div>
              <div className="flex justify-between"><dt>Reminder opt-ins</dt><dd>{health.audience.reengagement}</dd></div>
            </dl>
          </section>
        </div>

        <section className="overflow-hidden rounded-xl bg-[var(--color-surface)]">
          <h2 className="p-4 text-sm font-bold">Recent delivery attempts</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-[var(--color-surface-light)] text-[var(--color-muted)]"><tr><th className="p-3">Time</th><th className="p-3">Type</th><th className="p-3">Subject</th><th className="p-3">Status</th><th className="p-3">Attempts</th></tr></thead>
              <tbody>
                {health.recent.map((delivery) => (
                  <tr key={delivery.id} className="border-t border-[var(--color-surface-light)]"><td className="p-3">{new Date(delivery.createdAt).toLocaleString()}</td><td className="p-3">{delivery.messageType}</td><td className="max-w-xs truncate p-3">{delivery.subject}</td><td className="p-3">{delivery.status}</td><td className="p-3">{delivery.attemptCount}</td></tr>
                ))}
                {!health.recent.length && <tr><td colSpan={5} className="p-6 text-center text-[var(--color-muted)]">No tracked deliveries yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
