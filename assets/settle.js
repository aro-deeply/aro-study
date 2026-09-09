/* aro-study 정산: 계산(computeSettlement)과 렌더(renderSettlement), Firestore 연결(mountSettlement).
   화면 구성은 SPEC 6절 "속초 정산서"를 따른다.

   규칙(기본값):
   - 각 지출은 분배 대상(splitAmong: "attendees" = 그 세션 참석자 전원, 또는 memberId 배열)에게 균등 분배.
   - 1인 부담액은 100원 단위로 내림. 나머지(뒷자리)는 총무(role: admin)가 부담한다.
     총무가 분배 대상에 없으면 낸 사람이, 그도 없으면 첫 번째 대상이 나머지를 부담한다.
   - 차액 = 낸 금액 - 부담액. +는 받을 돈, -는 낼 돈.
   - 정산 완료(payments)는 보낸 사람의 차액을 올리고 받은 사람의 차액을 내린다. 남은 차액으로 "보낼 돈"을 만든다.
   - 회비에서 쓴 지출(source: "fund")과 회비에서 보전한 송금(from: "fund")은 개인 정산에서 제외한다(fund.js).
     이 파일의 계산은 "추가 비용(참석자 n분의 1)"에만 적용된다.
*/
import {
  db, collection, doc, getDoc, getDocs, query, where,
  loadMembers, members, memberById, memberName, esc, fmtWon, fmtDiff, fmtDate, floor100
} from "./app.js";
import { isSplit, FUND_ID, computeFund, renderSessionFund } from "./fund.js";

export const CATEGORIES = ["식사", "카페", "장소", "기타"];

/**
 * @param {object} p
 * @param {object[]} p.expenses   { sessionId, date, item, amount, category, paidBy, splitAmong }
 * @param {object[]} p.payments   { sessionId, from, to, amount, date }
 * @param {Object<string,object>} p.sessionsById  sessionId -> { attendees: [] }
 * @param {object[]} p.members    { id, name, role, active, order }
 */
