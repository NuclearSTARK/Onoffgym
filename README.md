# ONOFF CROSSFIT

Dark-only Korean gym app, with protected server-side workout publishing, XLSX imports, and movement videos. Existing Site identity and private audience retained.

## Development

- `npm test`: validation, release-boundary, approval, authorization and upload tests.
- `node scripts/dev.mjs`: local adapter at http://127.0.0.1:5173 using in-memory SQLite fixtures. Local-only test cookies `dev_user` and `dev_time` are consumed exclusively by this adapter and are not in the deployment artifact.
- `node qa.cjs`: Chromium integration tests (requires locally installed Playwright and Chromium).
- `python scripts/make-template.py`: rebuild blank workbook and separate example workbook (openpyxl).
- `npm run build`: deterministic dependency-free Worker build; embeds all web assets, copies the hosting manifest and migration SQL into `dist/`.

## Current operating backend

The GitHub Pages app now targets the representative-owned Supabase project. Kakao login is intentionally pending; the shared app requires a validated Auth session and operator approval. No temporary email login or real test account was created. An explicit `?preview=1#login` opens the existing isolated browser demo. The original owner-private Sites preview retains its D1 backend; its data was not copied into Supabase.

See [Supabase 연결·인수인계](docs/supabase-connection.md) for deployed schema/API, access controls, verification, the later Kakao setup and remaining limits. Web Push sending/scheduling, ranking aggregation and withdrawal are still pending separate integration. The older sections below document the retained D1 implementation unless explicitly referring to Supabase.

## Data and access

The Worker uses dispatch-owned Sites authentication headers and D1 (`DB`). `ONOFF_OWNER_EMAIL` is configured as a runtime secret, never bundled; only a matching authenticated Site identity is provisioned as owner/admin. Other signed-in accounts are pending until approved. Admins can approve/suspend members and grant member/coach/admin roles. Coaches manage workouts and movement videos but cannot grant roles. There is no client-side role switch or first-visitor-admin bootstrap. All mutations require same-origin JSON requests and server authorization.

Site hosting access remains owner-private; app roles do not grant Site hosting access. Broader member access and Kakao login are separate future integration steps. Do not tell members Kakao is connected. Attendance uses the in-app check-in button; GPS is not used.

Workout visibility: store `release_at` as the UTC instant corresponding to the previous day 22:00 Asia/Seoul. The server filters unreleased workouts out of member responses. Exactly 22:00 is inclusive. Staff can access all dates; staff member-view requests receive the same filtered workout response as a member. No cron or paid AI API is needed. The browser polls every 30 seconds and refreshes on visibility changes; a focused screen refreshes at the release boundary. Empty dates show preparation status; no example workout is substituted.

XLSX parsing uses vendored SheetJS CE 0.20.3 (Apache 2.0 license under web/assets). Only the 수업등록 sheet is imported; examples and instructions are separate sheets. Required headers, dates, Wednesday WOD-only rule, weekends, duplicates, sequential sections, related movements, scoring type, and YouTube URLs are validated in browser and again on server. Uploads are limited and D1 writes are atomic batches. Existing workouts require explicit overwrite confirmation in upload flow.

Movement video URLs are registered once in the movement library; related movement names attach videos to workouts. Optional per-workout overview videos are independently supported. Embeds use youtube-nocookie.com, valid HTTPS YouTube links only, with an external YouTube fallback. No video bytes are hosted.

## Existing preview features

Exercise results (including coach batch entry), personal PRs and regular community posts/comments still use browser-local storage, with clear in-app notices. Workout schedules, movement metadata and actual login-account roles use server storage. Old local draft workouts and fake members are never imported into the server. Connecting the remaining member-shared records and Kakao login is required before full gym operation.

## Deployment

Publish the exact pushed Git commit and archive built from it. Worker artifact: `dist/server/index.js`, `dist/.openai/hosting.json`, `dist/drizzle/0000_gym.sql`. Preserve project_id and hosting audience. D1 schema changes are migration-owned; never create tables during a request.

## Community notices, Korean holidays, and release-time settings

Announcements are persisted in `gym_notices`. Only approved admins can create/edit/delete or pin them, enforced at the API boundary. Pinned announcements appear before other community posts. Regular community posts remain the existing browser-local preview.

Release time is configurable by admins in Asia/Seoul (default 22:00) and persisted in `gym_settings`. A change atomically recalculates only unpublished workout release timestamps; already public workouts remain public, including when overwritten. The browser uses the server setting and published-date metadata for its release labels and checks.

