# Design System

Internal email marketing platform — visual design reference.
All values are implementation-ready. Use these tokens consistently across every screen.

---

## Color

### Primary accent — Slate Teal

A distinctive, confident hue. Not blue, not green. Calm authority.

| Token | Hex | Usage |
|---|---|---|
| `primary-50` | `#edf7f5` | Hover backgrounds, tinted surfaces |
| `primary-100` | `#c8ebe4` | Badge backgrounds, selected row tint |
| `primary-200` | `#94d5c8` | Decorative borders, chart fills |
| `primary-400` | `#2fa898` | Icons on light backgrounds |
| `primary-600` | `#1a7a6e` | **Primary brand color** — buttons, links, active states |
| `primary-800` | `#0f5247` | Pressed states, dark text on tinted bg |
| `primary-900` | `#092f29` | Near-black brand tone |

### Neutral — Warm Gray

Slightly warm undertone (not cold blue-gray). All body text, borders, and backgrounds.

| Token | Hex | Usage |
|---|---|---|
| `gray-50` | `#f8f7f5` | Page background |
| `gray-100` | `#f0eeeb` | Sidebar background, table header |
| `gray-200` | `#e2ded9` | Default borders, dividers |
| `gray-300` | `#c9c4bd` | Disabled borders, placeholder text borders |
| `gray-400` | `#a09990` | Placeholder text, muted icons |
| `gray-500` | `#787068` | Secondary text, captions |
| `gray-600` | `#534d46` | Body text |
| `gray-700` | `#3d3830` | Strong body text |
| `gray-800` | `#28241e` | Headings |
| `gray-900` | `#18150f` | Near-black, max contrast |

### Semantic

| Token | Hex | Usage |
|---|---|---|
| `success-100` | `#dcf3e8` | Success badge bg |
| `success-600` | `#1a7a46` | Success badge text, success icon |
| `warning-100` | `#fef3d0` | Warning badge bg |
| `warning-600` | `#92620a` | Warning badge text |
| `danger-100` | `#fde8e8` | Error badge bg, danger button hover bg |
| `danger-600` | `#c0272d` | Error badge text, danger button |
| `info-100` | `#e3f0fd` | Info badge bg |
| `info-600` | `#1a5fa8` | Info badge text |

### Status badge tokens

Each status has three tokens: background, text, border.

| Status | Background | Text | Border |
|---|---|---|---|
| `draft` | `gray-100` | `gray-600` | `gray-200` |
| `scheduled` | `warning-100` | `warning-600` | `#f5d87a` |
| `sending` | `info-100` | `info-600` | `#93c4f7` |
| `sent` | `success-100` | `success-600` | `#7dd3aa` |
| `failed` | `danger-100` | `danger-600` | `#f5a3a3` |
| `bounced` | `#fdf0e8` | `#984a14` | `#f5c4a0` |

### Background layers

| Layer | Token | Hex | Usage |
|---|---|---|---|
| Page | `bg-page` | `gray-50` (`#f8f7f5`) | Root page background |
| Card | `bg-card` | `#ffffff` | Content cards, table rows |
| Sidebar | `bg-sidebar` | `gray-100` (`#f0eeeb`) | Left navigation |
| Elevated | `bg-elevated` | `#ffffff` | Modals, dropdowns (with shadow) |

---

## Typography

Two typefaces only. Never mix a third.

### Typefaces

| Role | Family | Fallback |
|---|---|---|
| **Display / Heading** | `"DM Sans"` | `system-ui, sans-serif` |
| **Body / UI** | `"Inter"` | `system-ui, sans-serif` |
| **Mono** | `"JetBrains Mono"` | `"Fira Code", monospace` |

Both available on Google Fonts. Load only weights 400 and 500.

### Scale

| Token | Size | Line height | Weight | Family | Usage |
|---|---|---|---|---|---|
| `text-2xl` | 28px | 1.2 | 500 | DM Sans | Page titles |
| `text-xl` | 22px | 1.25 | 500 | DM Sans | Section headings, modal titles |
| `text-lg` | 18px | 1.3 | 500 | DM Sans | Card titles, table section headers |
| `text-md` | 15px | 1.4 | 500 | DM Sans | Sub-headings, labels above groups |
| `text-base` | 14px | 1.6 | 400 | Inter | Body text, table cells, form labels |
| `text-sm` | 13px | 1.55 | 400 | Inter | Secondary info, captions, helper text |
| `text-xs` | 11px | 1.5 | 500 | Inter | Badge text, uppercase labels (tracked +0.5px) |
| `text-mono` | 13px | 1.5 | 400 | JetBrains Mono | Email addresses, IDs, code values |

