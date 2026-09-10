/* aro-study 회비(기금) 계산과 렌더.

   운영 방식(기본): 1인 회비를 걷어 총무가 보관하고, 모임 비용은 그 회비에서 쓴다. 회비 설정(terms)은 금액과 선택적 기간을 담는다.
   회비를 넘는 추가 비용만 참석자끼리 n분의 1로 나눈다(settle.js).

   컬렉션:
   - terms/{id}:  { name, start, end, fee, months, account, memberIds: [id] | null(활성 멤버 전원), note }
                  months(사용 개월 수)와 start가 있으면 월별 가용 금액을 계산한다. account는 입금 계좌(표시용).
   - dues/{id}:   { termId, memberId, amount, date, note }          회비 납부 기록
   - expenses:    source "fund"(회비에서, 기본) | "split"(참석자 n분의 1). 없으면 "split"으로 본다.
   - payments:    from "fund" 이면 회비에서 개인에게 보전한 송금(총무가 아닌 사람이 회비 지출을 대신 결제했을 때).

   잔액 = 납부 합계 + 추가 비용 정산의 회비 귀속분(splitSurplus, settle.js가 계산) - 회비 지출 합계 (누가 결제했는지와 무관).
   보전할 돈 = 총무가 아닌 사람이 결제한 회비 지출 - 그 사람에게 이미 보전한 송금.
   월별 가용 금액(2026-09-10 추가) = 회비 총액(1인 회비 x 대상 인원)을 months로 나눈 배정액 + 이전 달까지 덜 쓴 이월분.
     월 배정액은 100원 단위 올림이고, 마지막 달은 남는 금액(그만큼 적을 수 있다).
*/
import { esc, fmtWon, fmtDate, todayStr, memberName, memberById, ceil100, toast } from "./app.js";
import { ym, addMonths, lastDayOf, fmtMonth, isYm } from "./schedule.js";

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
 * @param {number}   [p.splitSurplus]  추가 비용 정산에서 올림으로 더 걷혀 회비로 귀속된 금액(computeSettlement().surplus)
 */
export function computeFund({ terms = [], dues = [], expenses = [], payments = [], members = [], today = todayStr(), splitSurplus = 0 }) {
  const amt = v => Math.round(Number(v) || 0);
  const adminId = members.find(m => m.role === "admin")?.id || null;
  const active = members.filter(m => m.active !== false);
  const order = id => memberById(id)?.order ?? members.find(m => m.id === id)?.order ?? 999;

  const fundExpenses = expenses.filter(isFund).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const duesTotal = dues.reduce((s, d) => s + amt(d.amount), 0);
  const surplus = amt(splitSurplus);
  const income = duesTotal + surplus;
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
    const months = Math.max(0, Math.round(Number(t.months) || 0));
    // 종료일이 비어 있어도 개월 수가 있으면 마지막 달 말일까지로 본다.
    const endEff = t.end || (months && t.start ? lastDayOf(addMonths(ym(t.start), months - 1)) : "");
    const inTerm = fundExpenses.filter(x => (!t.start || (x.date || "") >= t.start) && (!endEff || (x.date || "") <= endEff));
    const tSpent = inTerm.reduce((s, x) => s + amt(x.amount), 0);
    const expected = fee * rows.length;
    return {
      ...t, fee, rows, months, endEff, expected,
      collected: rows.reduce((s, r) => s + r.paid, 0),
      spent: tSpent,
      paidCount: rows.filter(r => r.status === "paid").length,
      unpaid: rows.filter(r => r.status !== "paid"),
      isCurrent: (!t.start || t.start <= today) && (!endEff || endEff >= today),
      budget: computeBudget({ start: t.start, months, total: expected, expenses: inTerm, today })
    };
  });
  const current = termsOut.find(t => t.isCurrent) || termsOut.find(t => (t.start || "") <= today) || termsOut[0] || null;

  return { adminId, income, duesTotal, surplus, spent, balance, fundExpenses, reimburse, reimburseTotal, terms: termsOut, current, duesCount: dues.length };
}

/** "납부 x원 + 정산 적립 y원 - 지출 z원" 한 줄(귀속이 없으면 빼고). */
export function incomeLine(f) {
  return `납부 ${fmtWon(f.duesTotal ?? f.income)}원${f.surplus ? ` + 정산 적립 ${fmtWon(f.surplus)}원` : ""} - 지출 ${fmtWon(f.spent)}원`;
}

/**
 * 월별 가용 금액. start(YYYY-MM-DD)와 months가 있어야 계산한다.
 * @returns {null | { months, monthly, total, rows: [{ ym, alloc, carried, available, spent, remaining, isCurrent, isPast }], current, status: "before"|"during"|"after", startYm, endYm }}
 */