The server synchronizes Google Calendar's Korean public-holidays-only ICS feed on access, at most daily, and supports an admin refresh. Only events described as public holidays are imported; observances are excluded. Lunar and substitute holidays come from dated feed entries. The most recently retrieved calendar is cached in D1. If retrieval fails, a bundled snapshot is available; no paid API key is required. Source and fallback state are visible in the calendar. Feed changes depend on Google's calendar updates.

The month picker and attendance calendar mark Korean holidays. Public holidays default to no classes/open gym. A holiday-specific workout must include explicit start times (`sessions`) and each class is one hour. This is configurable in the workout editor or the new `수업 시간(공휴일)` Excel column. Both server and import preview validate these times. Unreleased holiday workouts are subject to the same publication restrictions.

Additive schema migration: `drizzle/0001_notices_settings_holidays.sql`. Existing migrations remain unchanged. GitHub and Supabase connection/migration remain deferred by user request.

## Button attendance, login and mobile inputs

Attendance is now an approved-account server action at `/api/attendance`, with a unique member/Korean-date key. It ignores client-supplied dates. There is no geolocation request or location UI. The login design is at `/#login` (also the initial view); Kakao is clearly labelled as not connected. Mobile editable controls use at least 16px fonts to avoid iOS automatic input zoom without disabling user-controlled zoom. Time inputs and buttons are constrained to their container width.

Web Push uses Web Crypto (RFC 8291/8292), a notification-only service worker, opt-in subscriptions/preferences, explicit admin-notice sending and private per-user test notifications. Expired endpoints are removed; members must still be approved. The scheduled release handler and retry/deduplication queue are implemented, but unattended scheduling is not connected in the current preview. The UI shows that status. Runtime VAPID keys are never in source. Additive migration: `drizzle/0002_attendance_push.sql`.

GitHub workflow runs tests/builds and produces an artifact; it does not claim to deploy to external hosting. Supabase is connected for the Pages app; Kakao login remains pending. See [운영자 인수인계](docs/운영자-인수인계.md).

## Public GitHub Pages test

`npm run build:pages` creates an isolated static demonstration under `pages-dist/`. The Pages workflow deploys this output to `https://nuclearstark.github.io/Onoffgym/` after repository Pages is configured to use GitHub Actions. It contains public example data only. Login, role changes, attendance, workouts, notices and records are browser-local demonstrations. No real member API or notifications are called. The public test notice stays visible. This is separate from the existing authenticated Sites backend; The Pages backend now uses Supabase; the explicit demo stays isolated.

The repository must be Public for the chosen free Pages configuration. In Settings → Pages, set Source to GitHub Actions once. Afterward, a main-branch push runs tests, builds the test site and deploys it automatically. Local test: serve `pages-dist` at the `/Onoffgym/` path and run `node qa-pages.cjs` against port 5183.

## ONOFF app icon identity

The app declares its own Apple home-screen icon, PNG/ICO favicons, ONOFF name and Web App Manifest. Manifest identity, scope, start URL and icon paths are project-relative so the GitHub Pages app stays under `/Onoffgym/` instead of reusing another app on the same GitHub hostname. Versioned icon filenames avoid stale asset URLs. Existing iOS home-screen shortcuts may need to be removed and added again after deployment. The square approved icon master is retained under `web/assets/`; `scripts/build-icons.mjs` exports the committed PNG/ICO variants if the optional `sharp` encoder is installed. Normal builds do not require it.

## Folder menus, home banner, and coach entry

The primary navigation is Home, Member Records, My Records, and Community, plus Operations for approved staff. My Records opens folder cards for workout history, 1RM, and attendance; `#records/rm` contains the existing movement cards and the percentage calculator. Legacy `#rm` links redirect into this folder. Operations opens folder cards rather than displaying every form at once. The banner, release time, and member permissions folders are admin-only.

Home banner text, enabled state and one of three colors (blue, mint, amber) are stored as the `banner` key in `gym_settings`; no new migration is needed. `/api/banner` validates changes and rejects members, coaches, and unapproved users. Approved members receive the current banner at bootstrap; the isolated Pages demo keeps this configuration in its browser-local demo state. The scrolling banner is above the home introduction and respects reduced-motion settings.

Operations → Coach Entry selects date, program, class start time and scoring section. Approved members appear with result and optional note fields. Enter advances to the next visible member. Search hides rows without discarding their input, and drafts survive changes of class or section within the current page session. All nonempty rows validate before any write. Empty rows never delete results; changing an existing result requires the overwrite checkbox. Matching uses member ID, date, program, start time and section. Saving the current account's 1RM result also updates that account's 1RM history. Other members' personal 1RM sharing awaits the shared-record backend.

