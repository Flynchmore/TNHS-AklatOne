# AklatOne UI-04.0 — UI/UX Resource Research and Evaluation

Date: 2026-11-19. Scope: read-only evaluation. No dependencies were installed, no repositories were cloned, no external code or assets were copied, and no application code was modified.

## 1. Evaluation basis

Each resource is assessed against the existing AklatOne architecture and design decisions:

- Stack: React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), React Hook Form + Zod, TanStack Query, `lucide-react` icons.
- One frontend codebase serves three platforms: Staff Web, Staff Desktop (Tauri), and Member Mobile (Capacitor, `/m/*` routes).
- Design direction: `DESIGN.md` (neutral, readable, accessible, no excessive decoration) and `docs/aklatone-ui-01r-premium-cross-platform-design-blueprint.md` (navy/yellow/red/white identity, tokens, component specifications, 44px touch targets, visible focus rings, reduced motion).

## 2. Current-state findings (measured from source)

These findings set the priority for every recommendation below.

| # | Finding | Evidence |
|---|---|---|
| F1 | Design tokens exist but are unused. | `src/index.css` declares `--color-primary` etc. in `:root`; 0 `var(--color-*)` uses in `.tsx`. Tokens are not registered in Tailwind's `@theme`, so no `bg-primary`-style utilities exist. |
| F2 | Colors are hard-coded. | 371 hex literals in `.tsx`; 365 are arbitrary Tailwind classes such as `bg-[#3354B5]`. 325 of them are in `features/mobile`. |
| F3 | Primary color has drifted between platforms. | Member Mobile uses `#3354B5` (80 uses); Staff Web uses the blueprint value `#3050B0` (24 uses). |
| F4 | Mobile input borders fail non-text contrast. | `#DCE3F0` on white = 1.29:1 (WCAG 1.4.11 requires 3:1 for input boundaries). Used on inputs in MobileCatalog, MobileRegister, MobileLogin, MobileForgotPassword. |
| F5 | Red brand colors are weak for normal-size white text. | White on `#F73B3A` = 3.72:1; white on `#F03030` = 4.06:1 (AA needs 4.5:1). No current white-on-red text was found by pattern search; this is a guard for future use. |
| F6 | Core colors pass. | White on `#3050B0` 7.24:1; white on `#3354B5` 6.83:1; muted `#64748B` on white 4.76:1; navy `#123A78` on yellow 9.03:1. |
| F7 | Focus styling uses `focus:` not `focus-visible:`; no dialog component exists. | 58 `focus:ring`, 0 `focus-visible:`, 32 `outline-none`; no `role="dialog"` in the codebase although the blueprint specifies Modal/ConfirmDialog/Toast. |

## 3. Resource evaluations

### 3.1 Claude Code official repository — github.com/anthropics/claude-code

- **Purpose:** Source and issue tracker for Claude Code, the agentic coding CLI. Directories include `plugins/`, `examples/`, `.claude/commands/`. Official plugins are developed in `anthropics/claude-plugins-official`, which is already registered on this machine.
- **Useful guidance:** Workflow tooling rather than UI design. Relevant official plugins: `frontend-design` (UI/UX implementation skill — same content as the existing local skill), `code-review` / `pr-review-toolkit` (review), `security-guidance` (security review of edits; relevant to the auth work).
- **Type:** Development tool (CLI) plus plugin marketplace.
- **Compatibility:** Not a runtime dependency; stack-independent.
- **Recommendation: Reference.** Use for workflow configuration only. Do not install the `frontend-design` plugin (duplicates `.claude/skills/frontend-design`). `security-guidance` may be considered later, with approval.

### 3.2 Anthropic Skills — github.com/anthropics/skills

