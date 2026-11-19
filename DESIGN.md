---
name: TRAKIA
description: Interfaz de entrenamiento personal dark minimalista, orientada a operar con calma y precisión.
colors:
  primary: "#FE271F"
  primary-foreground: "#170B0A"
  primary-action: "#C81F19"
  action-foreground: "#FFFFFF"
  background: "#0B0C0C"
  surface: "#141616"
  surface-raised: "#1C1F1F"
  foreground: "#F4F1EB"
  foreground-secondary: "#B2B3AE"
  foreground-tertiary: "#898C89"
  border: "#303434"
  focus: "#FE514A"
  success: "#B8D9A5"
  warning: "#F3D28A"
  info: "#A8C7FA"
  session: "#D0BCFF"
  exercise: "#8BE9FD"
  circuit: "#F0ABFC"
  error: "#FF958A"
  error-border: "#75483F"
  error-surface: "#211A18"
  error-secondary: "#E0B5AC"
typography:
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "9px"
    fontWeight: 600
    lineHeight: 1
  weekday:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
  metadata:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  small:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  body-secondary:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  section-title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  control: "8px"
  surface: "12px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  primary-action:
    backgroundColor: "{colors.primary-action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    height: "44px"
  quiet-navigation:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground-secondary}"
    rounded: "{rounded.control}"
    height: "60px"
---

# Design System: TRAKIA

## Overview

**Creative North Star: “Operar con calma y precisión.”**

TRAKIA is a mobile-first training tool. Its visual language keeps the workout and the next useful action easy to find. Dark charcoal surfaces, warm white text, measured spacing, and restrained red accents make the interface direct without adding visual noise.

The approved direction is the charcoal, warm-white, and TRAKIA-red palette recorded in the HC-05-10 UX proposal. The existing PNG is the official mark and must remain byte-for-byte intact. The calendar composition in the isolated proposal is approved for implementation; the session detail still requires its own visual proposal and approval.

**Key Characteristics:**
- Calm, precise, and operational.
- Flat charcoal surfaces with clear typographic hierarchy.
- Red used as a deliberate accent, not as a page-wide fill.
- Real training information stays primary; no decorative metrics or duplicated explanations.

## Colors

The palette pairs near-black charcoal with warm white and the original TRAKIA red. Semantic status colors remain secondary and must be accompanied by text.

