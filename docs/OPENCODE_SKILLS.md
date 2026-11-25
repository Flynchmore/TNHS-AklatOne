# Skills Inventory

## Project-local skills
OpenCode reads the originals in `.opencode/skills/`. Claude Code reads adapted copies in `.claude/skills/` (same content plus short "AklatOne note" scope lines; ui-ux-pro-max script paths point to `.claude/skills/`).

| Skill | Purpose | Source |
|---|---|---|
| backend-engineering | Express/TS conventions | Project |
| database-prisma-mariadb | DB/Prisma conventions | Project |
| frontend-react | React/TS conventions | Project |
| testing-playwright | Testing conventions | Project |
| security-privacy | Security/privacy | Project |
| capstone-documentation | Capstone docs | Project |
| ui-ux-pro-max | UI/UX design intelligence (Python 3 search scripts) | Copied from Montalban-HRIS |
| frontend-design | Visual design direction | Copied (source recorded inconsistently: Downloads or Montalban-HRIS) |
| design-system | Token architecture (slide system not applicable) | Copied from Montalban-HRIS |
| ui-styling | Tailwind/shadcn guidance (no shadcn in project) | Copied from Montalban-HRIS |

When editing a skill, update both copies.

## Ponytail (@dietrichgebert/ponytail 5.3.3)
- OpenCode: plugin in `opencode.json`.
- Claude Code: plugin `ponytail@ponytail`, project scope (`.claude/settings.json`), marketplace `DietrichGebert/ponytail`.
- Skills: ponytail, ponytail-review, ponytail-audit, ponytail-debt, ponytail-gain, ponytail-help.

## Not installed
- GSD Core: not used. The project uses AGENTS.md + PROJECT_CONTEXT.md + this file.