export function computeSettlement({ expenses = [], payments = [], sessionsById = {}, members = [] }) {
  expenses = expenses.filter(isSplit);
  payments = payments.filter(p => p.from !== FUND_ID && p.to !== FUND_ID);
  const adminId = members.find(m => m.role === "admin")?.id || null;
  const known = new Set(members.map(m => m.id));
  const paid = {}, owed = {}, warnings = [];
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };

  let total = 0;
  for (const x of expenses) {
    const amount = Math.round(Number(x.amount) || 0);
    total += amount;
    if (x.paidBy) add(paid, x.paidBy, amount);

    let group = Array.isArray(x.splitAmong) ? x.splitAmong.slice() : (sessionsById[x.sessionId]?.attendees || []);
    group = group.filter((id, i) => id && group.indexOf(id) === i);
    if (!group.length) {
      // 참석자 정보가 없으면 활성 멤버 전원으로 본다.
      group = members.filter(m => m.active !== false).map(m => m.id);
      if (group.length) warnings.push(`"${x.item}"의 분배 대상이 비어 있어 활성 멤버 전원으로 계산했습니다.`);
    }
    if (!group.length) { warnings.push(`"${x.item}"을 나눌 대상이 없습니다.`); continue; }

    const n = group.length;
    const base = floor100(amount / n);
    const rest = amount - base * n;
    const bearer = group.includes(adminId) ? adminId : (group.includes(x.paidBy) ? x.paidBy : group[0]);
    for (const id of group) add(owed, id, base + (id === bearer ? rest : 0));
  }

  // 사람별 집계
  const ids = new Set([...Object.keys(paid), ...Object.keys(owed)]);
  const balance = {};
  for (const id of ids) balance[id] = (paid[id] || 0) - (owed[id] || 0);
  for (const p of payments) {
    const a = Math.round(Number(p.amount) || 0);
    if (p.from) { add(balance, p.from, a); ids.add(p.from); }
    if (p.to) { add(balance, p.to, -a); ids.add(p.to); }
  }
  const order = id => memberById(id)?.order ?? 999;
  const people = [...ids]
    .sort((a, b) => order(a) - order(b) || String(a).localeCompare(String(b)))
    .map(id => ({
      id, name: known.has(id) ? memberName(id) : "(탈퇴 멤버)", isAdmin: id === adminId,
      paid: paid[id] || 0, owed: owed[id] || 0, diff: (paid[id] || 0) - (owed[id] || 0), remaining: balance[id] || 0
    }));

  // 보낼 돈: 남은 차액이 -인 사람 -> +인 사람 (큰 금액부터 그리디)
  const debtors = people.filter(p => p.remaining < 0).map(p => ({ id: p.id, amt: -p.remaining })).sort((a, b) => b.amt - a.amt);
  const creditors = people.filter(p => p.remaining > 0).map(p => ({ id: p.id, amt: p.remaining })).sort((a, b) => b.amt - a.amt);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const a = Math.min(debtors[i].amt, creditors[j].amt);
    if (a > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: a });
    debtors[i].amt -= a; creditors[j].amt -= a;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }

  // 카테고리
  const catSum = {};
  for (const x of expenses) add(catSum, CATEGORIES.includes(x.category) ? x.category : "기타", Math.round(Number(x.amount) || 0));
  const categories = CATEGORIES.map(c => ({ name: c, amount: catSum[c] || 0 })).filter(c => c.amount > 0);

  // 날짜별
  const byDateMap = {};
  for (const x of expenses) (byDateMap[x.date || ""] ||= []).push(x);
  const byDate = Object.keys(byDateMap).sort().map(date => ({
    date, items: byDateMap[date], subtotal: byDateMap[date].reduce((s, x) => s + Math.round(Number(x.amount) || 0), 0)
  }));

  // 검산
  const owedSum = Object.values(owed).reduce((s, v) => s + v, 0);
  const subSum = byDate.reduce((s, d) => s + d.subtotal, 0);
  const seen = new Set(), dup = [];
  for (const x of expenses) { const k = `${x.date}|${x.item}|${x.amount}`; if (seen.has(k)) dup.push(x.item); seen.add(k); }
  const checks = { itemsOk: subSum === total, owedOk: owedSum === total || expenses.length === 0, dupes: dup, owedSum, subSum };

  // 정산 기준 문구: 모든 지출이 참석자 전원 균등이면 단일 식으로 표시
  const groups = new Set(expenses.map(x => Array.isArray(x.splitAmong) ? x.splitAmong.slice().sort().join(",") : "attendees:" + (sessionsById[x.sessionId]?.attendees || []).slice().sort().join(",")));
  const uniform = groups.size <= 1;
  const n = uniform && expenses.length ? (Array.isArray(expenses[0].splitAmong) ? expenses[0].splitAmong.length : (sessionsById[expenses[0].sessionId]?.attendees || []).length) : 0;

  return { total, count: expenses.length, people, transfers, categories, byDate, checks, warnings, adminId, uniform, n };
}

