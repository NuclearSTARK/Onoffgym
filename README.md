# ONOFF CROSSFIT — first review version

Responsive Korean gym web app. Static HTML/CSS/JS; no paid API or dependency required. Uploaded logo retained in `dist/assets/onoff-logo.png`.

## Preview

Run `python -m http.server 5173 --directory dist`. Entry: `http://127.0.0.1:5173`.

## Scope

This is an explicitly labelled browser-local preview, not a production membership system. Records, PRs, posts/comments/participation, demo approvals, workouts and notices persist in localStorage (`onoff-v1`). Theme uses `onoff-theme`. Demo coach switching is not an authorization mechanism. Hosted preview stays owner-private. No real personal data or secret is included.

Implemented: Asia/Seoul timetable, 60-minute classes with Wednesday exceptions and open gym, current/next session selection, workout date picker, B/T and WOD sections, coach-defined record fields, member/coach record entry, lbs/kg conversion, 1RM history and percentage calculator, rank participation setting, community posts/comments/participation, notice banner visibility/text, light/dark/system themes, demo attendance calendar and signup approval flow.

Before actual gym operation: select hosting that supports Kakao as the login provider (Sites currently owns its own visitor authentication), configure Kakao developer app and redirects, implement server-side sessions/approval/roles and database access, replace localStorage records with shared database, set and verify gym coordinates/radius and implement attendance validation, publish appropriate privacy notice and account deletion/retention rules. Do not expose demo coach controls in an operational member app. Free-tier pricing/quotas must be checked for the selected final provider.

Uploaded workout content is shown as sample content on unconfigured dates. All example members/posts are fictional demo content. Ranking is opt-in in the UI, but no mixed-metric scores are ranked; numerical ranking needs a per-section scoring direction and comparable scale/conditions in the production model.
