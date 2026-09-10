#!/usr/bin/env node
/* Firestore sessions 문서를 터미널에서 등록·수정하는 도구 (Node 18+, 추가 설치 없음).
   Firebase REST API를 직접 호출한다(scripts/lib/firestore.mjs). 비밀번호는 환경변수 ARO_STUDY_PW 또는 실행 중 입력(화면에 표시되지 않음)으로 받고 어디에도 저장하지 않는다.

   사용:
     node scripts/session.mjs members
     node scripts/session.mjs get 2026-09-15
     node scripts/session.mjs set 2026-09-15 --title "제목" --next "다음 계획" --attendees "이름1,이름2" --presenter "이름" --briefs 1 --page
       --attendees 를 생략하면 기존 참석자를 유지한다(새 문서면 빈 배열).
       --presenter 는 이 회차 발제자 이름. 생략하면 기존 값 유지(새 문서면 발제 순서에서 그 달의 사람을 자동으로 넣는다).
       --time "19:00" --place "장소" 는 정기 규칙과 다른 시간·장소(선택).
       --page 는 weeks/<date>/index.html 이 있다는 표시(목록에서 링크 활성).
*/
import { login, listMembers, getDocById, patchDoc } from "./lib/firestore.mjs";

/* ---------- 인자 ---------- */
const [cmd, id, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true; opt[k] = v; }
}
if (!cmd || !["members", "get", "set"].includes(cmd) || (cmd !== "members" && !/^\d{4}-\d{2}-\d{2}$/.test(id || ""))) {
  console.log("사용: node scripts/session.mjs members | get <YYYY-MM-DD> | set <YYYY-MM-DD> [--title ..] [--next ..] [--attendees ..] [--presenter ..] [--briefs N] [--page]");
  process.exit(1);
}

/* ---------- 실행 ---------- */
const token = await login();
process.on("unhandledRejection", ex => { console.error(ex.message || ex); process.exit(1); });
const findMember = (ms, name) => { const m = ms.find(x => x.name === name); if (!m) throw new Error(`멤버를 찾을 수 없음: ${name} (node scripts/session.mjs members 로 확인)`); return m; };
/** 발제 순서(settings/rotation)에서 그 달의 사람. 순서가 없으면 "". */
async function presenterByRotation(date) {
  const r = await getDocById(token, "settings", "rotation");
  if (!r || !Array.isArray(r.order) || !r.order.length || !/^\d{4}-\d{2}$/.test(r.startMonth || "")) return "";
  const mi = s => { const [y, m] = s.split("-").map(Number); return y * 12 + (m - 1); };
  const n = r.order.length, k = (((mi(date.slice(0, 7)) - mi(r.startMonth)) % n) + n) % n;
  return r.order[k];
}

if (cmd === "members") {
  const ms = await listMembers(token);
  if (!ms.length) console.log("멤버가 없습니다. admin.html에서 먼저 추가하세요.");
  ms.forEach(m => console.log(`${String(m.order ?? "-").padStart(2)}  ${m.name}${m.role === "admin" ? " (총무)" : ""}${m.active === false ? " [비활성]" : ""}  id=${m.id}`));
} else if (cmd === "get") {
  const s = await getDocById(token, "sessions", id);
  if (!s) { console.log(`세션 ${id} 없음`); process.exit(2); }
  const ms = await listMembers(token);
  const nm = x => ms.find(m => m.id === x)?.name || x;
  console.log(JSON.stringify({ ...s, attendeeNames: (s.attendees || []).map(nm), presenterName: s.presenter ? nm(s.presenter) : "" }, null, 2));
} else if (cmd === "set") {
  const existing = await getDocById(token, "sessions", id);
  const ms = await listMembers(token);
  const fields = {};
  if (opt.title) fields.title = String(opt.title);
  if (opt.time) fields.time = String(opt.time);
  if (opt.place) fields.place = String(opt.place);
  if (opt.next) fields.nextPlan = String(opt.next);
  if (opt.briefs !== undefined) fields.briefCount = Number(opt.briefs) || 0;
  if (opt.page) fields.page = true;
  if (opt.attendees) fields.attendees = String(opt.attendees).split(",").map(s => s.trim()).filter(Boolean).map(n => findMember(ms, n).id);
  if (opt.presenter) fields.presenter = findMember(ms, String(opt.presenter)).id;
  if (!existing) {
    fields.date = id; if (!fields.attendees) fields.attendees = []; if (!fields.title) fields.title = ""; if (!fields.nextPlan) fields.nextPlan = ""; fields.memo = ""; fields.createdAt = new Date();
    if (!fields.presenter) fields.presenter = await presenterByRotation(id);
  }
  fields.updatedAt = new Date();
  await patchDoc(token, "sessions", id, fields);
  const nm = x => ms.find(m => m.id === x)?.name || x;
  console.log(`${existing ? "수정" : "생성"}: sessions/${id}`, JSON.stringify({ ...fields, attendees: fields.attendees?.map(nm), presenter: fields.presenter ? nm(fields.presenter) : undefined, createdAt: undefined, updatedAt: undefined }));
}