### Rules

- **Two weights only**: 400 (regular) and 500 (medium). Never 600, 700, or bold.
- Headings use DM Sans. Everything else uses Inter.
- Email addresses and technical identifiers always use `text-mono`.
- Uppercase labels (`text-xs`) use `letter-spacing: 0.5px`.

---

## Spacing

8-point grid. Every margin, padding, and gap is a multiple of 8 (or 4 for fine-grained adjustments).

| Token | Value | Common usage |
|---|---|---|
| `space-1` | 4px | Icon-to-label gap, badge inner padding |
| `space-2` | 8px | Tight internal padding, list item gap |
| `space-3` | 12px | Input padding (vertical), compact card padding |
| `space-4` | 16px | Card padding, form field gap |
| `space-5` | 20px | Section gap within a card |
| `space-6` | 24px | Card-to-card gap, panel padding |
| `space-8` | 32px | Section-to-section gap |
| `space-10` | 40px | Page header to content |
| `space-12` | 48px | Major layout gaps |
| `space-16` | 64px | Empty state vertical padding |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-none` | 0 | Dividers, full-width elements |
| `radius-sm` | 4px | Table row hover indicators, subtle chips |
| `radius-md` | 6px | Inputs, buttons, tooltips |
| `radius-lg` | 10px | Cards, modals, dropdowns |
| `radius-xl` | 16px | Large feature cards, empty state containers |
| `radius-full` | 9999px | Badges, status pills, avatar circles |

---

## Shadows

Two levels only. No decorative shadows.

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05)` | Cards, sidebar |
| `shadow-elevated` | `0 8px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)` | Modals, dropdowns, command palette |

Never use `box-shadow` for interactive focus rings. Use `outline` with `outline-offset` instead.

---

## Iconography