export function computeBudget({ start, months, total, expenses = [], today = todayStr() }) {
  months = Math.max(0, Math.round(Number(months) || 0));
  if (!months || !start) return null;
  const amt = v => Math.round(Number(v) || 0);
  const startYm = ym(start), curYm = ym(today);
  total = amt(total);
  const rows = [];
  const monthly = ceil100(total / months);   // 100원 단위 올림, 마지막 달은 남는 금액
  let cumAlloc = 0, cumSpent = 0;
  for (let i = 0; i < months; i++) {
    const m = addMonths(startYm, i);
    const alloc = i < months - 1 ? monthly : total - cumAlloc;
    const cum = cumAlloc + alloc;
    const carried = cumAlloc - cumSpent;
    const spent = expenses.filter(x => ym(x.date) === m).reduce((s, x) => s + amt(x.amount), 0);
    cumAlloc = cum; cumSpent += spent;
    rows.push({ ym: m, alloc, carried, available: carried + alloc, spent, remaining: cum - cumSpent, isCurrent: m === curYm, isPast: m < curYm });
  }
  const endYm = rows[rows.length - 1].ym;
  const status = curYm < startYm ? "before" : curYm > endYm ? "after" : "during";
  return { months, monthly, last: rows[rows.length - 1].alloc, total, rows, current: rows.find(r => r.isCurrent) || null, status, startYm, endYm };
}

/** 계좌 문자열에서 번호만(숫자·하이픈) 뽑는다. 없으면 전체를 돌려준다. */
export function accountNumber(s) { const m = String(s || "").match(/[\d-]{8,}/); return m ? m[0] : String(s || ""); }
/** data-copy 버튼: 누르면 클립보드에 복사. root마다 한 번만 건다. */
function bindCopy(root) {
  if (root.dataset.copyBound) return; root.dataset.copyBound = "1";
  root.addEventListener("click", async e => {
    const b = e.target.closest("button[data-copy]"); if (!b) return;
    const text = b.dataset.copy;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      toast("복사했습니다: " + text);
    } catch (ex) { console.error(ex); toast("복사 실패. 길게 눌러 직접 복사하세요", 3000); }
  });
}

/** 회비 기간 문구: "2026.09 ~ 2027.02", 둘 다 비어 있으면 "기간 미정" */
export function termPeriod(t) {
  const dot = s => s ? String(s).slice(0, 7).replace("-", ".") : "";
  if (!t) return "";
  return [dot(t.start), dot(t.endEff || t.end)].filter(Boolean).join(" ~ ") || "기간 미정";
}