The calculator uses saved successful 1RM weights, stored canonically in lbs, for fixed percentage buttons and a custom 1–150% input. Changing display units does not change the saved weight. Calculated values are mathematical weights, not automatic plate combinations. Records in this public test remain browser-local; Shared Supabase storage is implemented; actual Kakao authentication and real-user testing remain pending.

## Approval queue and unsaved input

The member approval menu is the first Operations card for admins. Pending counts appear on that card and the desktop/mobile Operations navigation; coaches, members and staff member-preview mode do not receive these indicators. Member management initially shows pending applications, with separate approved/suspended filters and name search. Quick approval grants the member role; promotion to coach/admin and status changes live in a separate member detail form. Existing server-side admin checks still enforce these writes.

Feature cards use a single semantic line icon on a muted color background. Class labels share the same right-hand grid slot; OPEN GYM adapts its type size to its card width, including narrow tablet layouts.

Unsaved form values are compared to the initial rendered values. Changed forms ask before in-app navigation, hash/back navigation, modal dismissal and Escape. Browser refresh/close uses the browser's standard beforeunload warning where supported. Successful saves clear the warning. Batch class/section changes preserve in-session drafts; unsaved changes in another class still trigger a warning when leaving coach entry. Choosing to leave discards those drafts. Search and batch filters do not independently count as unsaved edits.

## TV display, themes, and membership management

The public test TV entry is `tv.html` under the same project path. It uses the approved borderless two-column layout, with B/T on the left and WOD on the right, and WOD alone on Wednesdays. The real `/api/tv/bootstrap` API returns exactly one server-selected date: today's workouts before the configured Korean release time, then the next day's released workouts from that time onward. It preserves that workout through midnight and ignores requested date overrides. The display polls every 30 seconds and checks the release boundary every second while open. Long content is paginated; remote left/right changes pages and Escape opens controls. TV-browser fullscreen is requested only by user interaction when supported. The supplied ONOFF artwork has its original contours converted into paths in `web/assets/onoff-logo-v4.svg` and recolored using a CSS mask; the unchanged source is retained as `web/assets/onoff-logo-original-v3.jpg`. No replacement lettering is generated.

On the static public Pages test, TV uses example data and browser-local settings. The initial public demonstration PIN is **0000**; it is explicitly a demo credential and protects no real data. TV PINs are exactly four numeric digits, including leading zeroes. Legacy configured passwords must be replaced with a four-digit PIN in TV administration before a new login; they are not silently reset. A TV PIN changed in a demo browser only changes that browser's demo configuration. The actual Worker has no default PIN: an approved admin configures it at Operations → TV mode. Real authentication uses salted PBKDF2-SHA256 (100,000 iterations), a rate limit, a 30-day random server session stored as a digest, and an HttpOnly/SameSite cookie (Secure on HTTPS). Password changes or admin revocation clear sessions. A TV session cannot authenticate member APIs or expose other dates, member identities, notes, or membership data. The existing owner-private Sites hosting audience remains unchanged; anonymous TV access to real data requires the later publicly reachable authentication/backend integration. Kakao remains unconnected; Supabase is now the Pages app backend.

Member management supports 1/3/6/12-month period passes and count passes, registration, extension, pause/resume, explicit corrections with a reason, and audit history. Period-end dates are inclusive and may be overridden by an admin. Resume extends a pass by the elapsed Korean calendar days of the pause; count balances remain unchanged. Attendance debits once per member/Korean day in an atomic DB batch, and the last visit remains usable on that day. Attendance cancellation is idempotent and refunds only the same pass ID that originally paid for it. Replacement passes do not receive refunds from prior passes. Registered expired/paused/future passes restrict workout access while personal local records and 1RM remain accessible. Approved legacy accounts without a registered pass retain access during initial setup; admins should register their passes. Staff can still operate the app regardless of their own pass.

Admin-only distinguishing-note edits are shown only to staff for member selection, and records use stable member IDs. Ordinary member bootstrap contains no staff notes. The personal settings page contains the pass summary, three themes, ranking preference, collapsed notification details, and account info. Login-preview, movement-library and connection-status shortcuts are removed from settings; the movement library remains reachable through exercise links and staff tools. The decorative sidebar ON arrow is removed. Actual Kakao account sign-out remains part of the later Kakao integration.

Additive migration `drizzle/0003_membership_tv.sql` owns pass, audit, note and TV-session tables plus attendance debit metadata. Worker builds include the shared membership logic and services. Public Pages continues to use only isolated browser-local demonstration data; no real membership, notes, passwords, credentials, or session data is packaged into the GitHub repository.

## Two roles and fixed TV styling

