# Reversible Transcription V2 Appearance Modes

The Transcription V2 workspace now offers two visual options in the top header.

## Options

- **Classic**: the existing UI, unchanged. This is the **default for all users** who have not opted into a new appearance.
- **Enterprise**: a scoped, light enterprise visual layer with revised spacing, typography, surface treatment, control hierarchy, audio timeline chrome, transcript presentation, review dialog surfaces and mobile layouts.

Click **Classic** or **Enterprise** in the header to change appearance immediately. The choice is saved in local browser storage and will survive refreshes on that browser. This is **not a server-side user or task setting**; it does not affect other devices.

## Instant rollback / emergency fallback

- Select **Classic** in the workspace header at any time. The Enterprise body class is removed immediately.
- If the Enterprise interface obscures the toggle or looks wrong, append **`?ui=classic`** to the current task URL (or **`&ui=classic`** when the URL already has a query string), then refresh. The URL parameter overrides a saved Enterprise preference for that load.
- User choices are stored under `adatacore.transcription.v2.appearance` in browser localStorage; Classic remains usable even when storage is blocked.
- No deployment rollback is necessary for visual rollback.

## Scope and safety

New files: `transcription-enterprise-theme.css` and `transcription-appearance-switch.js`. Only `transcription-v2.html` receives two new asset references; existing CSS, JS, DOM structure and event listeners remain unchanged. The Enterprise CSS is explicitly gated by `body.tx-v2-editor.ac-enterprise-mode`, except for the small header switch shared by both modes.

No database migrations, project settings, audio, segment data, autosave logic, linter validation, reviewer rules, feedback, diff history or submission handlers are changed. **No functional buttons are hidden or moved.** The existing current-caption, paragraph editing and segment table modes remain available.

## Regression checks performed

- Static checks: existing CSS and linter/review elements preserved; Classic is initial HTML; appearance stylesheet loads after the existing CSS; controller loads after all original JS; scoped CSS balanced and never hides functional controls.
- Headless controller mocks: Classic default, selecting Enterprise, persistent choice, accessible pressed state, URL override back to Classic, clearing stale URL overrides, and storage-unavailable mode.
- Required follow-up: visually inspect both modes on authenticated desktop and mobile tasks, including a red linter error, expanded in-flow linter details, editing in paragraph mode, waveform controls, and L2 review. Testing here does not substitute for a signed-in browser test.

## Further design iterations

Keep all future visual changes inside the opt-in theme until verified, with a single feedback-backed revision path. Don't progressively add CSS overrides to the Classic production bundle. 
