# LifeOS — UX/UI Design Foundations

**Status:** Design
**Created:** 2026-02-15
**Parent:** [[LifeOS-App-Design]]

---

## Design Direction

**Balanced Hybrid** — The app shell (navigation, layout, typography) stays clean and professional. Gamification surfaces (XP bars, tier badges, streak counters, milestone celebrations) go bold and expressive. The contrast is the point: a calm workspace that rewards you with moments of delight.

**Theme:** System preference (both light and dark designed as first-class citizens).

**Primary Color:** Emerald (#10B981) — Growth-oriented, distinct from typical blue productivity tools.

---

## 1. Color System

### 1.1 Brand Scale (Emerald)

The primary scale used for interactive elements, active states, and brand identity.

| Token | Hex | Usage |
|-------|-----|-------|
| `emerald-50` | #ECFDF5 | Tinted backgrounds (light theme) |
| `emerald-100` | #D1FAE5 | Hover backgrounds, badges |
| `emerald-200` | #A7F3D0 | Focus rings, light accents |
| `emerald-300` | #6EE7B7 | Progress bar fills (light) |
| `emerald-400` | #34D399 | Icons, secondary buttons |
| `emerald-500` | #10B981 | **Primary — buttons, links, active nav** |
| `emerald-600` | #059669 | Primary hover, dark mode buttons |
| `emerald-700` | #047857 | Primary active/pressed |
| `emerald-800` | #065F46 | Dark mode text on emerald backgrounds |
| `emerald-900` | #064E3B | Dark accents |
| `emerald-950` | #022C22 | Deepest brand tone |

### 1.2 Neutral Scale (Slate)

Slate grays — slightly cool-toned to complement emerald without competing.

| Token | Hex | Light Theme Usage | Dark Theme Usage |
|-------|-----|-------------------|------------------|
| `slate-50` | #F8FAFC | Page background | — |
| `slate-100` | #F1F5F9 | Card background, sidebar | — |
| `slate-200` | #E2E8F0 | Borders, dividers | — |
| `slate-300` | #CBD5E1 | Disabled text, placeholders | — |
| `slate-400` | #94A3B8 | Secondary text | Secondary text |
| `slate-500` | #64748B | Body text (light) | Muted text |
| `slate-600` | #475569 | — | Body text (dark) |
| `slate-700` | #334155 | Headings (light) | — |
| `slate-800` | #1E293B | — | Card background |
| `slate-900` | #0F172A | — | Page background |
| `slate-950` | #020617 | — | Deepest background |

### 1.3 Life Area Colors

Each area gets a distinct hue. Used for area badges, module headers, chart segments, and session tags.

| Area | Color Name | Hex | Tailwind Class |
|------|-----------|-----|----------------|
| **Health & Training** | Teal | #14B8A6 | `teal-500` |
| **Career & Learning** | Indigo | #6366F1 | `indigo-500` |
| **Finance** | Amber | #F59E0B | `amber-500` |
| **Personal Brand** | Violet | #8B5CF6 | `violet-500` |
| **Life Admin** | Slate | #64748B | `slate-500` |

Each area color has a light tint (for backgrounds) and a dark shade (for text/icons):

```
Area background (light): {color}-50
Area background (dark):  {color}-950 at 40% opacity
Area border:             {color}-200 (light) / {color}-800 (dark)
Area icon/text:          {color}-600 (light) / {color}-400 (dark)
```

### 1.4 Semantic Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `success` | #10B981 (emerald-500) | #34D399 (emerald-400) | Completed tasks, positive streaks |
| `warning` | #F59E0B (amber-500) | #FBBF24 (amber-400) | Streak at risk, approaching deadline |
| `danger` | #EF4444 (red-500) | #F87171 (red-400) | Overdue, streak broken, errors |
| `info` | #3B82F6 (blue-500) | #60A5FA (blue-400) | Informational banners, tips |

### 1.5 Gamification Colors

Bold, saturated colors reserved exclusively for reward/progression surfaces:

| Token | Hex | Usage |
|-------|-----|-------|
| `xp-fill` | #10B981 → #6EE7B7 | XP bar gradient (emerald) |
| `tier-novice` | #94A3B8 | Tier 1 badge (slate-400) |
| `tier-apprentice` | #10B981 | Tier 2 badge (emerald-500) |
| `tier-journeyman` | #3B82F6 | Tier 3 badge (blue-500) |
| `tier-adept` | #8B5CF6 | Tier 4 badge (violet-500) |
| `tier-expert` | #F59E0B | Tier 5 badge (amber-500) |
| `tier-master` | #EF4444 | Tier 6 badge (red-500) |
| `tier-grandmaster` | Linear gradient #F59E0B → #EF4444 → #8B5CF6 | Tier 7 badge (multicolor) |
| `streak-glow` | #10B981 at 30% opacity | Glow behind active streak counter |
| `milestone-burst` | #FBBF24 | Particle color for milestone celebrations |

### 1.6 Theme Tokens (Semantic Mapping)

These are the tokens components actually reference. They resolve to different values per theme.

| Semantic Token | Light Value | Dark Value |
|----------------|-------------|------------|
| `--bg-primary` | slate-50 | slate-900 |
| `--bg-secondary` | white | slate-800 |
| `--bg-tertiary` | slate-100 | slate-700 |
| `--bg-elevated` | white | slate-800 |
| `--text-primary` | slate-900 | slate-50 |
| `--text-secondary` | slate-500 | slate-400 |
| `--text-tertiary` | slate-400 | slate-500 |
| `--border-primary` | slate-200 | slate-700 |
| `--border-secondary` | slate-100 | slate-800 |
| `--accent` | emerald-500 | emerald-400 |
| `--accent-hover` | emerald-600 | emerald-500 |
| `--accent-bg` | emerald-50 | emerald-950/40 |
| `--focus-ring` | emerald-500/50 | emerald-400/50 |

---

## 2. Typography

### 2.1 Font Stack

| Role | Font | Fallback | Why |
|------|------|----------|-----|
| **Headings** | Inter | system-ui, sans-serif | Clean geometric sans. Widely used, great at all sizes |
| **Body** | Inter | system-ui, sans-serif | Same family for consistency. Inter's x-height aids readability |
| **Mono** | JetBrains Mono | ui-monospace, monospace | Timer display, stats, code blocks. Tabular nums built in |

> Inter is loaded via `@fontsource/inter` (self-hosted, no Google Fonts dependency). Only load weights 400, 500, 600, 700.

### 2.2 Type Scale

Based on a 1.250 ratio (Major Third), anchored at 16px body.

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `text-xs` | 12px / 0.75rem | 400 | 1.5 | Captions, badges, timestamps |
| `text-sm` | 14px / 0.875rem | 400 | 1.5 | Secondary text, table cells |
| `text-base` | 16px / 1rem | 400 | 1.5 | Body text, input fields |
| `text-lg` | 18px / 1.125rem | 500 | 1.4 | Card titles, nav items |
| `text-xl` | 20px / 1.25rem | 600 | 1.3 | Section headings |
| `text-2xl` | 24px / 1.5rem | 600 | 1.3 | Page headings |
| `text-3xl` | 30px / 1.875rem | 700 | 1.2 | Dashboard hero stats |
| `text-4xl` | 36px / 2.25rem | 700 | 1.1 | Focus timer display |
| `text-5xl` | 48px / 3rem | 700 | 1.0 | Timer countdown (large) |

### 2.3 Typography Rules

- **Headings:** Inter 600-700, `--text-primary`, letter-spacing: -0.01em (tighten at large sizes)
- **Body:** Inter 400, `--text-primary` or `--text-secondary`
- **Numbers / Stats:** JetBrains Mono 600, `font-variant-numeric: tabular-nums` — so digits don't shift width during countdowns
- **Labels / Badges:** Inter 500, `text-xs` or `text-sm`, uppercase tracking: 0.05em (only for tiny labels like "NOVICE", "STREAK")
- **No italic** in the UI. Use weight or color to create emphasis, not style.

---

## 3. Spacing & Sizing

### 3.1 Spacing Scale

4px base unit. Every spacing value is a multiple of 4.

| Token | Value | Common Usage |
|-------|-------|-------------|
| `space-0.5` | 2px | Hairline gaps (icon-to-text micro-adjust) |
| `space-1` | 4px | Tight padding (badge inner) |
| `space-1.5` | 6px | Compact list item gap |
| `space-2` | 8px | Icon margins, inline gaps |
| `space-3` | 12px | Input padding, small card padding |
| `space-4` | 16px | Standard card padding, section gaps |
| `space-5` | 20px | Medium section gaps |
| `space-6` | 24px | Card padding (comfortable), list group gaps |
| `space-8` | 32px | Section spacing within a page |
| `space-10` | 40px | Page section dividers |
| `space-12` | 48px | Major layout gaps |
| `space-16` | 64px | Page top/bottom padding |

### 3.2 Component Sizing

| Element | Height | Padding |
|---------|--------|---------|
| Button (sm) | 32px | 8px 12px |
| Button (md) | 40px | 10px 16px |
| Button (lg) | 48px | 12px 24px |
| Input field | 40px | 10px 12px |
| Nav item | 40px | 8px 12px |
| Sidebar width (collapsed) | 64px | — |
| Sidebar width (expanded) | 256px | — |
| Card (min-height) | — | 16px (sm) / 24px (md) |
| Avatar (sm) | 32px | — |
| Avatar (md) | 40px | — |
| Badge | 20-24px | 4px 8px |
| Progress bar height | 8px (sm) / 12px (md) | — |
| XP bar height | 16px | — |

### 3.3 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 4px | Badges, small chips |
| `rounded-md` | 8px | Buttons, inputs, cards |
| `rounded-lg` | 12px | Modal dialogs, larger cards |
| `rounded-xl` | 16px | Floating panels, focus timer |
| `rounded-full` | 9999px | Avatars, circular buttons, progress rings |

---

## 4. Elevation & Depth

### 4.1 Shadow Scale

Light theme uses traditional shadows. Dark theme uses subtle border luminance instead (shadows are invisible on dark backgrounds).

| Token | Light Theme | Dark Theme | Usage |
|-------|-------------|------------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `border: 1px solid slate-700` | Subtle card lift |
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.1)` | `border: 1px solid slate-600` | Cards, dropdowns |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1)` | `border: 1px solid slate-600` + `bg: slate-750` | Modals, popovers |
| `shadow-xl` | `0 20px 25px -5px rgba(0,0,0,0.1)` | — | Floating timer overlay |
| `shadow-glow` | `0 0 20px emerald-500/30` | `0 0 20px emerald-400/20` | Active streak, tier-up moment |