- **Purpose:** Public library of Agent Skills (folders with `SKILL.md`), installable in Claude Code via `/plugin marketplace add anthropics/skills`. 19 skills, including `frontend-design`, `webapp-testing`, `theme-factory`, `brand-guidelines`, `web-artifacts-builder`, `canvas-design`.
- **Useful guidance:**
  - `frontend-design`: already present locally (`.opencode/skills` / `.claude/skills`, identical frontmatter). Its "aesthetic risk" stance is subordinate to `DESIGN.md` (AklatOne note already added).
  - `webapp-testing`: Playwright-based UI verification (screenshots, console logs, server lifecycle helper). Conceptually useful for the planned E2E phase, but it uses Python Playwright while the project plans Node Playwright (`testing-playwright`).
  - `theme-factory`: themes slides/documents/landing pages with preset palettes — not an application design-system tool.
  - `brand-guidelines`: Anthropic's own brand — not applicable.
- **Type:** Skills (agent instructions). Not a library.
- **Compatibility:** Not a runtime dependency; no effect on React/Vite/Tailwind.
- **Recommendation: Reference.** No new skill is needed now. Revisit `webapp-testing` when E2E work is approved. Ignore `theme-factory`, `brand-guidelines`, `web-artifacts-builder` for AklatOne.

### 3.3 shadcn/ui — ui.shadcn.com

- **Purpose:** Accessible React components (built on Radix UI primitives, styled with Tailwind) distributed by a CLI that writes component source into the project, rather than as a versioned npm package.
- **Useful patterns:**
  - Semantic token model (`--primary`, `--primary-foreground`, `--muted`, `--border`, `--ring`, …) mapped into Tailwind v4 via `@theme inline`. This directly addresses F1–F3.
  - Accessible Dialog/AlertDialog, DropdownMenu, Select, Tabs, Sheet (drawer), Sonner toasts — the components the blueprint specifies and the codebase lacks (F7).
  - `focus-visible:` ring conventions and `data-slot` styling hooks.
- **Type:** Component distribution system (code generator + library dependencies).
- **Compatibility:** React 19 and Tailwind v4 supported (OKLCH colors, `@theme inline`, `tw-animate-css`, `forwardRef` removed). Vite supported. Adoption would require: `@/*` path alias in `tsconfig`/`vite.config.ts`, `components.json`, and new dependencies (Radix packages, `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css`). It already uses `lucide-react`, which AklatOne uses.
- **Conflicts:** Default visual style (neutral palette, its own radii) differs from the AklatOne navy/yellow/red identity and would need re-theming; the `ui-styling` skill's `npx shadcn init` instruction is blocked pending approval.
- **Recommendation: Reference now; candidate for adoption only with explicit approval.** Use its token naming and accessibility patterns as the reference model. If accessible dialogs/menus are needed, shadcn (copy-in, selective components) is the strongest candidate because it fits the existing stack, but it is a new component dependency and must be approved first.

### 3.4 Material Design 3 — m3.material.io

- **Purpose:** Google's design system: foundations (layout, accessibility, interaction), styles (color roles, typography scale, shape, elevation, motion), and component guidance.
- **Source note:** The m3.material.io pages are rendered by JavaScript and returned no content when fetched. The points below are from established M3 guidance, not from fetched text.
- **Useful patterns:**
  - Color roles with paired "on" colors (primary/on-primary, container/on-container) — a clear model for guaranteeing contrast in tokens.
  - Adaptive navigation by window width: navigation bar (compact, phones) → navigation rail (medium) → navigation drawer (expanded). Matches AklatOne's bottom nav (Mobile) vs sidebar (Web/Desktop).
  - 48dp minimum touch targets on Android (blueprint already uses 44px; 48px aligns with Android).
  - Type scale and state layers (hover/pressed/focus opacity overlays).
- **Type:** Documentation (design guidelines). Official code implementations target Jetpack Compose, Flutter, and web components (`material-web`, which is in maintenance mode). There is no official React implementation; MUI implements Material Design 2, with M3 support still listed as planned.
- **Compatibility:** Guidance is framework-neutral. No suitable React + Tailwind v4 library.
- **Recommendation: Reference only** (Member Mobile/Android conventions: touch targets, bottom navigation, color-role pairing). Do not adopt an M3 component library and do not replace the AklatOne visual identity with Material styling.

### 3.5 WCAG — w3.org/WAI/standards-guidelines/wcag/

