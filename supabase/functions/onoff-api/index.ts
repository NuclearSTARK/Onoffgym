// supabase/functions/onoff-api/entry.js
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// web/record-schema.js
var CONDITIONS = ["rx", "scaled", "unspecified"];
var RX_LABEL = "Rx'd";
var complex = (kind) => ["\uC138\uD2B8\uBCC4 \uD69F\uC218\xB7\uCE7C\uB85C\uB9AC", "\uC790\uC720 \uAE30\uB85D"].includes(kind);
function recordPolicy(section = {}) {
  const p = section.recordPolicy || {}, ranking = p.ranking ?? (complex(section.kind) ? "none" : "auto");
  if (!["auto", "none", "metric"].includes(ranking) || complex(section.kind) && ranking === "auto") throw Error("\uBCF5\uD569 \uAE30\uB85D\uC740 \uC21C\uC704 \uAE30\uC900\uC744 \uC9C0\uC815\uD558\uAC70\uB098 \uAE30\uB85D\uB9CC \uB0A8\uAE30\uAE30\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
  const capUnit = p.capUnit ?? "\uD69F\uC218", metricLabel = String(p.metricLabel ?? "").trim(), metricOrder = p.metricOrder ?? "desc";
  if (!["\uD69F\uC218", "\uCE7C\uB85C\uB9AC", "\uB77C\uC6B4\uB4DC + \uD69F\uC218"].includes(capUnit) || !["asc", "desc"].includes(metricOrder) || metricLabel.length > 40 || ranking === "metric" && !metricLabel) throw Error("\uAD6C\uAC04\uC758 \uC21C\uC704 \uAE30\uC900\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return { version: 1, ranking, capUnit, metricLabel: ranking === "metric" ? metricLabel : "", metricOrder };
}
var policyKey = (s) => {
  const p = recordPolicy(s);
  return JSON.stringify([s.kind, p.ranking, p.capUnit, p.metricLabel, p.metricOrder]);
};
var integer = (v, label, max = 1e7) => {
  if (v === "" || v == null || !/^\d+$/.test(String(v)) || !Number.isSafeInteger(+v) || +v > max) throw Error(label + "\uC740 0 \uC774\uC0C1\uC758 \uC815\uC218\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
  return +v;
};
var number = (v, label, max = 1e9) => {
  if (!["string", "number"].includes(typeof v) || v === "" || v == null || !Number.isFinite(+v) || +v < 0 || +v > max) throw Error(label + "\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return +v;
};
var clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
function normalizeRecordResult(section, input) {
  if (!input || input.version != null && input.version !== 1) throw Error("\uAE30\uB85D \uC591\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const policy = recordPolicy(section), condition = input?.condition;
  if (!CONDITIONS.includes(condition)) throw Error(`\uC6B4\uB3D9 \uC870\uAC74(${RX_LABEL} / Scaled)\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.`);
  const result = { version: 1, condition, policyKey: policyKey(section) }, out = { result }, kind = section.kind;
  if (["\uC911\uB7C9", "1RM"].includes(kind)) {
    result.lbs = number(input.lbs, "\uC911\uB7C9", 6614);
    if (!result.lbs) throw Error("\uC911\uB7C9\uC740 0\uBCF4\uB2E4 \uCEE4\uC57C \uD574\uC694.");
    out.lbs = result.lbs;
  } else if (kind === "\uC2DC\uAC04") {
    if (!["completed", "capped"].includes(input.status)) throw Error("\uC644\uB8CC \uB610\uB294 \uD0C0\uC784\uCEA1\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
    result.status = input.status;
    if (result.status === "completed") {
      result.seconds = integer(input.seconds, "\uC2DC\uAC04", 59999);
      if (!result.seconds) throw Error("\uC644\uB8CC \uC2DC\uAC04\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
      out.value = clock(result.seconds);
    } else {
      result.capUnit = policy.capUnit;
      result.progress = integer(input.progress, policy.capUnit === "\uB77C\uC6B4\uB4DC + \uD69F\uC218" ? "\uB77C\uC6B4\uB4DC" : "\uC218\uD589\uB7C9");
      result.extra = policy.capUnit === "\uB77C\uC6B4\uB4DC + \uD69F\uC218" ? integer(input.extra, "\uCD94\uAC00 \uD69F\uC218") : 0;
      out.value = `\uD0C0\uC784\uCEA1 \xB7 ${result.progress}${policy.capUnit === "\uB77C\uC6B4\uB4DC + \uD69F\uC218" ? "R + " + result.extra + "\uD68C" : policy.capUnit === "\uCE7C\uB85C\uB9AC" ? " cal" : "\uD68C"}`;
    }
  } else if (["\uD69F\uC218", "\uCE7C\uB85C\uB9AC"].includes(kind)) {
    result.amount = integer(input.amount, kind);
    out.value = String(result.amount);
  } else if (kind === "\uB77C\uC6B4\uB4DC + \uD69F\uC218") {
    result.rounds = integer(input.rounds, "\uB77C\uC6B4\uB4DC");
    result.extra = integer(input.extra, "\uCD94\uAC00 \uD69F\uC218");
    out.value = `${result.rounds}R + ${result.extra}`;
  } else if (kind === "\uC644\uB8CC \uC5EC\uBD80") {
    if (typeof input.completed !== "boolean") throw Error("\uC644\uB8CC \uC5EC\uBD80\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
    result.completed = input.completed;
    out.value = result.completed ? "\uC644\uB8CC" : "\uBBF8\uC644\uB8CC";
  } else if (complex(kind)) {
    result.details = String(input.details ?? "").trim();
    if (!result.details || result.details.length > 1e3) throw Error("\uC0C1\uC138 \uACB0\uACFC\uB97C 1~1,000\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    out.value = result.details;
  } else throw Error("\uAE30\uB85D \uC885\uB958\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  if (policy.ranking === "metric") result.rankingValue = number(input.rankingValue, policy.metricLabel);
  return out;
}
var recordCondition = (r) => r.result?.condition || "unspecified";
function canonicalRecordPayload(section, record, old) {
  if (record.result) {
    if (record.result.condition === "unspecified" && (!old || recordCondition(old) !== "unspecified")) throw Error(`\uC6B4\uB3D9 \uC870\uAC74(${RX_LABEL} / Scaled)\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.`);
    return normalizeRecordResult(section, record.result);
  }
  if (old && !old.result && old.kind === section.kind && (old.value ?? null) === (record.value ?? null) && (old.lbs ?? null) === (record.lbs ?? null)) return old.lbs != null ? { lbs: old.lbs } : { value: old.value };
  if (record.lbs != null) {
    if (!["\uC911\uB7C9", "1RM"].includes(section.kind) || !Number.isFinite(record.lbs) || record.lbs <= 0 || record.lbs > 6614) throw Error("\uC911\uB7C9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    return { lbs: record.lbs };
  }
  if (["\uC911\uB7C9", "1RM"].includes(section.kind)) throw Error("\uC911\uB7C9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const value = String(record.value ?? "").trim();
  if (!value || value.length > 120) throw Error("\uC6B4\uB3D9 \uACB0\uACFC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  if (section.kind === "\uC2DC\uAC04" && !/^\d{1,3}:[0-5]\d$/.test(value) || ["\uD69F\uC218", "\uCE7C\uB85C\uB9AC"].includes(section.kind) && !/^\d+$/.test(value)) throw Error("\uC6B4\uB3D9 \uACB0\uACFC \uD615\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return { value };
}

// web/core.js
var MOVEMENTS = ["Front Squat", "Back Squat", "Deadlift", "Clean", "Clean & Jerk", "Snatch", "Power Snatch", "Squat Snatch", "Strict Press", "Push Press", "Split Jerk", "Row", "Box Step Over", "Pull-up", "Ring Dip", "Burpee"];
var KINDS = ["\uC5C6\uC74C", "\uC911\uB7C9", "1RM", "\uC2DC\uAC04", "\uD69F\uC218", "\uB77C\uC6B4\uB4DC + \uD69F\uC218", "\uCE7C\uB85C\uB9AC", "\uC138\uD2B8\uBCC4 \uD69F\uC218\xB7\uCE7C\uB85C\uB9AC", "\uC644\uB8CC \uC5EC\uBD80", "\uC790\uC720 \uAE30\uB85D"];
var DEFAULT_BANNER = { enabled: true, text: "ONOFF\uC640 \uD568\uAED8, \uC624\uB298\uC758 \uB098\uB97C \uCF1C\uBCF4\uC138\uC694! \xB7 \uC6B4\uB3D9 \uD6C4 \uB098\uC758 \uAE30\uB85D\uC744 \uB0A8\uACA8\uC8FC\uC138\uC694.", color: "blue" };
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
function workoutSchedule(date, workouts = {}, holidays = {}) {
  const day = (/* @__PURE__ */ new Date(date + "T12:00:00+09:00")).getUTCDay();
  const end = (time) => {
    const [h, m] = time.split(":").map(Number);
    return String(h + 1).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  };
  const special = Object.values(workouts).filter((w) => w.date === date && w.sections?.length).flatMap((w) => (w.sessions || []).map((time) => ({ time, end: end(time), type: w.program })));
  if (holidays[date] || day === 0) return special.sort((a, b) => a.time.localeCompare(b.time));
  if (day === 6) return [...special, { time: "10:00", end: "20:00", type: "OPEN GYM" }].sort((a, b) => a.time.localeCompare(b.time));
  const alternate = day === 2 || day === 5;
  let slots = [["09:30", alternate ? "WOD" : "B/T"], ["11:00", alternate ? "B/T" : "WOD"], ["12:00", "OPEN GYM"], ["17:00", alternate ? "WOD" : "B/T"], ["18:00", alternate ? "B/T" : "WOD"], ["19:10", alternate ? "WOD" : "B/T"], ["20:30", alternate ? "B/T" : "WOD"]];
  if (day === 3) slots = slots.filter(([time]) => !["12:00", "17:00", "20:30"].includes(time)).map(([t]) => [t, t === "11:00" ? "OPEN GYM" : "WOD"]);
  return slots.map(([time, type]) => ({ time, type, end: type === "OPEN GYM" ? "16:30" : end(time) }));
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
    let id2;
    if (h === "youtu.be") id2 = u.pathname.slice(1).split("/")[0];
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(h)) {
      id2 = u.searchParams.get("v") || u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id2 || "") ? id2 : null;
  } catch {
    return null;
  }
}
function normalizeRows(rows, library = MOVEMENTS, holidays = {}) {
  const errors = [], warnings = [], groups = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set();
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
      if (day === 3 && program === "B/T") issues.push("\uC218\uC694\uC77C\uC5D0\uB294 WOD\uB9CC \uB4F1\uB85D\uD560 \uC218 \uC788\uC5B4\uC694.");
    }
    if (!sm) issues.push("\uAD6C\uAC04\uC740 S1\uBD80\uD130 S99\uAE4C\uC9C0 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!title || title.length > 100) issues.push("\uC81C\uBAA9\uC740 1~100\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!text2 || text2.length > 5e3) issues.push("\uC6B4\uB3D9 \uB0B4\uC6A9\uC740 1~5,000\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    if (!KINDS.includes(kind)) issues.push("\uAE30\uB85D \uC885\uB958\uB97C \uC591\uC2DD\uC758 \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
    const ms = movementText ? movementText.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean) : [];
    const movements = ms.map((n) => canonical.get(n.toLowerCase()) || n), linkedMovements = ms.map((n) => canonical.get(n.toLowerCase())).filter(Boolean);
    if (ms.some((n) => !canonical.has(n.toLowerCase()))) warnings.push(`${line}\uD589: \uC9C1\uC811 \uC785\uB825\uD55C \uB3D9\uC791\uC740 \uC218\uC5C5\uC5D0 \uC800\uC7A5\uB418\uBA70 \uC601\uC0C1\xB71RM \uC790\uB3D9 \uC5F0\uACB0\uC740 \uBCF4\uB958\uB429\uB2C8\uB2E4.`);
    if (ms.length > 30 || ms.some((n) => n.length > 80)) issues.push("\uAD00\uB828 \uB3D9\uC791\uC740 80\uC790 \uC774\uB0B4\uB85C \uCD5C\uB300 30\uAC1C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    const overviewId = overview ? youtubeId(overview) : "";
    if (overview && !overviewId) issues.push("\uC720\uD6A8\uD55C \uC720\uD29C\uBE0C \uC601\uC0C1 \uC8FC\uC18C\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
    const times = String(r["\uC218\uC5C5 \uC2DC\uAC04(\uACF5\uD734\uC77C)"] || "").split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
    if (date && (holidays[date] || [0, 6].includes((/* @__PURE__ */ new Date(date + "T12:00:00+09:00")).getUTCDay())) && !times.length) issues.push("\uD734\uAC15\uC77C\xB7\uC8FC\uB9D0 \uD2B9\uBCC4 \uC218\uC5C5\uC758 \uC2DC\uC791 \uC2DC\uAC01\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.");
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
    w.sections.push({ number: +sm[1], title, text: text2, record: kind !== "\uC5C6\uC74C", kind, movements, linkedMovements, movement: (kind === "1RM" && movements.length !== 1 ? "" : linkedMovements[0]) || "" });
  });
  for (const w of groups.values()) {
    w.sections.sort((a, b) => a.number - b.number);
    if (w.sections.some((s, i) => s.number !== i + 1)) errors.push(`${w.date} ${w.program}: \uAD6C\uAC04\uC744 S1\uBD80\uD130 \uBE60\uC9D0\uC5C6\uC774 \uC785\uB825\uD574\uC8FC\uC138\uC694.`);
  }
  return { errors, warnings, workouts: [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.program.localeCompare(b.program)) };
}
function validateWorkouts(workouts, library = MOVEMENTS, holidays = {}) {
  if (!Array.isArray(workouts) || !workouts.length || workouts.length > 250) return { errors: ["1~250\uAC1C \uC218\uC5C5\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694."], workouts: [] };
  const rows = [];
  for (const w of workouts) {
    if (!Array.isArray(w.sections) || !w.sections.length) return { errors: ["\uC218\uC5C5 \uAD6C\uAC04\uC774 \uBE44\uC5B4 \uC788\uC5B4\uC694."], workouts: [] };
    w.sections.forEach((s, i) => rows.push({ "\uB0A0\uC9DC": w.date, "\uC218\uC5C5": w.program, "\uAD6C\uAC04": "S" + (i + 1), "\uC81C\uBAA9": s.title || "S" + (i + 1), "\uC6B4\uB3D9 \uB0B4\uC6A9": s.text, "\uAE30\uB85D \uC885\uB958": s.record ? s.kind : "\uC5C6\uC74C", "\uAD00\uB828 \uB3D9\uC791": (s.movements?.length ? s.movements : s.movement ? [s.movement] : []).join("; "), "\uC624\uB298 \uC6B4\uB3D9 \uC124\uBA85 \uC601\uC0C1": w.overviewId ? "https://youtu.be/" + w.overviewId : "", "\uC218\uC5C5 \uC2DC\uAC04(\uACF5\uD734\uC77C)": (w.sessions || []).join(", ") }));
  }
  const result = normalizeRows(rows, library, holidays);
  if (!result.errors.length) {
    for (const w of result.workouts) {
      const source = workouts.find((x) => normalizeDate(x.date) === w.date && x.program.toUpperCase() === w.program);
      w.sections.forEach((s, i) => {
        if (s.record && source?.sections[i]?.recordPolicy) {
          try {
            s.recordPolicy = recordPolicy({ ...s, recordPolicy: source.sections[i].recordPolicy });
          } catch (e) {
            result.errors.push(e.message);
          }
        }
      });
    }
  }
  return result;
}

// supabase/functions/onoff-api/member-overview-service.js
var fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
function createMemberOverviewService(db2) {
  return { async read(member, url) {
    if (member.status !== "approved" || member.role !== "admin" || member.delete_requested_at) fail("\uC6B4\uC601\uC790\uB9CC \uD68C\uC6D0 \uD604\uD669\uC744 \uBCFC \uC218 \uC788\uC5B4\uC694.", 403);
    const q = url.searchParams, kind = q.get("kind") || "attendance", action = q.get("action") || "summary", p = { kind, action };
    if (!["attendance", "rm", "named"].includes(kind) || !["summary", "history"].includes(action)) fail("\uC870\uD68C \uC885\uB958\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    for (const key of ["date", "month"]) if (q.has(key)) {
      if (!normalizeDate(q.get(key))) fail("\uC870\uD68C \uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p[key] = normalizeDate(q.get(key));
    }
    const filter = q.get("filter") || "";
    if (filter.length > 100) fail("\uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    p.filter = filter;
    if (action === "history") {
      const id2 = q.get("memberId"), page = q.get("page") || "0";
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id2 || "") || !/^\d{1,6}$/.test(page) || +page > 1e5) fail("\uD68C\uC6D0\xB7\uD398\uC774\uC9C0\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p.memberId = id2;
      p.page = +page;
    }
    const { data, error } = await db2.rpc("onoff_member_overview", { actor: member.id, p });
    if (error) fail(error.code === "42501" ? "\uC6B4\uC601\uC790\uB9CC \uD68C\uC6D0 \uD604\uD669\uC744 \uBCFC \uC218 \uC788\uC5B4\uC694." : "\uD68C\uC6D0 \uD604\uD669\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", error.code === "42501" ? 403 : 503);
    return data;
  } };
}

// supabase/functions/onoff-api/photo-history.js
function personalBoardRecords(imports, m, visible) {
  return imports.flatMap((i) => i.rows.filter((r) => !r.excluded && r.participants.some((p) => p.memberId === m.id)).map((r) => ({ ...r, id: i.photo_id + ":" + r.id, photoId: i.photo_id, date: i.gym_photos.date, session: i.gym_photos.session, participants: r.participants.map((p) => {
    const member = visible.find((v) => v.id === p.memberId);
    return { name: p.memberId === m.id ? m.name : member?.disclosure_consent === true ? member.name : "\uD300\uC6D0", memberId: p.memberId === m.id ? m.id : null };
  }) })));
}
async function readPhotoHistory(db2, member, members) {
  const { data, error } = await db2.from("gym_board_imports").select("*,gym_photos!inner(date,program,session,active)").eq("status", "published").eq("gym_photos.active", true).contains("rows", JSON.stringify([{ participants: [{ memberId: member.id }] }])).order("updated_at", { ascending: false }).limit(1e3);
  if (error) throw Object.assign(Error("\uAE30\uC874 \uC0AC\uC9C4 \uAE30\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694."), { status: 503 });
  return personalBoardRecords(data || [], member, members);
}

// web/attendance-location.js
var DEFAULT_RECORD_TOOLS = { attendance: { enabled: false, latitude: null, longitude: null, radius: 200 } };
function distanceMetres(a, b) {
  const rad = (n) => n * Math.PI / 180, lat = rad(b.latitude - a.latitude), lon = rad(b.longitude - a.longitude), h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function validateAttendanceLocation(config, position, now = Date.now()) {
  if (!config?.enabled) return;
  const p = position, c = config;
  if (!p || ![p.latitude, p.longitude, p.accuracy, p.timestamp, c.latitude, c.longitude, c.radius].every((v) => typeof v === "number" && Number.isFinite(v)) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180 || p.accuracy < 0 || p.accuracy > 100 || Math.abs(now - p.timestamp) > 12e4) throw Error("\uC815\uD655\uD55C \uD604\uC7AC \uC704\uCE58\uAC00 \uD544\uC694\uD574\uC694. \uC704\uCE58 \uAD8C\uD55C\uC744 \uD5C8\uC6A9\uD558\uACE0 \uCC3D\uAC00\uC5D0\uC11C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
  if (distanceMetres(c, p) > c.radius) throw Error("\uCCB4\uC721\uAD00 \uADFC\uCC98\uC5D0\uC11C\uB9CC \uCD9C\uC11D\uD560 \uC218 \uC788\uC5B4\uC694. \uCCB4\uC721\uAD00\uC5D0 \uACC4\uC2DC\uBA74 \uC704\uCE58\uB97C \uB2E4\uC2DC \uD655\uC778\uD558\uAC70\uB098 \uC6B4\uC601\uC790\uC5D0\uAC8C \uBB38\uC758\uD574\uC8FC\uC138\uC694.");
}

// web/meetups.js
function meetupMessage(instant) {
  const date = new Date(instant);
  if (!instant || !Number.isFinite(+date)) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((x) => [x.type, x.value]));
  return `\uC6B4\uB3D9 \uBC88\uAC1C ${parts.month}/${parts.day} ${parts.hour}:${parts.minute} \uD568\uAED8 \uC6B4\uB3D9\uD574\uC694`;
}
function meetupLifecycle(post, now = Date.now()) {
  const start = post?.category === "\uC6B4\uB3D9 \uBC88\uAC1C" ? Date.parse(post.starts_at) : NaN;
  const valid = Number.isFinite(start), closesAt = start + 30 * 60 * 1e3, deletesAt = start + 24 * 60 * 60 * 1e3;
  return { closed: valid && +now >= closesAt, expired: valid && +now >= deletesAt, closesAt: valid ? closesAt : null, deletesAt: valid ? deletesAt : null };
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

// web/participation-access.js
function participationAccess({ viewer, author, post, pass, today, attendedToday = false, now = Date.now() }) {
  const deny = (code, message, action = "") => ({ allowed: false, code, message, action });
  if (viewer?.status !== "approved") return deny("approval_required", "\uAC00\uC785 \uC2B9\uC778 \uD6C4 \uCC38\uC5EC\uD560 \uC218 \uC788\uC5B4\uC694.");
  if (!post) return deny("post_missing", "\uC0AD\uC81C\uB418\uC5C8\uAC70\uB098 \uD655\uC778\uD560 \uC218 \uC5C6\uB294 \uAC8C\uC2DC\uAE00\uC774\uC5D0\uC694.");
  const lifecycle = meetupLifecycle(post, now);
  if (lifecycle.expired) return deny("post_expired", "\uBCF4\uAD00 \uAE30\uAC04\uC774 \uC9C0\uB098 \uC0AD\uC81C\uB41C \uC6B4\uB3D9 \uBC88\uAC1C\uC608\uC694.");
  if (lifecycle.closed) return deny("meetup_closed", "\uB9C8\uAC10\uB41C \uC6B4\uB3D9 \uBC88\uAC1C\uC5D0\uB294 \uC0C8\uB85C \uCC38\uC5EC\uD560 \uC218 \uC5C6\uC5B4\uC694.");
  if (post.category === "\uC790\uC720\uAE00") return deny("not_joinable", "\uC774 \uAC8C\uC2DC\uAE00\uC740 \uCC38\uC5EC \uC2E0\uCCAD\uC744 \uBC1B\uC9C0 \uC54A\uC544\uC694.");
  if (viewer.disclosure_consent === false) return deny("sharing_required", "\uCC38\uC5EC\uC790 \uC774\uB984 \uACF5\uAC1C\uB97C \uC704\uD574 \uAC1C\uC778\uC124\uC815\uC5D0\uC11C \uD68C\uC6D0 \uAC04 \uACF5\uAC1C \uB3D9\uC758\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.", "privacy-settings");
  if (!author || author.status !== "approved") return deny("author_unavailable", "\uC791\uC131\uC790 \uACC4\uC815 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uB294 \uB3D9\uC548\uC5D0\uB294 \uC0C8\uB85C \uCC38\uC5EC\uD560 \uC218 \uC5C6\uC5B4\uC694.");
  if (author.disclosure_consent === false) return deny(author.privacy_version === "email-signup-v1" ? "author_review" : "post_private", author.privacy_version === "email-signup-v1" ? "\uC791\uC131\uC790\uAC00 \uC0C8 \uAC1C\uC778\uC815\uBCF4 \uC548\uB0B4\uB97C \uD655\uC778\uD558\uBA74 \uCC38\uC5EC\uD560 \uC218 \uC788\uC5B4\uC694." : "\uC791\uC131\uC790\uAC00 \uACF5\uAC1C\uB97C \uC911\uB2E8\uD55C \uAC8C\uC2DC\uAE00\uC5D0\uB294 \uC0C8\uB85C \uCC38\uC5EC\uD560 \uC218 \uC5C6\uC5B4\uC694.");
  const access = membershipState(pass, today, attendedToday);
  if (viewer.role !== "admin" && !access.active) return deny("membership_required", access.status === "paused" ? "\uD734\uD68C \uC911\uC5D0\uB294 \uC0C8\uB85C \uCC38\uC5EC\uD560 \uC218 \uC5C6\uC5B4\uC694. \uAE30\uC874 \uCC38\uC5EC\uB294 \uCDE8\uC18C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : access.status === "scheduled" ? "\uD68C\uC6D0\uAD8C \uC774\uC6A9 \uC2DC\uC791\uC77C\uBD80\uD130 \uCC38\uC5EC\uD560 \uC218 \uC788\uC5B4\uC694." : "\uD68C\uC6D0\uAD8C \uAE30\uAC04 \uB610\uB294 \uB0A8\uC740 \uD69F\uC218\uB97C \uC6B4\uC601\uC790\uC5D0\uAC8C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return { allowed: true, code: "allowed", message: "", action: "" };
}

// supabase/functions/onoff-api/named-service.js
var fail2 = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
var uuid = (x) => typeof x === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
var id = (x) => typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x);
var validText = (x, min, max) => typeof x === "string" && x.trim().length >= min && x.length <= max;
function createNamedService(db2) {
  async function rpc(name, p) {
    const { data, error } = await db2.rpc(name, p);
    if (error) fail2(error.code === "42501" ? "\uC774 \uAE30\uB2A5\uC758 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694." : error.code === "23505" ? "\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC885\uBAA9 \uB610\uB294 \uBD84\uB958\uC608\uC694." : "\uC694\uCCAD\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400);
    return data;
  }
  return { snapshot: (m) => rpc("onoff_named_snapshot", { actor: m.id }), async route(m, path, b) {
    if (m.status !== "approved") fail2("\uAD00\uB9AC\uC790 \uC2B9\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
    if (path === "/api/named-wods/comparison") {
      if (!id(b.wodId)) fail2("\uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return rpc("onoff_named_comparison", { actor: m.id, wod_id: b.wodId });
    }
    let p;
    if (path === "/api/named-wods/selection") {
      if (!Array.isArray(b.ids) || b.ids.length > 250 || b.ids.some((x) => !id(x))) fail2("\uC885\uBAA9 \uC120\uD0DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "selection", ids: [...new Set(b.ids)] };
    } else if (path === "/api/named-wods/record") {
      if (!uuid(b.id) || !id(b.wodId) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || !validText(b.note ?? "", 0, 150)) fail2("\uC885\uBAA9\xB7\uB0A0\uC9DC\xB7\uBA54\uBAA8\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const time = Number.isInteger(b.seconds) && b.seconds >= 1 && b.seconds <= 59999, rounds = Number.isInteger(b.rounds) && b.rounds >= 0 && b.rounds <= 9999 && Number.isInteger(b.reps) && b.reps >= 0 && b.reps <= 99999 && b.rounds + b.reps > 0;
      if (!time && !rounds) fail2("\uC2DC\uAC04 \uB610\uB294 \uB77C\uC6B4\uB4DC\xB7\uD69F\uC218\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "record", id: b.id, wodId: b.wodId, date: b.date, note: (b.note || "").trim(), ...time ? { seconds: b.seconds } : { rounds: b.rounds, reps: b.reps } };
    } else if (path === "/api/named-wods/record/delete") {
      if (!uuid(b.id)) fail2("\uAE30\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "record-delete", id: b.id };
    } else {
      if (m.role !== "admin") fail2("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
      if (path === "/api/named-wods/catalogue") {
        if (b.id && !id(b.id) || !validText(b.name, 1, 80) || !validText(b.description ?? "", 0, 1e4) || !id(b.categoryId) || !["time", "rounds"].includes(b.recordType) || typeof b.isDefault !== "boolean" || typeof b.active !== "boolean") fail2("\uC885\uBAA9 \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p = { action: "catalogue", ...b.id ? { id: b.id } : {}, name: b.name.trim(), description: b.description || "", categoryId: b.categoryId, recordType: b.recordType, isDefault: b.isDefault, active: b.active };
      } else if (path === "/api/named-wods/catalogue/delete") {
        if (!id(b.id)) fail2("\uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p = { action: "catalogue-delete", id: b.id };
      } else if (path === "/api/named-wods/category") {
        if (b.id && !id(b.id) || !validText(b.label, 1, 40)) fail2("\uBD84\uB958\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p = { action: "category", ...b.id ? { id: b.id } : {}, label: b.label.trim() };
      } else if (path === "/api/named-wods/category/delete") {
        if (!id(b.id) || !id(b.targetId) || b.id === b.targetId) fail2("\uC62E\uAE38 \uBD84\uB958\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
        p = { action: "category-delete", id: b.id, targetId: b.targetId };
      } else fail2("NAMED WOD \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
    }
    return rpc("onoff_named_mutate", { actor: m.id, p });
  } };
}

// web/gender.js
var validGender = (value) => value === "male" || value === "female";

// web/privacy-version.js
var PRIVACY_VERSION = "privacy-2026-11-05";

// supabase/functions/onoff-api/points-service.js
var fail3 = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
var uuid2 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var integer2 = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
function createPointsService(db2, { now = () => /* @__PURE__ */ new Date() } = {}) {
  const read = async (q) => {
    const { data, error } = await q;
    if (error) fail3("\uD3EC\uC778\uD2B8 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.", 503);
    return data;
  };
  async function snapshot(m) {
    if (m?.status !== "approved") fail3("\uAD00\uB9AC\uC790 \uC2B9\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
    const [cfg, account, coupons, products, ledger, rules, methods] = await Promise.all([
      read(db2.from("gym_point_config").select("enabled,attendance_points,record_points,max_balance").eq("singleton", true).maybeSingle()),
      read(db2.from("gym_point_accounts").select("balance").eq("user_id", m.id).maybeSingle()),
      read(db2.from("gym_point_coupons").select("id,name,price,total,remaining,created_at,last_used_at,expires_at").eq("user_id", m.id).order("created_at", { ascending: false }).limit(200)),
      read(db2.from("gym_point_products").select("id,name,description,price,uses").eq("deleted", false).order("name").limit(100)),
      read(db2.from("gym_point_ledger").select("id,amount,reason,created_at").eq("user_id", m.id).order("created_at", { ascending: false }).limit(30)),
      read(db2.from("gym_point_rules").select("id,auto_key,method_id,name,amount").eq("deleted", false).order("created_at")),
      read(db2.from("gym_point_methods").select("id,name,kind").eq("deleted", false).order("created_at"))
    ]);
    return { enabled: !!cfg?.enabled, attendancePoints: cfg?.attendance_points || 0, recordPoints: cfg?.record_points || 0, balance: Number(account?.balance || 0), maxBalance: cfg?.max_balance == null ? null : Number(cfg.max_balance), rules: rules || [], methods: methods || [], coupons: (coupons || []).map((c) => ({ ...c, expired: !!c.expires_at && Date.parse(c.expires_at) <= +now() })), products: products || [], ledger: ledger || [] };
  }
  async function route(m, path, b) {
    if (m?.status !== "approved") fail3("\uAD00\uB9AC\uC790 \uC2B9\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
    if (path === "/api/points") return snapshot(m);
    const isAdmin = m.role === "admin";
    if (["/api/points/admin", "/api/points/settings", "/api/points/product", "/api/points/product/delete", "/api/points/rule", "/api/points/rule/delete", "/api/points/grant", "/api/points/deduct", "/api/points/reset", "/api/points/method", "/api/points/method/delete"].includes(path) && !isAdmin) fail3("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
    if (path === "/api/points/admin") {
      const cfg = await read(db2.from("gym_point_config").select("pin_hash").eq("singleton", true).maybeSingle());
      const [base, coupons, members, accounts] = await Promise.all([snapshot(m), read(db2.from("gym_point_coupons").select("id,user_id,name,price,total,remaining,created_at,last_used_at,expires_at").order("created_at", { ascending: false }).limit(100)), read(db2.from("gym_members").select("id,name,status")), read(db2.from("gym_point_accounts").select("user_id,balance"))]);
      return { ...base, pinConfigured: !!cfg?.pin_hash, members: members.filter((m2) => m2.status === "approved").map((m2) => ({ id: m2.id, name: m2.name, balance: Number(accounts.find((a) => a.user_id === m2.id)?.balance || 0) })), issued: (coupons || []).map((c) => ({ ...c, expired: !!c.expires_at && Date.parse(c.expires_at) <= +now(), memberName: members.find((m2) => m2.id === c.user_id)?.name || "\uD68C\uC6D0" })) };
    }
    if (path === "/api/points/reset") {
      if (!uuid2(b.requestId) || b.confirmed !== true) fail3("\uCD08\uAE30\uD654 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const { data: data2, error: error2 } = await db2.rpc("onoff_point_reset", { actor: m.id, request_id: b.requestId });
      if (error2) fail3(error2.code === "42501" ? "\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694." : "\uD3EC\uC778\uD2B8 \uCD08\uAE30\uD654 \uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", error2.code === "42501" ? 403 : 503);
      return data2;
    }
    let p;
    if (path === "/api/points/settings") {
      if (typeof b.enabled !== "boolean" || b.pin && (typeof b.pin !== "string" || !/^\d{4}$/.test(b.pin))) fail3("\uC801\uB9BD \uC124\uC815\uACFC 4\uC790\uB9AC \uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "settings", enabled: b.enabled, pin: b.pin || "" };
      for (const key of ["attendancePoints", "recordPoints"]) if (key in b) {
        if (!integer2(b[key], 0, 1e6)) fail3("\uC801\uB9BD\uC561\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p[key] = b[key];
      }
      if ("maxBalance" in b) {
        if (b.maxBalance !== null && !integer2(b.maxBalance, 1, 9e12)) fail3("\uCD1D \uBCF4\uC720 \uD3EC\uC778\uD2B8 \uC0C1\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.maxBalance = b.maxBalance;
      }
    } else if (path === "/api/points/rule") {
      if (b.id && (typeof b.id !== "string" || b.id.length > 80) || !b.methodId && !["attendance", "record", "manual"].includes(b.kind) || b.methodId && (typeof b.methodId !== "string" || b.methodId.length > 80) || typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 60 || !integer2(b.amount, 0, 1e6)) fail3("\uC801\uB9BD \uD56D\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "rule-save", id: b.id || "", ...b.methodId ? { methodId: b.methodId } : { kind: b.kind }, name: b.name.trim(), amount: b.amount };
    } else if (path === "/api/points/rule/delete") {
      if (typeof b.id !== "string" || !b.id || b.id.length > 80) fail3("\uC801\uB9BD \uD56D\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "rule-delete", id: b.id };
    } else if (path === "/api/points/method") {
      if (b.id && (typeof b.id !== "string" || b.id.length > 80) || !["manual", "attendance", "record"].includes(b.kind) || typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 60) fail3("\uC801\uB9BD \uBC29\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "method-save", id: b.id || "", name: b.name.trim(), kind: b.kind };
    } else if (path === "/api/points/method/delete") {
      if (typeof b.id !== "string" || !b.id || b.id.length > 80) fail3("\uC801\uB9BD \uBC29\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "method-delete", id: b.id };
    } else if (path === "/api/points/deduct") {
      if (!uuid2(b.memberId) || !uuid2(b.requestId) || !integer2(b.amount, 1, 1e6) || typeof b.reason !== "string" || !b.reason.trim() || b.reason.length > 200) fail3("\uCC28\uAC10 \uB300\uC0C1\xB7\uD3EC\uC778\uD2B8\xB7\uC0AC\uC720\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "deduct", memberId: b.memberId, requestId: b.requestId, amount: b.amount, reason: b.reason.trim() };
    } else if (path === "/api/points/grant") {
      if (!uuid2(b.memberId) || !uuid2(b.requestId) || typeof b.reason !== "string" || !b.reason.trim() || b.reason.length > 200 || b.ruleId && (typeof b.ruleId !== "string" || b.ruleId.length > 80) || !b.ruleId && !integer2(b.amount, 1, 1e6)) fail3("\uC9C0\uAE09 \uB300\uC0C1\xB7\uD3EC\uC778\uD2B8\xB7\uC0AC\uC720\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "grant", memberId: b.memberId, requestId: b.requestId, ruleId: b.ruleId || null, reason: b.reason.trim(), ...!b.ruleId ? { amount: b.amount } : {} };
    } else if (path === "/api/points/product") {
      if (b.id && !uuid2(b.id) || typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 60 || typeof b.description !== "string" || b.description.length > 300 || !integer2(b.price, 1, 1e9) || !integer2(b.uses, 1, 1e3)) fail3("\uC0C1\uD488 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "product-save", id: b.id || "", name: b.name.trim(), description: b.description, price: b.price, uses: b.uses };
    } else if (path === "/api/points/product/delete") {
      if (!uuid2(b.id)) fail3("\uC0C1\uD488\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "product-delete", id: b.id };
    } else if (path === "/api/points/exchange") {
      if (!uuid2(b.productId) || !uuid2(b.requestId) || !integer2(b.expectedPrice, 1, 1e9) || !integer2(b.expectedUses, 1, 1e3)) fail3("\uAD50\uD658 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "exchange", productId: b.productId, requestId: b.requestId, expectedPrice: b.expectedPrice, expectedUses: b.expectedUses };
    } else if (path === "/api/points/use") {
      if (!uuid2(b.couponId) || !uuid2(b.requestId) || typeof b.pin !== "string" || !/^\d{4}$/.test(b.pin)) fail3("\uCFE0\uD3F0\uACFC 4\uC790\uB9AC \uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      p = { action: "use", couponId: b.couponId, requestId: b.requestId, pin: b.pin };
    } else fail3("\uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
    const { data, error } = await db2.rpc("onoff_points", { actor: m.id, p });
    if (error) fail3(error.code === "42501" ? "\uC774 \uC694\uCCAD\uC744 \uCC98\uB9AC\uD560 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694." : error.code === "P0001" ? error.message : "\uD3EC\uC778\uD2B8 \uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", error.code === "42501" ? 403 : error.code === "P0001" ? 400 : 503);
    if (data?.ok === false) fail3(data.error, data.status || 400);
    return data;
  }
  return { snapshot, route };
}

// web/name-order.js
var english = new Intl.Collator("en", { sensitivity: "base", numeric: true });
var korean = new Intl.Collator("ko", { sensitivity: "base", numeric: true });

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
var DEFAULT_RM_CATALOGUE = rmSeeds.map(([id2, name, category, isDefault = false, aliases = []]) => ({ id: id2, name, category, isDefault, active: true, aliases }));
var rmKey = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
function findRmMovement(catalogue, value) {
  return catalogue.find((m) => m.id === value) || catalogue.find((m) => [m.name, ...m.aliases || []].some((n) => rmKey(n) === rmKey(value)));
}
function updateRmCatalogue(catalogue, body, idFactory = () => crypto.randomUUID(), categories = RM_CATEGORIES) {
  if (!body || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 80) throw Error("\uC885\uBAA9 \uC774\uB984\uC744 2~80\uC790\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
  if (!categories.some((c) => c[0] === body.category) || typeof body.active !== "boolean" || typeof body.isDefault !== "boolean") throw Error("\uBD84\uB958\xB7\uAE30\uBCF8 \uD45C\uC2DC\xB7\uC0AC\uC6A9 \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const old = body.id ? catalogue.find((m) => m.id === body.id) : null;
  if (body.id && !old) throw Error("\uC218\uC815\uD560 \uC885\uBAA9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
  const name = body.name.trim().replace(/\s+/g, " ");
  if (catalogue.some((m) => m.id !== old?.id && [m.name, ...m.aliases || []].some((n) => rmKey(n) === rmKey(name)))) throw Error("\uC774\uBBF8 \uB4F1\uB85D\uB41C \uC885\uBAA9 \uC774\uB984\uC774\uC5D0\uC694.");
  if (!old && catalogue.length >= 250) throw Error("\uC885\uBAA9\uC740 \uCD5C\uB300 250\uAC1C\uAE4C\uC9C0 \uB4F1\uB85D\uD560 \uC218 \uC788\uC5B4\uC694.");
  const aliases = [.../* @__PURE__ */ new Set([...old?.aliases || [], ...old && old.name !== name ? [old.name] : []])].filter((n) => rmKey(n) !== rmKey(name));
  const movement = { id: old?.id || "custom-" + idFactory(), name, category: body.category, active: body.active, isDefault: body.active && body.isDefault, aliases };
  return { movement, catalogue: old ? catalogue.map((m) => m.id === old.id ? movement : m) : [...catalogue, movement] };
}
var ATTENDANCE_STAMPS = Object.freeze([
  "\u{1F600}",
  "\u{1F603}",
  "\u{1F604}",
  "\u{1F601}",
  "\u{1F606}",
  "\u{1F605}",
  "\u{1F642}",
  "\u{1F643}",
  "\u{1F609}",
  "\u{1F60A}",
  "\u{1F60D}",
  "\u{1F929}",
  "\u{1F618}",
  "\u{1F617}",
  "\u263A\uFE0F",
  "\u{1F61A}",
  "\u{1F619}",
  "\u{1F60B}",
  "\u{1F61B}",
  "\u{1F61C}",
  "\u{1F92A}",
  "\u{1F61D}",
  "\u{1F60E}",
  "\u{1F913}",
  "\u{1F44F}",
  "\u{1F44A}",
  "\u{1F4AA}",
  "\u{1F525}",
  "\u{1F3CB}\uFE0F\u200D\u2642\uFE0F",
  "\u{1F3CB}\uFE0F",
  "\u{1F3CB}\uFE0F\u200D\u2640\uFE0F",
  "\u{1F3C5}",
  "\u270C\uFE0F",
  "\u{1F921}",
  "\u{1F920}",
  "\u{1FAE0}",
  "\u{1FAE1}",
  "\u{1F3C3}\u200D\u2642\uFE0F",
  "\u{1F3C3}\u{1F3FB}",
  "\u{1F3C6}"
]);

// web/video-library.js
var VIDEO_CATEGORIES = [...RM_CATEGORIES, ["cardio", "\uC720\uC0B0\uC18C"], ["gymnastics", "\uB9E8\uBAB8\xB7\uCCB4\uC870"], ["other", "\uAE30\uD0C0 \uB3D9\uC791"]];
function videoCategory(name, catalogue) {
  const known = findRmMovement(catalogue, name);
  if (known && VIDEO_CATEGORIES.some(([id2]) => id2 === known.category)) return known.category;
  const n = String(name).toLowerCase();
  if (/clean.*jerk|thruster|cluster/.test(n)) return "complex";
  if (/snatch/.test(n)) return "snatch";
  if (/clean/.test(n)) return "clean";
  if (/squat/.test(n)) return "squat";
  if (/deadlift/.test(n)) return "deadlift";
  if (/press|jerk/.test(n)) return "press";
  if (/\b(row|rowing|bike|ski|run|running|jump rope|double under|single under)\b/.test(n)) return "cardio";
  if (/pull.up|push.up|muscle.up|handstand|toes.to.bar|sit.up|burpee|plank|box (jump|step)|air squat/.test(n)) return "gymnastics";
  return "other";
}
function resolveVideoCategory(id2, categories, redirects = {}) {
  const active = new Set(categories.map((c) => c[0]));
  for (let i = 0; i < 40 && !active.has(id2) && redirects[id2]; i++) id2 = redirects[id2];
  return active.has(id2) ? id2 : categories.find((c) => c[0] === "other")?.[0] || categories[0]?.[0] || "other";
}
function findVideoMovement(items, name) {
  const key = String(name || "").trim().toLocaleLowerCase();
  return items.find((m) => m.name.toLocaleLowerCase() === key) || items.find((m) => (m.aliases || []).some((alias) => alias.toLocaleLowerCase() === key));
}

// web/permissions.js
var COACH_PERMISSIONS = [["workouts.read", "\uBBF8\uACF5\uAC1C \uC218\uC5C5 \uC870\uD68C"], ["workouts.create", "\uC218\uC5C5 \uB4F1\uB85D"], ["workouts.update", "\uC218\uC5C5 \uC218\uC815"], ["workouts.delete", "\uC218\uC5C5 \uC0AD\uC81C"], ["records.create", "\uD68C\uC6D0 \uAE30\uB85D \uC785\uB825"], ["records.update", "\uD68C\uC6D0 \uAE30\uB85D \uC218\uC815"], ["records.delete", "\uD68C\uC6D0 \uAE30\uB85D \uC0AD\uC81C"], ["photos", "\uC624\uB298\uC758 \uAE30\uB85D \uC0AC\uC9C4 \uAD00\uB9AC"], ["videos", "\uC6B4\uB3D9\uC601\uC0C1 \uAD00\uB9AC"], ["rm", "1RM \uC885\uBAA9\uAD00\uB9AC"], ["notices", "\uACF5\uC9C0 \uAD00\uB9AC"], ["banner", "\uBC30\uB108 \uAD00\uB9AC"], ["push", "\uD478\uC2DC \uBC1C\uC1A1\xB7\uC774\uB825"], ["release", "\uACF5\uAC1C\uC2DC\uAC01"], ["tv", "TV \uD654\uBA74 \uC124\uC815"], ["acc.read", "\uBBF8\uACF5\uAC1C ACC \uC870\uD68C"], ["acc.create", "ACC \uB4F1\uB85D"], ["acc.update", "ACC \uC218\uC815"], ["acc.delete", "ACC \uC0AD\uC81C"]];
function hasPermission(member, key) {
  return member?.status === "approved" && (member.role === "admin" || member.role === "coach" && Array.isArray(member.coach_permissions) && member.coach_permissions.includes(key));
}

// supabase/functions/onoff-api/media-service.js
var fail4 = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
function cleanJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) fail4("JPEG \uC0AC\uC9C4\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
  const parts = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 255) fail4("\uC0AC\uC9C4 \uD615\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    const marker = bytes[i + 1];
    if (marker === 218) {
      parts.push(bytes.subarray(i));
      const output = new Uint8Array(bytes.length);
      let length = 0;
      for (const part of parts) {
        output.set(part, length);
        length += part.length;
      }
      return output.slice(0, length);
    }
    const size = bytes[i + 2] << 8 | bytes[i + 3];
    if (size < 2 || i + 2 + size > bytes.length) fail4("\uC0AC\uC9C4 \uD30C\uC77C\uC774 \uC190\uC0C1\uB410\uC5B4\uC694.");
    if (!(marker >= 224 && marker <= 239) && marker !== 254) parts.push(bytes.subarray(i, i + 2 + size));
    i += 2 + size;
  }
  fail4("\uC0AC\uC9C4 \uD30C\uC77C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
}
var photoPreviewPath = (path) => path.replace(/\.jpg$/, ".preview.jpg");
function decodeJpeg(data, limit) {
  if (typeof data !== "string" || data.length > Math.ceil(limit / 3) * 4) fail4("\uC555\uCD95\uB41C \uC0AC\uC9C4 \uD06C\uAE30\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch {
    fail4("\uC0AC\uC9C4 \uD30C\uC77C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  }
  if (bytes.length > limit) fail4("\uC0AC\uC9C4 \uD06C\uAE30\uB97C \uC904\uC5EC\uC8FC\uC138\uC694.");
  return cleanJpeg(bytes);
}
function createMediaService(db2, { now = () => /* @__PURE__ */ new Date() } = {}) {
  const bucket = db2.storage?.from("onoff-private-photos");
  async function result(q) {
    const { data, error } = await q;
    if (error) fail4(error.code === "42501" ? "\uC0AC\uC9C4 \uC811\uADFC \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694." : "\uC0AC\uC9C4\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", error.code === "42501" ? 403 : 503);
    return data;
  }
  async function cleanup() {
    if (!bucket) return;
    try {
      const stale = await result(db2.from("gym_photos").select("id").eq("active", false).lt("created_at", new Date(+now() - 864e5).toISOString()).limit(30));
      if (stale.length) await result(db2.from("gym_photos").delete().in("id", stale.map((p) => p.id)));
      const pending = await result(db2.from("gym_photo_cleanup").select("path").limit(30));
      if (pending.length) {
        const paths = pending.map((x) => x.path);
        const { error } = await bucket.remove(paths);
        if (!error) await result(db2.from("gym_photo_cleanup").delete().in("path", paths));
      }
    } catch {
    }
  }
  async function visiblePhotos(m, photos) {
    if (m?.role === "admin") return photos;
    const ids = [...new Set(photos.map((p) => p.owner_id).filter((id2) => id2 && id2 !== m?.id))];
    const owners = ids.length ? await result(db2.from("gym_members").select("id,status,disclosure_consent").in("id", ids)) : [];
    return photos.filter((p) => !p.owner_id || p.owner_id === m?.id || owners.some((o) => o.id === p.owner_id && o.status === "approved" && o.disclosure_consent !== false));
  }
  async function route(m, path, b) {
    if (m.status !== "approved") fail4("\uC2B9\uC778\uB41C \uD68C\uC6D0\uB9CC \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
    if (path === "/api/photos/upload") {
      if (m.disclosure_consent === false) fail4("\uC0AC\uC9C4 \uACF5\uAC1C\uC5D0 \uB3D9\uC758\uD55C \uB4A4 \uC774\uC6A9\uD574\uC8FC\uC138\uC694.", 403);
      if (!["community", "daily", "notice"].includes(b.kind) || b.kind === "daily" && !hasPermission(m, "photos") || b.kind === "notice" && !hasPermission(m, "notices")) fail4("\uC0AC\uC9C4 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
      const bytes = decodeJpeg(b.data, 614400), preview = b.previewData === void 0 ? null : decodeJpeg(b.previewData, 65536);
      await cleanup();
      const pending = await result(db2.from("gym_photos").select("id").eq("owner_id", m.id).eq("active", false).limit(10));
      if (pending.length >= 10) fail4("\uBBF8\uC0AC\uC6A9 \uC0AC\uC9C4\uC774 \uB9CE\uC544\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 429);
      const id2 = crypto.randomUUID(), storagePath = m.id + "/" + id2 + ".jpg", previewPath = preview ? photoPreviewPath(storagePath) : null;
      await result(db2.from("gym_photos").insert({ id: id2, owner_id: m.id, kind: b.kind, path: storagePath, preview_path: previewPath }));
      const uploads = await Promise.allSettled([[storagePath, bytes], ...preview ? [[previewPath, preview]] : []].map(([path2, data]) => bucket.upload(path2, data, { contentType: "image/jpeg", cacheControl: "3600", upsert: false })));
      if (uploads.some((r) => r.status === "rejected" || r.value.error)) {
        await result(db2.from("gym_photos").delete().eq("id", id2).eq("owner_id", m.id));
        await cleanup();
        fail4("\uC0AC\uC9C4 \uC5C5\uB85C\uB4DC \uC2E4\uD328 \xB7 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uBA74 \uC7AC\uC5C5\uB85C\uB4DC\uD569\uB2C8\uB2E4.", 503);
      }
      try {
        await result(db2.from("gym_photos").update({ uploaded: true }).eq("id", id2).eq("owner_id", m.id));
      } catch (e) {
        await result(db2.from("gym_photos").delete().eq("id", id2).eq("owner_id", m.id));
        await cleanup();
        throw e;
      }
      return { id: id2 };
    }
    if (path === "/api/photos/preview") {
      const preview = decodeJpeg(b.previewData, 65536), photo = await result(db2.from("gym_photos").select("id,path,preview_path,owner_id").eq("id", b.id).eq("active", true).eq("uploaded", true).maybeSingle());
      if (!photo) fail4("\uC0AC\uC9C4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      if (photo.owner_id !== m.id && m.role !== "admin") fail4("\uC0AC\uC9C4 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
      if (photo.preview_path) return { ok: true };
      const previewPath = photoPreviewPath(photo.path);
      if (previewPath === photo.path) fail4("\uC0AC\uC9C4 \uACBD\uB85C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const { error } = await bucket.upload(previewPath, preview, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      if (error && !["409", "Duplicate"].includes(String(error.statusCode || error.status || error.error))) fail4("\uBBF8\uB9AC\uBCF4\uAE30\uB97C \uC900\uBE44\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", 503);
      const updated = await result(db2.from("gym_photos").update({ preview_path: previewPath }).eq("id", photo.id).eq("active", true).is("preview_path", null).select("id"));
      if (!updated?.length) {
        const current = await result(db2.from("gym_photos").select("id,preview_path").eq("id", photo.id).maybeSingle());
        if (!current) {
          await result(db2.from("gym_photo_cleanup").upsert({ path: previewPath }, { onConflict: "path" }));
          await cleanup();
        }
      }
      return { ok: true };
    }
    if (path === "/api/photos/urls") {
      if (!Array.isArray(b.ids) || b.ids.length < 1 || b.ids.length > 12 || b.ids.some((id2) => typeof id2 !== "string" || !/^[-a-f0-9]{36}$/i.test(id2))) fail4("\uC0AC\uC9C4 \uBAA9\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const photos = await visiblePhotos(m, await result(db2.from("gym_photos").select("id,path,preview_path,owner_id").eq("active", true).in("id", [...new Set(b.ids)])));
      if (!photos.length) return { urls: [] };
      const source = (p) => b.variant === "preview" && p.preview_path ? p.preview_path : p.path;
      const { data, error } = await bucket.createSignedUrls(photos.map(source), 60);
      if (error) fail4("\uC0AC\uC9C4\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.", 503);
      return { urls: photos.flatMap((p) => {
        const signed = data.find((x) => x.path === source(p));
        return signed?.signedUrl ? [{ id: p.id, url: signed.signedUrl, variant: source(p) === p.preview_path ? "preview" : "full" }] : [];
      }), expiresIn: 60 };
    }
    if (path === "/api/photos/program") {
      if (!hasPermission(m, "photos")) fail4("\uC0AC\uC9C4 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
      return result(db2.rpc("onoff_photo_program", { actor: m.id, photo_id: b.id, target_program: b.program }));
    }
    if (path === "/api/photos/url") {
      const photo = await result(db2.from("gym_photos").select("*").eq("id", b.id).eq("active", true).maybeSingle());
      if (!photo || !(await visiblePhotos(m, [photo])).length) fail4("\uC0AC\uC9C4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      const { data, error } = await bucket.createSignedUrl(b.variant === "preview" && photo.preview_path ? photo.preview_path : photo.path, 60);
      if (error) fail4("\uC0AC\uC9C4\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694.", 503);
      return { url: data.signedUrl, variant: b.variant === "preview" && photo.preview_path ? "preview" : "full", expiresIn: 60 };
    }
    if (path === "/api/photos/attach") {
      if (b.kind !== "daily") fail4("\uC0AC\uC9C4 \uC885\uB958\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (!hasPermission(m, "photos")) fail4("\uC0AC\uC9C4 \uAD00\uB9AC \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
      return result(db2.rpc("onoff_attach_photos", { actor: m.id, p: b }));
    }
    if (path === "/api/photos/delete") {
      const photo = await result(db2.from("gym_photos").select("*").eq("id", b.id).maybeSingle());
      if (!photo) fail4("\uC0AC\uC9C4\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      if (photo.active ? photo.kind === "daily" ? !hasPermission(m, "photos") : photo.kind === "notice" ? !hasPermission(m, "notices") : m.role !== "admin" : photo.owner_id !== m.id) fail4("\uC0AC\uC9C4 \uC0AD\uC81C \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694.", 403);
      await result(db2.from("gym_photos").delete().eq("id", photo.id));
      await cleanup();
      return { ok: true };
    }
    fail4("\uC0AC\uC9C4 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.", 404);
  }
  async function list(date, postIds, noticeIds = [], member) {
    if (!bucket) return [];
    const fields = "id,kind,post_id,notice_id,date,program,session,owner_id,preview_path";
    const [daily, community, notices] = await Promise.all([result(db2.from("gym_photos").select(fields).eq("active", true).eq("kind", "daily").eq("date", date)), postIds.length ? result(db2.from("gym_photos").select(fields).eq("active", true).in("post_id", postIds)) : [], noticeIds.length ? result(db2.from("gym_photos").select(fields).eq("active", true).in("notice_id", noticeIds)) : []]);
    return (await visiblePhotos(member, [...daily, ...community, ...notices])).map(({ owner_id, preview_path, ...photo }) => ({ ...photo, hasPreview: !!preview_path, canPreparePreview: owner_id === member?.id || member?.role === "admin" }));
  }
  return { route, list, cleanup };
}

// web/avatars.js
var AVATAR_EMOJIS = ["\u{1F3CB}\uFE0F", "\u{1F4AA}", "\u{1F525}", "\u26A1", "\u{1F3C3}", "\u{1F6B4}", "\u{1F938}", "\u{1F947}", "\u{1F3C6}", "\u{1F3AF}", "\u{1F680}", "\u{1F31F}", "\u{1F60E}", "\u{1F60A}", "\u{1F43B}", "\u{1F42F}", "\u{1F981}", "\u{1F43C}", "\u{1F430}", "\u{1F98A}", "\u{1F438}", "\u{1F435}", "\u{1F436}", "\u{1F431}", "\u{1F984}", "\u{1F427}", "\u{1F985}", "\u{1F42C}", "\u{1F30A}", "\u{1F340}", "\u{1F308}", "\u{1F351}", "\u{1F43A}", "\u{1F439}", "\u{1F428}", "\u{1F42E}", "\u{1F437}", "\u{1F419}", "\u{1F996}", "\u{1F422}", "\u{1F98B}", "\u{1F41D}", "\u{1F41E}", "\u{1F989}", "\u{1F433}", "\u{1F988}", "\u{1F980}", "\u{1F40A}", "\u{1F601}", "\u{1F602}", "\u{1F973}", "\u{1F929}", "\u{1F913}", "\u{1F608}", "\u{1F47B}", "\u{1F47D}", "\u{1F916}", "\u{1F920}", "\u{1F917}", "\u{1FAE1}", "\u{1F34E}", "\u{1F34A}", "\u{1F34B}", "\u{1F349}", "\u{1F353}", "\u{1F352}", "\u{1F951}", "\u{1F966}", "\u{1F955}", "\u{1F33D}", "\u{1F354}", "\u{1F355}", "\u2615", "\u{1F369}", "\u{1F33B}", "\u{1F335}", "\u{1F334}", "\u{1F341}", "\u2744\uFE0F", "\u{1F319}"];
var validAvatar = (value) => AVATAR_EMOJIS.includes(value);
var avatarEmoji = (value) => validAvatar(value) ? value : "\u{1F3CB}\uFE0F";

// supabase/functions/onoff-api/account-service.js
var photoPaths = (paths) => [...new Set(paths.flatMap((path) => [path, photoPreviewPath(path)]))];
var fail5 = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
function createAccountService(db2, { reauthenticate } = {}) {
  return { async removeByAdmin(member, b) {
    if (member.role !== "admin" || member.status !== "approved" || member.id === b.id) fail5("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
    const args = { actor: member.id, target: b.id, request_id: b.requestId };
    const prepared = await db2.rpc("onoff_account_delete_prepare", { ...args, confirmed_name: b.confirmedName });
    if (prepared.error) fail5(prepared.error.code === "42501" ? "\uACC4\uC815 \uC0AD\uC81C \uAD8C\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." : prepared.error.code === "23514" ? "\uB9C8\uC9C0\uB9C9 \uC6B4\uC601\uC790\uB294 \uC0AD\uC81C\uD560 \uC218 \uC5C6\uC5B4\uC694." : "\uD68C\uC6D0 \uC774\uB984\uACFC \uC0AD\uC81C \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.", prepared.error.code === "42501" ? 403 : 409);
    if (!prepared.data?.already) {
      const paths = photoPaths(prepared.data?.paths || []);
      if (paths.length) {
        const bucket = db2.storage?.from("onoff-private-photos");
        if (!bucket) fail5("\uC0AC\uC9C4 \uC0AD\uC81C \uC5F0\uACB0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.", 503);
        for (let i = 0; i < paths.length; i += 100) {
          const removed = await bucket.remove(paths.slice(i, i + 100));
          if (removed.error) fail5("\uC0AC\uC9C4 \uC0AD\uC81C\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uACC4\uC815 \uC0AD\uC81C\uB97C \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
        }
      }
      const deleted = await db2.auth.admin.deleteUser(b.id, false);
      if (deleted.error) fail5("\uACC4\uC815 \uC0AD\uC81C\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
    }
    const completed = await db2.rpc("onoff_account_delete_complete", args);
    if (completed.error) fail5("\uACC4\uC815 \uC0AD\uC81C \uC644\uB8CC \uD655\uC778\uC744 \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
    return { ok: true, deleted: true };
  }, async withdraw(member, b) {
    if (b.confirmed !== true || typeof b.password !== "string" || !b.password || b.password.length > 128) fail5("\uD0C8\uD1F4 \uB3D9\uC758\uC640 \uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    if (!member.email || !reauthenticate) fail5("\uC774\uBA54\uC77C \uB85C\uADF8\uC778\uC744 \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.", 401);
    const session = await reauthenticate(member.email, b.password);
    if (!session || session.user?.id !== member.id || !session.accessToken) fail5("\uD604\uC7AC \uBE44\uBC00\uBC88\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.", 403);
    const prepared = await db2.rpc("onoff_withdraw_prepare", { actor: member.id });
    if (prepared.error) fail5(prepared.error.code === "23514" ? "\uB9C8\uC9C0\uB9C9 \uC6B4\uC601\uC790\uB294 \uB2E4\uB978 \uC2B9\uC778\uB41C \uC6B4\uC601\uC790\uC5D0\uAC8C \uAD8C\uD55C\uC744 \uB118\uAE34 \uB4A4 \uD0C8\uD1F4\uD560 \uC218 \uC788\uC5B4\uC694." : "\uD0C8\uD1F4 \uC694\uCCAD\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", prepared.error.code === "23514" ? 409 : 503);
    if (db2.storage?.from) {
      const photos = await db2.from("gym_photos").select("path").eq("owner_id", member.id);
      if (photos.error) fail5("\uC0AC\uC9C4 \uC0AD\uC81C \uC900\uBE44\uB97C \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
      const paths = photoPaths((photos.data || []).map((x) => x.path));
      for (let i = 0; i < paths.length; i += 100) {
        const removed2 = await db2.storage.from("onoff-private-photos").remove(paths.slice(i, i + 100));
        if (removed2.error) fail5("\uC0AC\uC9C4 \uC0AD\uC81C\uB97C \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
      }
    }
    const revoked = await db2.auth.admin.signOut(session.accessToken, "global");
    if (revoked.error) fail5("\uB85C\uADF8\uC778 \uC5F0\uACB0 \uD574\uC81C\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD55C \uB4A4 \uD0C8\uD1F4\uB97C \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
    const removed = await db2.auth.admin.deleteUser(member.id, false);
    if (removed.error) fail5("\uACC4\uC815 \uC0AD\uC81C\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD55C \uB4A4 \uD0C8\uD1F4\uB97C \uC7AC\uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", 503);
    return { ok: true, deleted: true };
  } };
}

// web/member-approval.js
var DEFAULT_REJECTION_REASON = "\uD68C\uC6D0 \uD655\uC778\uC774 \uC5B4\uB824\uC6CC \uAC00\uC785\uC774 \uC2B9\uC778\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uCCB4\uC721\uAD00 \uCE74\uC6B4\uD130\uC5D0 \uBB38\uC758\uD574\uC8FC\uC138\uC694.";
function isRejectedMember(member) {
  return member?.status === "suspended" && !member.approved_at && !member.delete_requested_at;
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
  const b = { orientation: value.orientation ?? "landscape", btColor: value.btColor ?? "blue", wodColor: value.wodColor ?? "orange", unit: value.unit ?? "lbs", pageSeconds: Number(value.pageSeconds ?? 20) };
  if (!["landscape", "portrait"].includes(b.orientation) || !TV_COLORS.some((c) => c.id === b.btColor) || !TV_COLORS.some((c) => c.id === b.wodColor) || !["lbs", "kg"].includes(b.unit) || ![15, 20, 30, 45].includes(b.pageSeconds)) throw Error("\uC218\uC5C5 \uC0C9\uC0C1\xB7\uC911\uB7C9 \uB2E8\uC704\xB7\uD398\uC774\uC9C0 \uC804\uD658 \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
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

// web/membership-reminder.js
function membershipReminderEligible(member, pass, payload, at = /* @__PURE__ */ new Date()) {
  const day = kstDate(at), hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" }).format(at);
  return !!(member?.status === "approved" && !member.delete_requested_at && pass && pass.user_id === member.id && payload?.membershipId === pass.id && normalizeDate(payload.endDate) && pass.end_date === payload.endDate && pass.end_date === addDays(day, 3) && pass.start_date <= day && !pass.paused_at && (pass.kind === "period" || pass.kind === "visits" && pass.remaining_visits > 0) && Number(hour) >= 9);
}
function membershipReminderPayload(pass) {
  return { title: "\uD68C\uC6D0\uAD8C \uB9CC\uB8CC 3\uC77C \uC804", body: `\uD68C\uC6D0\uAD8C\uC774 ${pass.end_date}\uC5D0 \uB9CC\uB8CC\uB3FC\uC694. \uC774\uC6A9 \uAE30\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.`, url: "/Onoffgym/?membership=expiry#settings", tag: `membership-expiry:${pass.id}:${pass.end_date}` };
}

// worker/push.js
function unbase64(s) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}
function base64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
var utf = (s) => new TextEncoder().encode(s);
var concat = (...arrays) => {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};
function validateSubscription(value) {
  try {
    const u = new URL(value.endpoint), h = u.hostname;
    const allowed = h === "fcm.googleapis.com" || h === "updates.push.services.mozilla.com" || h.endsWith(".push.services.mozilla.com") || h === "web.push.apple.com" || h.endsWith(".push.apple.com") || h.endsWith(".notify.windows.com");
    if (u.protocol !== "https:" || u.username || u.password || u.port || !allowed || value.endpoint.length > 2e3) return null;
    const auth = unbase64(value.keys.auth), p256dh = unbase64(value.keys.p256dh);
    if (auth.length !== 16 || p256dh.length !== 65 || p256dh[0] !== 4) return null;
    return { endpoint: u.href, keys: { auth: value.keys.auth, p256dh: value.keys.p256dh } };
  } catch {
    return null;
  }
}
async function hkdf(ikm, salt, info, size) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, size * 8));
}
async function encryptPush(subscription, payload) {
  const receiver = unbase64(subscription.keys.p256dh), auth = unbase64(subscription.keys.auth), ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), server = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)), client = await crypto.subtle.importKey("raw", receiver, { name: "ECDH", namedCurve: "P-256" }, false, []), shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: client }, ephemeral.privateKey, 256)), salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(shared, auth, concat(utf("WebPush: info\0"), receiver, server), 32), cek = await hkdf(ikm, salt, utf("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(ikm, salt, utf("Content-Encoding: nonce\0"), 12), key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(utf(JSON.stringify(payload)), new Uint8Array([2]));
  if (plain.length > 3e3) throw Error("Push payload too large");
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain)), rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([server.length]), server, ciphertext);
}
async function vapidAuthorization(endpoint, env, now = /* @__PURE__ */ new Date()) {
  const header = base64(utf(JSON.stringify({ typ: "JWT", alg: "ES256" }))), claims = base64(utf(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(+now / 1e3) + 12 * 3600, sub: env.VAPID_SUBJECT }))), unsigned = header + "." + claims, key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]), signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf(unsigned));
  return "vapid t=" + unsigned + "." + base64(signature) + ", k=" + env.VAPID_PUBLIC_KEY;
}
async function pushDigest(value) {
  return base64(await crypto.subtle.digest("SHA-256", utf(value)));
}

// supabase/functions/onoff-api/push-service.js
var fail6 = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
var same = (a, b) => {
  a = String(a || "");
  b = String(b || "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};
function createPushService(db2, { now = () => /* @__PURE__ */ new Date(), pushFetch = fetch, maintenance = async () => {
} } = {}) {
  async function result(q) {
    const { data, error } = await q;
    if (error) fail6(error.code === "42501" ? "\uC54C\uB9BC \uC694\uCCAD \uAD8C\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." : "\uC54C\uB9BC \uC694\uCCAD\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", error.code === "42501" ? 403 : 400);
    return data;
  }
  const one = (table, key, value) => result(db2.from(table).select("*").eq(key, value).maybeSingle());
  const setting = async (key, fallback = null) => (await one("gym_settings", "key", key))?.value ?? fallback;
  async function keys() {
    let value = await setting("pushVapid");
    if (value) return value;
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]), candidate = { publicKey: base64(await crypto.subtle.exportKey("raw", pair.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey), subject: "mailto:goffo@naver.com" };
    return result(db2.rpc("onoff_push_keys", { candidate }));
  }
  async function access(req) {
    const code = req.headers.get("X-OnOff-Push-Test") || "";
    if (!/^[a-f0-9]{32}$/.test(code)) fail6("\uC720\uD6A8\uD55C \uD478\uC2DC \uD14C\uC2A4\uD2B8 \uB9C1\uD06C \uB610\uB294 \uCF54\uB4DC\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.", 401);
    const hash = await pushDigest(code), test = await one("gym_push_tests", "hash", hash);
    if (!test || Date.parse(test.expires) <= +now()) fail6("\uD478\uC2DC \uD14C\uC2A4\uD2B8 \uB9C1\uD06C\uAC00 \uB9CC\uB8CC\uB410\uC5B4\uC694.", 401);
    return { hash, test };
  }
  async function subscribe(actor, testHash, b) {
    const sub = validateSubscription(b.subscription);
    if (!sub) fail6("\uC54C\uB9BC \uAD6C\uB3C5 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    const id2 = await pushDigest(sub.endpoint), preferences = { notices: b.preferences?.notices !== false, workouts: b.preferences?.workouts !== false, approvals: b.preferences?.approvals !== false, memberships: b.preferences?.memberships !== false };
    await result(db2.rpc("onoff_push_subscribe", { actor, test_code: testHash, sub_id: id2, sub_body: sub, prefs: preferences }));
    return { ok: true, id: id2 };
  }
  async function enqueue({ id: id2, kind, payload, targetId = null, testHash = null, dueAt }) {
    await result(db2.from("gym_push_jobs").upsert({ id: id2, kind, payload, target_id: targetId, test_hash: testHash, ...dueAt ? { due_at: dueAt } : {} }, { onConflict: "id", ignoreDuplicates: true }));
  }
  async function dispatch() {
    const config = await keys(), jobs = await result(db2.rpc("onoff_push_claim", { max_count: 100 }));
    let cursor = 0, sent = 0, failed = 0;
    await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, async () => {
      for (; ; ) {
        const job = jobs[cursor++];
        if (!job) return;
        let state = "failed", reason = null;
        try {
          const current = await one("gym_push_subscriptions", "id", job.subscriptionId);
          if (!current) continue;
          let membership = null, allowed = false;
          if (current.user_id) {
            const member = await one("gym_members", "id", current.user_id);
            allowed = member?.status === "approved" && (job.kind === "test" || current.preferences?.[job.kind] !== false);
            if (job.kind === "approvals") {
              const pending = await one("gym_members", "id", job.subjectId);
              allowed = allowed && member?.role === "admin" && (pending?.status === "pending" || pending?.status === "approved" && job.payload?.signupEvent === true);
            }
            if (job.kind === "memberships") {
              membership = await one("gym_memberships", "user_id", current.user_id);
              allowed = allowed && current.user_id === job.subjectId && membershipReminderEligible(member, membership, job.payload, now());
            }
          } else if (current.test_hash) {
            const test = await one("gym_push_tests", "hash", current.test_hash);
            allowed = job.kind === "test" && current.test_hash === job.testHash && Date.parse(test?.expires) > +now();
          }
          let meetup = null;
          if (job.payload?.meetupId) {
            meetup = await one("gym_posts", "id", job.payload.meetupId);
            const writer = meetup ? await one("gym_members", "id", meetup.author_id) : null;
            allowed = allowed && meetup?.category === "\uC6B4\uB3D9 \uBC88\uAC1C" && writer?.status === "approved" && writer?.disclosure_consent !== false && !!meetupMessage(meetup.starts_at) && !meetupLifecycle(meetup, now()).closed;
          }
          if (!allowed) {
            state = "skipped";
            reason = job.kind === "approvals" ? "\uAC00\uC785 \uC54C\uB9BC \uB300\uC0C1 \uC870\uAC74\uC774 \uBCC0\uACBD\uB418\uC5B4 \uBC1C\uC1A1 \uC81C\uC678" : "\uC54C\uB9BC \uC218\uC2E0 \uC870\uAC74\uC774 \uBCC0\uACBD\uB418\uC5B4 \uBC1C\uC1A1 \uC81C\uC678";
          } else {
            const subscription = validateSubscription(current.body);
            if (!subscription) throw Error("Invalid subscription");
            const payload = job.kind === "memberships" ? membershipReminderPayload(membership) : meetup ? { title: "\uC6B4\uB3D9 \uBC88\uAC1C", body: meetupMessage(meetup.starts_at), url: "/Onoffgym/?post=" + encodeURIComponent(meetup.id) + "#community", tag: "meetup:" + meetup.id } : job.kind === "approvals" ? { ...job.payload, url: "/Onoffgym/?approval=" + encodeURIComponent(job.subjectId) + "#admin/members" } : job.payload;
            const body = await encryptPush(subscription, payload), authorization = await vapidAuthorization(subscription.endpoint, { VAPID_PUBLIC_KEY: config.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(config.privateJwk), VAPID_SUBJECT: config.subject }, now());
            const response = await pushFetch(subscription.endpoint, { method: "POST", headers: { Authorization: authorization, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "3600", Urgency: job.kind === "test" ? "high" : "normal" }, body, redirect: "error", signal: AbortSignal.timeout(8e3) });
            if (!response.ok) reason = "\uD478\uC2DC \uC11C\uBE44\uC2A4 HTTP " + response.status;
            if (response.ok) {
              state = "sent";
              sent++;
            } else if ([404, 410].includes(response.status)) {
              await result(db2.from("gym_push_subscriptions").delete().eq("id", job.subscriptionId));
              continue;
            }
          }
        } catch {
          failed++;
          reason = "\uB124\uD2B8\uC6CC\uD06C\xB7\uC554\uD638\uD654 \uCC98\uB9AC \uC2E4\uD328 \uB610\uB294 \uC2DC\uAC04 \uCD08\uACFC";
        }
        await result(db2.from("gym_push_deliveries").update({ status: state, last_error: reason, updated_at: now().toISOString() }).eq("job_id", job.jobId).eq("subscription_id", job.subscriptionId));
      }
    }));
    return { ok: true, processed: jobs.length, sent, failed };
  }
  async function status(member) {
    const config = await setting("pushVapid"), sub = await result(db2.from("gym_push_subscriptions").select("id").eq("user_id", member.id).limit(1));
    return { configured: !!config, publicKey: config?.publicKey || "", schedulerConfigured: await setting("pushCronEnabled", false), subscribed: sub.length > 0 };
  }
  async function testStatus(hash) {
    const jobs = await result(db2.from("gym_push_jobs").select("id,due_at,created_at,payload").eq("test_hash", hash).order("created_at", { ascending: false }).limit(10)), ids = jobs.map((j) => j.id);
    const deliveries = ids.length ? await result(db2.from("gym_push_deliveries").select("job_id,status").in("job_id", ids)) : [];
    return jobs.map((j) => ({ ...j, status: deliveries.find((d) => d.job_id === j.id)?.status || "pending" }));
  }
  async function publicRoute(req, path, b) {
    if (path === "/api/push/dispatch") {
      const secret = await setting("pushCronSecret");
      if (!secret || !same(req.headers.get("X-OnOff-Worker"), secret)) fail6("\uC54C\uB9BC \uBC1C\uC1A1 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694.", 401);
      await maintenance();
      return dispatch();
    }
    const { hash, test } = await access(req);
    if (path === "/api/push/test-access/config") return { publicKey: (await keys()).publicKey, expires: test.expires, schedulerConfigured: await setting("pushCronEnabled", false) };
    if (path === "/api/push/test-access/status") return { jobs: await testStatus(hash) };
    if (path === "/api/push/test-access/subscribe") return subscribe(null, hash, b);
    const endpoint = typeof b.endpoint === "string" ? b.endpoint : "", id2 = await pushDigest(endpoint);
    if (path === "/api/push/test-access/unsubscribe") {
      await result(db2.from("gym_push_subscriptions").delete().eq("id", id2).eq("test_hash", hash));
      return { ok: true };
    }
    if (path === "/api/push/test-access/send") {
      const job = await result(db2.rpc("onoff_push_compose", { actor: null, test_code: hash, p: { mode: "test", title: b.title || "ONOFF \uD478\uC2DC \uD14C\uC2A4\uD2B8", body: b.body || "\uC571\uC744 \uB2EB\uC740 \uC0C1\uD0DC\uC758 \uC54C\uB9BC \uC218\uC2E0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.", subscriptionId: id2, delayed: b.delayed === true } }));
      return { ok: true, job, queued: true };
    }
    fail6("\uC54C\uB9BC \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
  }
  async function memberRoute(member, path, b) {
    if (["/api/push/compose", "/api/push/history"].includes(path)) {
      if (!hasPermission(member, "push")) fail6("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
      if (path.endsWith("/history")) return { jobs: await result(db2.rpc("onoff_push_history", { actor: member.id })) };
      if (!["test", "all"].includes(b.mode)) fail6("\uBC1C\uC1A1 \uB300\uC0C1\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (b.mode === "test" && !b.endpoint) fail6("\uC774 \uAE30\uAE30\uC5D0\uC11C \uC54C\uB9BC\uC744 \uBA3C\uC800 \uCF1C\uC8FC\uC138\uC694.");
      const job = await result(db2.rpc("onoff_push_compose", { actor: member.id, test_code: null, p: { mode: b.mode, title: "ONOFF", body: b.body, subscriptionId: await pushDigest(b.endpoint || ""), delayed: b.mode === "test" } }));
      return { ok: true, queued: true, job };
    }
    if (path === "/api/push/subscribe") {
      await keys();
      return subscribe(member.id, null, b);
    }
    const id2 = await pushDigest(typeof b.endpoint === "string" ? b.endpoint : "");
    if (path === "/api/push/unsubscribe") {
      await result(db2.from("gym_push_subscriptions").delete().eq("id", id2).eq("user_id", member.id));
      return { ok: true };
    }
    if (path === "/api/push/test") fail6("\uAC1C\uC778\uC124\uC815\uC758 \uC2DC\uD5D8 \uBC1C\uC1A1\uC740 \uC885\uB8CC\uB410\uC5B4\uC694. \uBCC4\uB3C4 \uD478\uC2DC \uD14C\uC2A4\uD2B8 \uD654\uBA74\uC744 \uC0AC\uC6A9\uD574\uC8FC\uC138\uC694.", 410);
    fail6("\uC54C\uB9BC \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
  }
  return { status, dispatch, enqueue, publicRoute, memberRoute };
}

// supabase/functions/onoff-api/server.js
var ORIGINS = /* @__PURE__ */ new Set(["https://nuclearstark.github.io", "https://onoffgym.pages.dev", "https://onoff-crossfit-gym.powerloding.chatgpt.site"]);
var bad = (message, status = 400, extra = {}) => {
  throw Object.assign(Error(message), { status, ...extra });
};
var uuid3 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var text = (v, min, max, label) => {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) bad(label + "\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return v.trim();
};
function createHandler(db2, { verifyUser, reauthenticate, fetchCalendar = fetch, now = () => /* @__PURE__ */ new Date() } = {}) {
  const overview = createMemberOverviewService(db2);
  const media = createMediaService(db2, { now }), points = createPointsService(db2, { now });
  const push = createPushService(db2, { now, maintenance: () => media.cleanup() }), account = createAccountService(db2, { reauthenticate }), named = createNamedService(db2);
  async function result(q) {
    const { data, error } = await q;
    if (error) {
      const code = error.code;
      if (code === "23514") bad(error.message?.includes("14\uC138") ? "\uD68C\uC6D0\uC774 \uBA3C\uC800 \uC131\uBCC4\xB7\uB9CC 14\uC138 \uC774\uC0C1 \uD655\uC778\uACFC \uAC1C\uC778\uC815\uBCF4 \uC548\uB0B4 \uB3D9\uC758\uB97C \uC644\uB8CC\uD574\uC57C \uC2B9\uC778\uD560 \uC218 \uC788\uC5B4\uC694." : "\uBCC0\uACBD\uD560 \uC218 \uC5C6\uB294 \uACC4\uC815 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.", 409);
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
    if (!token) bad("\uC774\uBA54\uC77C\uB85C \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694.", 401);
    const user = await verifyUser(token);
    if (!user?.id || user.is_anonymous) bad("\uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694.", 401);
    let m = await one("gym_members", "id", user.id);
    if (!m) m = await commit(user.id, "ensure-member");
    return { ...m, email: user.email || "" };
  }
  const approved = (m) => {
    if (m.status !== "approved") bad("\uAD00\uB9AC\uC790 \uC2B9\uC778 \uD6C4 \uC774\uC6A9\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
  };
  const permit = (m, key) => {
    approved(m);
    if (!hasPermission(m, key)) bad("\uC774 \uAE30\uB2A5\uC758 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
  };
  const admin = (m) => {
    approved(m);
    if (m.role !== "admin") bad("\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD574\uC694.", 403);
  };
  async function videoCategories() {
    const data = await rows("gym_video_categories", (q) => q.order("position").order("label"));
    return data.length ? data.map((c) => [c.id, c.label]) : VIDEO_CATEGORIES;
  }
  async function library() {
    const [custom, catalogue, categories, redirects] = await Promise.all([rows("gym_movements"), setting("rmCatalogue", DEFAULT_RM_CATALOGUE), videoCategories(), setting("videoCategoryRedirects", {})]);
    const map = new Map(MOVEMENTS.map((name) => [name, { name, videoId: "", notes: "" }])), deleted = new Set(custom.filter((m) => m.deleted).map((m) => m.name));
    for (const m of custom) if (!m.deleted) map.set(m.name, { ...m.body, name: m.name, categoryId: m.category_id || m.body.categoryId });
    for (const m of catalogue) for (const name of [m.name, ...m.aliases || []]) if (!map.has(name)) map.set(name, { name, videoId: "", notes: "" });
    return [...map.values()].filter((m) => !deleted.has(m.name)).map((m) => ({ ...m, categoryId: resolveVideoCategory(m.categoryId || videoCategory(m.name, catalogue), categories, redirects) }));
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
    const rt = await setting("releaseTime", "22:00"), clock2 = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now());
    return { revision: [await setting("revision", 0), kstDate(now()), clock2 >= rt ? 1 : 0, m.status, m.role].join(":"), serverNow: now().toISOString() };
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
  async function joinAccess(m, id2) {
    const [post, pass] = await Promise.all([one("gym_posts", "id", id2), one("gym_memberships", "user_id", m.id)]), author = post ? await one("gym_members", "id", post.author_id) : null, day = kstDate(now());
    const attendance = pass?.kind === "visits" && pass.remaining_visits === 0 ? await rows("gym_attendance", (q) => q.eq("user_id", m.id).eq("date", day).eq("membership_id", pass.id)) : [];
    return participationAccess({ viewer: m, author, post, pass, today: day, attendedToday: attendance.length > 0, now: now() });
  }
  async function bootstrap(m, url) {
    const rev = await revision(m);
    if (m.status !== "approved") return { viewer: m, privacyReviewRequired: m.privacy_version !== PRIVACY_VERSION || !validGender(m.gender), workouts: {}, library: [], members: [], ...rev };
    const staff = m.role === "admin", all = hasPermission(m, "workouts.read") && url.searchParams.get("view") !== "member", day = kstDate(now()), viewDate = normalizeDate(url.searchParams.get("date")) || day;
    const [pass, att, memberRows, prefs, cal, noticeRows, cat, lib, pointData] = await Promise.all([
      one("gym_memberships", "user_id", m.id),
      rows("gym_attendance", (q) => q.eq("user_id", m.id).order("date", { ascending: false }).limit(1e3)),
      rows("gym_members", (q) => staff ? q : q.eq("status", "approved")),
      one("gym_preferences", "user_id", m.id),
      calendar(),
      rows("gym_notices", (q) => q.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200)),
      setting("rmCatalogue", DEFAULT_RM_CATALOGUE),
      library(),
      points.snapshot(m)
    ]);
    const access = membershipState(pass, day, att.some((a) => a.date === day && a.membership_id === pass?.id)), canRead = staff || m.role === "coach" || access.active;
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
    if (canRead) {
      const extras = await rows("gym_posts", (q) => q.eq("banner_pinned", true).eq("category", "\uC6B4\uB3D9 \uBC88\uAC1C").order("starts_at").limit(100));
      const linked = url.searchParams.get("post");
      if (uuid3(linked)) {
        const post = await one("gym_posts", "id", linked);
        if (post) extras.push(post);
      }
      const merged = [...new Map([...posts, ...extras].map((p) => [p.id, p])).values()];
      posts.splice(0, posts.length, ...merged.filter((p) => {
        const author = memberRows.find((m2) => m2.id === p.author_id);
        return !meetupLifecycle(p, now()).expired && (staff || author?.disclosure_consent !== false || p.author_id === m.id);
      }));
    }
    const pointBalances = staff ? await rows("gym_point_accounts") : [];
    const rankingOwners = new Set(memberRows.filter((x) => x.status === "approved" && x.disclosure_consent === true).map((x) => x.id));
    const records = [...new Map([...ownRecords, ...selectedRecords].map((r) => [r.id, r])).values()], names = new Map(memberRows.map((x) => [x.id, x.name])), rank = /* @__PURE__ */ new Map(), avatars = /* @__PURE__ */ new Map();
    if (canRead) {
      for (const p of await rows("gym_preferences", (q) => q.limit(1e3))) {
        rank.set(p.user_id, p.body.rank !== false);
        avatars.set(p.user_id, avatarEmoji(p.body.avatarEmoji));
      }
    }
    const accRows = canRead ? await rows("gym_acc_workouts", (q) => {
      q = q.or(`date.gte.${addDays(day, -30)},date.eq.${viewDate}`);
      return (hasPermission(m, "acc.read") && url.searchParams.get("view") !== "member" ? q : q.lte("release_at", now().toISOString())).order("date", { ascending: false }).limit(1e3);
    }) : [];
    const [savedTools, photoRecords] = await Promise.all([setting("recordTools", DEFAULT_RECORD_TOOLS), readPhotoHistory(db2, m, memberRows)]);
    const recordTools = { attendance: { ...DEFAULT_RECORD_TOOLS.attendance, ...savedTools?.attendance } };
    return {
      recordTools,
      photoRecords,
      named: await named.snapshot(m),
      privacyReviewRequired: m.privacy_version !== PRIVACY_VERSION || !validGender(m.gender),
      points: pointData,
      accWorkouts: Object.fromEntries(accRows.map((w) => [w.date, w.body])),
      videoCategories: await videoCategories(),
      viewer: m,
      ...rev,
      memberView: !all,
      shared: true,
      releaseTime: await setting("releaseTime", "22:00"),
      banner: await setting("banner", DEFAULT_BANNER),
      rmCatalogue: cat,
      rmCategories: await setting("rmCategories", RM_CATEGORIES),
      library: lib,
      calendar: cal,
      membership: pass,
      membershipState: access,
      memberships: passes,
      membershipEvents: events.map((e) => ({ ...e, body: JSON.stringify(e.body) })),
      memberAttendance: attAll,
      attendance: att.map((a) => a.date),
      recordMembers: hasPermission(m, "records.create") || hasPermission(m, "records.update") ? memberRows.filter((x) => x.status === "approved").map((x) => ({ id: x.id, name: x.name, status: x.status })) : [],
      members: staff ? memberRows.map((x) => ({ ...x, pointBalance: Number(pointBalances.find((a) => a.user_id === x.id)?.balance || 0), avatarEmoji: avatars.get(x.id) || avatarEmoji(), note: notes.find((n) => n.user_id === x.id)?.note || "" })) : [],
      workouts: Object.fromEntries(ws.map((w) => [w.key, w.body])),
      publishedDates: [...new Set(ws.filter((w) => Date.parse(w.release_at) <= +now()).map((w) => w.date))],
      notices: canRead ? noticeRows.map((n) => ({ ...n, category: "\uACF5\uC9C0\uC0AC\uD56D", author: names.get(n.author_id) || "\uC6B4\uC601\uC790", serverNotice: true, date: kstDate(new Date(n.created_at)), comments: [], joined: [] })) : [],
      records: records.filter((r) => staff || r.user_id === m.id || memberRows.find((x) => x.id === r.user_id)?.disclosure_consent !== false).map((r) => ({ ...r.body, id: r.id, memberId: r.user_id, name: names.get(r.user_id) || "\uD68C\uC6D0", avatarEmoji: avatars.get(r.user_id) || avatarEmoji(), rank: rank.get(r.user_id) !== false && rankingOwners.has(r.user_id) })),
      photos: canRead ? await media.list(viewDate, posts.map((p) => p.id), noticeRows.map((n) => n.id), m) : [],
      rms: rms.map((r) => ({ ...r.body, id: r.id, memberId: r.user_id })),
      preferences: prefs?.body || {},
      posts: posts.map((p) => ({ ...p, viewerJoined: joins.some((j) => j.post_id === p.id && j.user_id === m.id), joinAccess: participationAccess({ viewer: m, author: memberRows.find((x) => x.id === p.author_id), post: p, pass, today: day, attendedToday: att.some((a) => a.date === day && a.membership_id === pass?.id), now: now() }), authorId: p.author_id, author: names.get(p.author_id) || "\uD68C\uC6D0", date: kstDate(new Date(p.created_at)), joined: [], joinedIds: joins.filter((j) => j.post_id === p.id && memberRows.find((x) => x.id === j.user_id)?.disclosure_consent !== false).map((j) => j.user_id), joinedNames: Object.fromEntries(joins.filter((j) => j.post_id === p.id && memberRows.find((x) => x.id === j.user_id)?.disclosure_consent !== false).map((j) => [j.user_id, names.get(j.user_id) || "\uD68C\uC6D0"])), comments: comments.filter((c) => c.post_id === p.id && memberRows.find((x) => x.id === c.author_id)?.disclosure_consent !== false).map((c) => ({ ...c, authorId: c.author_id, author: names.get(c.author_id) || "\uD68C\uC6D0" })) })),
      tv: hasPermission(m, "tv") ? await tvSettings() : void 0,
      push: await push.status(m),
      historyLimit: 1e3
    };
  }
  async function route(req, path, url, b) {
    if (path === "/api/health") return { ok: true, backend: "supabase", serverNow: now().toISOString() };
    if (path === "/api/push/dispatch" || path.startsWith("/api/push/test-access/")) return push.publicRoute(req, path, b);
    if (["/api/tv/login", "/api/tv/logout", "/api/tv/bootstrap", "/api/tv/heartbeat"].includes(path)) return tv(req, path, b);
    const m = await member(req);
    if (path === "/api/bootstrap" && m.status === "approved") await media.cleanup();
    if (path === "/api/account/delete") return account.withdraw(m, b);
    if (path === "/api/signup/reapply") {
      if (m.delete_requested_at || m.approved_at || !isRejectedMember(m) && m.status !== "pending") bad("\uC7AC\uC2B9\uC778 \uC694\uCCAD\uC774 \uAC00\uB2A5\uD55C \uACC4\uC815\uC774 \uC544\uB2C8\uC5D0\uC694.", 403);
      return result(db2.rpc("onoff_signup_reapply", { actor: m.id, member_name: text(b.name, 2, 30, "\uC2E4\uBA85") }));
    }
    if (path === "/api/privacy/accept") {
      if (!validGender(b.gender)) bad("\uC131\uBCC4\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
      if (b.version !== PRIVACY_VERSION || b.ageOver14 !== true || typeof b.disclosure !== "boolean") bad("\uB9CC 14\uC138 \uC774\uC0C1 \uD655\uC778\uACFC \uAC1C\uC778\uC815\uBCF4 \uC548\uB0B4 \uB3D9\uC758\uAC00 \uD544\uC694\uD574\uC694.");
      return result(db2.rpc("onoff_privacy_accept", { actor: m.id, p: { version: PRIVACY_VERSION, gender: b.gender, ageOver14: true, disclosure: b.disclosure } }));
    }
    if (path === "/api/revision") return revision(m);
    if (path === "/api/bootstrap") return bootstrap(m, url);
    if (path === "/api/profile") return commit(m.id, "profile", { name: text(b.name, 2, 30, "\uC2E4\uBA85") });
    approved(m);
    if (path === "/api/member-overview") return overview.read(m, url);
    if (["/api/rm/comparison", "/api/named-wods/comparison"].includes(path) && !validGender(m.gender)) bad("\uC131\uBCC4\uC744 \uBA3C\uC800 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.", 409);
    if ((path === "/api/posts" || path === "/api/meetups" || path === "/api/posts/comment") && m.disclosure_consent === false) bad("\uAC1C\uC778\uC124\uC815\uC5D0\uC11C \uD68C\uC6D0 \uAC04 \uACF5\uAC1C\uC5D0 \uB3D9\uC758\uD55C \uB4A4 \uC774\uC6A9\uD574\uC8FC\uC138\uC694.", 403);
    if (path.startsWith("/api/board/")) bad("\uC0AC\uC9C4 \uC790\uB3D9 \uAE30\uB85D \uAE30\uB2A5\uC774 \uC885\uB8CC\uB410\uC5B4\uC694. \uAE30\uC874 \uC0AC\uC9C4\uC740 \uACC4\uC18D \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 410);
    if (path === "/api/record-tools") {
      admin(m);
      const a = b.attendance;
      if (!a || typeof a.enabled !== "boolean" || !Number.isInteger(a.radius) || a.radius < 50 || a.radius > 500 || a.enabled && (![a.latitude, a.longitude].every((v) => typeof v === "number" && Number.isFinite(v)) || Math.abs(a.latitude) > 90 || Math.abs(a.longitude) > 180)) bad("\uCCB4\uC721\uAD00 \uC704\uCE58\uC640 \uBC18\uACBD(50~500m)\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const value = { photoEnabled: false, attendance: { enabled: a.enabled, latitude: typeof a.latitude === "number" ? a.latitude : null, longitude: typeof a.longitude === "number" ? a.longitude : null, radius: a.radius } };
      await commit(m.id, "setting", { key: "recordTools", value });
      return { ok: true };
    }
    if (path === "/api/attendance/override") {
      admin(m);
      if (!uuid3(b.id)) bad("\uD68C\uC6D0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_attendance_override", { actor: m.id, target: b.id, reason: text(b.reason, 2, 200, "\uC608\uC678 \uC0AC\uC720") }));
    }
    if (path.startsWith("/api/named-wods/")) return named.route(m, path, b);
    if (path === "/api/rm/comparison") {
      if (typeof b.movementId !== "string" || b.movementId.length > 100) bad("\uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_rm_comparison", { actor: m.id, movement_id: b.movementId }));
    }
    if (path === "/api/members/delete") {
      admin(m);
      if (!uuid3(b.id) || !uuid3(b.requestId) || b.id === m.id || b.confirmed !== true || typeof b.confirmedName !== "string" || b.confirmedName.length > 40) bad("\uC0AD\uC81C\uD560 \uD68C\uC6D0\uACFC \uD655\uC778 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return account.removeByAdmin(m, b);
    }
    if (path === "/api/points" || path.startsWith("/api/points/")) return points.route(m, path, b);
    if (path.startsWith("/api/photos/")) {
      if (path === "/api/photos/attach" && (!normalizeDate(b.date) || b.date > kstDate(now()) || !["ALL", "B/T", "WOD"].includes(b.program) || b.session && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.session))) bad("\uC0AC\uC9C4 \uB0A0\uC9DC\xB7\uC218\uC5C5\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return media.route(m, path, b);
    }
    if (path === "/api/attendance") {
      try {
        validateAttendanceLocation((await setting("recordTools", DEFAULT_RECORD_TOOLS)).attendance, b.position, +now());
      } catch (e) {
        bad(e.message, 403);
      }
      const day = kstDate(now()), cal = await calendar(), ws = await rows("gym_workouts", (q) => q.eq("date", day));
      if (!workoutSchedule(day, ws.map((w) => w.body), cal.dates).length) bad("\uD734\uAC15\uC77C\uC5D0\uB294 \uCD9C\uC11D\uD560 \uC218 \uC5C6\uC5B4\uC694. \uD2B9\uBCC4 \uC218\uC5C5\uC774 \uB4F1\uB85D\uB418\uBA74 \uCD9C\uC11D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", 403);
      return commit(m.id, "attendance");
    }
    if (path === "/api/preferences") {
      const p = {};
      if ("showMembershipWallet" in b) {
        if (!["admin", "coach"].includes(m.role)) bad("\uC6B4\uC601\uC790\xB7\uCF54\uCE58\uB9CC \uD68C\uC6D0\uCE74\uB4DC \uD45C\uC2DC\uB97C \uC124\uC815\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
        if (typeof b.showMembershipWallet !== "boolean") bad("\uD68C\uC6D0\uCE74\uB4DC\xB7\uCFE0\uD3F0 \uD45C\uC2DC \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.showMembershipWallet = b.showMembershipWallet;
      }
      if ("pushOnboardingSeen" in b) {
        if (b.pushOnboardingSeen !== true) bad("\uC54C\uB9BC \uC548\uB0B4 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.pushOnboardingSeen = true;
      }
      if ("avatarEmoji" in b) {
        if (!validAvatar(b.avatarEmoji)) bad("\uD504\uB85C\uD544 \uC774\uBAA8\uC9C0\uB97C \uBAA9\uB85D\uC5D0\uC11C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
        p.avatarEmoji = b.avatarEmoji;
      }
      if ("rank" in b) {
        if (typeof b.rank !== "boolean") bad("\uC21C\uC704 \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.rank = b.rank;
      }
      if ("rmSelection" in b) {
        const cat = await setting("rmCatalogue", DEFAULT_RM_CATALOGUE);
        if (!Array.isArray(b.rmSelection) || b.rmSelection.length > 200 || b.rmSelection.some((id2) => !cat.some((m2) => m2.id === id2))) bad("1RM \uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        p.rmSelection = [...new Set(b.rmSelection)];
      }
      return commit(m.id, "preferences", p);
    }
    if (path === "/api/records/delete") {
      if (!uuid3(b.id)) bad("\uAE30\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_delete_record", { actor: m.id, record_id: b.id }));
    }
    if (path === "/api/records") {
      const list = b.records;
      if (!Array.isArray(list) || list.length < 1 || list.length > 200) bad("\uAE30\uB85D \uBAA9\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (list.length > 1 && !hasPermission(m, "records.create") && !hasPermission(m, "records.update")) admin(m);
      const cat = await setting("rmCatalogue", DEFAULT_RM_CATALOGUE), cache = /* @__PURE__ */ new Map(), clean = [];
      for (const r of list) {
        const id2 = r.id || crypto.randomUUID(), memberId = r.memberId || m.id;
        if (!uuid3(id2) || !uuid3(memberId)) bad("\uD68C\uC6D0\uACFC \uAE30\uB85D ID\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        let prior;
        if (memberId !== m.id) {
          prior = await one("gym_records", "id", id2);
          permit(m, prior ? "records.update" : "records.create");
        }
        if (!normalizeDate(r.date) || r.date > kstDate(now()) || !["B/T", "WOD"].includes(r.program) || !/^S[1-9]\d?$/.test(r.section)) bad("\uAE30\uB85D \uB0A0\uC9DC\uC640 \uC218\uC5C5\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        const key = r.date + "_" + r.program;
        if (!cache.has(key)) cache.set(key, await one("gym_workouts", "key", key));
        const w = cache.get(key), sec = w?.body.sections?.[+r.section.slice(1) - 1];
        if (!sec?.record || Date.parse(w.release_at) > +now()) bad("\uACF5\uAC1C\uB41C \uC218\uC5C5\uC758 \uAE30\uB85D \uAD6C\uAC04\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
        if (r.session && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.session)) bad("\uC218\uC5C5 \uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        const movement = sec.kind === "1RM" && (sec.movements?.length ?? (sec.movement ? 1 : 0)) !== 1 ? "" : sec.movement || sec.movements?.[0] || "", rm = findRmMovement(cat, movement), item = { id: id2, memberId, date: r.date, program: r.program, section: r.section, session: r.session || "", kind: sec.kind, movement, movements: sec.movements || [], movementId: rm?.id, note: typeof r.note === "string" ? text(r.note, 0, 150, "\uBA54\uBAA8") : "", writer: m.role };
        if (prior === void 0 && (!r.result || r.result.condition === "unspecified")) prior = await one("gym_records", "id", id2);
        try {
          Object.assign(item, canonicalRecordPayload(sec, r, prior?.user_id === memberId && prior.date === r.date && prior.program === r.program && prior.section === r.section ? prior.body : null));
        } catch (e) {
          bad(e.message);
        }
        clean.push(item);
      }
      return commit(m.id, "records", { records: clean });
    }
    if (path === "/api/rms/delete") {
      if (!uuid3(b.id)) bad("1RM \uAE30\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const r = await one("gym_rms", "id", b.id);
      if (!r || r.user_id !== m.id) bad("\uBCF8\uC778\uC758 1RM \uAE30\uB85D\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
      return commit(m.id, "rm-delete", { id: b.id });
    }
    if (path === "/api/rms") {
      if (b.id && !uuid3(b.id)) bad("1RM \uAE30\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const existing = b.id ? await one("gym_rms", "id", b.id) : null;
      if (b.id && (!existing || existing.user_id !== m.id)) bad("\uBCF8\uC778\uC758 1RM \uAE30\uB85D\uB9CC \uC218\uC815\uD560 \uC218 \uC788\uC5B4\uC694.", 403);
      const cat = await setting("rmCatalogue", DEFAULT_RM_CATALOGUE), mov = findRmMovement(cat, b.movementId || b.movement), oldMov = existing ? findRmMovement(cat, existing.body.movementId || existing.body.movement) : null;
      if (!mov || !mov.active && mov.id !== oldMov?.id || !Number.isFinite(b.lbs) || b.lbs <= 0 || b.lbs > 6614 || !normalizeDate(b.date) || b.date > kstDate(now())) bad("1RM \uC885\uBAA9\xB7\uC911\uB7C9\xB7\uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (existing?.source && (b.date !== existing.body.date || mov.id !== oldMov?.id)) bad("\uC218\uC5C5\uC5D0\uC11C \uC5F0\uACB0\uB41C \uB3D9\uC791\uACFC \uB0A0\uC9DC\uB294 \uC720\uC9C0\uD574\uC8FC\uC138\uC694.");
      const body = { id: existing?.id || crypto.randomUUID(), memberId: m.id, movementId: mov.id, movement: mov.name, lbs: b.lbs, date: b.date };
      if (existing?.source) body.source = existing.source;
      return commit(m.id, existing ? "rm-update" : "rm", body);
    }
    if (path === "/api/community/read") {
      if (!uuid3(b.id) || !["post", "notice"].includes(b.kind)) bad("\uC77D\uC740 \uAC8C\uC2DC\uAE00\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const item = await one(b.kind === "notice" ? "gym_notices" : "gym_posts", "id", b.id);
      if (!item || meetupLifecycle(item, now()).expired) bad("\uAC8C\uC2DC\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      return commit(m.id, "community-read", { id: b.id, kind: b.kind });
    }
    if (path === "/api/meetups") {
      if (!uuid3(b.id) || b.category && b.category !== "\uC6B4\uB3D9 \uBC88\uAC1C" || typeof b.startsAt !== "string" || b.startsAt.length > 40 || !Number.isFinite(Date.parse(b.startsAt)) || new Date(b.startsAt).getUTCFullYear() < 1900 || "bannerPinned" in b && typeof b.bannerPinned !== "boolean" || "sendPush" in b && typeof b.sendPush !== "boolean") bad("\uC6B4\uB3D9 \uC2DC\uC791 \uB0A0\uC9DC\xB7\uC2DC\uAC04\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const ids = b.photoIds || [];
      if (!Array.isArray(ids) || ids.length > 3 || ids.some((id2) => !uuid3(id2)) || new Set(ids).size !== ids.length) bad("\uCCA8\uBD80 \uC0AC\uC9C4\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_meetup_create", { actor: m.id, p: { id: b.id, title: text(b.title, 1, 80, "\uC81C\uBAA9"), body: text(b.body, 1, 3e3, "\uB0B4\uC6A9"), startsAt: new Date(b.startsAt).toISOString(), bannerPinned: b.bannerPinned === true, sendPush: b.sendPush === true, photoIds: ids } }));
    }
    if (path === "/api/meetups/pin") {
      if (!uuid3(b.id) || typeof b.pinned !== "boolean") bad("\uC6B4\uB3D9 \uBC88\uAC1C \uACE0\uC815 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_meetup_pin", { actor: m.id, post_id: b.id, pinned: b.pinned }));
    }
    if (path === "/api/posts") {
      if (b.photoIds?.length) {
        if (!uuid3(b.id)) bad("\uAC8C\uC2DC\uAE00 ID\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        return result(db2.rpc("onoff_attach_photos", { actor: m.id, p: { ...b, kind: "community", title: text(b.title, 1, 80, "\uC81C\uBAA9"), body: text(b.body, 1, 3e3, "\uB0B4\uC6A9") } }));
      }
      if (!["\uC6B4\uB3D9 \uBC88\uAC1C", "\uACF5\uB3D9\uAD6C\uB9E4", "\uC790\uC720\uAE00"].includes(b.category)) bad("\uB9D0\uBA38\uB9AC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "post", { category: b.category, title: text(b.title, 1, 80, "\uC81C\uBAA9"), body: text(b.body, 1, 3e3, "\uB0B4\uC6A9") });
    }
    if (path === "/api/posts/access") {
      if (!uuid3(b.id)) bad("\uAC8C\uC2DC\uAE00\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return joinAccess(m, b.id);
    }
    if (path === "/api/posts/join") {
      if (!uuid3(b.id) || typeof b.joined !== "boolean") bad("\uAC8C\uC2DC\uAE00\uACFC \uCC38\uC5EC \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (b.joined) {
        const access = await joinAccess(m, b.id);
        if (!access.allowed) bad(access.message, 403, { joinAccess: access });
      }
      try {
        return await result(db2.rpc("onoff_post_participation", { actor: m.id, target_post: b.id, joined: b.joined }));
      } catch (error) {
        if (error.status === 403 && b.joined) {
          const access = await joinAccess(m, b.id);
          if (!access.allowed) bad(access.message, 403, { joinAccess: access });
          bad("\uCC38\uC5EC \uC870\uAC74\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694. \uC0C1\uD0DC\uB97C \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.", 409);
        }
        throw error;
      }
    }
    if (["/api/posts/delete", "/api/posts/comment"].includes(path)) {
      if (!uuid3(b.id)) bad("\uAC8C\uC2DC\uAE00\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (!path.endsWith("delete")) {
        const post = await one("gym_posts", "id", b.id);
        if (post) {
          if (meetupLifecycle(post, now()).expired) bad("\uBCF4\uAD00 \uAE30\uAC04\uC774 \uC9C0\uB098 \uC0AD\uC81C\uB41C \uC6B4\uB3D9 \uBC88\uAC1C\uC608\uC694.", 404);
          const author = await one("gym_members", "id", post.author_id);
          if (author?.disclosure_consent === false) bad("\uACF5\uAC1C\uAC00 \uC911\uC9C0\uB41C \uAC8C\uC2DC\uAE00\uC785\uB2C8\uB2E4.", 403);
        }
      }
      const comment = path.endsWith("comment");
      if (b.requestId && !uuid3(b.requestId)) bad("\uB313\uAE00 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if ("joined" in b && typeof b.joined !== "boolean") bad("\uCC38\uC5EC \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const value = await commit(m.id, path.endsWith("delete") ? "post-delete" : path.endsWith("join") ? "join" : "comment", { id: b.id, ...comment ? { text: text(b.text, 1, 300, "\uB313\uAE00"), commentId: b.requestId || crypto.randomUUID() } : "joined" in b ? { joined: b.joined } : {} });
      if (path.endsWith("delete")) await media.cleanup();
      return value;
    }
    if (path.startsWith("/api/push/")) return push.memberRoute(m, path, b);
    if (path === "/api/acc") {
      if (!normalizeDate(b.date)) bad("\uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (b.action === "delete") {
        permit(m, "acc.delete");
        return result(db2.rpc("onoff_acc", { actor: m.id, target_date: b.date, p: { action: "delete" } }));
      }
      const existing = await one("gym_acc_workouts", "date", b.date);
      permit(m, existing ? "acc.update" : "acc.create");
      const movements = b.movements || [];
      if (!Array.isArray(movements) || movements.length > 30 || movements.some((x) => typeof x !== "string" || !x.trim() || x.length > 80)) bad("\uAD00\uB828 \uB3D9\uC791\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const overviewId = b.overview === void 0 ? existing?.body?.overviewId || "" : b.overview ? youtubeId(b.overview) : "";
      if (overviewId === null) bad("\uC720\uD29C\uBE0C \uC8FC\uC18C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_acc", { actor: m.id, target_date: b.date, p: { text: text(b.text, 1, 5e3, "\uC6B4\uB3D9 \uB0B4\uC6A9"), movements: movements.map((x) => x.trim()), overviewId } }));
    }
    if (path === "/api/video-categories") {
      permit(m, "videos");
      const actions = { add: "category-add", edit: "category-edit", delete: "category-delete" }, action = actions[b.action];
      if (!action) bad("\uBD84\uB958 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_video_manage", { actor: m.id, p: { action, id: b.id, label: b.action === "delete" ? void 0 : text(b.label, 1, 40, "\uBD84\uB958 \uC774\uB984"), targetId: b.targetId } }));
    }
    if (path === "/api/rm-categories") {
      permit(m, "rm");
      if (!["add", "edit", "delete"].includes(b.action) || b.action !== "add" && (typeof b.id !== "string" || !b.id || b.id.length > 100) || b.action === "delete" && (typeof b.targetId !== "string" || !b.targetId || b.targetId.length > 100)) bad("\uBD84\uB958 \uC694\uCCAD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_rm_categories", { actor: m.id, p: { action: b.action, id: b.id, label: b.action === "delete" ? void 0 : text(b.label, 1, 40, "\uBD84\uB958 \uC774\uB984"), targetId: b.targetId } }));
    }
    if (path === "/api/movements/delete") {
      permit(m, "videos");
      return result(db2.rpc("onoff_video_manage", { actor: m.id, p: { action: "movement-delete", name: text(b.name, 2, 80, "\uB3D9\uC791 \uC774\uB984") } }));
    }
    const permission = { "/api/tv/status": "tv", "/api/tv/admin": "tv", "/api/workouts/delete": "workouts.delete", "/api/settings": "release", "/api/banner": "banner", "/api/rm-catalogue": "rm", "/api/rm-catalogue/delete": "rm", "/api/movements": "videos", "/api/notices": "notices" }[path];
    if (permission) permit(m, permission);
    else if (path !== "/api/workouts") admin(m);
    if (path === "/api/storage-usage") return result(db2.rpc("onoff_storage_usage", { actor: m.id }));
    if (path === "/api/tv/status") return tvSettings();
    if (path === "/api/tv/admin") {
      if (m.role !== "admin" && (b.password || b.revoke)) bad("TV \uC778\uC99D \uAD00\uB9AC\uB294 \uC6B4\uC601\uC790\uB9CC \uD560 \uC218 \uC788\uC5B4\uC694.", 403);
      let preferences;
      try {
        preferences = normalizeTvPreferences(b);
      } catch (e) {
        bad(e.message);
      }
      const p = { preferences, revoke: b.revoke === true };
      if (b.password) {
        if (!/^\d{4}$/.test(b.password)) bad("TV \uC554\uD638\uB294 \uC22B\uC790 4\uC790\uB9AC\uC608\uC694.");
        const salt = crypto.randomUUID();
        p.password = { salt, hash: await tvPassword(b.password, salt), format: "pin4" };
      }
      await commit(m.id, "tv-admin", p);
      return { ok: true, ...await tvSettings() };
    }
    if (path === "/api/member-name" || path === "/api/member-note" || path === "/api/members") {
      const target = uuid3(b.id) ? await one("gym_members", "id", b.id) : null;
      if (!target) bad("\uD68C\uC6D0\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      if (path.endsWith("member-name")) return commit(m.id, "member-name", { id: b.id, name: text(b.name, 2, 30, "\uC2E4\uBA85") });
      if (path.endsWith("member-note")) return commit(m.id, "member-note", { id: b.id, note: text(b.note, 0, 500, "\uAD6C\uBD84 \uBA54\uBAA8") });
      if (!["admin", "coach", "member"].includes(b.role) || !["approved", "pending", "suspended", "rejected"].includes(b.status)) bad("\uD68C\uC6D0 \uAD8C\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const permissions = b.coach_permissions || [];
      if (!Array.isArray(permissions) || permissions.some((k) => !COACH_PERMISSIONS.some(([key]) => key === k))) bad("\uCF54\uCE58 \uAD8C\uD55C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const payload = { id: b.id, role: b.role, status: b.status, coach_permissions: b.role === "coach" ? [...new Set(permissions)] : [] };
      if (b.status === "rejected" || b.status === "suspended" && !target.approved_at) {
        if (target.approved_at || target.delete_requested_at || !["pending", "suspended"].includes(target.status)) bad("\uAC00\uC785 \uC2B9\uC778 \uC804 \uACC4\uC815\uB9CC \uAC70\uC808\uD560 \uC218 \uC788\uC5B4\uC694.", 409);
        const reason = text(b.reason ?? "", 0, 500, "\uAC70\uC808 \uC0AC\uC720") || DEFAULT_REJECTION_REASON;
        return result(db2.rpc("onoff_signup_reject", { actor: m.id, p: { ...payload, status: "suspended", reason } }));
      }
      return commit(m.id, "members", payload);
    }
    if (path === "/api/membership/history/delete") {
      if (!uuid3(b.id) || !uuid3(b.eventId) || b.confirmed !== true) bad("\uD68C\uC6D0\uACFC \uAD00\uB9AC \uC774\uB825 \uC0AD\uC81C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_membership_history_delete", { actor: m.id, target_member: b.id, event_id: b.eventId }));
    }
    if (path === "/api/membership/delete") {
      if (!uuid3(b.id) || !uuid3(b.passId)) bad("\uD68C\uC6D0\uAD8C\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const old = await one("gym_memberships", "user_id", b.id);
      if (!old || old.id !== b.passId || !Number.isInteger(b.revision) || old.revision !== b.revision) bad("\uD68C\uC6D0\uAD8C\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694. \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.", 409);
      return commit(m.id, "membership-delete", { id: b.id, passId: old.id, revision: old.revision });
    }
    if (path === "/api/membership") {
      if (!uuid3(b.id)) bad("\uD68C\uC6D0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
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
      if (!uuid3(b.id) || !normalizeDate(b.date) || b.date > kstDate(now())) bad("\uD68C\uC6D0\uACFC \uCD9C\uC11D \uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return commit(m.id, "attendance-cancel", { id: b.id, date: b.date, reason: text(b.reason, 1, 200, "\uCDE8\uC18C \uC0AC\uC720") });
    }
    if (path === "/api/workouts/delete") {
      if (!normalizeDate(b.date) || !["B/T", "WOD"].includes(b.program)) bad("\uC0AD\uC81C\uD560 \uC218\uC5C5\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_delete_workout", { actor: m.id, target_date: b.date, target_program: b.program }));
    }
    if (path === "/api/workouts") {
      if (!Array.isArray(b.workouts)) bad("\uC218\uC5C5 \uBAA9\uB85D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      for (const w of b.workouts) {
        const old = await one("gym_workouts", "key", w.date + "_" + w.program);
        permit(m, old ? "workouts.update" : "workouts.create");
      }
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
    if (path === "/api/rm-catalogue/delete") {
      if (typeof b.id !== "string" || !b.id || b.id.length > 100) bad("\uC885\uBAA9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      return result(db2.rpc("onoff_rm_archive", { actor: m.id, item_id: b.id }));
    }
    if (path === "/api/rm-catalogue") {
      let value;
      try {
        value = updateRmCatalogue(await setting("rmCatalogue", DEFAULT_RM_CATALOGUE), b, () => crypto.randomUUID(), await setting("rmCategories", RM_CATEGORIES));
      } catch (e) {
        bad(e.message);
      }
      await commit(m.id, "setting", { key: "rmCatalogue", value: value.catalogue });
      return { ok: true, ...value };
    }
    if (path === "/api/movements") {
      const name = text(b.name, 2, 80, "\uB3D9\uC791 \uC774\uB984"), videoId = b.url ? youtubeId(b.url) : "";
      if (videoId === null) bad("\uC720\uD29C\uBE0C \uC8FC\uC18C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const categories = await videoCategories(), categoryId = b.categoryId || resolveVideoCategory(videoCategory(name, await setting("rmCatalogue", DEFAULT_RM_CATALOGUE)), categories, await setting("videoCategoryRedirects", {}));
      if (!categories.some(([id2]) => id2 === categoryId)) bad("\uBD84\uB958\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
      let originalName = name;
      if (b.originalName) {
        originalName = text(b.originalName, 2, 80, "\uAE30\uC874 \uB3D9\uC791 \uC774\uB984");
        const items = await library(), source = findVideoMovement(items, originalName), target = findVideoMovement(items, name);
        if (!source) bad("\uC218\uC815\uD560 \uB3D9\uC791\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
        originalName = source.name;
        if (target && target.name !== originalName) bad("\uC774\uBBF8 \uB4F1\uB85D\uB41C \uB3D9\uC791 \uC774\uB984\uC774\uC5D0\uC694.", 409);
      }
      return result(db2.rpc("onoff_video_save", { actor: m.id, p: { originalName, name, videoId, categoryId, notes: text(b.notes, 0, 1e3, "\uC124\uBA85") } }));
    }
    if (path === "/api/notices") {
      if (b.id && !uuid3(b.id)) bad("\uACF5\uC9C0\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (b.action === "delete") {
        const value = await commit(m.id, "notices", { action: "delete", id: b.id });
        await media.cleanup();
        return value;
      }
      if (typeof b.pinned !== "boolean") bad("\uC0C1\uB2E8 \uACE0\uC815 \uC5EC\uBD80\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (b.sendPush === true) permit(m, "push");
      const notice = { id: b.id || crypto.randomUUID(), title: text(b.title, 1, 100, "\uC81C\uBAA9"), body: text(b.body, 1, 5e3, "\uB0B4\uC6A9"), pinned: b.pinned };
      await result(db2.rpc("onoff_save_notice_photos", { actor: m.id, p: { ...notice, photoIds: b.photoIds || [] } }));
      if (b.sendPush === true) {
        permit(m, "push");
        await push.enqueue({ id: "notice:" + notice.id + ":" + crypto.randomUUID(), kind: "notices", payload: { title: notice.title, body: notice.body.slice(0, 140), url: "/Onoffgym/#community", tag: "notice:" + notice.id } });
      }
      return { ok: true };
    }
    if (path === "/api/holidays/sync") return { ok: true, calendar: await calendar(true) };
    bad("\uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
  }
  return async (req) => {
    const origin = req.headers.get("Origin"), allowed = !origin || ORIGINS.has(origin), cors = { "Access-Control-Allow-Origin": allowed && origin ? origin : "https://nuclearstark.github.io", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-onoff-tv-token,x-onoff-push-test", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });
    try {
      if (!allowed) bad("\uD5C8\uC6A9\uB41C \uC571\uC5D0\uC11C \uC811\uC18D\uD574\uC8FC\uC138\uC694.", 403);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const url = new URL(req.url), match = url.pathname.match(/\/api\/[^?]+$/), path = match?.[0];
      if (!path) bad("\uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", 404);
      const get = /* @__PURE__ */ new Set(["/api/member-overview", "/api/points", "/api/points/admin", "/api/health", "/api/bootstrap", "/api/revision", "/api/tv/bootstrap", "/api/tv/status", "/api/storage-usage", "/api/push/test-access/config", "/api/push/test-access/status", "/api/push/history"]);
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
      return response({ error: e.status ? e.message : "\uC11C\uBC84 \uC5F0\uACB0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.", ...e.status && e.joinAccess ? { joinAccess: e.joinAccess } : {} }, e.status || 503);
    }
  };
}

// supabase/functions/onoff-api/entry.js
var db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createHandler(db, { reauthenticate: async (email, password) => {
  const client = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return error ? null : { user: data.user, accessToken: data.session?.access_token };
}, verifyUser: async (token) => {
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
} }));