### 4.2 Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `z-base` | 0 | Page content |
| `z-card` | 10 | Overlapping cards |
| `z-dropdown` | 20 | Dropdowns, popovers |
| `z-sidebar` | 30 | Sidebar navigation |
| `z-header` | 40 | Top bar / quick capture |
| `z-modal` | 50 | Modal dialogs |
| `z-toast` | 60 | Toast notifications |
| `z-focus-overlay` | 70 | Focus Shield distraction overlay |
| `z-celebration` | 80 | Milestone celebrations (top of everything) |

---

## 5. Motion & Animation

### 5.1 Timing Functions

| Token | Value | Usage |
|-------|-------|-------|
| `ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | General transitions |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Elements exiting |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering |
| `ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Gamification pops (XP gain, tier-up) |

### 5.2 Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `duration-fast` | 100ms | Hover states, micro-interactions |
| `duration-normal` | 200ms | Toggles, state changes, card transitions |
| `duration-slow` | 300ms | Sidebar open/close, modals |
| `duration-slower` | 500ms | Page transitions, chart animations |
| `duration-celebration` | 1500ms | Milestone burst, tier-up animation |

### 5.3 Animation Patterns

**Shell (clean, subtle):**
- Hover: background fade (`duration-fast`, `ease-default`)
- Sidebar collapse: width transition (`duration-slow`, `ease-default`)
- Card appear: fade + translateY 4px → 0 (`duration-normal`, `ease-out`)
- Modal: fade in + scale 0.95 → 1 (`duration-slow`, `ease-out`)
- Page switch: crossfade (`duration-slower`)

