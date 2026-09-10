/* scripts 공용: Firebase REST API로 Firestore를 읽고 쓰는 최소 도구 (Node 18+, 추가 설치 없음).
   로그인은 사이트와 같은 익명 로그인(비밀번호 없음). 콘솔에서 "익명" 제공업체가 켜져 있어야 한다. */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cfgMod = await import(path.join(here, "..", "..", "assets", "firebase-config.js").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
export const cfg = cfgMod.default;
export const BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;

/* ---------- Firestore 값 변환 ---------- */
export const toVal = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toVal) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } };
  return { stringValue: String(v) };
};
export const fromVal = v => {
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
export const fromDoc = d => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, fromVal(x)])) });
export const toFields = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toVal(v)]));

/* ---------- API ---------- */
/** 익명 로그인(REST). 이메일 없이 signUp 하면 익명 사용자가 만들어진다. */
export async function signIn() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const j = await r.json();
  if (!r.ok) {
    const m = j.error?.message || String(r.status);
    if (m.startsWith("ADMIN_ONLY_OPERATION")) throw new Error("익명 로그인이 꺼져 있음: Firebase 콘솔 > Authentication > Sign-in method 에서 '익명'을 켜세요");
    throw new Error("로그인 실패: " + m);
  }
  return j.idToken;
}
export async function api(token, method, url, body) {
  const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  const j = await r.json();
  if (r.status === 403) throw new Error("권한 오류: Firestore 규칙이 콘솔에 게시됐는지 확인하세요 (firestore.rules)");
  if (!r.ok) throw new Error(`${method} 실패 ${r.status}: ${j.error?.message || ""}`);
  return j;
}
/** 컬렉션 전체 읽기(200개까지). */
export const listAll = async (t, col) => ((await api(t, "GET", `${BASE}/${col}?pageSize=200`))?.documents || []).map(fromDoc);
export const listMembers = async t => (await listAll(t, "members")).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
export const getDocById = async (t, col, id) => { const d = await api(t, "GET", `${BASE}/${col}/${id}`); return d ? fromDoc(d) : null; };
/** 문서 일부 필드만 갱신(없으면 생성). */
export async function patchDoc(t, col, id, fields) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join("&");
  return fromDoc(await api(t, "PATCH", `${BASE}/${col}/${id}?${mask}`, { fields: toFields(fields) }));
}
/** 자동 ID로 문서 추가. */
export async function addDocTo(t, col, fields) { return fromDoc(await api(t, "POST", `${BASE}/${col}`, { fields: toFields(fields) })); }

/** 익명 로그인해서 토큰을 돌려준다. 실패하면 메시지를 찍고 종료. */
export async function login() {
  try { return await signIn(); }
  catch (ex) {
    console.error(ex.message);
    process.exitCode = 1;
    await new Promise(r => setTimeout(r, 200)); // Windows Node에서 fetch 직후 즉시 exit 하면 libuv 단언 오류가 나서 잠깐 기다린다
    process.exit(1);
  }
}
