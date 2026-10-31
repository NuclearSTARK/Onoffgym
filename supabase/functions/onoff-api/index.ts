// supabase/functions/onoff-api/entry.js
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// web/core.js
var MOVEMENTS = ["Front Squat", "Back Squat", "Deadlift", "Clean", "Clean & Jerk", "Snatch", "Power Snatch", "Squat Snatch", "Strict Press", "Push Press", "Split Jerk", "Row", "Box Step Over", "Pull-up", "Ring Dip", "Burpee"];
var KINDS = ["\uC5C6\uC74C", "\uC911\uB7C9", "1RM", "\uC2DC\uAC04", "\uD69F\uC218", "\uB77C\uC6B4\uB4DC + \uD69F\uC218", "\uCE7C\uB85C\uB9AC", "\uC138\uD2B8\uBCC4 \uD69F\uC218\xB7\uCE7C\uB85C\uB9AC", "\uC644\uB8CC \uC5EC\uBD80"];
var DEFAULT_BANNER = { enabled: true, text: "\uC628\uC624\uD504\uC640 \uD568\uAED8, \uC624\uB298\uC758 \uB098\uB97C \uCF1C\uBCF4\uC138\uC694! \xB7 \uC6B4\uB3D9 \uD6C4 \uB098\uC758 \uAE30\uB85D\uC744 \uB0A8\uACA8\uC8FC\uC138\uC694.", color: "blue" };
function validBanner(b) {
  return !!b && typeof b.enabled === "boolean" && typeof b.text === "string" && b.text.trim().length > 0 && b.text.length <= 500 && ["blue", "mint", "amber"].includes(b.color);
}
function kstDate(now = /* @__PURE__ */ new Date()) {
  return new Date(+now + 9 * 36e5).toISOString().slice(0, 10);
}
function addDays(date, days) {
  return new Date(Date.parse(date + "T12:00:00+09:00") + days * 864e5).toISOString().slice(0, 10);
}
function releaseAt(date, time = "22:00") {
  return Date.parse(addDays(date, -1) + "T" + time + ":00+09:00");
}
function isReleased(date, now = /* @__PURE__ */ new Date(), time = "22:00") {
  return +now >= releaseAt(date, time);
}
function tvWorkoutDate(now = /* @__PURE__ */ new Date(), time = "22:00") {
  const date = kstDate(now);
  return isReleased(addDays(date, 1), now, time) ? addDays(date, 1) : date;
}
function workoutDayState(date, holidays = {}) {
  const day = (/* @__PURE__ */ new Date(date + "T12:00:00+09:00")).getUTCDay();
  return holidays[date] ? "holiday" : day === 0 ? "rest" : day === 6 ? "open-gym" : "class";
}
function normalizeDate(v) {
  const m = String(v ?? "").trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const s = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if (!Number.isFinite(Date.parse(s + "T00:00:00Z")) || (/* @__PURE__ */ new Date(s + "T00:00:00Z")).toISOString().slice(0, 10) !== s) return null;
  return s;
}
function youtubeId(value) {
  if (!value) return "";
  try {
    const u = new URL(String(value));
    if (u.protocol !== "https:") return null;
    const h = u.hostname.replace(/^www\./, "");
    let id;
    if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(h)) {
      id = u.searchParams.get("v") || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
function normalizeRows(rows, library = MOVEMENTS, holidays = {}) {
  const errors = [], groups = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set();
  const canonical = new Map(library.map((n) => [n.toLowerCase(), n]));
  if (!Array.isArray(rows) || rows.length > 1e3) return { errors: ["\uCD5C\uB300 1,000\uD589\uAE4C\uC9C0 \uB4F1\uB85D\uD560 \uC218 \uC788\uC5B4\uC694."], workouts: [] };
  rows.forEach((r, i) => {
    if (!Object.values(r).some((v) => String(v).trim())) return;
    const line = i + 2, date = normalizeDate(r["\uB0A0\uC9DC"]), program = String(r["\uC218\uC5C5"] || "").trim().toUpperCase(), sm = String(r["\uAD6C\uAC04"] || "").trim().toUpperCase().match(/^S?([1-9]\d?)$/), title = String(r["\uC81C\uBAA9"] || "").trim(), text2 = String(r["\uC6B4\uB3D9 \uB0B4\uC6A9"] || "").trim(), kind = String(r["\uAE30\uB85D \uC885\uB958"] || "\uC5C6\uC74C").trim(), movementText = String(r["\uAD00\uB828 \uB3D9\uC791"] || "").trim(), overview = String(r["\uC624\uB298 \uC6B4\uB3D9 \uC124\uBA85 \uC601\uC0C1"] || "").trim();
    const issues = [];
    if (!date) issues.push("\uB0A0\uC9DC\uB294 YYYY-MM-DD \uD615\uC2DD\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!["B/T", "WOD"].includes(program)) issues.push("\uC218\uC5C5\uC740 B/T \uB610\uB294 WOD\uB9CC \uC785\uB825\uD560 \uC218 \uC788\uC5B4\uC694.");
    if (date) {
      const day = (/* @__PURE__ */ new Date(date + "T12:00:00+09:00")).getUTCDay();
      if ([0, 6].includes(day) && !holidays[date]) issues.push("\uD1A0\xB7\uC77C\uC694\uC77C\uC740 \uC815\uADDC \uC218\uC5C5 \uB4F1\uB85D \uB300\uC0C1\uC774 \uC544\uB2C8\uC5D0\uC694.");
      if (day === 3 && program === "B/T" && !holidays[date]) issues.push("\uC218\uC694\uC77C\uC5D0\uB294 WOD\uB9CC \uB4F1\uB85D\uD560 \uC218 \uC788\uC5B4\uC694.");
    }
    if (!sm) issues.push("\uAD6C\uAC04\uC740 S1\uBD80\uD130 S99\uAE4C\uC9C0 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!title || title.length > 100) issues.push("\uC81C\uBAA9\uC740 1~100\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!text2 || text2.length > 5e3) issues.push("\uC6B4\uB3D9 \uB0B4\uC6A9\uC740 1~5,000\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!KINDS.includes(kind)) issues.push("\uAE30\uB85D \uC885\uB958\uB97C \uC591\uC2DD\uC758 \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
    const ms = movementText ? movementText.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean) : [];
    const movements = ms.map((n) => canonical.get(n.toLowerCase()) || "");
    if (movements.some((n) => !n)) issues.push("\uB4F1\uB85D\uB418\uC9C0 \uC54A\uC740 \uAD00\uB828 \uB3D9\uC791\uC774 \uC788\uC5B4\uC694. \uC6B4\uB3D9 \uC0AC\uC804\uC5D0 \uBA3C\uC800 \uB4F1\uB85D\uD574\uC8FC\uC138\uC694.");
    if (kind === "1RM" && movements.length !== 1) issues.push("1RM \uAD6C\uAC04\uC740 \uAD00\uB828 \uB3D9\uC791\uC744 \uC815\uD655\uD788 \uD558\uB098 \uC9C0\uC815\uD574\uC8FC\uC138\uC694.");
    const overviewId = overview ? youtubeId(overview) : "";
    if (overview && !overviewId) issues.push("\uC720\uD6A8\uD55C \uC720\uD29C\uBE0C \uC601\uC0C1 \uC8FC\uC18C\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    const times = String(r["\uC218\uC5C5 \uC2DC\uAC04(\uACF5\uD734\uC77C)"] || "").split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
    if (holidays[date] && !times.length) issues.push("\uACF5\uD734\uC77C \uD2B9\uBCC4 \uC218\uC5C5\uC758 \uC2DC\uC791 \uC2DC\uAC01\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t) || t > "23:00") || new Set(times).size !== times.length) issues.push("\uC218\uC5C5 \uC2DC\uAC04\uC740 00:00~23:00 \uC0AC\uC774 HH:mm\uC73C\uB85C \uC911\uBCF5 \uC5C6\uC774 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    const duplicateKey = `${date}_${program}_${sm?.[1]}`;
    if (seen.has(duplicateKey)) issues.push("\uAC19\uC740 \uB0A0\uC9DC\xB7\uC218\uC5C5\xB7\uAD6C\uAC04\uC774 \uD30C\uC77C\uC5D0 \uC911\uBCF5\uB418\uC5B4 \uC788\uC5B4\uC694.");
    seen.add(duplicateKey);
    if (issues.length) {
      errors.push(...issues.map((x) => `${line}\uD589: ${x}`));
      return;
    }
    const key = `${date}_${program}`;
    let w = groups.get(key);
    if (!w) {
      w = { date, program, title: program === "WOD" ? "Work of the Day" : "Body Training", sections: [], overviewId: "", sessions: times };
      groups.set(key, w);
    }
    if (w.sessions.join(",") !== times.join(",")) {
      errors.push(`${line}\uD589: \uAC19\uC740 \uC218\uC5C5\uC758 \uC2DC\uC791 \uC2DC\uAC01\uC774 \uC11C\uB85C \uB2EC\uB77C\uC694.`);
      return;
    }
    if (overviewId) {
      if (w.overviewId && w.overviewId !== overviewId) {
        errors.push(`${line}\uD589: \uAC19\uC740 \uC218\uC5C5\uC758 \uC124\uBA85 \uC601\uC0C1 \uC8FC\uC18C\uAC00 \uC11C\uB85C \uB2EC\uB77C\uC694.`);
        return;
      }
      w.overviewId = overviewId;
    }
    w.sections.push({ number: +sm[1], title, text: text2, record: kind !== "\uC5C6\uC74C", kind, movements, movement: movements[0] || "" });
  });
  for (const w of groups.values()) {
    w.sections.sort((a, b) => a.number - b.number);
    if (w.sections.some((s, i) => s.number !== i + 1)) errors.push(`${w.date} ${w.program}: \uAD6C\uAC04\uC744 S1\uBD80\uD130 \uBE60\uC9D0\uC5C6\uC774 \uC785\uB825\uD574\uC8FC\uC138\uC694.`);
  }
  return { errors, workouts: [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.program.localeCompare(b.program)) };
}
function validateWorkouts(workouts, library = MOVEMENTS, holidays = {}) {
  if (!Array.isArray(workouts) || !workouts.length || workouts.length > 250) return { errors: ["1~250\uAC1C \uC218\uC5C5\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694."], workouts: [] };
  const rows = [];
  for (const w of workouts) {
    if (!Array.isArray(w.sections) || !w.sections.length) return { errors: ["\uC218\uC5C5 \uAD6C\uAC04\uC774 \uBE44\uC5B4 \uC788\uC5B4\uC694."], workouts: [] };
    w.sections.forEach((s, i) => rows.push({ "\uB0A0\uC9DC": w.date, "\uC218\uC5C5": w.program, "\uAD6C\uAC04": "S" + (i + 1), "\uC81C\uBAA9": s.title, "\uC6B4\uB3D9 \uB0B4\uC6A9": s.text, "\uAE30\uB85D \uC885\uB958": s.record ? s.kind : "\uC5C6\uC74C", "\uAD00\uB828 \uB3D9\uC791": (s.movements?.length ? s.movements : s.movement ? [s.movement] : []).join("; "), "\uC624\uB298 \uC6B4\uB3D9 \uC124\uBA85 \uC601\uC0C1": w.overviewId ? "https://youtu.be/" + w.overviewId : "", "\uC218\uC5C5 \uC2DC\uAC04(\uACF5\uD734\uC77C)": (w.sessions || []).join(", ") }));
  }
  return normalizeRows(rows, library, holidays);
}

// web/holidays.js
var HOLIDAY_SOURCE = "https://calendar.google.com/calendar/ical/ko.south_korea.official%23holiday%40group.v.calendar.google.com/public/basic.ics";
var HOLIDAY_FALLBACK = { "2025-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2029-02-13": { "name": "\uC124\uB0A0", "substitute": false }, "2021-10-04": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uAC1C\uCC9C\uC808", "substitute": true }, "2021-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2022-02-01": { "name": "\uC124\uB0A0", "substitute": false }, "2022-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2022-05-08": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2022-06-01": { "name": "\uC9C0\uBC29\uC120\uAC70\uC77C", "substitute": false }, "2022-09-09": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2022-09-12": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uCD94\uC11D \uC5F0\uD734", "substitute": true }, "2022-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2022-10-10": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uD55C\uAE00\uB0A0", "substitute": true }, "2023-01-24": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2023-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2024-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2024-02-10": { "name": "\uC124\uB0A0", "substitute": false }, "2024-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2024-09-18": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2024-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2025-01-30": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2025-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2025-10-05": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2025-10-07": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2026-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2026-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2027-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2027-09-15": { "name": "\uCD94\uC11D", "substitute": false }, "2027-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2027-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2028-01-26": { "name": "\uC124\uB0A0", "substitute": false }, "2028-01-27": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2028-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2028-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2028-10-02": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2028-10-03": { "name": "\uCD94\uC11D", "substitute": false }, "2028-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2029-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2029-09-22": { "name": "\uCD94\uC11D", "substitute": false }, "2029-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2021-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2021-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2021-08-16": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uAD11\uBCF5\uC808", "substitute": true }, "2021-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2022-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2022-02-02": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2022-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2022-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2022-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2022-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2023-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2023-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2023-05-27": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2023-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2023-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2023-09-28": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2024-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2024-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2024-05-06": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC5B4\uB9B0\uC774\uB0A0", "substitute": true }, "2024-09-17": { "name": "\uCD94\uC11D", "substitute": false }, "2024-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2025-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2025-01-29": { "name": "\uC124\uB0A0", "substitute": false }, "2025-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2026-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2026-02-17": { "name": "\uC124\uB0A0", "substitute": false }, "2026-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2027-02-08": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2027-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2027-05-13": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2027-09-14": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2027-10-11": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uD55C\uAE00\uB0A0", "substitute": true }, "2028-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2029-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2021-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2021-02-13": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2021-09-20": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2021-09-21": { "name": "\uCD94\uC11D", "substitute": false }, "2021-09-22": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2021-10-11": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uD55C\uAE00\uB0A0", "substitute": true }, "2021-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2022-01-31": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2022-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2023-01-23": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2023-05-29": { "name": "\uC11D\uAC00\uD0C4\uC2E0\uC77C \uB300\uCCB4\uACF5\uD734\uC77C", "substitute": false }, "2023-09-29": { "name": "\uCD94\uC11D", "substitute": false }, "2023-09-30": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2023-10-02": { "name": "\uCD94\uC11D (\uB300\uCCB4\uACF5\uD734\uC77C)", "substitute": false }, "2023-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2023-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2024-02-09": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2024-02-12": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2024-05-15": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2024-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2025-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2025-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2026-02-18": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2026-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2026-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2026-09-24": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2026-09-26": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2027-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2027-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2027-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2028-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2028-05-02": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2028-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2029-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2029-05-20": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2029-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2029-09-21": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2029-09-23": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2029-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2021-02-12": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2021-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2021-05-19": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2021-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2022-03-09": { "name": "\uB300\uD1B5\uB839 \uC120\uAC70", "substitute": false }, "2022-09-10": { "name": "\uCD94\uC11D", "substitute": false }, "2022-09-11": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2023-01-21": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2023-01-22": { "name": "\uC124\uB0A0", "substitute": false }, "2023-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2024-02-11": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2024-04-10": { "name": "\uAD6D\uD68C\uC758\uC6D0\uC120\uAC70\uC77C", "substitute": false }, "2024-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2025-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2025-10-06": { "name": "\uCD94\uC11D", "substitute": false }, "2025-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2026-05-24": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2026-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2026-09-25": { "name": "\uCD94\uC11D", "substitute": false }, "2026-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2027-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2027-09-16": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2028-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2028-10-04": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2029-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2029-02-14": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2029-09-24": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uCD94\uC11D \uC5F0\uD734", "substitute": true }, "2029-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2024-10-01": { "name": "\uAD6D\uAD70\uC758\uB0A0", "substitute": false }, "2025-01-28": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2026-05-25": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": true }, "2029-05-21": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": true }, "2026-02-16": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2026-03-02": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC0BC\uC77C\uC808", "substitute": true }, "2025-03-03": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC0BC\uC77C\uC808", "substitute": true }, "2025-05-06": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC5B4\uB9B0\uC774\uB0A0", "substitute": true }, "2025-10-08": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uCD94\uC11D \uC5F0\uD734", "substitute": true }, "2030-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2030-02-04": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2030-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2030-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2030-05-09": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2030-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2030-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2030-09-11": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2030-09-12": { "name": "\uCD94\uC11D", "substitute": false }, "2030-09-13": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2030-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2030-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2030-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2025-01-27": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2025-06-03": { "name": "\uB300\uD1B5\uB839 \uC120\uAC70", "substitute": false }, "2026-06-03": { "name": "\uC9C0\uBC29\uC120\uAC70\uC77C", "substitute": false }, "2026-08-17": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uAD11\uBCF5\uC808", "substitute": true }, "2026-10-05": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uAC1C\uCC9C\uC808", "substitute": true }, "2031-01-01": { "name": "\uC0C8\uD574\uCCAB\uB0A0", "substitute": false }, "2031-01-23": { "name": "\uC124\uB0A0", "substitute": false }, "2031-01-24": { "name": "\uC124\uB0A0 \uC5F0\uD734", "substitute": false }, "2031-03-01": { "name": "\uC0BC\uC77C\uC808", "substitute": false }, "2031-03-03": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC0BC\uC77C\uC808", "substitute": true }, "2031-05-05": { "name": "\uC5B4\uB9B0\uC774\uB0A0", "substitute": false }, "2031-05-28": { "name": "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", "substitute": false }, "2031-06-06": { "name": "\uD604\uCDA9\uC77C", "substitute": false }, "2031-08-15": { "name": "\uAD11\uBCF5\uC808", "substitute": false }, "2031-09-30": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2031-10-01": { "name": "\uCD94\uC11D", "substitute": false }, "2031-10-02": { "name": "\uCD94\uC11D \uC5F0\uD734", "substitute": false }, "2031-10-03": { "name": "\uAC1C\uCC9C\uC808", "substitute": false }, "2031-10-09": { "name": "\uD55C\uAE00\uB0A0", "substitute": false }, "2031-12-25": { "name": "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": false }, "2026-07-17": { "name": "\uC81C\uD5CC\uC808", "substitute": false }, "2027-07-17": { "name": "\uC81C\uD5CC\uC808", "substitute": false }, "2028-07-17": { "name": "\uC81C\uD5CC\uC808", "substitute": false }, "2029-07-17": { "name": "\uC81C\uD5CC\uC808", "substitute": false }, "2030-07-17": { "name": "\uC81C\uD5CC\uC808", "substitute": false }, "2031-07-17": { "name": "\uC81C\uD5CC\uC808", "substitute": false }, "2026-05-01": { "name": "\uB178\uB3D9\uC808", "substitute": false }, "2027-05-01": { "name": "\uB178\uB3D9\uC808", "substitute": false }, "2027-05-03": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uB178\uB3D9\uC808", "substitute": true }, "2028-05-01": { "name": "\uB178\uB3D9\uC808", "substitute": false }, "2029-05-01": { "name": "\uB178\uB3D9\uC808", "substitute": false }, "2030-05-01": { "name": "\uB178\uB3D9\uC808", "substitute": false }, "2031-05-01": { "name": "\uB178\uB3D9\uC808", "substitute": false }, "2027-02-07": { "name": "\uC124\uB0A0", "substitute": false }, "2027-02-09": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC124\uB0A0", "substitute": true }, "2027-07-19": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uC81C\uD5CC\uC808", "substitute": true }, "2027-08-16": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uAD11\uBCF5\uC808", "substitute": true }, "2027-10-04": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uAC1C\uCC9C\uC808", "substitute": true }, "2027-12-27": { "name": "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 \uD06C\uB9AC\uC2A4\uB9C8\uC2A4", "substitute": true } };
function parseHolidayCalendar(text2) {
  const unfolded = text2.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const dates = {};
  for (const event of unfolded.split("BEGIN:VEVENT").slice(1)) {
    if (/STATUS:CANCELLED/.test(event)) continue;
    const start = event.match(/(?:^|\n)DTSTART;VALUE=DATE:(\d{8})/), summary = event.match(/(?:^|\n)SUMMARY:(.+)/), description = event.match(/(?:^|\n)DESCRIPTION:(.+)/);
    if (!start || !summary || !description || !description[1].includes("\uACF5\uD734\uC77C")) continue;
    const value = start[1], date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, name = summary[1].trim().replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";"), substitute = /^(쉬는 날|대체공휴일)/.test(name);
    dates[date] = { name: name.replace(/^쉬는 날 /, "\uB300\uCCB4\uACF5\uD734\uC77C \xB7 "), substitute };
  }
  if (Object.keys(dates).length < 10) throw Error("\uACF5\uD734\uC77C \uCE98\uB9B0\uB354 \uC751\uB2F5\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return dates;
}