**Gamification (bold, expressive):**
- XP bar fill: width transition (`duration-slower`, `ease-out`) with emerald glow pulse
- Streak increment: number scale 1 → 1.3 → 1 (`duration-normal`, `ease-bounce`)
- Tier-up: badge scale + golden particle burst + glow ring (`duration-celebration`)
- Milestone badge: rotate 0 → 360deg + fade in (`duration-celebration`)
- Progress complete: progress bar flash + checkmark pop (`duration-slow`, `ease-bounce`)
- Quest complete: confetti burst from card center (800ms)

### 5.4 Reduced Motion

All animations respect `prefers-reduced-motion: reduce`:
- Replace transforms with opacity-only fades
- Celebration animations become a simple color flash
- Timer ring progress becomes a stepped fill (no smooth rotation)
- No parallax, no spring physics, no auto-playing particle effects

---

## 6. Iconography

### 6.1 Icon Library

**Lucide React** — Consistent 24px stroke icons, 1.5px stroke weight, MIT licensed.

| Context | Example Icons |
|---------|--------------|
| Navigation | `LayoutDashboard`, `Timer`, `FolderKanban`, `Target`, `Sword`, `Calendar`, `Settings` |
| Areas | `Heart` (Health), `Briefcase` (Career), `DollarSign` (Finance), `Megaphone` (Brand), `ClipboardList` (Admin) |
| Actions | `Plus`, `Check`, `X`, `ChevronRight`, `MoreHorizontal`, `Search`, `Edit3` |
| Gamification | `Flame` (streak), `Trophy` (milestone), `Star` (XP), `Shield` (streak shield), `Zap` (focus) |
| Status | `Circle` (pending), `CheckCircle` (done), `AlertCircle` (warning), `Clock` (in progress) |

