/* aro-study 회비(기금) 계산과 렌더.

   운영 방식(기본): 1인 회비를 걷어 총무가 보관하고, 모임 비용은 그 회비에서 쓴다. 회비 설정(terms)은 금액과 선택적 기간을 담는다.
   회비를 넘는 추가 비용만 참석자끼리 n분의 1로 나눈다(settle.js).

   컬렉션:
   - terms/{id}:  { name, start, end, fee, memberIds: [id] | null(활성 멤버 전원), note }
   - dues/{id}:   { termId, memberId, amount, date, note }          회비 납부 기록
   - expenses:    source "fund"(회비에서, 기본) | "split"(참석자 n분의 1). 없으면 "split"으로 본다.
   - payments:    from "fund" 이면 회비에서 개인에게 보전한 송금(총무가 아닌 사람이 회비 지출을 대신 결제했을 때).

   잔액 = 납부 합계 - 회비 지출 합계 (누가 결제했는지와 무관).
   보전할 돈 = 총무가 아닌 사람이 결제한 회비 지출 - 그 사람에게 이미 보전한 송금.
*/
import { esc, fmtWon, fmtDate, todayStr, memberName, memberById } from "./app.js";

export const isFund = x => x && x.source === "fund";
export const isSplit = x => x && x.source !== "fund";
export const FUND_ID = "fund";
export const fundLabel = "회비";

/** 이름 표시: payments.from/to 가 "fund"면 "회비". */
export function partyName(id) { return id === FUND_ID ? fundLabel : memberName(id); }

/**
 * @param {object} p
 * @param {object[]} p.terms
 * @param {object[]} p.dues
 * @param {object[]} p.expenses   전체(회비·n분의 1 섞여 있어도 됨)
 * @param {object[]} p.payments   전체
 * @param {object[]} p.members
 * @param {string}   [p.today]
 */
