#!/usr/bin/env node
/* Firestore sessions 문서를 터미널에서 등록·수정하는 도구 (Node 18+, 추가 설치 없음).
   Firebase REST API를 직접 호출한다. 비밀번호는 환경변수 ARO_STUDY_PW 또는 실행 중 입력(화면에 표시되지 않음)으로 받고 어디에도 저장하지 않는다.

   사용:
     node scripts/session.mjs members
     node scripts/session.mjs get 2026-09-15
     node scripts/session.mjs set 2026-09-15 --title "제목" --next "다음 계획" --attendees "이름1,이름2" --briefs 1 --page
       --attendees 를 생략하면 기존 참석자를 유지한다(새 문서면 빈 배열).
       --page 는 weeks/<date>/index.html 이 있다는 표시(목록에서 링크 활성).
*/
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cfgMod = await import(path.join(here, "..", "assets", "firebase-config.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
const cfg = cfgMod.default, EMAIL = cfgMod.LOGIN_EMAIL;
const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;

/* ---------- 인자 ---------- */
const [cmd, id, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true; opt[k] = v; }
}
if (!cmd || !["members", "get", "set"].includes(cmd) || (cmd !== "members" && !/^\d{4}-\d{2}-\d{2}$/.test(id || ""))) {
  console.log("사용: node scripts/session.mjs members | get <YYYY-MM-DD> | set <YYYY-MM-DD> [--title ..] [--next ..] [--attendees ..] [--briefs N] [--page]");
  process.exit(1);
}

/* ---------- 비밀번호 ---------- */
async function askPassword() {
  if (process.env.ARO_STUDY_PW) return process.env.ARO_STUDY_PW;
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write("공용 계정 비밀번호: ");
    const stdin = process.stdin; let pw = "";
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume(); stdin.setEncoding("utf8");
    const onData = ch => {
      if (ch === "\r" || ch === "\n") { if (stdin.isTTY) stdin.setRawMode(false); stdin.removeListener("data", onData); process.stdout.write("\n"); rl.close(); res(pw); }
      else if (ch === "") process.exit(1);
      else if (ch === "" || ch === "\b") pw = pw.slice(0, -1);
      else pw += ch;
    };
    stdin.on("data", onData);
  });
}

/* ---------- Firestore 값 변환 ---------- */
const toVal = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toVal) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } };
  return { stringValue: String(v) };
};
const fromVal = v => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromVal);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromVal(x)]));
  return null;
};
const fromDoc = d => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, fromVal(x)])) });

/* ---------- API ---------- */
async function signIn(pw) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: pw, returnSecureToken: true })
  });
  const j = await r.json();
  if (!r.ok) throw new Error("로그인 실패: " + (j.error?.message || r.status));
  return j.idToken;
}
async function api(token, method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  const j = await r.json();
  if (r.status === 403) throw new Error("권한 오류: Firestore 규칙이 콘솔에 게시됐는지 확인하세요 (firestore.rules)");
  if (!r.ok) throw new Error(`${method} 실패 ${r.status}: ${j.error?.message || ""}`);
  return j;
}
const listMembers = async t => ((await api(t, "GET", `${BASE}/members?pageSize=200`))?.documents || []).map(fromDoc).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
const getSession = async t => { const d = await api(t, "GET", `${BASE}/sessions/${id}`); return d ? fromDoc(d) : null; };

/* ---------- 실행 ---------- */
let token;
try { token = await signIn(await askPassword()); } catch (ex) { console.error(ex.message); process.exit(1); }
process.on("unhandledRejection", ex => { console.error(ex.message || ex); process.exit(1); });
if (cmd === "members") {
  const ms = await listMembers(token);
  if (!ms.length) console.log("멤버가 없습니다. admin.html에서 먼저 추가하세요.");
  ms.forEach(m => console.log(`${String(m.order ?? "-").padStart(2)}  ${m.name}${m.role === "admin" ? " (총무)" : ""}${m.active === false ? " [비활성]" : ""}  id=${m.id}`));
} else if (cmd === "get") {
  const s = await getSession(token);
  if (!s) { console.log(`세션 ${id} 없음`); process.exit(2); }
  const ms = await listMembers(token);
  const nm = x => ms.find(m => m.id === x)?.name || x;
  console.log(JSON.stringify({ ...s, attendeeNames: (s.attendees || []).map(nm) }, null, 2));
} else if (cmd === "set") {
  const existing = await getSession(token);
  const ms = await listMembers(token);
  const fields = {};
  if (opt.title) fields.title = String(opt.title);
  if (opt.next) fields.nextPlan = String(opt.next);
  if (opt.briefs !== undefined) fields.briefCount = Number(opt.briefs) || 0;
  if (opt.page) fields.page = true;
  if (opt.attendees) {
    const names = String(opt.attendees).split(",").map(s => s.trim()).filter(Boolean);
    const ids = names.map(n => { const m = ms.find(x => x.name === n); if (!m) throw new Error(`멤버를 찾을 수 없음: ${n} (node scripts/session.mjs members 로 확인)`); return m.id; });
    fields.attendees = ids;
  }
  if (!existing) { fields.date = id; if (!fields.attendees) fields.attendees = []; if (!fields.title) fields.title = ""; if (!fields.nextPlan) fields.nextPlan = ""; fields.memo = ""; fields.createdAt = new Date(); }
  fields.updatedAt = new Date();
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
  await api(token, "PATCH", `${BASE}/sessions/${id}?${mask}`, { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toVal(v)])) });
  console.log(`${existing ? "수정" : "생성"}: sessions/${id}`, JSON.stringify({ ...fields, createdAt: undefined, updatedAt: undefined }));
}