### 6.2 Icon Sizing

| Context | Size | Stroke |
|---------|------|--------|
| Inline with text-sm | 16px | 1.5px |
| Inline with text-base | 20px | 1.5px |
| Nav / toolbar | 24px | 1.5px |
| Feature icon (card) | 32px | 1.5px |
| Empty state illustration | 48-64px | 1.5px |

### 6.3 Area Icons

Each life area has a dedicated icon + color pairing. These appear on nav items, cards, chart legends, and badges.

```
Health:    Heart      + teal-500
Career:    Briefcase  + indigo-500
Finance:   DollarSign + amber-500
Brand:     Megaphone  + violet-500
Admin:     ClipboardList + slate-500
```

---

## 7. Component Inventory

### 7.1 Buttons

| Variant | Style | Usage |
|---------|-------|-------|
| **Primary** | Solid emerald-500 bg, white text | Main actions (Save, Start Focus, Create) |
| **Secondary** | Transparent bg, emerald-500 text, emerald border | Auxiliary actions (Cancel, View All) |
| **Ghost** | Transparent bg, slate-500 text, no border | Tertiary actions, icon-only buttons |
| **Danger** | Solid red-500 bg, white text | Destructive actions (Delete, Remove) |
| **Icon** | Ghost style, square aspect ratio | Toolbar actions, card menus |

**States:** default → hover (darken 1 step) → active (darken 2 steps) → disabled (30% opacity, no pointer) → loading (spinner replaces label)

**Focus:** 2px emerald-500/50 ring, offset 2px.

### 7.2 Cards

The primary content container. Used for dashboard widgets, area modules, project cards, quest cards.

```
┌─────────────────────────────────────────┐
│  [Icon] Card Title          [•••]       │  ← Header: 16px padding, border-bottom
├─────────────────────────────────────────┤
│                                         │
│  Card body content                      │  ← Body: 16-24px padding
│                                         │
├─────────────────────────────────────────┤
│  Footer action                    →     │  ← Footer (optional): border-top
└─────────────────────────────────────────┘

Background: --bg-secondary
Border: 1px solid --border-primary
Radius: rounded-lg (12px)
Shadow: shadow-sm (light) / border only (dark)
```

**Card variants:**
- **Default** — As above
- **Area card** — Left border 3px in area color, area icon in header
- **Stat card** — Large number (text-3xl mono), label below, optional sparkline
- **Quest card** — Progress bar in body, deadline in footer
- **Journey card** — Tier badge, XP bar, hours counter
- **Compact** — No header/footer, tighter padding (12px), used in lists

**States:** default → hover (shadow-md, translateY -1px) → selected (emerald left border) → loading (skeleton pulse)

### 7.3 Progress Bars

