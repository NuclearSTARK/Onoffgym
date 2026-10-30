# ONOFF CROSSFIT

Dark-only Korean gym app, with protected server-side workout publishing, XLSX imports, and movement videos. Existing Site identity and private audience retained.

## Development

- `npm test`: validation, release-boundary, approval, authorization and upload tests.
- `node scripts/dev.mjs`: local adapter at http://127.0.0.1:5173 using in-memory SQLite fixtures. Local-only test cookies `dev_user` and `dev_time` are consumed exclusively by this adapter and are not in the deployment artifact.
- `node qa.cjs`: Chromium integration tests (requires locally installed Playwright and Chromium).
- `python scripts/make-template.py`: rebuild blank workbook and separate example workbook (openpyxl).
- `npm run build`: deterministic dependency-free Worker build; embeds all web assets, copies the hosting manifest and migration SQL into `dist/`.

## Data and access

The Worker uses dispatch-owned Sites authentication headers and D1 (`DB`). `ONOFF_OWNER_EMAIL` is configured as a runtime secret, never bundled; only a matching authenticated Site identity is provisioned as owner/admin. Other signed-in accounts are pending until approved. Admins can approve/suspend members and grant member/coach/admin roles. Coaches manage workouts and movement videos but cannot grant roles. There is no client-side role switch or first-visitor-admin bootstrap. All mutations require same-origin JSON requests and server authorization.

Site hosting access remains owner-private; app roles do not grant Site hosting access. Broader member access and Kakao login are separate future integration steps. Do not tell members Kakao is connected. GPS attendance is also unconfigured.

Workout visibility: store `release_at` as the UTC instant corresponding to the previous day 22:00 Asia/Seoul. The server filters unreleased workouts out of member responses. Exactly 22:00 is inclusive. Staff can access all dates; staff member-view requests receive the same filtered workout response as a member. No cron or paid AI API is needed. The browser polls every 30 seconds and refreshes on visibility changes; a focused screen refreshes at the release boundary. Empty dates show preparation status; no example workout is substituted.

XLSX parsing uses vendored SheetJS CE 0.20.3 (Apache 2.0 license under web/assets). Only the 수업등록 sheet is imported; examples and instructions are separate sheets. Required headers, dates, Wednesday WOD-only rule, weekends, duplicates, sequential sections, related movements, scoring type, and YouTube URLs are validated in browser and again on server. Uploads are limited and D1 writes are atomic batches. Existing workouts require explicit overwrite confirmation in upload flow.

Movement video URLs are registered once in the movement library; related movement names attach videos to workouts. Optional per-workout overview videos are independently supported. Embeds use youtube-nocookie.com, valid HTTPS YouTube links only, with an external YouTube fallback. No video bytes are hosted.

## Existing preview features

Exercise results, personal PRs, community posts/comments, notice settings and demo attendance still use browser-local storage, with clear in-app notices. Workout schedules, movement metadata and actual login-account roles use server storage. Old local draft workouts and fake members are never imported into the server. Connecting the remaining member-shared records and Kakao/GPS is required before full gym operation.

## Deployment

Publish the exact pushed Git commit and archive built from it. Worker artifact: `dist/server/index.js`, `dist/.openai/hosting.json`, `dist/drizzle/0000_gym.sql`. Preserve project_id and hosting audience. D1 schema changes are migration-owned; never create tables during a request.

## Community notices, Korean holidays, and release-time settings

Announcements are persisted in `gym_notices`. Only approved admins can create/edit/delete or pin them, enforced at the API boundary. Pinned announcements appear before other community posts. Regular community posts remain the existing browser-local preview.

Release time is configurable by admins in Asia/Seoul (default 22:00) and persisted in `gym_settings`. A change atomically recalculates only unpublished workout release timestamps; already public workouts remain public, including when overwritten. The browser uses the server setting and published-date metadata for its release labels and checks.

The server synchronizes Google Calendar's Korean public-holidays-only ICS feed on access, at most daily, and supports an admin refresh. Only events described as public holidays are imported; observances are excluded. Lunar and substitute holidays come from dated feed entries. The most recently retrieved calendar is cached in D1. If retrieval fails, a bundled snapshot is available; no paid API key is required. Source and fallback state are visible in the calendar. Feed changes depend on Google's calendar updates.

The month picker and attendance calendar mark Korean holidays. Public holidays default to no classes/open gym. A holiday-specific workout must include explicit start times (`sessions`) and each class is one hour. This is configurable in the workout editor or the new `수업 시간(공휴일)` Excel column. Both server and import preview validate these times. Unreleased holiday workouts are subject to the same publication restrictions.

Additive schema migration: `drizzle/0001_notices_settings_holidays.sql`. Existing migrations remain unchanged. GitHub and Supabase connection/migration remain deferred by user request.