### Primary
- **TRAKIA Red** (#FE271F): Brand accent, focus, and small state signals. Use the darker action red (#C81F19) for a filled button with white text.

### Neutral
- **Charcoal Base** (#0B0C0C): Main page background.
- **Charcoal Surface** (#141616): Primary surface.
- **Raised Charcoal** (#1C1F1F): Occasional raised surface.
- **Warm White** (#F4F1EB): Primary text.
- **Warm Grey** (#B2B3AE): Secondary text.
- **Muted Grey** (#898C89): Tertiary metadata; avoid for essential text.
- **Graphite Border** (#303434): Dividers and quiet outlines.
- **Focus Red** (#FE514A): Visible keyboard focus ring.
- **Soft Green** (#B8D9A5): Success status with a text label.
- **Warm Amber** (#F3D28A): In-progress or warning status with a text label.
- **Soft Blue** (#A8C7FA): Informational emphasis on dark surfaces; use with its visible metric label.
- **Soft Violet** (#D0BCFF): Session count emphasis on dark surfaces.
- **Soft Cyan** (#8BE9FD): Exercise count emphasis on dark surfaces.
- **Soft Fuchsia** (#F0ABFC): Circuit count emphasis on dark surfaces.
- **Soft Error** (#FF958A): Error text on the dark error surface (#211A18), paired with its muted border (#75483F).
- **Error Secondary** (#E0B5AC): Secondary text inside error surfaces.

### Named Rules
**The Accent Restraint Rule.** TRAKIA red marks a meaningful action, focus, or state; it does not fill large background regions or carry meaning by color alone.

## Typography

**Display Font:** Inter with the system sans-serif fallback already used by the web app.
**Body Font:** Inter with the system sans-serif fallback already used by the web app.
**Label/Mono Font:** No separate mono face is established.

**Character:** Compact, neutral sans-serif typography supports repeated scanning. Tabular numerals are used when numbers need stable alignment.

### Hierarchy
- **Headline** (600, 30–36px, tight line-height): Screen titles and primary activity names.
- **Title** (600, 18–20px, 1.35 line-height): Day and section headings.
- **Body** (400, 16px, 1.5 line-height): Training content and instructions needed to act.
- **Section title** (600, 18px, 1.35 line-height): Day and section headings.
- **Label** (500–600, 12–14px): Dates, status, and secondary navigation labels; do not use uppercase labels as decoration.
- **Compact calendar labels** (600, 9–11px): Day captions and weekday abbreviations only; never use for body copy.

## Layout

Use a single-column layout on phones with a centered content width up to 68rem on wide screens. The established spacing rhythm is based on 4px increments: 4, 8, 12, 16, 24, and 32px. Keep related controls close and separate independent sections with larger gaps. Respect safe-area insets and use dynamic viewport sizing. Interactive targets in the app are generally at least 44px high; maintain visible focus and avoid horizontal scrolling at 375px and 390px widths.

## Elevation & Depth

The system is flat by default. Depth comes from tonal surface changes and thin borders rather than heavy shadows, blur, or glow. Reserve a raised charcoal surface for information that needs a clear grouping.

## Shapes

Controls use moderate corners (8px). Surfaces may use 12px corners where a distinct container improves grouping. Prefer dividers and open lists when cards would add repeated framing. Borders are subtle and do not replace focus indication.

Status pills use the full pill radius (999px) with visible text. Pending uses a neutral grey fill; completed uses a muted soft-green fill, check icon, and label; in-progress uses a restrained warm-amber fill and label. Color never replaces the status text.

Conflict targets in the plan importer use an 8px radius, 1px muted error border, dark error surface, and light error text. Keep this treatment scoped to affected-item pills; calendar status pills retain their own variants.

Import confirmation metric pills keep the raised-charcoal surface and 8px control radius. Tint each pill's raised-charcoal background with its foreground color: soft violet for sessions, soft cyan for exercises, soft fuchsia for circuits, warm amber for time, soft green for rounds, and soft blue for repetitions. Retain the metric text so color is a secondary scanning cue.

## Components

### Buttons
- **Shape:** 8px radius.
- **Primary:** Dark action red (#C81F19) with white text; use for a single clear primary action.
- **Hover / Focus:** State change remains visible; keyboard focus uses a 2px red outline with an offset.
- **Secondary / Ghost:** Transparent or charcoal surface with warm-white text and a quiet border; keep labels explicit.
- **Target:** Preserve at least 44px height for primary touch controls.

### Cards / Containers
- **Corner Style:** 12px only when grouping earns a container.
- **Background:** Charcoal base or surface; raised charcoal is occasional.
- **Shadow Strategy:** Flat; use tonal separation and borders.
- **Border:** 1px graphite for intentional boundaries.
- **Internal Padding:** 16px or 24px, based on content density.

### Navigation
- Use persistent, visible labels for primary destinations when navigation is present.
- Show the active destination through text/icon contrast and a second cue such as an underline or marker.
- Include safe-area space for fixed navigation and keep focused content unobscured.

### Official Mark
- Use `/brand/trackia.png` at its intrinsic 3:2 ratio, preserving its complete canvas, transparency, and pixels.
- Do not crop, recolor, filter, recomposite, or re-export the source image.

## Do's and Don'ts

### Do:
- **Do** use the approved charcoal, warm-white, and TRAKIA-red palette.
- **Do** remove technical identifiers, duplicate data, and explanations that the interface makes unnecessary.
- **Do** pair status colors with clear text.
- **Do** use visible focus and responsive layouts at narrow widths.
- **Do** treat page-specific designs as proposals until their visual review is approved.

### Don't:
- **Don't** change the official PNG or create derivative marks without approval.
- **Don't** add decorative sports effects, invented metrics, nested cards, gradients, or heavy shadows.
- **Don't** add product capabilities or change sports logic during a visual redesign.
- **Don't** use color as the sole status signal.

## Calendar proposal status

The isolated calendar proposal is documented in `docs/design/calendar-proposal.md` and rendered in `docs/design/calendar-proposal.html`. Its composition, wordmark, calendar activity markers, and session-status treatment are approved for Vue implementation. The detail view is outside this visual approval and requires a separate proposal.

The approved calendar composition pairs the untouched PNG with one continuous TRAKIA wordmark (same type metrics and uniform tight tracking at -0.025em, TRAK warm white and IA red), uses a #141616 weekly selector and a #1C1F1F session group, and shows one red activity dot only on days containing sessions. The selected day has a red border; an unselected current day has a warm-white border and the “Hoy” label. Session statuses use neutral grey for pending, muted soft green with a check for completed, and restrained warm amber for in-progress; all keep visible labels. It removes content dividers except the boundary above fixed bottom navigation. Session rows share one surface without nested cards, omit internal IDs and redundant counts, and preserve a common content height for empty and populated states. The session detail remains outside this approval.