- **Purpose:** W3C standard for web accessibility. Current recommendation: WCAG 2.2 (2023, updated 2024). Conformance levels A/AA/AAA; principles: perceivable, operable, understandable, robust. WCAG 3.0 is an early draft.
- **Directly relevant criteria:**
  - 1.4.3 Contrast (Minimum) 4.5:1 text — see F5/F6.
  - 1.4.11 Non-text Contrast 3:1 — see F4.
  - 2.4.7 Focus Visible and 2.4.11 Focus Not Obscured (AA, new in 2.2) — see F7; relevant to sticky mobile headers and bottom nav.
  - 2.5.8 Target Size (Minimum) 24×24 CSS px (AA, new in 2.2) — the blueprint's 44px exceeds it.
  - 3.3.8 Accessible Authentication (AA, new in 2.2) — login/OTP/password reset must allow paste and password managers; the show/hide password control already helps.
  - 3.3.7 Redundant Entry (A, new) — relevant to the multi-step forgot-password/OTP flow.
  - 3.2.6 Consistent Help (A, new) — keep help/contact in the same place across screens.
- **Type:** Documentation (normative standard).
- **Compatibility:** Technology-neutral; applies equally to all three platforms (Tauri and Capacitor render the same HTML).
- **Recommendation: Adopt as the acceptance standard — WCAG 2.2 Level AA** for Staff Web, Staff Desktop, and Member Mobile. Adopting a standard requires no code or dependency change; it becomes the checklist for future UI work.

## 4. Summary matrix

| Resource | Type | React / TS / Vite / Tailwind v4 | Recommendation |
|---|---|---|---|
| Claude Code repo | Development tool + plugin marketplace | N/A (not a runtime dependency) | Reference |
| Anthropic Skills | Skills | N/A | Reference (frontend-design already local; webapp-testing later) |
| shadcn/ui | Component system (copy-in code + deps) | Compatible (React 19, Tailwind v4, Vite) | Reference; adopt only with approval |
| Material Design 3 | Documentation | Guidance neutral; no official React library | Reference (mobile conventions only) |
| WCAG 2.2 | Documentation (standard) | Neutral | Adopt as AA acceptance standard |

## 5. Recommendations for a consistent, accessible design system (for approval; not implemented)

Ordered by impact; none requires a new dependency except item 5.

1. **Confirm one primary color** (`#3050B0` per blueprint, or `#3354B5` as used on Mobile). This is a design decision for the developer.
2. **Register the AklatOne tokens in Tailwind v4 `@theme`** in `src/index.css` with semantic names (primary, on-primary, accent, danger, surface, text, muted, border, ring), so all three platforms use `bg-primary`-style utilities instead of hex literals. Then migrate screens incrementally, Member Mobile first (current development priority; 325 literals).
3. **Fix the mobile input border contrast** (F4) by choosing a token that reaches 3:1 against white for input boundaries; decorative card borders may stay light.
4. **Switch focus styles to `focus-visible:`** and verify every `outline-none` has a visible replacement ring (F7).
5. **Decide on accessible overlay primitives** (Dialog, ConfirmDialog, Toast, Sheet) specified by the blueprint: either hand-built to WCAG patterns or selected shadcn/ui components. Requires approval because it adds dependencies.
6. **Record WCAG 2.2 AA** as the acceptance criterion in `DESIGN.md` / `PROJECT_CONTEXT.md`.

## 6. Unverified items

- Material Design 3 content could not be fetched (JavaScript-rendered site); M3 statements rely on established guidance.
- The full dependency list added by `shadcn init` was not shown on the fetched pages.
- Contrast was computed for colors found in source; rendered screens were not visually audited.

## Sources

- https://github.com/anthropics/claude-code and plugins/README.md
- https://github.com/anthropics/skills (skills/ listing; webapp-testing, theme-factory, frontend-design SKILL.md)
- https://ui.shadcn.com/docs/tailwind-v4 ; https://ui.shadcn.com/docs/installation/vite
- https://m3.material.io/ ; https://github.com/material-components/material-web
- https://github.com/mui/material-ui/issues/29345 ; https://mui.com/getting-started/supported-components/
- https://www.w3.org/WAI/standards-guidelines/wcag/ ; https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
