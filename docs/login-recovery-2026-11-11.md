# Login bootstrap recovery

The whiteboard history addition passed a JavaScript array of objects directly to PostgREST `contains`. The pinned Supabase client's array overload emits PostgreSQL array syntax (`cs.{[object Object]}`), which is invalid for the JSONB `rows` column. Approved users' authenticated bootstrap therefore returned 503 after Auth succeeded. The deployed database logs confirmed `invalid input syntax for type json` at the same timestamps as failed bootstrap requests.

Serialize the JSONB array explicitly before passing it to `contains`, producing `cs.[{"participants":[{"memberId":"…"}]}]`. Keep the existing published-only, active-photo and own-participant filters. No auth or database access restrictions are relaxed.

The regression test uses the actual pinned Supabase client with intercepted HTTP, rather than a query-builder stub, and parses the exact generated JSONB containment predicate. Supabase `onoff-api` v36 contains the correction. The production query was also executed read-only under `service_role` with a nonexistent test member ID; no member records or notifications were created.