/* ---------- 렌더 ---------- */
export function renderSettlement(root, r, opt = {}) {
  const title = opt.title || "정산";
  if (!r.count) {
    root.innerHTML = opt.emptyText === "" ? "" : `<div class="empty">${esc(opt.emptyText || "아직 등록된 지출이 없습니다.")}${opt.adminHint ? ' 총무가 <a href="' + esc(opt.adminHint) + '#expenses">관리 화면</a>에서 입력하면 여기 표시됩니다.' : ""}</div>`;
    return;
  }
  const rule = r.uniform && r.n
    ? `참석 ${r.n}인 균등, 100원 단위. 뒷자리는 총무 부담.<div class="eq">${fmtWon(r.total)} / ${r.n} = ${fmtWon(r.total / r.n)} → ${fmtWon(floor100(r.total / r.n))}원</div>`
    : `항목마다 분배 대상 기준으로 균등, 100원 단위. 뒷자리는 총무 부담.`;

  const people = r.people.map(p => `
    <div class="st-person${p.isAdmin ? " is-admin" : ""}">
      <div class="nm">${esc(p.name)}${p.isAdmin ? ' <span class="tag">총무 · 뒷자리 부담</span>' : ""}</div>
      <b>${fmtWon(p.owed)}원</b>
      <span>낸 돈 ${fmtWon(p.paid)} · <em class="diff ${p.diff > 0 ? "plus" : p.diff < 0 ? "minus" : ""}">${fmtDiff(p.diff)}</em></span>
    </div>`).join("");

  const catTotal = r.categories.reduce((s, c) => s + c.amount, 0) || 1;
  const catIdx = c => CATEGORIES.indexOf(c.name) + 1 || 4;
  const bar = r.categories.map(c => `<i class="c${catIdx(c)}" style="width:${(c.amount / catTotal * 100).toFixed(1)}%" title="${esc(c.name)}"></i>`).join("");
  const cats = r.categories.map(c => `<span><i class="c${catIdx(c)}"></i>${esc(c.name)} <b>${fmtWon(c.amount)}</b></span>`).join("");

  const days = r.byDate.map(d => `
    <div class="st-day">
      <div class="hd"><b>${fmtDate(d.date, "short")}</b><span class="n">${d.items.length}건</span><span class="sum">${fmtWon(d.subtotal)}원</span></div>
      ${d.items.map(x => `<div class="it"><span class="nm">${esc(x.item)}<small>${esc(x.category || "")}${x.note ? " · " + esc(x.note) : ""}</small></span><span class="by">${esc(memberName(x.paidBy))}</span><span class="amt">${fmtWon(x.amount)}</span></div>`).join("")}
    </div>`).join("");

  const transfers = r.transfers.length
    ? r.transfers.map(t => `<div class="tr"><span>${esc(memberName(t.from))}</span><span class="arrow">→</span><span>${esc(memberName(t.to))}</span><span class="amt">${fmtWon(t.amount)}원</span></div>`).join("")
    : `<div class="tr done"><span>남은 정산이 없습니다.</span></div>`;
  const done = (opt.payments || []).filter(p => p.from !== FUND_ID && p.to !== FUND_ID).map(p => `<div class="tr done"><span>${esc(memberName(p.from))}</span><span class="arrow">→</span><span>${esc(memberName(p.to))}</span><span class="amt">${fmtWon(p.amount)}원</span><span class="tag ok">완료 ${fmtDate(p.date, "short")}</span></div>`).join("");

  const bad = !r.checks.itemsOk || !r.checks.owedOk || r.checks.dupes.length || r.warnings.length;
  const checkLine = bad
    ? [
        !r.checks.itemsOk ? `소계 합 ${fmtWon(r.checks.subSum)} ≠ 총액 ${fmtWon(r.total)}` : "",
        !r.checks.owedOk ? `부담액 합 ${fmtWon(r.checks.owedSum)} ≠ 총액 ${fmtWon(r.total)}` : "",
        r.checks.dupes.length ? `중복 의심: ${r.checks.dupes.map(esc).join(", ")}` : "",
        ...r.warnings.map(esc)
      ].filter(Boolean).join(" · ")
    : `중복 없음 · 합계 검산 완료 (항목 합 ${fmtWon(r.checks.subSum)} = 총액, 부담액 합 ${fmtWon(r.checks.owedSum)} = 총액)`;

  root.innerHTML = `
    <div class="st-head">
      <div class="st-total"><div class="lab">${esc(opt.totalLabel || "총 지출")}</div><b>${fmtWon(r.total)}<small>원</small></b><span>${esc(opt.subtitle || "")}${opt.subtitle ? ", " : ""}항목 ${r.count}건</span></div>
      <div class="st-rule"><div class="lab">정산 기준</div>${rule}</div>
    </div>
    <div class="st-people">${people}</div>
    ${r.categories.length ? `<div class="lab">카테고리</div><div class="st-catbar">${bar}</div><div class="st-cats">${cats}</div>` : ""}
    <div class="lab">상세 내역</div>${days}
    <div class="lab" style="margin-top:18px">보낼 돈</div>
    <div class="st-transfers">${transfers}${done}</div>
    <div class="st-check${bad ? " bad" : ""}">${checkLine}</div>`;
}