export function computeFund({ terms = [], dues = [], expenses = [], payments = [], members = [], today = todayStr() }) {
  const amt = v => Math.round(Number(v) || 0);
  const adminId = members.find(m => m.role === "admin")?.id || null;
  const active = members.filter(m => m.active !== false);
  const order = id => memberById(id)?.order ?? members.find(m => m.id === id)?.order ?? 999;

  const fundExpenses = expenses.filter(isFund).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const income = dues.reduce((s, d) => s + amt(d.amount), 0);
  const spent = fundExpenses.reduce((s, x) => s + amt(x.amount), 0);
  const balance = income - spent;

  // 보전할 돈: 총무가 아닌 사람이 결제한 회비 지출
  const owedTo = {};
  for (const x of fundExpenses) if (x.paidBy && x.paidBy !== adminId) owedTo[x.paidBy] = (owedTo[x.paidBy] || 0) + amt(x.amount);
  const reimbursed = {};
  for (const p of payments) if (p.from === FUND_ID && p.to) reimbursed[p.to] = (reimbursed[p.to] || 0) + amt(p.amount);
  const reimburse = Object.keys({ ...owedTo, ...reimbursed })
    .map(id => ({ id, name: memberName(id), paid: owedTo[id] || 0, done: reimbursed[id] || 0, remaining: (owedTo[id] || 0) - (reimbursed[id] || 0) }))
    .filter(r => r.paid || r.done)
    .sort((a, b) => order(a.id) - order(b.id));
  const reimburseTotal = reimburse.reduce((s, r) => s + Math.max(0, r.remaining), 0);

  // 회비 설정별 납부 현황
  const termList = terms.slice().sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const termsOut = termList.map(t => {
    const fee = amt(t.fee);
    const tDues = dues.filter(d => d.termId === t.id);
    const ids = new Set(Array.isArray(t.memberIds) && t.memberIds.length ? t.memberIds : active.map(m => m.id));
    tDues.forEach(d => { if (d.memberId) ids.add(d.memberId); });
    const rows = [...ids].sort((a, b) => order(a) - order(b)).map(id => {
      const mine = tDues.filter(d => d.memberId === id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const paid = mine.reduce((s, d) => s + amt(d.amount), 0);
      const status = paid <= 0 ? "unpaid" : paid < fee ? "partial" : "paid";
      return { id, name: memberName(id), paid, fee, status, date: mine.length ? mine[mine.length - 1].date : "", dues: mine };
    });
    const tSpent = fundExpenses.filter(x => (!t.start || (x.date || "") >= t.start) && (!t.end || (x.date || "") <= t.end)).reduce((s, x) => s + amt(x.amount), 0);
    return {
      ...t, fee, rows,
      expected: fee * rows.length,
      collected: rows.reduce((s, r) => s + r.paid, 0),
      spent: tSpent,
      paidCount: rows.filter(r => r.status === "paid").length,
      unpaid: rows.filter(r => r.status !== "paid"),
      isCurrent: (!t.start || t.start <= today) && (!t.end || t.end >= today)
    };
  });
  const current = termsOut.find(t => t.isCurrent) || termsOut.find(t => (t.start || "") <= today) || termsOut[0] || null;

  return { adminId, income, spent, balance, fundExpenses, reimburse, reimburseTotal, terms: termsOut, current, duesCount: dues.length };
}

/** 회비 기간 문구: "2026.09 ~ 2027.02", 둘 다 비어 있으면 "기간 미정" */
export function termPeriod(t) {
  const ym = s => s ? String(s).slice(0, 7).replace("-", ".") : "";
  if (!t) return "";
  return [ym(t.start), ym(t.end)].filter(Boolean).join(" ~ ") || "기간 미정";
}

const statusTag = r => r.status === "paid" ? '<span class="tag ok">납부</span>' : r.status === "partial" ? '<span class="tag warn">일부</span>' : '<span class="tag warn">미납</span>';

/**
 * 회비 현황 렌더(목록 화면). 잔액 요약 + 현재 회비 설정의 납부 표 + 보전할 돈.
 * @param {HTMLElement} root
 * @param {ReturnType<computeFund>} f
 * @param {{me?: string, adminHint?: string, termId?: string}} opt
 */
export function renderFund(root, f, opt = {}) {
  const t = opt.termId ? f.terms.find(x => x.id === opt.termId) : f.current;
  if (!t && !f.duesCount && !f.fundExpenses.length) {
    root.innerHTML = `<div class="empty">아직 회비 설정이 없습니다.${opt.adminHint ? ' 총무가 <a href="' + esc(opt.adminHint) + '#dues">관리 화면</a>에서 1인 회비를 정하면 여기 표시됩니다.' : ""}</div>`;
    return;
  }
  const neg = f.balance < 0;
  const head = `
    <div class="st-head">
      <div class="st-total${neg ? " neg" : ""}"><div class="lab">회비 잔액</div><b>${fmtWon(f.balance)}<small>원</small></b>
        <span>납부 ${fmtWon(f.income)}원 - 지출 ${fmtWon(f.spent)}원${f.reimburseTotal ? ` · 보전 대기 ${fmtWon(f.reimburseTotal)}원` : ""}</span></div>
      <div class="st-rule"><div class="lab">${t ? esc(t.name || "회비") : "회비 설정 없음"}</div>
        ${t ? `${esc(termPeriod(t))} · 1인 ${fmtWon(t.fee)}원 · 대상 ${t.rows.length}명<div class="eq">납부 ${t.paidCount}/${t.rows.length}명 · ${fmtWon(t.collected)} / ${fmtWon(t.expected)}원${t.spent ? ` · 이 기간 지출 ${fmtWon(t.spent)}원` : ""}</div>` : "회비 설정 없이 기록된 납부·지출만 합산했습니다."}
        ${neg ? '<div class="eq" style="color:var(--danger)">지출이 납부액을 넘었습니다. 추가 회비를 걷거나 초과분을 참석자 n분의 1로 나눕니다.</div>' : ""}</div>
    </div>`;

  const rows = t ? t.rows.map(r => `<tr${r.id === opt.me ? ' class="hl"' : ""}${r.status !== "paid" ? ' data-unpaid="1"' : ""}>
      <td>${esc(r.name)}${r.id === f.adminId ? ' <span class="tag">총무</span>' : ""}</td>
      <td data-label="상태">${statusTag(r)}</td>
      <td class="amt" data-label="납부액">${r.paid ? fmtWon(r.paid) : '<span class="soft">-</span>'}${r.status === "partial" ? `<small class="soft"> / ${fmtWon(r.fee)}</small>` : ""}</td>
      <td data-label="납부일">${r.date ? fmtDate(r.date, "short") : '<span class="soft">-</span>'}</td></tr>`).join("") : "";
  const unpaidLine = t && t.unpaid.length
    ? `<div class="note warn" style="margin-top:6px">미납 ${t.unpaid.length}명: ${t.unpaid.map(r => esc(r.name) + (r.status === "partial" ? ` (${fmtWon(r.fee - r.paid)}원 남음)` : "")).join(", ")}</div>`
    : (t ? '<div class="note ok" style="margin-top:6px">전원 납부 완료</div>' : "");

  const pend = f.reimburse.filter(r => r.remaining > 0);
  const reimb = pend.length
    ? `<div class="lab" style="margin-top:16px">회비에서 보전할 돈</div><div class="st-transfers">${pend.map(r => `<div class="tr"><span>${fundLabel}</span><span class="arrow">→</span><span>${esc(r.name)}</span><span class="amt">${fmtWon(r.remaining)}원</span></div>`).join("")}</div>
       <div class="secsub">총무가 아닌 사람이 회비 지출을 대신 결제한 금액입니다. 총무가 보내고 관리 화면 "송금 기록"에 남기면 사라집니다.</div>`
    : "";

  const others = f.terms.filter(x => x !== t);
  const past = others.length
    ? `<div class="lab" style="margin-top:16px">이전 회비 설정</div>${others.map(x => `<div class="rowi"><div class="main">${esc(x.name || "회비")}<small>${esc(termPeriod(x))} · 1인 ${fmtWon(x.fee)}원 · 납부 ${x.paidCount}/${x.rows.length}명</small></div><span class="amt">${fmtWon(x.collected)}</span></div>`).join("")}`
    : "";

  root.innerHTML = `${head}
    ${t ? `<table class="stack dues"><thead><tr><th>멤버</th><th>상태</th><th class="amt">납부액</th><th>납부일</th></tr></thead><tbody>${rows}</tbody></table>${unpaidLine}` : ""}
    ${reimb}${past}`;
}

/**
 * 주차 페이지용: 이 회차의 회비 지출 목록과 현재 잔액.
 * @param {object} p  { items: 회비 지출(이 세션), f: computeFund 결과 | null, payments: 이 세션 payments }
 */
export function renderSessionFund(root, { items = [], f = null, payments = [] }) {
  if (!items.length) { root.innerHTML = ""; return; }
  const total = items.reduce((s, x) => s + (Math.round(Number(x.amount) || 0)), 0);
  const adminId = f?.adminId;
  const list = items.map(x => `<div class="it"><span class="nm">${esc(x.item)}<small>${fmtDate(x.date, "short")} · ${esc(x.category || "")}${x.note ? " · " + esc(x.note) : ""}</small></span><span class="by">${esc(memberName(x.paidBy))}${x.paidBy && adminId && x.paidBy !== adminId ? ' <span class="tag">대신 결제</span>' : ""}</span><span class="amt">${fmtWon(x.amount)}</span></div>`).join("");
  const others = items.filter(x => x.paidBy && adminId && x.paidBy !== adminId);
  const doneTo = {};
  payments.filter(p => p.from === FUND_ID).forEach(p => { doneTo[p.to] = (doneTo[p.to] || 0) + (Math.round(Number(p.amount) || 0)); });
  const reimbRows = [];
  const byPayer = {};
  others.forEach(x => { byPayer[x.paidBy] = (byPayer[x.paidBy] || 0) + Math.round(Number(x.amount) || 0); });
  for (const id of Object.keys(byPayer)) {
    const rem = byPayer[id] - (doneTo[id] || 0);
    reimbRows.push(rem > 0
      ? `<div class="tr"><span>${fundLabel}</span><span class="arrow">→</span><span>${esc(memberName(id))}</span><span class="amt">${fmtWon(rem)}원</span></div>`
      : `<div class="tr done"><span>${fundLabel}</span><span class="arrow">→</span><span>${esc(memberName(id))}</span><span class="amt">${fmtWon(byPayer[id])}원</span><span class="tag ok">보전 완료</span></div>`);
  }
  root.innerHTML = `
    <div class="st-head">
      <div class="st-total"><div class="lab">이 회차 회비 지출</div><b>${fmtWon(total)}<small>원</small></b><span>항목 ${items.length}건 · 참석자 개인 부담 없음</span></div>
      <div class="st-rule"><div class="lab">회비 잔액 (현재)</div>${f ? `<div class="eq${f.balance < 0 ? ' style="color:var(--danger)"' : ""}">${fmtWon(f.balance)}원</div>납부 ${fmtWon(f.income)}원 - 지출 ${fmtWon(f.spent)}원${f.current ? ` · ${esc(f.current.name || "")} ${esc(termPeriod(f.current))}` : ""}` : "잔액을 불러오지 못했습니다."}</div>
    </div>
    <div class="st-day"><div class="hd"><b>내역</b><span class="n">${items.length}건</span><span class="sum">${fmtWon(total)}원</span></div>${list}</div>
    ${reimbRows.length ? `<div class="lab" style="margin-top:14px">회비에서 보전</div><div class="st-transfers">${reimbRows.join("")}</div>` : ""}`;
}
