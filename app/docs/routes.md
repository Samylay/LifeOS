# LifeOS — Routes

Every route below exists on disk under `src/app/` (verified 2026-08-22). No phantom routes.

| Route | Page | Status | Description |
|-------|------|--------|-------------|
| `/` | Dashboard | **Live** | Command center: morning/evening brief, attention surface, stats |
| `/content` | Content | **Live** | Content pipeline / publishing management |
| `/decide` | Decide | **Live** | Saved-item triage (each card names the action approving it commits) + tag/topic proposals |
| `/decide/approvals` | Approvals | **Live** | NEEDS-USER asks from every ROADMAP; verdicts written back to the project |
| `/decide/dispatch` | Send to Claude | **Live** | Queue instructions for a Claude session and send the merged brief |
| `/diagrams` | Diagrams | **Live** | Diagram viewer/gallery |
| `/feed` | Feed | **Live** | IG-replacement feed; cards gated behind recall quizzes |
| `/finance` | Finance | **Live** | Finances with bank sync, budgets, transactions |
| `/knowledge` | Knowledge | **Live** | Knowledge base + capture |
| `/knowledge/teach/[id]` | Teach Topic | **Live** | Teach-back session for a knowledge topic |
| `/leads` | Leads | **Live** | Lead lifecycle tracking |
| `/news` | News | **Live** | News aggregator digest |
| `/news/feeds` | Feed Manager | **Live** | Manage news feed sources |
| `/pager` | Pager | **Live** | Notify/pager messages and actions |
| `/prime` | Prime | **Live** | Daily affirmations / priming |
| `/prime/manage` | Prime Manager | **Live** | Create and manage affirmations |
| `/projects` | Projects | **Live** | Projects and shipped work |
| `/recipes` | Recipes | **Live** | Recipe collection and planning |
| `/settings` | Settings | **Live** | Integrations, LLM toggle, app settings |
| `/status` | Status | **Live** | Life-status dashboard with headline stat tiles |
| `/terminal` | Terminal | **Live** | In-app terminal surface |
| `/voice` | Voice | **Live** | VoicePal voice notes list |
| `/voice/[id]` | Voice Note | **Live** | Voice note detail/transcript |
| `/workouts` | Workouts | **Live** | Training log synced from Strava |

### Status Legend

- **Live**: Functional page wired to the local DB / real data.