**Icon set**: [Phosphor Icons](https://phosphoricons.com/) — **outline (regular) weight only**.

| Context | Size | Usage |
|---|---|---|
| Inline / label | 16px | Next to text in buttons, form labels, table cells |
| UI / navigation | 20px | Sidebar nav, toolbar actions, card icons |
| Feature / empty state | 24px | Empty state illustrations, onboarding |

- Never mix outline and fill variants in the same view.
- Icons in buttons sit at 16px, vertically centered with text.
- Sidebar icons at 20px with a 6px gap to the nav label.
- Recommended icons per feature:
  - Campaigns → `PaperPlaneTilt`
  - Contacts → `Users`
  - Lists → `ListBullets`
  - Templates → `Layout`
  - Analytics → `ChartLineUp`
  - Settings → `Gear`
  - Schedule → `CalendarBlank`
  - Send → `PaperPlaneTilt` (filled — only allowed filled icon)
  - Warning → `Warning`
  - Success → `CheckCircle`

---

## Components

### Button

Four variants. One size per variant (height 36px). Loading state replaces label with a spinner.

```
Primary
  background:  primary-600
  text:        #ffffff
  border:      none
  radius:      radius-md
  padding:     space-2 space-4
  font:        text-sm, weight 500

  :hover       background: primary-800
  :active      background: primary-900, scale(0.98)
  :disabled    opacity: 0.45, cursor: not-allowed
  :loading     spinner icon replaces label, same background

Secondary
  background:  #ffffff
  text:        gray-700
  border:      1px solid gray-200
  radius:      radius-md

  :hover       background: gray-50, border-color: gray-300
  :active      background: gray-100

Ghost
  background:  transparent
  text:        gray-600
  border:      none

  :hover       background: gray-100, text: gray-800
  :active      background: gray-200

Danger
  background:  #ffffff
  text:        danger-600
  border:      1px solid danger-100

  :hover       background: danger-100, border-color: danger-600
  :active      background: #fbd5d5
```

Icon buttons (square, 36×36px) follow the same variant rules. Tooltip required on all icon-only buttons.

---

### Badge / Status pill

Two sizes. Always `radius-full`. Font: `text-xs`, weight 500, letter-spacing 0.5px.

```
Size sm  padding: 2px 8px   font-size: 11px
Size md  padding: 3px 10px  font-size: 12px

Colors: use status badge tokens defined in Color section.
```

Status badges for campaigns always include a 6px colored dot before the label:

```
● Draft      gray dot
● Scheduled  amber dot
● Sending    blue dot (animate: pulse 1.5s ease-in-out infinite)
● Sent       green dot
● Failed     red dot
```

---

### Input field

Height: 36px. Consistent across text, select, and textarea.

```
Default
  background:  #ffffff
  border:      1px solid gray-200
  radius:      radius-md
  padding:     space-2 space-3
  font:        text-base, Inter
  text-color:  gray-800

  placeholder  gray-400

:focus
  border-color: primary-600
  outline:      2px solid primary-100
  outline-offset: 0

:error
  border-color: danger-600
  background:   #fffafa
  — helper text below in danger-600, text-sm

:disabled
  background:   gray-50
  border-color: gray-200
  text-color:   gray-400
  cursor: not-allowed
```

Labels sit above inputs, `text-sm` weight 500, `gray-700`, `space-2` gap.
Helper text sits below, `text-sm`, `gray-500`, `space-1` gap.

---

### Table

The primary data display pattern. Compact but readable.

```
Container
  background:  #ffffff
  border:      1px solid gray-200
  radius:      radius-lg
  overflow:    hidden

Header row
  background:  gray-50
  border-bottom: 1px solid gray-200
  height:      36px
  font:        text-xs, weight 500, gray-500, uppercase, letter-spacing 0.5px
  padding:     0 space-3

Body row
  height:      48px
  border-bottom: 1px solid gray-100 (last row: no border)
  padding:     0 space-3
  font:        text-sm, gray-700

  :hover       background: gray-50
  :selected    background: primary-50, border-left: 2px solid primary-600

Cell variants
  text         gray-700, text-sm
  secondary    gray-500, text-sm (dates, IDs)
  badge        inline status pill component
  number       tabular-nums, text-right
  mono         JetBrains Mono 13px, gray-600 (email addresses)
  action       icon buttons, visible on row :hover only (opacity transition)
```

Sticky header on scroll for tables taller than viewport.

---

### Card

```
Flat (default)
  background:  #ffffff
  border:      1px solid gray-200
  radius:      radius-lg
  padding:     space-6

Elevated
  background:  #ffffff
  shadow:      shadow-card
  radius:      radius-lg
  padding:     space-6
  — no border

Interactive (clickable card)
  extends Flat
  cursor: pointer
  :hover  shadow: shadow-card, border-color: gray-300
  :active scale(0.995)
```

Stat / metric cards (dashboard use):
```
  padding:     space-5
  radius:      radius-lg
  border:      1px solid gray-200

  Label        text-xs, weight 500, gray-500, uppercase, letter-spacing 0.5px
  Value        text-2xl, weight 500, DM Sans, gray-900
  Trend        text-sm — success-600 for positive, danger-600 for negative
               preceded by ↑ / ↓ glyph
```

---

### Sidebar navigation

Fixed left, 240px wide. Page background: `bg-sidebar`.

```
Nav section label
  text-xs, uppercase, weight 500, gray-400, letter-spacing 0.5px
  padding: space-4 space-3 space-2

Nav item
  height:      36px
  radius:      radius-md
  padding:     space-2 space-3
  font:        text-sm, weight 400, gray-600
  icon:        20px, gray-500, margin-right space-2

  :hover       background: gray-200, text: gray-800, icon: gray-700
  :active      (current page)
               background: primary-100
               text: primary-800, weight 500
               icon: primary-600
               border-left: 2px solid primary-600

Collapsed state (not needed for internal tool — always expanded)
```

---

### Modal

```
Overlay
  background:  rgba(24, 21, 15, 0.45)  (gray-900 at 45% opacity)
  backdrop-filter: blur(2px)

Container
  background:  #ffffff
  radius:      radius-lg
  shadow:      shadow-elevated
  width:       480px (sm), 640px (md), 800px (lg)
  max-height:  90vh, overflow-y: auto

Header
  padding:     space-5 space-6
  border-bottom: 1px solid gray-100
  title:       text-lg, DM Sans, weight 500, gray-800
  close button: ghost icon button, top-right

Body
  padding:     space-6

Footer
  padding:     space-4 space-6
  border-top:  1px solid gray-100
  actions:     right-aligned, gap space-2 (secondary then primary)
```

Destructive confirmation modals: danger icon in header, body text explains consequence, confirm button is `danger` variant labeled specifically ("Delete campaign", not "Confirm").

---

### Toast notification

Appears top-right, stacks vertically. Auto-dismisses after 4 seconds. Max 3 visible.

```
Container
  width:       360px
  radius:      radius-lg
  shadow:      shadow-elevated
  padding:     space-3 space-4
  border-left: 3px solid [semantic color]

Variants
  success      border: success-600, icon: CheckCircle (success-600)
  error        border: danger-600,  icon: XCircle    (danger-600)
  warning      border: warning-600, icon: Warning    (warning-600)
  info         border: primary-600, icon: Info       (primary-600)

Content
  title        text-sm, weight 500, gray-800
  description  text-sm, gray-600 (optional)
  dismiss      ghost icon button (X), top-right
```

---

### Empty state

Used when a list or table has no data. Centered in the content area.

```
Container
  padding:     space-16 space-8
  text-align:  center
  max-width:   440px, margin: 0 auto

Icon / illustration
  56×56px geometric shape or Phosphor icon
  color: gray-300
  margin-bottom: space-6

Headline
  text-lg, DM Sans, weight 500, gray-800
  — Action-oriented ("Create your first campaign")
  — Not descriptive ("No campaigns found")
  margin-bottom: space-3

Description
  text-sm, gray-500, line-height 1.6
  2–3 short lines max explaining what the user gets
  margin-bottom: space-6

CTA
  Primary button, centered
```

Teaching empty states: each description bullet explains a concrete outcome, not a feature. "Send to your whole list at once" not "Supports list targeting".

---

## Motion

Purposeful animation only. No decorative transitions.

| Element | Property | Duration | Easing |
|---|---|---|---|
| Button hover | `background-color` | 100ms | `ease` |
| Card hover | `box-shadow`, `border-color` | 150ms | `ease` |
| Modal open | `opacity`, `translateY(8px → 0)` | 180ms | `ease-out` |
| Modal close | `opacity` | 120ms | `ease-in` |
| Toast enter | `opacity`, `translateX(16px → 0)` | 200ms | `ease-out` |
| Toast exit | `opacity`, `translateX(0 → 16px)` | 150ms | `ease-in` |
| Sidebar nav active | `background-color` | 120ms | `ease` |
| Row hover | `background-color` | 80ms | `ease` |
| Status badge (sending) | `opacity` pulse | 1500ms | `ease-in-out`, infinite |
| Page transition | `opacity` | 150ms | `ease` |

Always respect `prefers-reduced-motion`. When set, remove all transitions except opacity ≤ 100ms.

---

## Layout

### Page structure

```
┌─────────────────────────────────────────────┐
│  Sidebar (240px, fixed)  │  Main content    │
│                          │                  │
│  Logo (48px header)      │  Page header     │
│  ─────────────────        │  (title + CTA)   │
│  Nav items               │  ─────────────── │
│                          │  Content area    │
│                          │  (scrollable)    │
│  ─────────────────        │                  │
│  User avatar + name      │                  │
│  (bottom of sidebar)     │                  │
└─────────────────────────────────────────────┘
```

### Page header

Every page has a consistent header zone (height ~72px, `border-bottom: 1px solid gray-200`):
- Left: Page title (`text-2xl`, DM Sans) + optional breadcrumb above it (`text-sm`, gray-500)
- Right: Primary action button (always visible, never hidden in a menu)

### Content grid

- Single-column pages (lists, tables): full width with `max-width: 1200px`, `padding: 0 space-6`
- Two-column pages (campaign builder): sidebar `320px` fixed + canvas `flex: 1`
- Dashboard: 12-column CSS grid, stat cards span 3 cols each

---

## Dark mode

Design in light mode first. Dark mode maps token values — no new components.

| Light token | Dark value |
|---|---|
| `bg-page` `#f8f7f5` | `#111210` |
| `bg-card` `#ffffff` | `#1c1c1a` |
| `bg-sidebar` `#f0eeeb` | `#161614` |
| `gray-200` (borders) | `#2e2d2a` |
| `gray-600` (body text) | `#b0aa9f` |
| `gray-800` (headings) | `#e8e4de` |
| `primary-600` | `#2dbdaa` (lightened for contrast) |
| `primary-100` (badge bg) | `#0f3d36` |

Toggle via `class="dark"` on `<html>`. Use CSS custom properties for all token values so a single class switch re-maps the full palette.