// web/rm-catalogue.js
var RM_CATEGORIES = [["squat", "\uC2A4\uCFFC\uD2B8"], ["press", "\uD504\uB808\uC2A4\xB7\uC800\uD06C"], ["deadlift", "\uB370\uB4DC\uB9AC\uD504\uD2B8"], ["clean", "\uD074\uB9B0"], ["snatch", "\uC2A4\uB0B4\uCE58"], ["complex", "\uBCF5\uD569 \uB3D9\uC791"]];
var rmSeeds = [
  ["back-squat", "Back Squat", "squat", true],
  ["front-squat", "Front Squat", "squat", true],
  ["overhead-squat", "Overhead Squat", "squat"],
  ["shoulder-press", "Shoulder Press", "press", true, ["Strict Press"]],
  ["bench-press", "Bench Press", "press"],
  ["push-press", "Push Press", "press"],
  ["push-jerk", "Push Jerk", "press"],
  ["split-jerk", "Split Jerk", "press"],
  ["deadlift", "Deadlift", "deadlift", true],
  ["sumo-deadlift", "Sumo Deadlift", "deadlift"],
  ["power-clean", "Power Clean", "clean", true],
  ["squat-clean", "Squat Clean", "clean"],
  ["muscle-clean", "Muscle Clean", "clean"],
  ["hang-power-clean", "Hang Power Clean", "clean"],
  ["hang-squat-clean", "Hang Squat Clean", "clean", false, ["Hang Sqaut Clean"]],
  ["power-snatch", "Power Snatch", "snatch"],
  ["squat-snatch", "Squat Snatch", "snatch", true, ["Sqaut Snatch"]],
  ["muscle-snatch", "Muscle Snatch", "snatch"],
  ["hang-power-snatch", "Hang Power Snatch", "snatch"],
  ["hang-squat-snatch", "Hang Squat Snatch", "snatch", false, ["Hang Sqaut Snatch"]],
  ["snatch-balance", "Snatch Balance", "snatch", false, ["Snatch Blance"]],
  ["clean-jerk", "Clean & Jerk", "complex"],
  ["clean-split-jerk", "Clean & Split Jerk", "complex"],
  ["power-clean-jerk", "Power Clean & Jerk", "complex"],
  ["power-clean-split-jerk", "Power Clean & Split Jerk", "complex"],
  ["thruster", "Thruster", "complex"],
  ["cluster", "Cluster", "complex"]
];
var DEFAULT_RM_CATALOGUE = rmSeeds.map(([id, name, category, isDefault = false, aliases = []]) => ({ id, name, category, isDefault, active: true, aliases }));
var rmKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
function findRmMovement(catalogue, value) {
  return catalogue.find((m) => m.id === value) || catalogue.find((m) => [m.name, ...m.aliases || []].some((n) => rmKey(n) === rmKey(value)));
}
function updateRmCatalogue(catalogue, body, idFactory = () => crypto.randomUUID()) {
  if (!body || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 80) throw Error("\uC885\uBAA9 \uC774\uB984\uC744 2~80\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
  if (!RM_CATEGORIES.some((c) => c[0] === body.category) || typeof body.active !== "boolean" || typeof body.isDefault !== "boolean") throw Error("\uBD84\uB958\xB7\uAE30\uBCF8 \uD45C\uC2DC\xB7\uC0AC\uC6A9 \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const old = body.id ? catalogue.find((m) => m.id === body.id) : null;
  if (body.id && !old) throw Error("\uC218\uC815\uD560 \uC885\uBAA9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  const name = body.name.trim().replace(/\s+/g, " ");
  if (catalogue.some((m) => m.id !== old?.id && [m.name, ...m.aliases || []].some((n) => rmKey(n) === rmKey(name)))) throw Error("\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC885\uBAA9 \uC774\uB984\uC774\uC5D0\uC694.");
  if (!old && catalogue.length >= 250) throw Error("\uC885\uBAA9\uC740 \uCD5C\uB300 250\uAC1C\uAE4C\uC9C0 \uB4F1\uB85D\uD560 \uC218 \uC788\uC5B4\uC694.");
  const aliases = [.../* @__PURE__ */ new Set([...old?.aliases || [], ...old && old.name !== name ? [old.name] : []])].filter((n) => rmKey(n) !== rmKey(name));
  const movement = { id: old?.id || "custom-" + idFactory(), name, category: body.category, active: body.active, isDefault: body.active && body.isDefault, aliases };
  return { movement, catalogue: old ? catalogue.map((m) => m.id === old.id ? movement : m) : [...catalogue, movement] };
}

// web/membership.js
function memberDays(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}
function periodEnd(start, months) {
  if (!normalizeDate(start) || ![1, 3, 6, 12].includes(Number(months))) throw Error("\uC2DC\uC791\uC77C\uACFC \uAE30\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const d = /* @__PURE__ */ new Date(start + "T00:00:00Z"), day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return addDays(d.toISOString().slice(0, 10), -1);
}
function membershipState(pass, today, attendedToday = false) {
  if (!pass) return { status: "unregistered", label: "\uD68C\uC6D0\uAD8C \uBBF8\uB4F1\uB85D", active: true, soon: false };
  if (pass.paused_at) return { status: "paused", label: "\uD734\uD68C \uC911", active: false, soon: false };
  if (pass.start_date > today) return { status: "scheduled", label: "\uC774\uC6A9 \uC2DC\uC791 \uC804", active: false, soon: false };
  const days = pass.end_date ? memberDays(today, pass.end_date) + 1 : null;
  if (attendedToday && pass.kind === "visits" && pass.remaining_visits === 0 && (days === null || days > 0)) return { status: "active", label: "\uC624\uB298 \uB9C8\uC9C0\uB9C9 \uD68C\uCC28 \uC774\uC6A9 \uC911", active: true, soon: true, days };
  if (days !== null && days <= 0 || pass.kind === "visits" && pass.remaining_visits <= 0) return { status: "expired", label: "\uB9CC\uB8CC", active: false, soon: false, days };
  const soon = days !== null && days <= 7 || pass.kind === "visits" && pass.remaining_visits <= 3;
  return { status: "active", label: soon ? "\uB9CC\uB8CC \uC608\uC815" : "\uC774\uC6A9 \uC911", active: true, soon, days };
}
function changeMembership(old, b, today) {
  let p = old ? { ...old } : null;
  const action = b.action;
  if (["register", "extend"].includes(action)) {
    if (b.endDate && !normalizeDate(b.endDate)) throw Error("\uC885\uB8CC\uC77C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    if (!["period", "visits"].includes(b.kind)) throw Error("\uD68C\uC6D0\uAD8C \uC885\uB958\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
    if (action === "extend" && (!old || old.kind !== b.kind || old.paused_at)) throw Error("\uAC19\uC740 \uC885\uB958\uC758 \uD68C\uC6D0\uAD8C\uC744 \uC7AC\uAC1C\uD55C \uD6C4 \uC5F0\uC7A5\uD574\uC8FC\uC138\uC694.");
    const start = normalizeDate(b.startDate || today);
    if (!start) throw Error("\uC2DC\uC791\uC77C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    if (b.kind === "period") {
      const months = Number(b.months);
      if (![1, 3, 6, 12].includes(months)) throw Error("1\xB73\xB76\uAC1C\uC6D4 \uB610\uB294 1\uB144\uAD8C\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
      const base = action === "extend" && old.end_date >= today ? addDays(old.end_date, 1) : start;
      p = { id: action === "extend" ? old.id : crypto.randomUUID(), kind: "period", months, start_date: action === "extend" ? old.start_date : start, end_date: normalizeDate(b.endDate) || periodEnd(base, months), total_visits: null, remaining_visits: null, paused_at: null };
    } else {
      const count = Number(b.visits);
      if (!Number.isInteger(count) || count < 1 || count > 9999) throw Error("\uD69F\uC218\uB294 1~9,999\uD68C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
      if (b.endDate && !normalizeDate(b.endDate)) throw Error("\uC720\uD6A8\uAE30\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { id: action === "extend" ? old.id : crypto.randomUUID(), kind: "visits", months: null, start_date: action === "extend" ? old.start_date : start, end_date: b.endDate || (action === "extend" ? old?.end_date : null) || null, total_visits: count + (action === "extend" ? old.total_visits : 0), remaining_visits: count + (action === "extend" ? old.remaining_visits : 0), paused_at: null };
    }
  } else if (action === "pause") {
    if (!old || !membershipState(old, today).active || old.paused_at) throw Error("\uC774\uC6A9 \uC911\uC778 \uD68C\uC6D0\uAD8C\uB9CC \uD734\uD68C\uD560 \uC218 \uC788\uC5B4\uC694.");
    p.paused_at = today;
  } else if (action === "resume") {
    if (!old?.paused_at) throw Error("\uD734\uD68C \uC911\uC778 \uD68C\uC6D0\uAD8C\uC774 \uC544\uB2C8\uC5D0\uC694.");
    const days = Math.max(0, memberDays(old.paused_at, today));
    p.end_date = p.end_date ? addDays(p.end_date, days) : null;
    p.paused_at = null;
  } else if (action === "adjust") {
    if (!old || !String(b.reason || "").trim()) throw Error("\uD68C\uC6D0\uAD8C\uACFC \uC218\uC815 \uC0AC\uC720\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    if (b.endDate && !normalizeDate(b.endDate)) throw Error("\uC885\uB8CC\uC77C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    p.end_date = b.endDate || null;
    if (p.kind === "period" && !p.end_date) throw Error("\uAE30\uAC04\uAD8C\uC758 \uC885\uB8CC\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (p.kind === "visits") {
      const n = Number(b.remaining);
      if (!Number.isInteger(n) || n < 0 || n > 9999) throw Error("\uC794\uC5EC\uD69F\uC218\uB97C 0~9,999\uD68C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
      p.remaining_visits = n;
      p.total_visits = Math.max(p.total_visits, n);
    }
  } else throw Error("\uCC98\uB9AC\uD560 \uD68C\uC6D0\uAD8C \uC791\uC5C5\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
  if (p.end_date && p.end_date < p.start_date) throw Error("\uC885\uB8CC\uC77C\uC774 \uC2DC\uC791\uC77C\uBCF4\uB2E4 \uBE60\uB97C \uC218 \uC5C6\uC5B4\uC694.");
  return p;
}

// web/tv-colors.js
var TV_COLORS = [
  { id: "blue", name: "\uBE14\uB8E8", color: "#7bb3ff" },
  { id: "sky", name: "\uD558\uB298", color: "#79d5f5" },
  { id: "mint", name: "\uBBFC\uD2B8", color: "#83e4c7" },
  { id: "orange", name: "\uC624\uB80C\uC9C0", color: "#ffad6c" },
  { id: "purple", name: "\uD37C\uD50C", color: "#c2a5ff" },
  { id: "pink", name: "\uD551\uD06C", color: "#f4afd2" },
  { id: "yellow", name: "\uC610\uB85C", color: "#efd785" },
  { id: "red", name: "\uB808\uB4DC", color: "#f2a6a6" }
];
function normalizeTvPreferences(value = {}) {
  const b = { btColor: value.btColor ?? "blue", wodColor: value.wodColor ?? "orange", unit: value.unit ?? "lbs", pageSeconds: Number(value.pageSeconds ?? 20) };
  if (!TV_COLORS.some((c) => c.id === b.btColor) || !TV_COLORS.some((c) => c.id === b.wodColor) || !["lbs", "kg"].includes(b.unit) || ![15, 20, 30, 45].includes(b.pageSeconds)) throw Error("\uC218\uC5C5 \uC0C9\uC0C1\xB7\uC911\uB7C9 \uB2E8\uC704\xB7\uD398\uC774\uC9C0 \uC804\uD658 \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return b;
}

// worker/tv-service.js
var tvHex = (bytes) => [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
async function tvDigest(value) {
  return tvHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function tvPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return tvHex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 1e5 }, key, 256));
}

// supabase/functions/onoff-api/server.js
var ORIGINS = /* @__PURE__ */ new Set(["https://nuclearstark.github.io", "https://onoff-crossfit-gym.powerloding.chatgpt.site"]);
var bad = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
var uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var text = (v, min, max, label) => {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) bad(label + "\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return v.trim();
};
function createHandler(db2, { verifyUser, fetchCalendar = fetch, now = () => /* @__PURE__ */ new Date() } = {}) {
  async function result(q) {
    const { data, error } = await q;
    if (error) {
      const code = error.code;
      bad(code === "42501" ? "\uC774 \uC694\uCCAD\uC744 \uCC98\uB9AC\uD560 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694." : code === "23505" ? "\uC774\uBBF8 \uB4F1\uB85D\uB41C \uD56D\uBAA9\uC774 \uC788\uC5B4\uC694. \uC0C8\uB85C \uBD88\uB7EC\uC628 \uB4A4 \uD655\uC778\uD574\uC8FC\uC138\uC694." : code === "40001" ? "\uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C \uBCC0\uACBD\uB410\uC5B4\uC694. \uB2E4\uC2DC \uBD88\uB7EC\uC640 \uC8FC\uC138\uC694." : "\uC800\uC7A5 \uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", code === "42501" ? 403 : ["23505", "40001"].includes(code) ? 409 : 503);
    }
    return data;
  }
  const rows = (table, configure = (q) => q) => result(configure(db2.from(table).select("*")));
  const one = (table, key, value) => result(db2.from(table).select("*").eq(key, value).maybeSingle());
  async function setting(key, fallback) {
    const row = await one("gym_settings", "key", key);
    return row?.value ?? fallback;
  }
  const commit = (actor, op, p = {}) => result(db2.rpc("onoff_commit", { actor, op, p }));
  async function member(req) {
    const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) bad("\uCE74\uCE74\uC624 \uB85C\uADF8\uC778 \uC5F0\uACB0 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 401);
    const user = await verifyUser(token);
    if (!user?.id || user.is_anonymous) bad("\uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694.", 401);
    let m = await one("gym_members", "id", user.id);
    if (!m) m = await commit(user.id, "ensure-member");
    return m;
  }
  const approved = (m) => {
    if (m.status !== "approved") bad("\uAD00\uB9AC\uC790 \uC2B9\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
  };
  const admin = (m) => {
    approved(m);
    if (m.role !== "admin") bad("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
  };
  async function library() {
    const [custom, catalogue] = await Promise.all([rows("gym_movements"), setting("rmCatalogue", DEFAULT_RM_CATALOGUE)]);
    const map = new Map(MOVEMENTS.map((name) => [name, { name, videoId: "", notes: "" }]));
    for (const m of custom) map.set(m.name, m.body);
    for (const m of catalogue) for (const name of [m.name, ...m.aliases || []]) if (!map.has(name)) map.set(name, { name, videoId: "", notes: "" });
    return [...map.values()];
  }
  async function calendar(force = false) {
    const cached = await one("gym_holiday_cache", "key", "KR");
    if (!force && cached && +now() - Date.parse(cached.updated_at) < 864e5) return cached.body;
    try {
      const res = await fetchCalendar(HOLIDAY_SOURCE, { signal: AbortSignal.timeout(5e3) });
      if (!res.ok) throw Error("calendar");
      const value = { dates: parseHolidayCalendar(await res.text()), source: "Google \uB300\uD55C\uBBFC\uAD6D \uACF5\uD734\uC77C \uCE98\uB9B0\uB354", updatedAt: now().toISOString(), fallback: false };
      await result(db2.from("gym_holiday_cache").upsert({ key: "KR", body: value, updated_at: now().toISOString() }));
      return value;
    } catch {
      return cached ? { ...cached.body, stale: true } : { dates: HOLIDAY_FALLBACK, source: "Google \uB300\uD55C\uBBFC\uAD6D \uACF5\uD734\uC77C \uCE98\uB9B0\uB354", updatedAt: "2026-10-30T00:00:00Z", fallback: true };
    }
  }
  async function revision(m) {
    const rt = await setting("releaseTime", "22:00"), clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now());
    return { revision: [await setting("revision", 0), kstDate(now()), clock >= rt ? 1 : 0, m.status, m.role].join(":"), serverNow: now().toISOString() };
  }
  async function tvSettings() {
    const [pin, prefs, devices] = await Promise.all([setting("tvPassword", null), setting("tvDisplay", {}), rows("gym_tv_sessions", (q) => q.gt("expires", now().toISOString()).order("last_seen", { ascending: false, nullsFirst: false }).limit(20))]);
    return { configured: !!pin, needsPinUpdate: false, preferences: normalizeTvPreferences(prefs), shared: true, devices: devices.map((d) => ({ id: d.device_id, lastSeen: d.last_seen, online: !!d.last_seen && +now() - Date.parse(d.last_seen) <= 9e4, displayDate: d.display_date, preferences: d.display_preferences })) };
  }
  async function tv(req, path, b) {
    const token = req.headers.get("X-OnOff-TV-Token");
    if (path === "/api/tv/login") {
      const pin = await setting("tvPassword", null);
      if (!pin) bad("\uC6B4\uC601\uC790\uAC00 TV \uC554\uD638\uB97C \uBA3C\uC800 \uC124\uC815\uD574\uC8FC\uC138\uC694.", 503);
      const peer = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
      const attemptId = await tvDigest(peer), attempt = await result(db2.rpc("onoff_tv_attempt", { ip_hash: attemptId }));
      if (!attempt.allowed) bad("\uC554\uD638\uB97C \uC5EC\uB7EC \uBC88 \uC785\uB825\uD588\uC5B4\uC694. 15\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 429);
      const value = typeof b.password === "string" && /^\d{4}$/.test(b.password) ? b.password : "", hash2 = await tvPassword(value, pin.salt);
      let mismatch = hash2.length ^ pin.hash.length;
      for (let i = 0; i < hash2.length; i++) mismatch |= hash2.charCodeAt(i) ^ pin.hash.charCodeAt(i);
      if (mismatch) bad("TV \uC554\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.", 401);
      const raw = [...crypto.getRandomValues(new Uint8Array(32))].map((v) => v.toString(16).padStart(2, "0")).join("");
      await commit(null, "tv-login", { hash: await tvDigest(raw), pinHash: pin.hash, attemptId: "ip:" + attemptId });
      return { ok: true, token: raw };
    }
    if (!token || !/^[a-f0-9]{64}$/.test(token)) bad("TV \uC804\uC6A9 \uC554\uD638\uB85C \uC811\uC18D\uD574\uC8FC\uC138\uC694.", 401);
    const hash = await tvDigest(token), session = await one("gym_tv_sessions", "hash", hash);
    if (!session || Date.parse(session.expires) <= +now()) bad("TV \uC804\uC6A9 \uC554\uD638\uB85C \uC811\uC18D\uD574\uC8FC\uC138\uC694.", 401);
    if (path === "/api/tv/logout") {
      await result(db2.from("gym_tv_sessions").delete().eq("hash", hash));
      return { ok: true };
    }
    const releaseTime = await setting("releaseTime", "22:00"), date = tvWorkoutDate(now(), releaseTime);
    if (path === "/api/tv/heartbeat") {
      if (!normalizeDate(b.displayDate) || b.displayDate > date || b.displayDate < addDays(date, -1)) bad("TV \uD45C\uC2DC \uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      await result(db2.from("gym_tv_sessions").update({ last_seen: now().toISOString(), display_date: b.displayDate, display_preferences: normalizeTvPreferences(b.preferences || {}) }).eq("hash", hash));
      return { ok: true, serverNow: now().toISOString() };
    }
    const [ws, holidays, prefs] = await Promise.all([rows("gym_workouts", (q) => q.eq("date", date).lte("release_at", now().toISOString())), calendar(), setting("tvDisplay", {})]);
    return { date, releaseTime, serverNow: now().toISOString(), dayState: workoutDayState(date, holidays.dates), holidayName: holidays.dates[date]?.name || "", workouts: ws.map((w) => w.body), preferences: normalizeTvPreferences(prefs) };
  }
  async function bootstrap(m, url) {
    const rev = await revision(m);
    if (m.status !== "approved") return { viewer: m, workouts: {}, library: [], members: [], ...rev };
    const staff = m.role === "admin", all = staff && url.searchParams.get("view") !== "member", day = kstDate(now()), viewDate = normalizeDate(url.searchParams.get("date")) || day;
    const [pass, att, memberRows, prefs, cal, noticeRows, cat, lib] = await Promise.all([
      one("gym_memberships", "user_id", m.id),
      rows("gym_attendance", (q) => q.eq("user_id", m.id).order("date", { ascending: false }).limit(1e3)),
      rows("gym_members", (q) => staff ? q : q.eq("status", "approved")),
      one("gym_preferences", "user_id", m.id),
      calendar(),
      rows("gym_notices", (q) => q.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200)),
      setting("rmCatalogue", DEFAULT_RM_CATALOGUE),
      library()
    ]);
    const access = membershipState(pass, day, att.some((a) => a.date === day && a.membership_id === pass?.id)), canRead = staff || access.active;
    const ws = canRead ? await rows("gym_workouts", (q) => {
      q = q.or(`date.gte.${addDays(day, -30)},date.eq.${viewDate}`);
      return (all ? q : q.lte("release_at", now().toISOString())).order("date", { ascending: false }).limit(1e3);
    }) : [];
    if (canRead && !ws.some((w) => w.date === viewDate)) {
      const selected = await rows("gym_workouts", (q) => {
        q = q.eq("date", viewDate);
        return all ? q : q.lte("release_at", now().toISOString());
      });
      ws.push(...selected);
    }
    const [ownRecords, selectedRecords, rms, posts, comments, joins, notes, passes, events, attAll] = await Promise.all([
      rows("gym_records", (q) => q.eq("user_id", m.id).order("date", { ascending: false }).limit(1e3)),
      canRead ? rows("gym_records", (q) => q.eq("date", viewDate).limit(1e3)) : [],
      rows("gym_rms", (q) => q.eq("user_id", m.id).order("body->>date", { ascending: false }).limit(1e3)),
      canRead ? rows("gym_posts", (q) => q.order("created_at", { ascending: false }).limit(200)) : [],
      canRead ? rows("gym_comments", (q) => q.order("created_at").limit(1e3)) : [],
      canRead ? rows("gym_post_joins", (q) => q.limit(1e3)) : [],
      staff ? rows("gym_member_notes") : [],
      staff ? rows("gym_memberships") : [],
      staff ? rows("gym_membership_events", (q) => q.order("created_at", { ascending: false }).limit(500)) : [],
      staff ? rows("gym_attendance", (q) => q.order("date", { ascending: false }).limit(2e3)) : []
    ]);
    const records = [...new Map([...ownRecords, ...selectedRecords].map((r) => [r.id, r])).values()], names = new Map(memberRows.map((x) => [x.id, x.name])), rank = /* @__PURE__ */ new Map();
    if (canRead) {
      for (const p of await rows("gym_preferences", (q) => q.limit(1e3))) rank.set(p.user_id, p.body.rank !== false);
    }
    return {
      viewer: m,
      ...rev,
      memberView: !all,
      shared: true,
      releaseTime: await setting("releaseTime", "22:00"),
      banner: await setting("banner", DEFAULT_BANNER),
      rmCatalogue: cat,
      library: lib,
      calendar: cal,
      membership: pass,
      membershipState: access,
      memberships: passes,
      membershipEvents: events.map((e) => ({ ...e, body: JSON.stringify(e.body) })),
      memberAttendance: attAll,
      attendance: att.map((a) => a.date),
      members: staff ? memberRows.map((x) => ({ ...x, note: notes.find((n) => n.user_id === x.id)?.note || "" })) : [],
      workouts: Object.fromEntries(ws.map((w) => [w.key, w.body])),
      publishedDates: [...new Set(ws.filter((w) => Date.parse(w.release_at) <= +now()).map((w) => w.date))],
      notices: canRead ? noticeRows.map((n) => ({ ...n, category: "\uACF5\uC9C0\uC0AC\uD56D", author: names.get(n.author_id) || "\uC6B4\uC601\uC790", serverNotice: true, date: kstDate(new Date(n.created_at)), comments: [], joined: [] })) : [],
      records: records.map((r) => ({ ...r.body, id: r.id, memberId: r.user_id, name: names.get(r.user_id) || "\uD68C\uC6D0", rank: rank.get(r.user_id) !== false })),
      rms: rms.map((r) => ({ ...r.body, id: r.id, memberId: r.user_id })),
      preferences: prefs?.body || {},
      posts: posts.map((p) => ({ ...p, authorId: p.author_id, author: names.get(p.author_id) || "\uD68C\uC6D0", date: kstDate(new Date(p.created_at)), joined: [], joinedIds: joins.filter((j) => j.post_id === p.id).map((j) => j.user_id), joinedNames: Object.fromEntries(joins.filter((j) => j.post_id === p.id).map((j) => [j.user_id, names.get(j.user_id) || "\uD68C\uC6D0"])), comments: comments.filter((c) => c.post_id === p.id).map((c) => ({ ...c, authorId: c.author_id, author: names.get(c.author_id) || "\uD68C\uC6D0" })) })),
      tv: staff ? await tvSettings() : void 0,
      push: { configured: false, publicKey: "", schedulerConfigured: false },
      historyLimit: 1e3
    };
  }
  async function route(req, path, url, b) {
    if (path === "/api/health") return { ok: true, backend: "supabase", serverNow: now().toISOString() };
    if (["/api/tv/login", "/api/tv/logout", "/api/tv/bootstrap", "/api/tv/heartbeat"].includes(path)) return tv(req, path, b);
    const m = await member(req);
    if (path === "/api/revision") return revision(m);
    if (path === "/api/bootstrap") return bootstrap(m, url);
    if (path === "/api/profile") return commit(m.id, "profile", { name: text(b.name, 2, 30, "\uC2E4\uBA85") });
    approved(m);
    if (path === "/api/attendance") return commit(m.id, "attendance");
    if (path === "/api/preferences") {
      const p = {};
      if ("rank" in b) {
        if (typeof b.rank !== "boolean") bad("\uC21C\uC704 \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.rank = b.rank;
      }
      if ("rmSelection" in b) {
        const cat = await setting("rmCatalogue", DEFAULT_RM_CATALOGUE);
        if (!Array.isArray(b.rmSelection) || b.rmSelection.length > 200 || b.rmSelection.some((id) => !cat.some((m2) => m2.id === id))) bad("1RM \uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.rmSelection = [...new Set(b.rmSelection)];
      }
      return commit(m.id, "preferences", p);
    }
    if (path === "/api/records") {
      const list = b.records;
      if (!Array.isArray(list) || list.length < 1 || list.length > 200) bad("\uAE30\uB85D \uBAA9\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (list.length > 1) admin(m);
      const cat = await setting("rmCatalogue", DEFAULT_RM_CATALOGUE), cache = /* @__PURE__ */ new Map(), clean = [];
      for (const r of list) {
        const id = r.id || crypto.randomUUID(), memberId = r.memberId || m.id;
        if (!uuid(id) || !uuid(memberId)) bad("\uD68C\uC6D0\uACFC \uAE30\uB85D ID\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        if (memberId !== m.id) admin(m);
        if (!normalizeDate(r.date) || r.date > kstDate(now()) || !["B/T", "WOD"].includes(r.program) || !/^S[1-9]\d?$/.test(r.section)) bad("\uAE30\uB85D \uB0A0\uC9DC\uC640 \uC218\uC5C5\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        const key = r.date + "_" + r.program;
        if (!cache.has(key)) cache.set(key, await one("gym_workouts", "key", key));
        const w = cache.get(key), sec = w?.body.sections?.[+r.section.slice(1) - 1];
        if (!sec?.record || Date.parse(w.release_at) > +now()) bad("\uACF5\uAC1C\uB41C \uC218\uC5C5\uC758 \uAE30\uB85D \uAD6C\uAC04\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
        if (r.session && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.session)) bad("\uC218\uC5C5 \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        const movement = sec.movement || sec.movements?.[0] || "", rm = findRmMovement(cat, movement), item = { id, memberId, date: r.date, program: r.program, section: r.section, session: r.session || "", kind: sec.kind, movement, movements: sec.movements || [], movementId: rm?.id, note: typeof r.note === "string" ? text(r.note, 0, 150, "\uBA54\uBAA8") : "", writer: m.role };
        if (["\uC911\uB7C9", "1RM"].includes(sec.kind)) {
          if (!Number.isFinite(r.lbs) || r.lbs <= 0 || r.lbs > 6614) bad("\uC911\uB7C9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
          item.lbs = r.lbs;
        } else {
          item.value = text(r.value, 1, 120, "\uC6B4\uB3D9 \uACB0\uACFC");
          if (sec.kind === "\uC2DC\uAC04" && !/^\d{1,3}:[0-5]\d$/.test(item.value) || ["\uD69F\uC218", "\uCE7C\uB85C\uB9AC"].includes(sec.kind) && !/^\d+$/.test(item.value)) bad("\uC6B4\uB3D9 \uACB0\uACFC \uD615\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        }
        clean.push(item);
      }
      return commit(m.id, "records", { records: clean });
    }
    if (path === "/api/rms") {
      const cat = await setting("rmCatalogue", DEFAULT_RM_CATALOGUE), mov = findRmMovement(cat, b.movementId || b.movement);
      if (!mov?.active || !Number.isFinite(b.lbs) || b.lbs <= 0 || b.lbs > 6614 || !normalizeDate(b.date) || b.date > kstDate(now())) bad("1RM \uC885\uBAA9\xB7\uC911\uB7C9\xB7\uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "rm", { id: crypto.randomUUID(), memberId: m.id, movementId: mov.id, movement: mov.name, lbs: b.lbs, date: b.date });
    }
    if (path === "/api/posts") {
      if (!["\uC6B4\uB3D9 \uBC88\uAC1C", "\uACF5\uB3D9\uAD6C\uB9E4", "\uC790\uC720\uAE00"].includes(b.category)) bad("\uB9D0\uBA38\uB9AC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "post", { category: b.category, title: text(b.title, 1, 80, "\uC81C\uBAA9"), body: text(b.body, 1, 3e3, "\uB0B4\uC6A9") });
    }
    if (["/api/posts/delete", "/api/posts/join", "/api/posts/comment"].includes(path)) {
      if (!uuid(b.id)) bad("\uAC8C\uC2DC\uAE00\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, path.endsWith("delete") ? "post-delete" : path.endsWith("join") ? "join" : "comment", { id: b.id, ...path.endsWith("comment") ? { text: text(b.text, 1, 300, "\uB313\uAE00") } : {} });
    }
    if (path.startsWith("/api/push/")) bad("Supabase \uC54C\uB9BC \uBC1C\uC1A1 \uC5F0\uACB0\uC744 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4.", 503);
    admin(m);
    if (path === "/api/tv/status") return tvSettings();
    if (path === "/api/tv/admin") {
      const p = { preferences: normalizeTvPreferences(b), revoke: b.revoke === true };
      if (b.password) {
        if (!/^\d{4}$/.test(b.password)) bad("TV \uC554\uD638\uB294 \uC22B\uC790 4\uC790\uB9AC\uC608\uC694.");
        const salt = crypto.randomUUID();
        p.password = { salt, hash: await tvPassword(b.password, salt), format: "pin4" };
      }
      await commit(m.id, "tv-admin", p);
      return { ok: true, ...await tvSettings() };
    }
    if (path === "/api/member-name" || path === "/api/member-note" || path === "/api/members") {
      if (!uuid(b.id) || !await one("gym_members", "id", b.id)) bad("\uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      if (path.endsWith("member-name")) return commit(m.id, "member-name", { id: b.id, name: text(b.name, 2, 30, "\uC2E4\uBA85") });
      if (path.endsWith("member-note")) return commit(m.id, "member-note", { id: b.id, note: text(b.note, 0, 500, "\uAD6C\uBD84 \uBA54\uBAA8") });
      if (!["admin", "member"].includes(b.role) || !["approved", "pending", "suspended"].includes(b.status)) bad("\uD68C\uC6D0 \uAD8C\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "members", { id: b.id, role: b.role, status: b.status });
    }
    if (path === "/api/membership") {
      if (!uuid(b.id)) bad("\uD68C\uC6D0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const old = await one("gym_memberships", "user_id", b.id);
      let pass;
      try {
        pass = changeMembership(old, b, kstDate(now()));
      } catch (e) {
        bad(e.message);
      }
      return commit(m.id, "membership", { id: b.id, action: b.action, pass, revision: old?.revision ?? -1, reason: String(b.reason || "").slice(0, 200) });
    }
    if (path === "/api/attendance/cancel") {
      if (!uuid(b.id) || !normalizeDate(b.date) || b.date > kstDate(now())) bad("\uD68C\uC6D0\uACFC \uCD9C\uC11D \uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "attendance-cancel", { id: b.id, date: b.date, reason: text(b.reason, 1, 200, "\uCDE8\uC18C \uC0AC\uC720") });
    }
    if (path === "/api/workouts") {
      const [lib, cal] = await Promise.all([library(), calendar()]), v = validateWorkouts(b.workouts, lib.map((m2) => m2.name), cal.dates);
      if (v.errors.length) bad(v.errors.join("\n"));
      await commit(m.id, "workouts", { workouts: v.workouts, overwrite: b.overwrite === true });
      return { ok: true, count: v.workouts.length };
    }
    if (path === "/api/settings") {
      if (typeof b.releaseTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.releaseTime)) bad("\uACF5\uAC1C \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      await commit(m.id, "settings", { releaseTime: b.releaseTime });
      return { ok: true, releaseTime: b.releaseTime };
    }
    if (path === "/api/banner") {
      if (!validBanner(b)) bad("\uACF5\uC9C0 \uBB38\uAD6C\xB7\uC0C9\uC0C1\xB7\uB178\uCD9C \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const banner = { text: b.text.trim(), color: b.color, enabled: b.enabled };
      await commit(m.id, "setting", { key: "banner", value: banner });
      return { ok: true, banner };
    }
    if (path === "/api/rm-catalogue") {
      let value;
      try {
        value = updateRmCatalogue(await setting("rmCatalogue", DEFAULT_RM_CATALOGUE), b);
      } catch (e) {
        bad(e.message);
      }
      await commit(m.id, "setting", { key: "rmCatalogue", value: value.catalogue });
      return { ok: true, ...value };
    }
    if (path === "/api/movements") {
      const name = text(b.name, 2, 80, "\uB3D9\uC791 \uC774\uB984"), videoId = b.url ? youtubeId(b.url) : "";
      if (videoId === null) bad("\uC720\uD29C\uBE0C \uC8FC\uC18C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "movements", { name, videoId, notes: text(b.notes, 0, 1e3, "\uC124\uBA85") });
    }
    if (path === "/api/notices") {
      if (b.sendPush) bad("\uC54C\uB9BC \uC11C\uBC84 \uC5F0\uACB0 \uC804\uC5D0\uB294 \uC54C\uB9BC \uBCF4\uB0B4\uAE30\uB97C \uD574\uC81C\uD574\uC8FC\uC138\uC694.", 503);
      if (b.id && !uuid(b.id)) bad("\uACF5\uC9C0\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (b.action === "delete") return commit(m.id, "notices", { action: "delete", id: b.id });
      if (typeof b.pinned !== "boolean") bad("\uC0C1\uB2E8 \uACE0\uC815 \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "notices", { id: b.id, title: text(b.title, 1, 100, "\uC81C\uBAA9"), body: text(b.body, 1, 5e3, "\uB0B4\uC6A9"), pinned: b.pinned });
    }
    if (path === "/api/holidays/sync") return { ok: true, calendar: await calendar(true) };
    bad("\uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
  }
  return async (req) => {
    const origin = req.headers.get("Origin"), allowed = !origin || ORIGINS.has(origin), cors = { "Access-Control-Allow-Origin": allowed && origin ? origin : "https://nuclearstark.github.io", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-onoff-tv-token", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });
    try {
      if (!allowed) bad("\uD5C8\uC6A9\uB41C \uC571\uC5D0\uC11C \uC811\uC18D\uD574\uC8FC\uC138\uC694.", 403);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const url = new URL(req.url), match = url.pathname.match(/\/api\/[^?]+$/), path = match?.[0];
      if (!path) bad("\uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      const get = /* @__PURE__ */ new Set(["/api/health", "/api/bootstrap", "/api/revision", "/api/tv/bootstrap", "/api/tv/status"]);
      if (req.method !== (get.has(path) ? "GET" : "POST")) bad("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC694\uCCAD \uBC29\uC2DD\uC774\uC5D0\uC694.", 405);
      let b = {};
      if (req.method === "POST") {
        if (!req.headers.get("Content-Type")?.startsWith("application/json")) bad("JSON \uC694\uCCAD\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 415);
        const raw = await req.text();
        if (raw.length > 2e6) bad("\uC694\uCCAD\uC774 \uB108\uBB34 \uCEE4\uC694.", 413);
        try {
          b = JSON.parse(raw);
        } catch {
          bad("\uC694\uCCAD \uD615\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        }
        if (!b || typeof b !== "object" || Array.isArray(b)) bad("\uC694\uCCAD \uD615\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      }
      return response(await route(req, path, url, b));
    } catch (e) {
      if (!e.status) console.error("ONOFF request failed", e.name);
      return response({ error: e.status ? e.message : "\uC11C\uBC84 \uC5F0\uACB0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." }, e.status || 503);
    }
  };
}

// supabase/functions/onoff-api/entry.js
var db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createHandler(db, { verifyUser: async (token) => {
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
} }));