/* ---------- Firestore 연결 ---------- */
export async function fetchSessionData(sessionId) {
  const [sSnap, eSnap, pSnap] = await Promise.all([
    getDoc(doc(db, "sessions", sessionId)),
    getDocs(query(collection(db, "expenses"), where("sessionId", "==", sessionId))),
    getDocs(query(collection(db, "payments"), where("sessionId", "==", sessionId)))
  ]);
  const session = sSnap.exists() ? { id: sSnap.id, ...sSnap.data() } : null;
  const expenses = eSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const payments = pSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return { session, expenses, payments };
}

/** 회비 잔액 계산에 필요한 전체 자료(회비 설정, 납부, 회비 지출, 회비 보전 송금). */
export async function fetchFundData() {
  const [tSnap, dSnap, eSnap, pSnap] = await Promise.all([
    getDocs(collection(db, "terms")),
    getDocs(collection(db, "dues")),
    getDocs(query(collection(db, "expenses"), where("source", "==", "fund"))),
    getDocs(query(collection(db, "payments"), where("from", "==", FUND_ID)))
  ]);
  const rows = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  return { terms: rows(tSnap), dues: rows(dSnap), fundExpenses: rows(eSnap), fundPayments: rows(pSnap) };
}

/** 주차 페이지용: 세션 하나의 비용(회비 지출 + 추가 비용 정산)을 root에 렌더. 반환값으로 세션 문서도 돌려준다. */
export async function mountSettlement(root, sessionId, opt = {}) {
  root.innerHTML = '<div class="empty">비용 불러오는 중</div>';
  try {
    await loadMembers();
    const { session, expenses, payments } = await fetchSessionData(sessionId);
    const fundItems = expenses.filter(x => !isSplit(x));
    let f = null;
    if (fundItems.length) {
      try { const fd = await fetchFundData(); f = computeFund({ terms: fd.terms, dues: fd.dues, expenses: fd.fundExpenses, payments: fd.fundPayments, members: members() }); }
      catch (ex) { console.error(ex); }
    }
    const r = computeSettlement({ expenses, payments, sessionsById: { [sessionId]: session || {} }, members: members() });
    root.innerHTML = '<div id="settle-fund"></div><div id="settle-split"></div>';
    renderSessionFund(root.querySelector("#settle-fund"), { items: fundItems, f, payments });
    const splitRoot = root.querySelector("#settle-split");
    if (fundItems.length) splitRoot.innerHTML = r.count ? '<div class="lab" style="margin-top:22px">추가 비용 (참석자 n분의 1)</div>' : "";
    const sub = document.createElement("div"); splitRoot.appendChild(sub);
    renderSettlement(sub, r, {
      ...opt, payments, subtitle: opt.subtitle ?? (session?.date ? fmtDate(session.date) : ""),
      totalLabel: fundItems.length ? "추가 비용" : "총 지출",
      emptyText: fundItems.length ? "" : (opt.emptyText || "아직 등록된 지출이 없습니다.")
    });
    return { session, expenses, payments, result: r, fund: f };
  } catch (ex) {
    console.error(ex);
    root.innerHTML = `<div class="note warn">비용을 불러오지 못했습니다: ${esc(ex.message || ex)}</div>`;
    return null;
  }
}