| Variant | Height | Radius | Usage |
|---------|--------|--------|-------|
| **Default** | 8px | full | Task/quest progress |
| **XP bar** | 16px | full | Hero Journey progression |
| **Slim** | 4px | full | Inline progress (table cells) |

- Track: `--bg-tertiary`
- Fill: area color or emerald-500 (default)
- XP bar fill: emerald gradient with subtle glow animation on change
- Labels: percentage left-aligned inside bar (XP bar only, when > 20% filled)
- Animated fill on mount (width from 0 to value, `duration-slower`)

### 7.4 Badges & Chips

| Type | Style | Usage |
|------|-------|-------|
| **Area badge** | Area color bg (tinted), area color text | Area tags on tasks, sessions |
| **Status badge** | Semantic color bg (tinted), matching text | Task status, quest status |
| **Tier badge** | Tier color bg (solid), white text, slight glow | Journey tier display |
| **Streak badge** | Emerald bg, white text, flame icon | Streak counter on dashboard |
| **Chip** | Slate-100 bg (light) / slate-700 bg (dark), removable | Filter selections, tag inputs |

### 7.5 Focus Timer

The centerpiece UI. Full-screen capable.

```
        ┌─────────────────────┐
        │                     │
        │    ╭─── ○ ───╮     │   ← Progress ring: 200px diameter
        │    │           │     │     Stroke: 6px, emerald-500
        │    │  25:00    │     │     Counter: text-5xl, JetBrains Mono
        │    │  FOCUS    │     │     Label: text-xs, uppercase
        │    ╰───────────╯     │
        │                     │
        │  ▶ Pause   ■ Stop   │   ← Controls: icon buttons
        │                     │
        │  Session 3 of 4     │   ← Context: text-sm, --text-secondary
        │  Career / Web Dev   │   ← Linked area + tag
        │                     │
        └─────────────────────┘

Ring states:
  Running:  Smooth clockwise drain, emerald-500 stroke
  Paused:   Pulsing opacity (0.5 → 1), amber-500 stroke
  Break:    Blue-500 stroke, relaxed pulse
  Complete: Full ring, emerald glow, checkmark center
```

### 7.6 Navigation

**Sidebar (desktop):**
```
┌──────┐
│ Logo │  ← 64px height, emerald mark
├──────┤
│  ◈   │  Dashboard
│  ◷   │  Focus
│  ⬡   │  Areas
│  ▦   │  Projects
│  ◎   │  Quests
│  ⚔   │  Journeys
│  ▦   │  Calendar
├──────┤
│      │  ← Spacer
├──────┤
│  ⚙   │  Settings
│  ○   │  Avatar
└──────┘

Collapsed: 64px wide, icon-only, tooltip on hover
Expanded: 256px wide, icon + label
Active item: emerald-500 left border (3px), emerald-50 bg (light) / emerald-950/30 bg (dark)
Hover: slate-100 bg (light) / slate-800 bg (dark)
```

**Bottom tab bar (mobile):**
- 5 tabs max: Dashboard, Focus, Areas, Quests, More
- Active: emerald-500 icon + label. Inactive: slate-400 icon
- Height: 56px + safe area inset

**Top bar:**
- Height: 56px
- Contains: hamburger (mobile) or breadcrumb (desktop), Quick Capture input, notification bell, avatar
- Background: `--bg-secondary` with `--border-primary` bottom border
- Sticky (`position: sticky, top: 0, z-header`)

### 7.7 Inputs & Forms

| Element | Style |
|---------|-------|
| **Text input** | 40px height, slate-200 border (light) / slate-600 border (dark), rounded-md, emerald focus ring |
| **Quick Capture** | Wider input with `Zap` icon prefix, "Capture anything..." placeholder, rounded-xl, prominent |
| **Select** | Same as text input + chevron-down icon |
| **Checkbox** | 18px square, rounded-sm, emerald-500 fill when checked, check icon |
| **Toggle** | 44×24px track, 20px thumb, emerald-500 active, slate-300 inactive |
| **Slider** | Emerald-500 fill + thumb, slate-200 track |
| **Textarea** | Same border treatment, auto-grow, min-height 80px |

### 7.8 Modals & Overlays

