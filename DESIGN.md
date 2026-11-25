# AklatOne Design Direction

Professional, readable, accessible school library UI.
- Neutral slate palette, clear typography, consistent spacing.
- Sidebar navigation, data tables, forms with labels.
- Loading/empty/error states.
- No excessive decoration.

## Accessibility standard
WCAG 2.2 Level AA for Member Mobile, Staff Web, and Staff Desktop.

## Color tokens (approved 2026-11-19)
Defined once in `frontend/src/index.css` (`@theme`). Use the token utilities (`bg-primary`, `text-ink-muted`, `border-line-strong`, …), not hex values.
- Primary `#3354B5` (canonical), primary-strong `#1E326D`, primary-soft `#EAF0FF`.
- Accent yellow `#F0F000` is decorative only; text on it uses `#123A78`. Never white text on yellow.
- Danger `#C42B2A` (school red darkened to pass 4.5:1); success `#15803D`; warning `#B45309`.
- `line` `#DCE3F0` is for decorative dividers only; input and control boundaries use `line-strong` `#7B88A1` (3:1).
- Purple appears only inside the school seal.

Status: Member Mobile uses the tokens. Staff Web and Staff Desktop still use hard-coded colors and are migrated later.

## Member Mobile conventions
- Shared building blocks: `frontend/src/components/mobile/ui.tsx` (Field, Alert, buttons, headers, list states, API error messages).
- Every input has a visible, linked label (or `sr-only` label for search). Errors use `role="alert"`.
- Focus: `focus-visible` ring in `focus` color. Never remove an outline without a replacement.
- Touch targets: 48px for primary actions, 40–44px for icon buttons, never under 24px.
- Entrance animations use the `ak-*` classes in `index.css`; they are disabled under `prefers-reduced-motion`.
- Background photo: `tnhs-quadrangle.jpg` with a navy overlay so white text keeps 4.5:1.

Details and test results: `docs/aklatone-ui-04.1-member-mobile-design-system.md`.
