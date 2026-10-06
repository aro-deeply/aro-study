/* aro-study 첫 화면(index.html)과 회비 화면(fund.html)이 같이 쓰는 데이터 불러오기와 화면 조각.
   계산은 기존 함수(computeSettlement, computeFund, computeSchedule)를 그대로 쓴다. 여기서는 숫자를 새로 만들지 않는다.
   ?demo=1 이면 Firestore 없이 demo/sample.js 가명 데이터로 그린다. */
import {
  ready, db, esc, fmtWon, todayStr, members, setMembers, memberName, renderTopbar,
  collection, getDocs, query, orderBy
} from "./app.js";
import { computeSettlement } from "./settle.js";
import { computeFund, isSplit, accountNumber } from "./fund.js";
import { computeSchedule, loadSettings, ym } from "./schedule.js";

export const DEMO = new URLSearchParams(location.search).get("demo") === "1";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const NB = " ";

/** "2026-11-11" -> { y, m, d, w: "수" } */
export function dparts(iso) {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d, w: WD[new Date(y, m - 1, d).getDay()] };
}
/** 1 -> "첫", 2 -> "두" ... 10 -> "열", 그 뒤는 숫자 */
export function ordinal(n) {
  const k = ["", "첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
  return n >= 1 && n <= 10 ? k[n] : `${n}`;
}
/** 링크 주소: 예시 화면이면 예시 페이지로 */
export const href = {
  home: () => DEMO ? "./?demo=1" : "./",
  fund: () => DEMO ? "fund.html?demo=1" : "fund.html",
  week: s => DEMO ? "demo/week.html" : `weeks/${encodeURIComponent(s.id)}/`
};

/** 전체 자료를 읽고 계산까지 한다. */
export async function loadAll() {
  let me = "", today = todayStr();
  let sessions = [], expenses = [], payments = [], comments = [], terms = [], dues = [], settings = null;
  if (DEMO) {
    const S = await import("../demo/sample.js");
    setMembers(S.MEMBERS); me = "b"; today = S.TODAY || today;
    sessions = S.SESSIONS.slice(); expenses = S.EXPENSES; payments = S.PAYMENTS; comments = S.COMMENTS; terms = S.TERMS; dues = S.DUES;
    settings = { ...S.SETTINGS, notice: { text: "", until: "" } };
    const mf = document.querySelector('link[rel="manifest"]'); if (mf) mf.href = "demo/manifest.json";
    renderTopbar(me, { demo: true, home: href.home(), fund: href.fund() });
  } else {
    ({ me } = await ready());
    const [sSnap, eSnap, pSnap, cSnap, tSnap, dSnap, st] = await Promise.all([
      getDocs(query(collection(db, "sessions"), orderBy("date", "desc"))),
      getDocs(collection(db, "expenses")),
      getDocs(collection(db, "payments")),
      getDocs(collection(db, "comments")),
      getDocs(collection(db, "terms")),
      getDocs(collection(db, "dues")),
      loadSettings()
    ]);
    const rows = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
    sessions = rows(sSnap); expenses = rows(eSnap); payments = rows(pSnap); terms = rows(tSnap); dues = rows(dSnap); settings = st;
    comments = cSnap.docs.map(d => d.data());
  }
  sessions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const commentCount = {};
  comments.forEach(c => { if (!c.deleted) commentCount[c.sessionId] = (commentCount[c.sessionId] || 0) + 1; });
  const sessionsById = Object.fromEntries(sessions.map(s => [s.id, s]));
  const r = computeSettlement({ expenses, payments, sessionsById, members: members() });
  const f = computeFund({ terms, dues, expenses, payments, members: members(), today, splitSurplus: r.surplus });
  const sch = computeSchedule({ meeting: settings?.meeting, rotation: settings?.rotation, sessions, today, months: 12, untilEnd: true });
  // 회차별 추가 비용 정산(참석자 n분의 1). 회차마다 따로 계산한다(기존 화면과 같은 방식).
  const splits = sessions
    .filter(s => expenses.some(x => x.sessionId === s.id && isSplit(x)))
    .map(s => ({ s, rs: computeSettlement({ expenses: expenses.filter(x => x.sessionId === s.id), payments: payments.filter(p => p.sessionId === s.id), sessionsById, members: members() }) }));
  const D = { me, today, sessions, expenses, payments, comments, terms, dues, settings, commentCount, sessionsById, r, f, sch, splits };
  window.__site = D; window.__fund = f; window.__r = r; window.__sched = sch;
  return D;
}

/** 이 사람이 할 일(회비 미납, 추가 비용 보낼 돈·받을 돈, 회비에서 돌려받을 돈). 없으면 [].
    각 항목: { title, desc(왜), acct(계좌 표시), link(내역 페이지), action(복사 버튼 HTML) } */
export function tasksFor(D) {
  const { me, f, splits, expenses = [] } = D;
  if (!me) return [];
  const out = [];
  const t = f.current;
  const acct = t?.account || "";
  const copy = acct ? `<button type="button" class="btn block" data-copy="${esc(accountNumber(acct))}">계좌번호 복사</button>` : "";
  const mine = t?.rows.find(x => x.id === me);
  if (mine && mine.status !== "paid") {
    const left = mine.fee - mine.paid;
    out.push({ title: `회비 ${fmtWon(left)}원 내기`, desc: mine.paid ? `${fmtWon(mine.fee)}원 중 ${fmtWon(mine.paid)}원 납부` : `1인 회비 ${fmtWon(mine.fee)}원`, acct: esc(acct), link: href.fund(), linkLabel: "회비 보기", action: copy });
  }
  for (const { s, rs } of splits) {
    const p = dparts(s.date);
    const when = p ? `${p.m}월 ${p.d}일` : "";
    const items = expenses.filter(x => x.sessionId === s.id && isSplit(x)).map(x => x.item).filter(Boolean);
    const what = items.length ? (items.length > 2 ? `${items.slice(0, 2).join(", ")} 외 ${items.length - 2}건` : items.join(", ")) : "추가 비용";
    const why = r => r.uniform && r.n ? `${esc(what)} ${fmtWon(r.total)}원을 ${r.n}명이 나눔` : `${esc(what)} ${fmtWon(r.total)}원을 나눔`;
    const link = s.page ? href.week(s) : "";
    for (const tr of rs.transfers.filter(x => x.from === me)) {
      const toAdmin = tr.to === f.adminId && acct;
      out.push({ title: `${when} 추가 비용 ${fmtWon(tr.amount)}원 보내기`, desc: why(rs) + (toAdmin ? "" : `${NB}· 받는 사람 ${esc(memberName(tr.to))}`),
        acct: toAdmin ? esc(acct) : "", link, action: toAdmin ? copy : "" });
    }
    const inc = rs.transfers.filter(x => x.to === me);
    if (inc.length) out.push({ title: `${when} 추가 비용 ${fmtWon(inc.reduce((a, x) => a + x.amount, 0))}원 받을 예정`,
      desc: inc.map(x => `${esc(memberName(x.from))} ${fmtWon(x.amount)}원`).join(", "), acct: "", link, action: "" });
  }
  const rb = f.reimburse.find(x => x.id === me && x.remaining > 0);
  if (rb) out.push({ title: `회비에서 ${fmtWon(rb.remaining)}원 돌려받을 예정`, desc: "회비로 낼 돈을 먼저 결제한 금액", acct: "", link: href.fund(), linkLabel: "회비 보기", action: "" });
  return out;
}

/** 오류 문구 */
export function loadError(ex) {
  console.error(ex);
  return /insufficient permissions/i.test(ex?.message || "") ? "권한 오류. 총무가 Firestore 규칙을 게시했는지 확인 필요." : esc(ex?.message || ex);
}
export { ym };
