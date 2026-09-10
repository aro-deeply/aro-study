#!/usr/bin/env node
/* 운영 설정을 JSON 파일 하나로 Firestore에 넣는 도구 (Node 18+, 추가 설치 없음).
   정기 모임 규칙, 발제 순서, 회비 설정, 세션, 지출을 한 번에 넣을 때 쓴다. admin.html에서 하나씩 입력하는 것과 결과가 같다.
   멤버 이름이 들어가는 JSON은 저장소 밖(예: ../work/aro-study/)에 둔다.

   사용:
     node scripts/setup.mjs <설정.json>            실제로 쓰기 전에 무엇을 넣을지 보여 주고 확인을 받는다
     node scripts/setup.mjs <설정.json> --dry-run  보여 주기만 하고 쓰지 않는다
     node scripts/setup.mjs <설정.json> --yes      확인 없이 쓴다

   JSON 형식 (모든 키 선택):
   {
     "meeting":  { "week": 2, "weekday": 2, "time": "19:30", "place": "" },        // week 1~5(5=마지막), weekday 0(일)~6(토)
     "rotation": { "startMonth": "2026-09", "order": ["이름1", "이름2", ...] },    // 시작 월의 발제자가 첫 번째
     "terms":    [{ "name": "회비", "fee": 50000, "months": 6, "start": "2026-10-01", "end": "", "account": "", "note": "" }],
     "sessions": [{ "id": "2026-09-09", "title": "OT", "presenter": "이름", "attendees": "all" | ["이름", ...], "nextPlan": "" }],
     "expenses": [{ "sessionId": "2026-09-09", "date": "2026-09-09", "item": "...", "amount": 4000, "category": "기타",
                    "source": "split" | "fund", "paidBy": "admin" | "이름", "splitAmong": "attendees" | ["이름", ...], "note": "" }]
   }
   같은 이름·시작일의 회비 설정, 같은 세션·항목·금액의 지출이 이미 있으면 건너뛴다(두 번 실행해도 중복되지 않음).
*/
import fs from "node:fs";
import readline from "node:readline";
import { login, listMembers, listAll, getDocById, patchDoc, addDocTo } from "./lib/firestore.mjs";

const [file, ...flags] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.log("사용: node scripts/setup.mjs <설정.json> [--dry-run] [--yes]"); process.exit(1); }
const DRY = flags.includes("--dry-run"), YES = flags.includes("--yes");
const plan = JSON.parse(fs.readFileSync(file, "utf8"));
const CATS = ["식사", "카페", "장소", "기타"];

const token = await login();
process.on("unhandledRejection", ex => { console.error(ex.message || ex); process.exit(1); });
const ms = await listMembers(token);
const active = ms.filter(m => m.active !== false);
const admin = ms.find(m => m.role === "admin");
const byName = n => { const m = ms.find(x => x.name === n); if (!m) throw new Error(`멤버를 찾을 수 없음: "${n}" (admin.html 멤버 탭 또는 node scripts/session.mjs members 로 확인)`); return m; };
const nameOf = id => ms.find(m => m.id === id)?.name || id;
const idsOf = v => v === "all" || v === "attendees" ? v : (Array.isArray(v) ? v.map(n => byName(n).id) : []);

/* ---------- 계획 만들기 (이름 -> id 변환, 검증, 중복 확인) ---------- */
const ops = [];   // { label, run }
const say = s => console.log("  " + s);

