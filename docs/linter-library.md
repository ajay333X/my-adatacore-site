# Adatacore Linter Library

A **platform-level** rule profile catalog, deliberately independent of any project. A project attaches any number of active profiles and can detach them without modifying the shared profile or any other project.

## Admin workflows

- Admin console → **Linter Library** (`/admin/linters`). The central library lists profiles and includes a project picker.
- Super admins can create, edit, disable and delete shared profiles. The UI supports configuring a set of deterministic rules and setting each severity to **Block** or **Warn**.
- Project managers (and super admins) can assign and detach active profiles for projects they manage. QA managers can view the configuration.
- Each Project Lab has a **Linters** tab, showing its own assignments and a shortcut to the central library.
- No profile is automatically assigned to existing or new projects. Attaching is an explicit action.
- An edited shared profile changes behavior for **all** projects using it. Disabling a profile suspends its validation globally while preserving the project assignment.
- "Test project rules" checks example text against the selected project's actual attached profiles without changing a transcript.

## Data and enforcement

Supabase:
- `public.linter_profiles`: reusable profile library, rules and activation state.
- `public.project_linter_assignments`: independent many-to-many project/profile bindings.
- `public.linter_rule_catalog()`: supported deterministic rule definitions.
- `public.linter_library_snapshot(project)`, `public.linter_save_profile(...)`, `public.linter_delete_profile(...)`, `public.linter_set_project(...)`: authorization-checked management.
- `public.linter_validate_texts(project, segments)`: generic frontend/backend validation API for future editors.
- `public.linter_check_item(item)`: validation of saved transcription segments for the current authenticated assignee/reviewer.
- `app_private.linter_evaluate(project, segments)`: central engine. If multiple assigned profiles have the same rule, a blocking severity takes priority over warning.
- A database trigger blocks an invalid transcription when its status moves to **submitted** or **approved**, even if a client bypasses frontend checks. Review-return actions and draft saves remain available.

**Current scope:** Platform-level profiles and their assignment APIs work for all `project_lab` projects. The fully integrated server-side submission gate is implemented for the existing **Transcription / Transcription V.2** workflow. New task types and editors need to call `linter_validate_texts` and install an equivalent server-side enforcement hook in their own submission flow before claiming blocking support.

## Initial catalog

`DOUBLE_SPACE`, `SPACE_BEFORE_PUNCT`, `NO_SPACE_AFTER_DANDA` (now includes other end marks and Hindi text after a period), `NO_SPACE_AFTER_COMMA`, `TRIM_EDGES`, `REPEATED_PUNCT`, `INVISIBLE_CHAR`, `SPACE_INSIDE_BRACKETS`.

Seed profiles:
1. **Hindi · Essential Formatting** — blocking, strict punctuation/spacing.
2. **Hindi · Extra QA Warnings** — nonblocking, suspicious formatting only.

Structured tags (e.g., `{PRO: ...}`, `<...>`, `[...]`) are excluded from punctuation matching to minimize false rejections. The engine does not attempt to infer semantic accuracy, grammar, audio delivery or missing tags from plain text.

## Permissions and security

The profile and assignment tables use RLS and are not directly exposed for browser writes. The management RPCs verify active `admin_staff_roles`; only active super admins may edit the global library, and only authorized project managers or super admins may attach/detach. Transcription item validation checks the existing `app_private.tx_mode` authorization before reading saved text.

## QA completed

- Verified initial sample typos produced 5 blocking matches and 1 warning.
- Verified extended punctuation (question, exclamation, Hindi after period) produced 8 blocking matches and 1 warning.
- Checked against clean Hindi and PRO tags, scientific decimal `3.14`, number separators `1,000`, ellipsis and foreign language tags; no issues.
- All SQL verification used transactions with `ROLLBACK`; **no linter was attached to a real project** during testing.
- Checked changed JS syntax and the Vercel preview deployment.

## Deployment notes

The schema was applied directly using Supabase's migration capability. The feature code is on `feature/shared-linter-library-20261110` before release. Any additional rule implementation must update both `linter_rule_catalog` and `linter_evaluate`, then add regression tests to prevent false positives.

## Linter playground and custom rules (2026-11-10)

- The **Linter playground** now works without any project selected: choose a library profile and run a sample. If a project is selected, the **Project # — attached rules** option previews its active assignments, explicitly reporting when no rules are attached.
- The **Test this linter** action on each profile opens its preview, without any attachment or task submission.
- **Edit linter** now supports up to **40** rules total. Alongside built-in checks, admins can create named custom rules: prohibited literal text, prohibited term lists, suggested spelling replacements, text required in each segment, and per-segment character limits. Custom rules have per-rule Block/Warn severity and optional case matching.
- The modal includes **Test draft rules** which previews the current unsaved settings, so admins can avoid unexpectedly blocking tasks.
- The transcription editor **Project linter** action now uses in-memory text (including unsaved edits) rather than always checking the previously saved transcript; the existing server submission trigger remains the final authority after draft save.
- Project attach/detach, profile save, custom rule preview and role authorization have been checked in rollback-only transactions. These tests leave project assignments and task data unchanged.
- Custom literal matching is substring-based: do not use very short Hindi particles as blockers unless their matches are unambiguous. Spelling suggestions should normally be warnings, with audio verification by reviewers.

## Inline project linter — Transcription / Transcription V.2

The linter now loads active assignments using the authorized `linter_project_runtime(p_item)` endpoint. Only task owners, authorized reviewers and admins can retrieve the project profile configuration for that task. No profiles are automatically attached by opening the editor.

The editor validates text locally as users edit, without making per-keystroke database requests. A dedicated project-linter status badge beside Save opens a compact error panel, with **line navigation**, **red/warning highlights**, and individual **safe spacing fixes** that use the normal editor's Undo and autosave paths. The follow-along caption and expanded paragraph views show affected words, while a table-line hint remains available during segment editing. Spelling suggestions require explicit confirmation, not automatic text changes.

Existing structural validation remains separate. The project-level linter is authoritative at the database on transcription submission and review approval; warning rules never block, and review return actions remain possible. The V.2 preflight dialog lists project issues and disables contributor submission continuation for blocking rules. A failure to load the project linter is disclosed in the badge, rather than falsely reporting zero errors. The script uses debounced local checks, limited highlighted ranges and an optimized offset map to keep typing responsive.

Regression tests include missing post-punctuation spaces, double spaces, extra pre-punctuation spaces, repeated punctuation, PRO and foreign-language tags, ellipsis, and spelling suggestions. Project 93 currently has two attached Hindi profiles; other projects remain independently configured.
