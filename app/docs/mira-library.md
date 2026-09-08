# Homelab component library integration

LifeOS consumes the owner's component library from
`/home/quorky/apps/component-library` (private source package version 0.0.1,
shadcn base-mira, preset bdvw9YIa). The selected modules are copied into
`src/components/ui/mira`, keeping production builds independent of the
homelab directory layout.

## Local adaptations

- Replace the source package's `cn` import with LifeOS's existing `cn` helper.
- Install Base UI 1.8.0 and Hugeicons runtime packages used by those modules.
  DM Sans is served locally through fontsource; no font request goes to Google.
- Enlarge controls for 14px UI text, 16px phone inputs, and touch targets.
- Replace source transition-all, color, shadow, and layout animations with
  transform/opacity transitions and LifeOS easing tokens.
- Keep the existing persisted sidebar preference; do not introduce a second
  cookie preference. Use the shell's 1024px breakpoint throughout.
- Give the mobile sheet a visible Close button, title, and description.
- Render SidebarInset as a div so the app has one main landmark.
- Preserve the existing Button asChild contract through an adapter. New Base
  UI compositions use render. Existing Radix overlays keep matching parts.
- Cards allow overflow for existing feature menus. Card content stays sized by
  its content, and the source library's shared spacing variable is retained.

The global token migration applies Mira's neutral zinc surfaces and DM Sans
typography to the remaining features and chart kit. Legacy Radix controls use
those tokens; their behavior has not been swapped to incompatible Base APIs.

## Updating

Compare the source modules against the copies and preserve these adaptations.
Do not blindly overwrite the adapted modules with registry output. Use the
existing UI import paths in features so updates remain centralized.

## Homelab decisions

The Decide card offers a Homelab group with two explicit choices. Approving
"Queue skill install" creates a fixed installation request in the existing
Send to Claude queue. Source prose and source URLs never become executable
instructions; the request references the stored item by a validated ID. The
existing Send gesture remains the point that starts the agent session.

"Save UI reference" stores the source in the existing document store under
`users/local/homelabResources`, deduplicated by canonical URL. No database
migration is needed. `GET /api/homelab/resources?q=...` retrieves references
by matching task keywords, without age-based expiry. Matching references
appear while preparing queued instructions and are available to Assistant
replies. Dispatched agents are instructed to consult the same endpoint for
UI work. Source descriptions remain untrusted reference material.

Undo removes an unsent installation request or unlinks the saved reference.
It preserves a reference saved through another item and refuses to cancel a
request that has already been dispatched. New effect writes and the triage
status change are transactional.
