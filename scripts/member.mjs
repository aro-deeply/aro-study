#!/usr/bin/env node
/* 멤버 추가 도구 (Node 18+, 추가 설치 없음). admin.html 멤버 탭에서 "추가"하고 회비 설정의 대상 멤버에 체크하는 것과 결과가 같다.
   총무 계정으로 로그인한다. 비밀번호는 실행 중 입력(환경변수 ARO_STUDY_PW로 대신할 수 있음).

   사용:
     node scripts/member.mjs add <이름> [--term 회비] [--order N] [--dry-run] [--yes]
       --term <회비 설정 이름>   그 회비 설정의 대상 멤버에 넣는다(대상이 "활성 멤버 전원"이면 자동 포함이라 건너뜀).
                                같은 이름의 설정이 여럿이면 가장 최근 시작일의 것. --term-start YYYY-MM-DD 로 지정 가능.
       --order N                멤버 순서. 없으면 맨 뒤.
     node scripts/member.mjs list                      멤버 목록

   예: node scripts/member.mjs add 김동주 --term 회비
   같은 이름의 멤버가 이미 있으면 추가하지 않고 회비 대상 포함만 한다(두 번 실행해도 중복되지 않음).
   발제 순서(settings/rotation)에는 넣지 않는다. 모임에서 정한 뒤 admin.html 일정·발제 탭에서 추가한다. */
import readline from "node:readline";
import { login, listMembers, listAll, patchDoc, addDocTo } from "./lib/firestore.mjs";

const [cmd, name, ...rest] = process.argv.slice(2);
const flag = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const has = k => rest.includes(k);
if (!cmd || !["add", "list"].includes(cmd) || (cmd === "add" && !name)) {
  console.log("사용: node scripts/member.mjs add <이름> [--term 회비] [--order N] [--dry-run] [--yes] | list"); process.exit(1);
}
const DRY = has("--dry-run"), YES = has("--yes");
const token = await login();
const ms = await listMembers(token);
const say = s => console.log("  " + s);

if (cmd === "list") {
  for (const m of ms) say(`${m.order ?? "-"}. ${m.name}${m.role === "admin" ? " (총무)" : ""}${m.active === false ? " 비활성" : ""}  ${m.id}`);
  process.exit(0);
}

const ops = [];
let existing = ms.find(m => m.name === name);
const order = Number(flag("--order")) || Math.max(0, ...ms.map(m => Number(m.order) || 0)) + 1;
if (existing) say(`members: "${name}" 은 이미 있음 (순서 ${existing.order ?? "-"}, ${existing.active === false ? "비활성" : "활성"}) -> 추가 건너뜀`);
else ops.push({ label: `members: "${name}" 추가 (순서 ${order}, 활성, 역할 member)`, run: async () => { existing = await addDocTo(token, "members", { name, order, active: true, role: "member", joinedAt: new Date() }); } });

const termName = flag("--term");
let term = null;
if (termName) {
  const terms = (await listAll(token, "terms")).filter(t => t.name === termName && (!flag("--term-start") || t.start === flag("--term-start")))
    .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  if (!terms.length) throw new Error(`회비 설정을 찾을 수 없음: "${termName}"`);
  term = terms[0];
  const n = Array.isArray(term.memberIds) && term.memberIds.length ? term.memberIds.length : null;
  if (n === null) say(`terms "${term.name}" (${term.start || "시작 미정"}): 대상이 활성 멤버 전원이라 자동 포함 -> 건너뜀`);
  else if (existing && term.memberIds.includes(existing.id)) say(`terms "${term.name}": 이미 대상에 포함 -> 건너뜀`);
  else ops.push({ label: `terms "${term.name}" (${term.start || "시작 미정"}, 1인 ${Number(term.fee).toLocaleString()}원): 대상 ${n}명 -> ${n + 1}명`,
    run: () => patchDoc(token, "terms", term.id, { memberIds: [...term.memberIds, existing.id], updatedAt: new Date() }) });
}

if (!ops.length) { console.log("넣을 것이 없습니다."); process.exit(0); }
console.log("\n넣을 내용:"); ops.forEach(o => say(o.label));
if (DRY) { console.log("\n(--dry-run) 쓰지 않았습니다."); process.exit(0); }
if (!YES) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ok = await new Promise(r => rl.question("\n진행할까요? (y/N) ", a => { rl.close(); r(/^y/i.test(a.trim())); }));
  if (!ok) { console.log("취소"); process.exit(0); }
}
for (const o of ops) { await o.run(); say("완료: " + o.label); }
console.log("\n끝. 납부가 들어오면 admin.html 회비 탭에서 납부 처리하거나 setup.mjs의 dues로 넣으세요.");
