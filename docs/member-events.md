# Saturday and member events

- On Saturday, **수업 등록·수정** offers one **Special Workout 등록·수정** button. Set the start times and sections as before. Home and TV show one course, with one shared **댓글** area beneath all sections.
- Saturday continues using the existing WOD storage key. Existing class contents, results, photos and comment ownership remain linked. Spreadsheet imports may use `Special Workout` on Saturday; new Saturday B/T registration is rejected by server validation.
- Christmas snow, the approved new Santa artwork and clickable encouragement gifts run **December 21–25, Korea time**, annually. The existing daily effect toggle remains. Reduced-motion mode offers a static gift instead of a moving sleigh.
- Successful improvements over an existing personal 1RM or NAMED WOD best trigger a brief gold celebration throughout the year. First records, tied/lower scores, failed saves, deletion and other members’ records do not trigger it. Time scores improve downward; round/repetition scores improve upward. Turn **개인설정 → 최고 기록 축하** off to stop these effects.
- **January 1–7, 2027**: “2027 / 새해의 나를 ON!” appears once per account after entry. The own account preference persists across devices; an owner-scoped local fallback prevents repeated display if saving that preference fails.
- The earliest saved attendance in 2027 produces a **2027 첫 운동 완료** stamp on the personal membership card. Accounts hiding their wallet see it in personal settings. Cancelled attendance does not keep a fabricated stamp.
- From **January 1, 2027**, **개인설정 → 2026 운동 결산 → 결산 보기** shows the own account’s saved 2026 attendance count and 1RM/NAMED WOD record counts, plus up to three best results per type. **결산 이미지 저장** creates a 1080 × 1350 PNG; supported phones open the native share/save sheet. The recap only describes records saved in the app.

`GET /api/member-milestones` binds the verified signed-in account; caller-supplied member IDs are ignored. Its service-only, security-invoker RPC aggregates complete history rather than the bootstrap’s 1,000-row subset. Unapproved/deleting accounts and direct anonymous/authenticated RPC access are denied. This feature adds no photo uploads, AI service or notification jobs.

Validation: Node tests, isolated browser fixtures and `supabase/member-milestones-tests.sql` transaction/rollback fixtures cover KST dates, score direction, denied saves, account isolation, attendance cancellation, export and responsive layouts. Browser fixtures route Auth/API requests to `approval-test.invalid` and never notify actual members.
