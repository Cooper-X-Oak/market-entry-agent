# Workbench design system

## Product character

The UI is a quiet, evidence-dense B2B operations workbench. It prioritizes judgment transparency, scan speed and clear approval states over promotional visuals. The main user is an export or business-development operator who needs to understand why a route, contact or action exists before acting.

## Foundations

- Desktop-first 240 px sidebar, 64 px top bar and maximum 1600 px content area.
- Slate neutral surfaces with a single blue action color and semantic success/warning/danger/info colors from the PRD.
- 10 px panel radius, 48 px table rows, 24 px content rhythm and a 7:5 detail split.
- System sans typography, tabular figures for scores/costs, and compact evidence/status badges.
- Persistent Mission navigation keeps Overview, Ledger, Routes, Ecosystem, Targets, Contacts, Opportunities, Action Queue, Refresh, Timeline and Runs one click away.

## Reusable patterns

- `PageHeader`: title, operational description and primary commands.
- `Panel` / `MetricStrip`: stable grouping without nested decorative cards.
- `DataTable`: dense list frame with toolbar, row actions and empty state.
- `StatusBadge` / `Confidence`: explicit machine/business state and numeric quality.
- `CommandButton`: pending state, idempotent API mutation and read-model refresh.
- `EmptyState`, `ErrorState`, `TableSkeleton`: consistent loading/empty/failure language.
- `StageProgress`: current workflow position plus budget usage.
- `AppShell`: global mission context, breadcrumbs, utilities and exit.

## Judgment semantics

`observed`, `inferred`, `unknown`, `user_confirmed`, `contradicted` and `superseded` never share a neutral presentation. Confidence always includes both a number and a low/medium/high visual band. Approval commands are visible next to the object they affect; destructive/archive actions require confirmation.

## Responsive behavior

At narrower widths the sidebar becomes a top-level horizontal navigation surface, split columns collapse to one column, metrics wrap, tables remain horizontally scrollable, and Action/Kanban layouts preserve labels rather than compressing content beyond legibility.

## Interaction boundaries

The UI can approve, copy, download and mark an action as executed, but it does not send external email/messages. Refresh suggestions are proposals until accepted. Demo fixtures are presented as workflow data, never as real market facts.

## Review status

The design follows the PRD-fixed layout/tokens and the repository design contract. Automated browser screenshots and visual review were not run in the initial implementation delivery because runtime validation was explicitly excluded from that turn.