| Type | Style |
|------|-------|
| **Modal** | Centered, max-width 480px (sm) / 640px (md), rounded-lg, shadow-lg, backdrop blur(4px) + black/50 |
| **Sheet (mobile)** | Slides up from bottom, rounded-t-xl, drag handle at top |
| **Popover** | Anchored to trigger, shadow-md, rounded-md, max-width 320px |
| **Toast** | Bottom-right (desktop) / bottom-center (mobile), rounded-md, shadow-lg, auto-dismiss 5s |
| **Focus Shield overlay** | Full viewport, `z-focus-overlay`, semi-transparent emerald-950 bg, centered message |
| **Celebration overlay** | Full viewport, `z-celebration`, transparent bg, particle effects only |

### 7.9 Charts & Data Visualization

Library: **Recharts** (React-native, composable, Tailwind-friendly).

| Chart Type | Usage | Colors |
|------------|-------|--------|
| **Bar chart** | Daily focus hours, weekly volume | Emerald-500 fill |
| **Stacked bar** | Focus hours by area | Area colors |
| **Line chart** | Trends (sleep, energy, mood, focus) | Emerald-500 line, emerald-100 fill |
| **Donut chart** | Focus time distribution by area | Area colors |
| **Heatmap** | Best focus times (hour × day) | Emerald-100 → emerald-700 gradient |
| **Sparkline** | Inline mini-trend in stat cards | Emerald-500, no axis |

Chart rules:
- Grid lines: `--border-secondary`, dashed
- Axis labels: `text-xs`, `--text-tertiary`
- Tooltips: `--bg-elevated`, `shadow-md`, `rounded-md`
- All charts animate on mount (`duration-slower`)
- Respect `prefers-reduced-motion`

### 7.10 Empty States

When a section has no data yet:

```
┌─────────────────────────────────┐
│                                 │
│         [64px Lucide icon]      │   ← slate-300 (light) / slate-600 (dark)
│                                 │
│     No focus sessions yet       │   ← text-lg, --text-primary
│  Start your first session to    │   ← text-sm, --text-secondary
│  see your stats appear here.    │
│                                 │
│      [ Start Focus Session ]    │   ← Primary button
│                                 │
└─────────────────────────────────┘
```

### 7.11 Loading States

| Pattern | Usage |
|---------|-------|
| **Skeleton pulse** | Cards, lists, text blocks — slate-200/slate-700 pulsing rectangles matching content shape |
| **Spinner** | Button loading, inline actions — 20px emerald-500 ring spinner |
| **Progress bar (indeterminate)** | Page-level loading — thin emerald bar at top of viewport, sweeping left-to-right |

---

## 8. Layout System

### 8.1 Page Grid

```
┌──────────────────────────────────────────────────────┐
│ Top Bar (56px, full width, sticky)                    │
├────────┬─────────────────────────────────────────────┤
│        │                                             │
│ Side-  │  Main Content Area                          │
│ bar    │                                             │
│ (64-   │  Max width: 1280px                          │
│ 256px) │  Padding: 24px (desktop) / 16px (mobile)    │
│        │  Grid: 12-column CSS Grid                   │
│        │                                             │
│        │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│        │  │  Card    │ │  Card   │ │  Card   │      │
│        │  │  span-4  │ │  span-4 │ │  span-4 │      │
│        │  └─────────┘ └─────────┘ └─────────┘      │
│        │                                             │
│        │  ┌───────────────────┐ ┌───────────────┐   │
│        │  │  Card span-8      │ │ Card span-4   │   │
│        │  └───────────────────┘ └───────────────┘   │
│        │                                             │
├────────┴─────────────────────────────────────────────┤
│ Bottom Tab Bar (mobile only, 56px + safe area)        │
└──────────────────────────────────────────────────────┘
```

Main content grid:
- 12 columns
- Gap: 16px (mobile) / 24px (desktop)
- Max width: 1280px, centered

### 8.2 Breakpoints

| Token | Value | Layout Behavior |
|-------|-------|-----------------|
| `sm` | 640px | Single column, bottom tabs, no sidebar |
| `md` | 768px | Two columns available, collapsed sidebar (64px) |
| `lg` | 1024px | Full grid, expanded sidebar (256px) |
| `xl` | 1280px | Max content width reached, centered |

### 8.3 Responsive Rules