/** 회비 현황과 주차 페이지에 같이 쓰는 월별 가용 금액 표. */
export function renderBudget(b, opt = {}) {
  if (!b) return "";
  const note = b.status === "before" ? `${fmtMonth(b.startYm, "short")}부터` : b.status === "after" ? `${fmtMonth(b.endYm)} 종료` : "";
  const rows = b.rows.map(r => `<tr${r.isCurrent ? ' class="hl"' : ""}${r.remaining < 0 ? ' data-over="1"' : ""}>
      <td>${esc(fmtMonth(r.ym))}${r.isCurrent ? ' <span class="tag">이달</span>' : ""}</td>
      <td class="amt" data-label="배정">${fmtWon(r.alloc)}</td>
      <td class="amt" data-label="이월">${r.carried ? fmtWon(r.carried) : '<span class="soft">-</span>'}</td>
      <td class="amt" data-label="지출">${r.spent ? fmtWon(r.spent) : '<span class="soft">-</span>'}</td>
      <td class="amt" data-label="남은 금액"><b>${fmtWon(r.remaining)}</b></td></tr>`).join("");
  return `<div class="lab" style="margin-top:16px">월별 가용 금액</div>
    <div class="secsub" style="margin:0 0 8px">월 ${fmtWon(b.monthly)}원${b.last !== b.monthly ? ` · 마지막 달 ${fmtWon(b.last)}원` : ""}${note ? " · " + esc(note) : ""}</div>
    <table class="stack budget"><thead><tr><th>월</th><th class="amt">배정</th><th class="amt">이월</th><th class="amt">지출</th><th class="amt">남은 금액</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    root.innerHTML = `<div class="empty">회비 설정 없음${opt.adminHint ? ' · <a href="' + esc(opt.adminHint) + '#dues">관리</a>에서 설정' : ""}</div>`;
    return;
  }
  const neg = f.balance < 0;
  const head = `
    <div class="st-head">
      <div class="st-total${neg ? " neg" : ""}"><div class="lab">회비 잔액</div><b>${fmtWon(f.balance)}<small>원</small></b>
        <span>${incomeLine(f)}${f.reimburseTotal ? ` · 보전 대기 ${fmtWon(f.reimburseTotal)}원` : ""}</span></div>
      <div class="st-rule"><div class="lab">${t ? esc(t.name || "회비") : "회비 설정 없음"}</div>
        ${t ? `${esc(termPeriod(t))} · 1인 ${fmtWon(t.fee)}원 · 대상 ${t.rows.length}명<div class="eq">납부 ${t.paidCount}/${t.rows.length}명 · ${fmtWon(t.collected)} / ${fmtWon(t.expected)}원${t.spent ? ` · 이 기간 지출 ${fmtWon(t.spent)}원` : ""}</div>${t.account ? `<div class="eq acct"><span>계좌 ${esc(t.account)}</span><button type="button" class="copy-btn" data-copy="${esc(accountNumber(t.account))}">복사</button></div>` : ""}` : "회비 설정 없음 · 납부와 지출만 합산"}
        ${neg ? '<div class="eq" style="color:var(--danger)">지출이 납부액 초과</div>' : ""}</div>
    </div>`;

  const rows = t ? t.rows.map(r => `<tr${r.id === opt.me ? ' class="hl"' : ""}${r.status !== "paid" ? ' data-unpaid="1"' : ""}>
      <td>${esc(r.name)}${r.id === f.adminId ? ' <span class="tag">총무</span>' : ""}</td>
      <td data-label="상태">${statusTag(r)}</td>
      <td class="amt" data-label="납부액">${r.paid ? fmtWon(r.paid) : '<span class="soft">-</span>'}${r.status === "partial" ? `<small class="soft"> / ${fmtWon(r.fee)}</small>` : ""}</td>
      <td data-label="납부일">${r.date ? fmtDate(r.date, "short") : '<span class="soft">-</span>'}</td></tr>`).join("") : "";
  const pend = f.reimburse.filter(r => r.remaining > 0);
  const reimb = pend.length
    ? `<div class="lab" style="margin-top:16px">회비에서 보전할 돈</div><div class="st-transfers">${pend.map(r => `<div class="tr"><span>${fundLabel}</span><span class="arrow">→</span><span>${esc(r.name)}</span><span class="amt">${fmtWon(r.remaining)}원</span></div>`).join("")}</div>
       <div class="secsub">대신 결제한 금액. 총무가 송금 후 기록하면 사라짐.</div>`
    : "";

  const others = f.terms.filter(x => x !== t);
  const past = others.length
    ? `<div class="lab" style="margin-top:16px">이전 회비 설정</div>${others.map(x => `<div class="rowi"><div class="main">${esc(x.name || "회비")}<small>${esc(termPeriod(x))} · 1인 ${fmtWon(x.fee)}원 · 납부 ${x.paidCount}/${x.rows.length}명</small></div><span class="amt">${fmtWon(x.collected)}</span></div>`).join("")}`
    : "";

  root.innerHTML = `${head}
    ${t ? renderBudget(t.budget) : ""}
    ${t ? `<div class="lab" style="margin-top:16px">멤버별 납부</div><table class="stack dues"><thead><tr><th>멤버</th><th>상태</th><th class="amt">납부액</th><th>납부일</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${reimb}${past}`;
  bindCopy(root);
}

/** "이달 가용 x원 (이월 y원 포함)" 한 줄. 월별 예산이 없으면 빈 문자열. */
export function budgetLine(f) {
  const b = f?.current?.budget; if (!b) return "";
  if (b.status === "before") return `<div class="eq" style="font-weight:500">${esc(fmtMonth(b.startYm))}부터 월 ${fmtWon(b.monthly)}원</div>`;
  if (!b.current) return "";
  const c = b.current;
  return `<div class="eq${c.remaining < 0 ? ' style="color:var(--danger)"' : ""}">이달 가용 ${fmtWon(c.remaining)}원 <small style="font-weight:500">(배정 ${fmtWon(c.alloc)}${c.carried ? ` + 이월 ${fmtWon(c.carried)}` : ""}${c.spent ? ` - 지출 ${fmtWon(c.spent)}` : ""})</small></div>`;
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
      <div class="st-total"><div class="lab">이 회차 회비 지출</div><b>${fmtWon(total)}<small>원</small></b><span>${items.length}건 · 개인 부담 없음</span></div>
      <div class="st-rule"><div class="lab">회비 잔액 (현재)</div>${f ? `<div class="eq${f.balance < 0 ? ' style="color:var(--danger)"' : ""}">${fmtWon(f.balance)}원</div>${incomeLine(f)}${f.current ? ` · ${esc(f.current.name || "")} ${esc(termPeriod(f.current))}` : ""}${budgetLine(f)}` : "잔액 불러오기 실패"}</div>
    </div>
    <div class="st-day"><div class="hd"><b>내역</b><span class="n">${items.length}건</span><span class="sum">${fmtWon(total)}원</span></div>${list}</div>
    ${reimbRows.length ? `<div class="lab" style="margin-top:14px">회비에서 보전</div><div class="st-transfers">${reimbRows.join("")}</div>` : ""}`;
}
