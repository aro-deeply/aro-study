/* aro-study 일정과 발제 순서.

   Firestore:
   - settings/meeting:  { week: 1~5(5는 마지막), weekday: 0(일)~6(토), time, place, note }   정기 모임 규칙. 없으면 DEFAULT_MEETING(둘째 수요일).
   - settings/rotation: { order: [memberId...], startMonth: "YYYY-MM", note }               발제 순서. startMonth의 발제자가 order[0], 이후 매월 한 칸씩, 끝나면 처음으로.
   - sessions/{id}.presenter: memberId                                                    그 회차의 실제 발제자(있으면 순서보다 우선).

   달 표기는 "YYYY-MM" 문자열로 통일한다.
*/
import { esc, fmtDate, todayStr, memberName, honor, db, doc, getDoc } from "./app.js";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const WEEK_LABELS = { 1: "첫째", 2: "둘째", 3: "셋째", 4: "넷째", 5: "마지막" };
export const DEFAULT_MEETING = { week: 2, weekday: 3, time: "", place: "", note: "" };

/* ---------- 달 계산 ---------- */
export const ym = iso => String(iso || "").slice(0, 7);
export const monthIndex = s => { const [y, m] = String(s).split("-").map(Number); return y * 12 + (m - 1); };
export const monthFromIndex = i => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export const addMonths = (s, n) => monthFromIndex(monthIndex(s) + n);
export const isYm = s => /^\d{4}-\d{2}$/.test(String(s || ""));
/** "2026-10" -> "2026년 10월", short: "10월" */
export function fmtMonth(s, style = "full") {
  if (!isYm(s)) return "";
  const [y, m] = s.split("-").map(Number);
  return style === "short" ? `${m}월` : `${y}년 ${m}월`;
}
/** 그 달의 마지막 날 "YYYY-MM-DD" */
export function lastDayOf(s) {
  const [y, m] = s.split("-").map(Number);
  return `${s}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 그 달의 n번째 요일(week 5는 마지막). 예: nthWeekday("2026-10", 2, 3) -> "2026-10-14" */
export function nthWeekday(s, week, weekday) {
  const [y, m] = s.split("-").map(Number);
  week = Number(week) || 2; weekday = Number(weekday);
  if (week >= 5) {
    const last = new Date(y, m, 0);
    return iso(y, m, last.getDate() - ((last.getDay() - weekday + 7) % 7));
  }
  const first = new Date(y, m - 1, 1).getDay();
  return iso(y, m, 1 + ((weekday - first + 7) % 7) + (week - 1) * 7);
}
export function normalizeMeeting(m) {
  const r = { ...DEFAULT_MEETING, ...(m || {}) };
  r.week = Math.min(5, Math.max(1, Number(r.week) || 2));
  r.weekday = Math.min(6, Math.max(0, Number(r.weekday ?? 3)));
  return r;
}
export function meetingDate(s, meeting) { const m = normalizeMeeting(meeting); return nthWeekday(s, m.week, m.weekday); }
/** "매월 둘째 수요일" (+ 시간) */
export function ruleLabel(meeting, withTime = true) {
  const m = normalizeMeeting(meeting);
  return `매월 ${WEEK_LABELS[m.week]} ${WEEKDAYS[m.weekday]}요일${withTime && m.time ? " " + m.time : ""}`;
}

/* ---------- 발제 순서 ---------- */
export function normalizeRotation(r) {
  const order = Array.isArray(r?.order) ? r.order.filter((id, i, a) => id && a.indexOf(id) === i) : [];
  return { order, startMonth: isYm(r?.startMonth) ? r.startMonth : "", note: r?.note || "" };
}
/** 순서만으로 정한 그 달의 발제자 id. 순서가 없으면 null. */
export function presenterFor(s, rotation) {
  const r = normalizeRotation(rotation);
  if (!r.order.length || !r.startMonth || !isYm(s)) return null;
  const n = r.order.length;
  const k = (((monthIndex(s) - monthIndex(r.startMonth)) % n) + n) % n;
  return r.order[k];
}

/**
 * 앞으로의 일정표. 이번 달부터 months개월. 세션이 있는 달은 세션 날짜·발제자를 우선한다.
 * @returns {{ rows, next, meeting, rotation }}
 *   rows[i] = { ym, date, presenter, fromSession, session, status: "done"|"next"|"planned", index: 순서상 위치(1부터) | 0 }
 */
export function computeSchedule({ meeting, rotation, sessions = [], today = todayStr(), months = 12, from = "" } = {}) {
  const m = normalizeMeeting(meeting), r = normalizeRotation(rotation);
  const byMonth = {};
  for (const s of sessions) { const k = ym(s.date || s.id); if (!k) continue; if (!byMonth[k] || (s.date || "") > (byMonth[k].date || "")) byMonth[k] = s; }
  const start = isYm(from) ? from : ym(today);
  const rows = [];
  for (let i = 0; i < months; i++) {
    const k = addMonths(start, i);
    const s = byMonth[k] || null;
    const date = s?.date || meetingDate(k, m);
    const byRule = presenterFor(k, r);
    const presenter = s?.presenter || byRule || "";
    rows.push({ ym: k, date, presenter, fromSession: !!s?.presenter, session: s, byRule,
      index: r.order.length && presenter ? r.order.indexOf(presenter) + 1 : 0,
      status: s && date < today ? "done" : (date < today ? "passed" : "planned") });
  }
  const next = rows.find(x => x.date >= today) || null;
  if (next) next.status = "next";
  return { rows, next, meeting: m, rotation: r };
}

/* ---------- Firestore ---------- */
export async function loadSettings() {
  const [ms, rs] = await Promise.all([getDoc(doc(db, "settings", "meeting")), getDoc(doc(db, "settings", "rotation"))]);
  return { meeting: normalizeMeeting(ms.exists() ? ms.data() : null), rotation: normalizeRotation(rs.exists() ? rs.data() : null), hasMeeting: ms.exists(), hasRotation: rs.exists() };
}

/* ---------- 렌더 ---------- */
const statusTag = st => st === "next" ? '<span class="tag">다음</span>' : st === "done" ? '<span class="tag ok">완료</span>' : st === "passed" ? '<span class="tag warn">기록 없음</span>' : "";

/**
 * 목록 화면 "일정과 발제": 다음 모임 카드 + 월별 표 + 순서 한 줄.
 * @param {{me?: string, adminHint?: string, nextPlan?: string}} opt
 */
export function renderSchedule(root, sch, opt = {}) {
  const { rows, next, meeting: m, rotation: r } = sch;
  // 세션에 시간·장소가 있으면(확정 일정) 규칙의 기본값보다 우선
  const place = [next?.session?.time || m.time, next?.session?.place || m.place].filter(Boolean).join(" · ");
  const nextName = next?.presenter ? honor(memberName(next.presenter)) : "미정";
  const head = `
    <div class="st-head">
      <div class="st-total"><div class="lab">다음 모임</div>
        <b>${next ? fmtDate(next.date, "short") : "미정"}</b>
        <span>${next?.session ? "확정 일정" : esc(ruleLabel(m, false))}${place ? " · " + esc(place) : ""}</span></div>
      <div class="st-rule"><div class="lab">${next ? fmtMonth(next.ym, "short") + " 발제" : "발제"}</div>
        <div class="eq">${esc(nextName)}${next?.fromSession ? ' <span class="tag">확정</span>' : ""}</div>
        ${r.order.length ? `순서 ${next?.index || "-"}/${r.order.length} · ${esc(fmtMonth(r.startMonth))}부터` : "발제 순서 없음" + (opt.adminHint ? ` · <a href="${esc(opt.adminHint)}#schedule">관리</a>에서 설정` : "")}
        ${opt.nextPlan ? `<div class="eq" style="font-weight:500;margin-top:6px">${esc(opt.nextPlan)}</div>` : ""}</div>
    </div>`;
  const table = `<table class="stack sched"><thead><tr><th>월</th><th>모임일</th><th>발제</th><th>상태</th></tr></thead><tbody>${rows.map(x => `
    <tr${x.status === "next" ? ' class="hl"' : ""}${x.presenter === opt.me ? ' data-me="1"' : ""}>
      <td>${esc(fmtMonth(x.ym))}</td>
      <td data-label="모임일">${fmtDate(x.date, "short")}</td>
      <td data-label="발제">${x.presenter ? esc(honor(memberName(x.presenter))) : '<span class="soft">미정</span>'}${x.fromSession ? ' <span class="tag">확정</span>' : ""}</td>
      <td data-label="상태">${statusTag(x.status)}${x.session?.page ? ` <a href="${esc(opt.weekHref ? opt.weekHref(x.session) : "weeks/" + x.session.id + "/")}">기록</a>` : ""}</td></tr>`).join("")}</tbody></table>`;
  const cycle = r.order.length
    ? `<div class="lab" style="margin-top:14px">발제 순서 (${r.order.length}명 순환)</div><div class="chips">${r.order.map((id, i) => `<span class="chip${id === next?.presenter ? "" : " dim"}">${i + 1}. ${esc(honor(memberName(id)))}</span>`).join("")}</div>
       <div class="secsub" style="margin-top:8px">한 바퀴 뒤 처음부터. 특정 달의 변경은 해당 세션에서.</div>`
    : "";
  root.innerHTML = head + table + cycle;
}

/** 주차 페이지 메타 줄에 쓸 발제자 이름. */
export function presenterName(session) { return session?.presenter ? honor(memberName(session.presenter)) : ""; }