Only `member` and `admin` may now be assigned. Admins manage classes, bulk result entry, approvals, membership passes, notes, notices and TV settings. Migration `0004_two_roles.sql` converts legacy limited `coach` accounts into members rather than granting them new full administrative rights. Administrators explicitly promote the people who need operator access. Runtime and demo normalization cover old cached accounts; new coach assignments are rejected by the API. Existing member approval is still required.

The member detail modal uses a single input column on phones, zero-minimum grid/form widths, bounded native date inputs, vertical scrolling and a scroll-locked background. Pinned community notices and their tags use the active app theme colors. Date selection now opens the calendar by tapping the displayed date; the daily previous/next arrows are removed, with a separate Today shortcut when viewing another date. Unreleased dates stay unavailable to members.

TV no longer has whole-screen themes. The background is fixed charcoal, the exact original logo/date/clock stay white, and B/T and WOD each choose one of eight preset colors. Defaults are blue and orange. The selected course color applies to the compact program header, the side rule and S1/S2 badges (about 32px at Full HD). App personal themes remain unchanged. Course defaults are stored through TV administration; individual TVs may override either course color in local storage, or reset to the operator settings. Legacy TV theme settings are read compatibly but omitted from the new preference response.


## Fixed mobile header and privacy drafts

The public-test notice and app header share one sticky container. Top, bottom and landscape side safe areas are applied to headers, content and navigation; mobile shows one personal-settings gear. Home uses a compact released-next-day link beside the date selector instead of a next-workout notice card. Dates identify today/tomorrow, and empty states distinguish unreleased, closed, open gym and not-yet-registered workouts. A released-next-day link appears only if a workout exists. A scroll-to-top button appears after scrolling 500px.

`web/privacy.js` contains the privacy-policy, rights/contact and withdrawal screen drafts. Replace `PRIVACY_DETAILS` confirmation fields and review the policy against actual processing before real signup. Links are reachable from login, the footer and personal settings. The drafts deliberately do not fabricate business details, retention periods, a contact address or Supabase transfer details. Real Kakao unlinking, Auth/DB deletion and withdrawal requests are not connected; the withdrawal execution button is disabled and labelled accordingly. Public tests must use example data only. Ranking calculations also remain pending integration; see `docs/handover-test-plan.md`.


## Compact home, personal 1RM catalogue and current handoff

Home contains the notice, selected date with attendance button, a single-line nearest-class summary, equal-width B/T and WOD tabs, selected workout content and timetable. The large greeting and release countdown card are removed. A next-day link appears beside the date only when the next workout exists and is released. Home has no record-entry buttons or section record/history/results shortcuts; these remain in the records and operator screens. Personal percentage weights share one unit label. Attendance summaries, result previews and the movement-library promotion are kept out of home. Phone timetables default to collapsed; desktop timetables default to expanded. Exercise links stay compact. Attendance calendars use a stable emoji for each attended Korean date.

`web/rm-catalogue.js` provides 27 categorized movements with six defaults. Members manage their own visible items; operators add, rename, categorize, change defaults or deactivate common entries under Operations → 1RM. Catalogue IDs remain stable and former names remain aliases, including Strict Press → Shoulder Press and supplied spelling corrections. Existing records are not deleted by hiding/deactivating a movement. Class sections show the signed-in member's 50/60/70/80/90% reference for an exact linked movement; lbs stays canonical and kg is a display conversion. Multiple eligible movements use a single selector. TV never renders personal 1RM references.

Desktop login follows the approved split layout; phone login uses the centered original logo over the blue patterned header. Footer typography and legal links align, and Instagram points to https://www.instagram.com/onoff.ilguang/. Confirmed operator data is in `web/privacy.js`; retention, effective date and integration-dependent policy details remain drafts.

Approved members cannot self-rename via the UI or API. Operators correct names while IDs, memberships and attendance stay unchanged. Local records, 1RM and post ownership use IDs; ambiguous name-only legacy data is retained for explicit operator association. The catalogue and member identity migrations do not guess ownership from names.

Migration `0005_tv_status.sql` adds acknowledged TV display status. Authorized operators see last update, confirmed display date, effective course colors and stale status after 90 seconds. Updates do not reset unsaved TV settings. The public Pages demo labels this as browser-local testing; it does not claim phone-to-TV sharing. The Pages app is configured for authenticated Supabase storage. Kakao authentication and real-user/multi-device testing are deferred by user request.

The latest supplied ONOFF logo, including its original tagline, is used in login, app navigation, TV and versioned v4 browser/home-screen icons. App themes tint the original artwork; TV remains white.

The v4 logo uses paths traced from the supplied artwork, without embedded JPEGs, runtime color filters or substituted fonts. Its original JPEG remains unchanged. Theme masks tint those paths; versioned SVG and app icon URLs bypass previous image caches.