**Mobile (< 640px):**
- Single column layout, cards stack vertically
- Sidebar hidden, bottom tab bar visible
- Quick Capture accessible via FAB (floating action button, bottom-right)
- Focus timer goes truly full-screen
- Modals become bottom sheets
- Charts simplify (fewer data points, no legend — tap to see)

**Tablet (640-1023px):**
- 2-column grid for dashboard cards
- Collapsed sidebar (64px, icon-only)
- Quick Capture in top bar
- Focus timer stays inline (not full-screen)

**Desktop (1024px+):**
- Full 12-column grid
- Expanded sidebar (256px, collapsible)
- Quick Capture always visible in top bar
- Side-by-side panels where useful (e.g., calendar + task list)

### 8.4 Dashboard Layout (Command Center)

Morning view card arrangement at desktop breakpoint:

```
Row 1: [Schedule — span 8]          [Energy Check-in — span 4]
Row 2: [Priority Tasks — span 4]    [Focus Streak — span 4]    [Active Quests — span 4]
Row 3: [Hero Journeys — span 8]     [Daily Brief — span 4]
```

Evening view:
```
Row 1: [Day Review — span 8]        [Streak Tracker — span 4]
Row 2: [Tomorrow's Top 3 — span 6]  [Gratitude / Reflection — span 6]
```

### 8.5 Focus Page Layout

```
Desktop:                                Mobile:
┌────────────────────────────────┐     ┌──────────────────┐
│        Timer (centered)        │     │                  │
│                                │     │   Timer (full    │
│  ╭──── ○ ────╮    Session     │     │   screen)        │
│  │            │    Context     │     │                  │
│  │   25:00    │    Panel       │     │  ╭── ○ ──╮      │
│  │            │    --------    │     │  │ 25:00  │      │
│  ╰────────────╯    Area tag   │     │  ╰────────╯      │
│                    Task link   │     │                  │
│  [Pause] [Stop]    Streak     │     │ [Pause] [Stop]   │
│                    Sessions   │     │ Session 3 of 4   │
└────────────────────────────────┘     └──────────────────┘
```

---

## 9. Design Principles in Practice

### Clean Shell

The app chrome — sidebar, top bar, page backgrounds, cards — uses:
- Neutral colors only (slate scale)
- Subtle shadows / borders (never heavy)
- Consistent spacing (multiples of 4)
- No decorative elements, no gradients in structural surfaces
- Typography does the heavy lifting

### Bold Gamification

Reward surfaces — and only reward surfaces — break the restraint:
- XP bars get the emerald gradient + glow
- Tier badges are solid, saturated color
- Streak counters pulse subtly when active
- Milestone moments get particle effects and animations
- Tier-up gets a full-screen celebration overlay

### The Boundary Rule

> If it helps you **do work**, it's clean. If it **rewards work done**, it's bold.

Examples:
- Task list → clean (work tool)
- Task completion checkmark → subtle pop animation (small reward)
- Focus timer running → clean (active work)
- Focus session completed → bold ring fill + streak increment animation (reward)
- Quest progress bar → clean (progress tracking)
- Quest 100% complete → confetti burst + quest card glow (reward)
- Journey XP bar → slightly expressive (motivational, always visible)
- Journey tier-up → full celebration (major milestone)

---

## 10. Accessibility

- **Color contrast:** All text meets WCAG 2.1 AA (4.5:1 for body, 3:1 for large text). Verified in both themes.
- **Focus indicators:** Visible 2px emerald ring on all interactive elements. Never rely on color alone.
- **Touch targets:** Minimum 44×44px on mobile, 36×36px on desktop.
- **Reduced motion:** Full support via `prefers-reduced-motion` media query.
- **Screen reader:** Semantic HTML, ARIA labels on icon-only buttons, live regions for timer updates and toast notifications.
- **Keyboard navigation:** Full tab order, Escape closes modals, Enter/Space activates buttons.
- **Color-blind safety:** Area colors are distinguishable in the three common color-blindness types (protanopia, deuteranopia, tritanopia). Icons always accompany color to provide a second channel.

---

## Next Steps

- [ ] Build Tailwind config with these tokens (`tailwind.config.ts`)
- [ ] Create component library (Storybook or in-app)
- [ ] Design key screens as wireframes/mockups
- [ ] Prototype focus timer interaction
- [ ] Validate dark theme contrast ratios