if (plan.meeting) {
  const m = plan.meeting;
  const f = { week: Math.min(5, Math.max(1, Number(m.week) || 2)), weekday: Math.min(6, Math.max(0, Number(m.weekday ?? 2))), time: String(m.time || ""), place: String(m.place || ""), updatedAt: new Date() };
  const wl = ["", "첫째", "둘째", "셋째", "넷째", "마지막"][f.week], wd = "일월화수목금토"[f.weekday];
  ops.push({ label: `settings/meeting: 매월 ${wl} ${wd}요일${f.time ? " " + f.time : ""}${f.place ? " · " + f.place : ""}`, run: () => patchDoc(token, "settings", "meeting", f) });
}
if (plan.rotation) {
  const r = plan.rotation;
  if (!/^\d{4}-\d{2}$/.test(r.startMonth || "")) throw new Error("rotation.startMonth 는 YYYY-MM 형식");
  const order = (r.order || []).map(n => byName(n).id);
  if (!order.length) throw new Error("rotation.order 가 비어 있음");
  ops.push({ label: `settings/rotation: ${r.startMonth}부터 ${order.map((id, i) => `${i + 1}.${nameOf(id)}`).join(" ")}`, run: () => patchDoc(token, "settings", "rotation", { order, startMonth: r.startMonth, updatedAt: new Date() }) });
}
const existingTerms = plan.terms?.length ? await listAll(token, "terms") : [];
for (const t of plan.terms || []) {
  const f = { name: String(t.name || "회비"), fee: Math.round(Number(t.fee) || 0), months: Math.max(0, Math.round(Number(t.months) || 0)), start: String(t.start || ""), end: String(t.end || ""), account: String(t.account || ""), memberIds: Array.isArray(t.memberIds) ? t.memberIds.map(n => byName(n).id) : null, note: String(t.note || ""), createdAt: new Date(), updatedAt: new Date() };
  if (f.fee <= 0) throw new Error(`회비 "${f.name}": fee 가 0`);
  if (f.months && !f.start) throw new Error(`회비 "${f.name}": months 를 쓰려면 start 필요`);
  const dup = existingTerms.find(x => x.name === f.name && (x.start || "") === f.start);
  const n = f.memberIds ? f.memberIds.length : active.length;
  const label = `terms: ${f.name} 1인 ${f.fee.toLocaleString()}원 x ${n}명 = ${(f.fee * n).toLocaleString()}원${f.months ? ` / ${f.months}개월 = 월 ${Math.round(f.fee * n / f.months).toLocaleString()}원` : ""} (${f.start || "시작 미정"} ~ ${f.end || "개월 수로 계산"})`;
  if (dup) ops.push({ label: label + "  -> 이미 있음, 건너뜀", skip: true });
  else ops.push({ label, run: () => addDocTo(token, "terms", f) });
}
for (const s of plan.sessions || []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.id || "")) throw new Error("sessions[].id 는 YYYY-MM-DD 형식");
  const existing = await getDocById(token, "sessions", s.id);
  const f = { date: s.id, updatedAt: new Date() };
  if (s.title !== undefined) f.title = String(s.title);
  if (s.nextPlan !== undefined) f.nextPlan = String(s.nextPlan);
  if (s.presenter) f.presenter = byName(s.presenter).id;
  if (s.attendees === "all") f.attendees = active.map(m => m.id);
  else if (Array.isArray(s.attendees)) f.attendees = idsOf(s.attendees);
  if (!existing) { f.title ??= ""; f.nextPlan ??= ""; f.attendees ??= []; f.memo = ""; f.createdAt = new Date(); }
  ops.push({ label: `sessions/${s.id} ${existing ? "수정" : "생성"}: ${f.title ?? existing?.title ?? ""}${f.presenter ? ` · 발제 ${nameOf(f.presenter)}` : ""}${f.attendees ? ` · 참석 ${f.attendees.length}명` : ""}`, run: () => patchDoc(token, "sessions", s.id, f) });
}
const existingExp = plan.expenses?.length ? await listAll(token, "expenses") : [];
let expTotal = 0;
for (const x of plan.expenses || []) {
  const f = {
    sessionId: String(x.sessionId || ""), date: String(x.date || x.sessionId || ""), item: String(x.item || ""), amount: Math.round(Number(x.amount) || 0),
    category: CATS.includes(x.category) ? x.category : "기타", source: x.source === "fund" ? "fund" : "split",
    paidBy: x.paidBy === "admin" || !x.paidBy ? (admin?.id || "") : byName(x.paidBy).id,
    splitAmong: Array.isArray(x.splitAmong) ? idsOf(x.splitAmong) : "attendees", note: String(x.note || ""), createdAt: new Date(), createdBy: admin?.id || ""
  };
  if (!f.sessionId || !f.item || f.amount <= 0) throw new Error(`지출 항목이 불완전함: ${JSON.stringify(x)}`);
  const dup = existingExp.find(e => e.sessionId === f.sessionId && e.item === f.item && Number(e.amount) === f.amount);
  const label = `expenses: [${f.sessionId}] ${f.item} ${f.amount.toLocaleString()}원 · ${f.category} · ${f.source === "fund" ? "회비에서" : "참석자 n분의 1"} · 낸 사람 ${nameOf(f.paidBy)}`;
  if (dup) ops.push({ label: label + "  -> 이미 있음, 건너뜀", skip: true });
  else { ops.push({ label, run: () => addDocTo(token, "expenses", f) }); expTotal += f.amount; }
}

/* ---------- 보여 주고 확인 ---------- */
console.log(`\n넣을 내용 (${file}):`);
ops.forEach(o => say(o.label));
if (expTotal) say(`지출 합계 ${expTotal.toLocaleString()}원`);
if (!admin) console.log("\n주의: 총무(role admin)가 없어 paidBy \"admin\" 항목의 낸 사람이 비어 있습니다.");
const todo = ops.filter(o => !o.skip);
if (!todo.length) { console.log("\n새로 넣을 것이 없습니다."); process.exit(0); }
if (DRY) { console.log("\n--dry-run: 쓰지 않았습니다."); process.exit(0); }
if (!YES) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise(res => rl.question(`\n${todo.length}건을 Firestore에 쓸까요? (y/N) `, a => { rl.close(); res(a.trim().toLowerCase()); }));
  if (ans !== "y" && ans !== "yes") { console.log("취소했습니다."); process.exit(0); }
}
for (const o of todo) { await o.run(); console.log("  완료: " + o.label); }
console.log(`\n끝. 사이트를 새로고침해 확인하세요.`);
