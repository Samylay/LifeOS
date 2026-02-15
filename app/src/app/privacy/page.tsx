"use client";

export default function PrivacyPolicyPage() {
  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold text-lg">
            L
          </div>
          <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            LifeOS
          </span>
        </div>

        <h1 className="text-2xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Privacy Policy
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-tertiary)" }}>
          Last updated: February 15, 2026
        </p>

        <div className="space-y-6">
          <Section title="Overview">
            <p>
              LifeOS is a personal productivity application. Your data is stored in your own
              Firebase project — we do not operate a central server that collects or stores
              your personal information.
            </p>
          </Section>

          <Section title="Google Calendar Integration">
            <p>
              LifeOS offers an optional Google Calendar integration. When you connect your
              Google account, the app requests access to your calendar data through Google
              OAuth. Specifically:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>
                <strong>Data accessed:</strong> Event titles, start/end times, locations,
                and descriptions from your primary Google Calendar.
              </li>
              <li>
                <strong>How it&apos;s used:</strong> Calendar events are displayed within the
                LifeOS interface so you can see your schedule alongside your tasks and focus
                sessions. Events can also be created on your Google Calendar from within
                LifeOS (e.g. syncing focus blocks).
              </li>
              <li>
                <strong>Storage:</strong> Calendar events fetched from Google are held in
                your browser&apos;s memory for display purposes only. Your Google OAuth
                connection status and email address are stored in your own Firebase Firestore
                database.
              </li>
              <li>
                <strong>No server-side storage:</strong> LifeOS does not transmit your
                Google Calendar data to any third-party server. All data stays between your
                browser and Google&apos;s API.
              </li>
              <li>
                <strong>Revoking access:</strong> You can disconnect Google Calendar at any
                time from the LifeOS Settings page. You can also revoke access from your{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--accent)" }}
                >
                  Google Account permissions
                </a>
                .
              </li>
            </ul>
          </Section>

          <Section title="Data We Collect">
            <p>
              LifeOS stores all user data in your own Firebase project. This includes:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Account information (name, email, profile photo from Google sign-in)</li>
              <li>Tasks, projects, goals, and quests you create</li>
              <li>Focus session history and timer settings</li>
              <li>Daily log entries (mood, energy, reflections)</li>
              <li>Habits and streak data</li>
              <li>Calendar events you create manually</li>
              <li>Integration connection status (e.g. Google Calendar connected/disconnected)</li>
            </ul>
            <p className="mt-2">
              We do not have access to your Firebase project or its data. You control your
              own database and its security rules.
            </p>
          </Section>

          <Section title="Data Sharing">
            <p>
              LifeOS does not sell, rent, or share your personal data with any third parties.
              Your data is transmitted only between your browser and the services you
              configure (Firebase, Google Calendar).
            </p>
          </Section>

          <Section title="Cookies &amp; Local Storage">
            <p>
              LifeOS uses browser local storage and cookies only for authentication session
              management (Firebase Auth). No tracking cookies or analytics services are used.
            </p>
          </Section>

          <Section title="Data Retention &amp; Deletion">
            <p>
              Since all data is stored in your own Firebase project, you have full control
              over data retention. You can delete any data at any time through the
              application or directly in your Firebase console. Disconnecting Google Calendar
              removes the stored connection status from your database.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Authentication is handled by Firebase Auth using Google OAuth 2.0. All data in
              transit is encrypted via HTTPS. Firestore security rules ensure each user can
              only access their own data.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. Changes will be reflected
              on this page with an updated date.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              If you have questions about this privacy policy, please open an issue on the{" "}
              <a
                href="https://github.com/Samylay/LifeOS"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "var(--accent)" }}
              >
                LifeOS GitHub repository
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
      }}
    >
      <h2 className="text-base font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <div className="text-sm space-y-2" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </div>
  );
}
