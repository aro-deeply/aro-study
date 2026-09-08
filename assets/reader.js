/* aro-study reader: 하이라이트·메모(annotations)와 의견(comments).
   aro-briefs의 reader.js를 Firestore 저장으로 개조한 것. anchor 방식(본문 텍스트 오프셋 start/end)은 그대로 둔다.

   저장소(store)는 교체 가능: firestoreStore(컬렉션, sessionId) 또는 memoryStore(예시용).
   store 인터페이스: subscribe(cb) -> unsubscribe, add(data) -> id, update(id, patch), remove(id)

   사용:
     import { mountReader, mountComments, firestoreStore } from "../../assets/reader.js";
     mountReader({ sessionId, me });                       // 본문(.rd-root 또는 #content)에 하이라이트·메모
     mountComments({ sessionId, me, root: $("#comments") }); // 의견
*/
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp, writeBatch,
  memberName, memberById, esc, el, toast, $, $$, fmtTime
} from "./app.js";

/* ---------- 저장소 ---------- */
export function firestoreStore(colName, sessionId) {
  const col = collection(db, colName);
  return {
    subscribe(cb) {
      return onSnapshot(query(col, where("sessionId", "==", sessionId)),
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        err => { console.error(err); toast(/insufficient permissions/i.test(err.message) ? "권한 오류: Firestore 규칙을 확인하세요" : "불러오기 실패: " + err.message, 4000); cb([]); });
    },
    async add(data) { const r = await addDoc(col, { ...data, sessionId, createdAt: serverTimestamp() }); return r.id; },
    async update(id, patch) { await updateDoc(doc(db, colName, id), patch); },
    async remove(id) { await deleteDoc(doc(db, colName, id)); },
    async removeMany(ids) { const b = writeBatch(db); ids.forEach(id => b.delete(doc(db, colName, id))); await b.commit(); }
  };
}
export function memoryStore(initial = []) {
  let items = initial.map(x => ({ ...x })), subs = [];
  const emit = () => subs.forEach(cb => cb(items.map(x => ({ ...x }))));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    subscribe(cb) { subs.push(cb); cb(items.map(x => ({ ...x }))); return () => { subs = subs.filter(s => s !== cb); }; },
    async add(data) { const id = uid(); items.push({ id, ...data, createdAt: new Date() }); emit(); return id; },
    async update(id, patch) { items = items.map(x => x.id === id ? { ...x, ...patch } : x); emit(); },
    async remove(id) { items = items.filter(x => x.id !== id); emit(); },
    async removeMany(ids) { items = items.filter(x => !ids.includes(x.id)); emit(); }
  };
}

const who = id => memberById(id) ? memberName(id) : "(이름 없음)";
const tsOf = x => x.createdAt?.toDate ? x.createdAt.toDate().getTime() : (x.createdAt ? new Date(x.createdAt).getTime() : Date.now());

/* ================= 하이라이트·메모 ================= */
export function mountReader({ sessionId, me = "", store, root, title } = {}) {
  const ROOT = root || $(".rd-root") || $("#content") || document.body;
  store = store || firestoreStore("annotations", sessionId);
  let state = [];           // 전체 annotations
  let mineOnly = true;      // 내 것만 보기
  let notesOpen = false;
  const openSet = new Set();

  /* ----- 텍스트 오프셋 ----- */
  function textNodes() {
    const out = [], w = document.createTreeWalker(ROOT, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        let p = n.parentNode;
        while (p && p !== ROOT) { if (p.classList && (p.classList.contains("rd-ui") || p.classList.contains("rd-note") || p.classList.contains("rd-tag"))) return NodeFilter.FILTER_REJECT; p = p.parentNode; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n; while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function rangeToOffsets(r) {
    const nodes = textNodes(); let pos = 0, s = -1, e = -1;
    for (const n of nodes) {
      if (n === r.startContainer) s = pos + r.startOffset;
      if (n === r.endContainer) { e = pos + r.endOffset; break; }
      pos += n.nodeValue.length;
    }
    return (s >= 0 && e > s) ? { start: s, end: e } : null;
  }
  function unwrapAll() {
    ROOT.querySelectorAll(".rd-note, .rd-tag").forEach(x => x.remove());
    ROOT.querySelectorAll("mark.rd-mark").forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); });
    ROOT.normalize();
  }
  function visible() { return mineOnly ? state.filter(h => h.author === me) : state; }
  function render() {
    unwrapAll();
    const list = visible().slice().sort((a, b) => a.anchor.start - b.anchor.start || tsOf(a) - tsOf(b));
    for (const h of list) {
      const { start, end } = h.anchor || {};
      if (!(end > start)) continue;
      const nodes = textNodes(); let pos = 0; const pieces = [];
      for (const n of nodes) {
        const len = n.nodeValue.length, a = pos, b = pos + len;
        if (b > start && a < end) pieces.push({ node: n, from: Math.max(start, a) - a, to: Math.min(end, b) - a });
        pos = b; if (pos >= end) break;
      }
      let last = null;
      for (const p of pieces) {
        if (p.to <= p.from) continue;
        const rng = document.createRange(); rng.setStart(p.node, p.from); rng.setEnd(p.node, p.to);
        const m = document.createElement("mark");
        m.className = "rd-mark" + (h.note ? " has-note" : "") + (h.author !== me ? " other" : "");
        m.dataset.id = h.id; m.title = h.author !== me ? who(h.author) : "";
        try { rng.surroundContents(m); last = m; } catch (e) { }
      }
      if (last && h.note) {
        const tag = el(`<button class="rd-tag" type="button" data-id="${esc(h.id)}">${h.author === me ? "메모" : esc(who(h.author))}</button>`);
        last.insertAdjacentElement("afterend", tag);
        const note = el(`<span class="rd-note${notesOpen || openSet.has(h.id) ? " open" : ""}" data-id="${esc(h.id)}"></span>`);
        if (h.author !== me) note.appendChild(el(`<span class="rd-who">${esc(who(h.author))}</span>`));
        note.appendChild(document.createTextNode(h.note));
        tag.insertAdjacentElement("afterend", note);
      }
    }
    const c = $("#rd-count"); if (c) { const mine = state.filter(h => h.author === me).length; c.textContent = mineOnly ? (mine ? `${mine}개` : "") : (state.length ? `${state.length}개` : ""); }
  }

  /* ----- 동작 ----- */
  function needName() { if (!me) { toast("상단에서 이름을 먼저 선택하세요"); return true; } return false; }
  async function add(withNote) {
    if (needName()) return;
    const sel = window.getSelection(); if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const r = sel.getRangeAt(0); if (!ROOT.contains(r.commonAncestorContainer)) return;
    const off = rangeToOffsets(r); if (!off) { toast("이 구간은 표시할 수 없습니다"); return; }
    if (state.some(h => h.author === me && off.start < h.anchor.end && off.end > h.anchor.start)) { toast("내가 이미 표시한 구간과 겹칩니다"); return; }
    const text = r.toString().replace(/\s+/g, " ").trim();
    let note = "";
    if (withNote) { const v = window.prompt("메모", ""); if (v === null) return; note = v.trim(); }
    sel.removeAllRanges(); hideFloat();
    try {
      await store.add({ author: me, type: note ? "memo" : "highlight", anchor: off, text, note });
      toast(note ? "메모를 저장했습니다" : "하이라이트를 저장했습니다");
    } catch (ex) { console.error(ex); toast("저장 실패: " + ex.message, 3000); }
  }
  async function edit(id) {
    const h = state.find(x => x.id === id); if (!h) return;
    if (h.author !== me) { toast(`${who(h.author)}의 표시입니다. 본인 것만 고칠 수 있습니다`); return; }
    const v = window.prompt('메모 수정 (비우면 메모만 삭제, "삭제"라고 쓰면 하이라이트도 삭제)', h.note || "");
    if (v === null) return;
    const t = v.trim();
    try {
      if (t === "삭제") await store.remove(id);
      else { if (t) openSet.add(id); await store.update(id, { note: t, type: t ? "memo" : "highlight" }); }
    } catch (ex) { console.error(ex); toast("저장 실패: " + ex.message, 3000); }
  }
  function toggleAll() {
    notesOpen = !notesOpen; openSet.clear(); render();
    const b = $("#rd-toggle"); if (b) b.textContent = notesOpen ? "메모 접기" : "메모 펼치기";
  }
  function exportText() {
    const t = (title || $("h1")?.textContent || document.title).replace(/\s+/g, " ").trim();
    const lines = [`# ${t}`, `출처: HR STUDY 모임 기록, ${location.href}`, "", "아래는 이 기록에서 멤버들이 표시한 구간과 메모다. 사람별로 묶었다. 이것을 바탕으로 이야기해 달라.", ""];
    const byAuthor = {};
    for (const h of state) (byAuthor[h.author] ||= []).push(h);
    const authors = Object.keys(byAuthor).sort((a, b) => (a === me ? -1 : b === me ? 1 : 0) || (memberById(a)?.order ?? 99) - (memberById(b)?.order ?? 99));
    for (const a of authors) {
      lines.push(`## ${who(a)}${a === me ? " (나)" : ""}`);
      byAuthor[a].sort((x, y) => x.anchor.start - y.anchor.start).forEach((h, i) => {
        lines.push(`${i + 1}. "${h.text}"`);
        if (h.note) lines.push(`   메모: ${h.note}`);
      });
      lines.push("");
    }
    if (!state.length) lines.push("(표시한 구간이 없음)");
    const out = lines.join("\n");
    const done = () => toast("복사됨. AI 대화창에 붙여 넣으세요");
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(out).then(done, () => { fallback(out); done(); });
    else { fallback(out); done(); }
    return out;
  }
  function fallback(t) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { } ta.remove(); }
  async function reset() {
    const mine = state.filter(h => h.author === me); if (!mine.length) { toast("지울 내 표시가 없습니다"); return; }
    if (!confirm(`이 페이지의 내 하이라이트와 메모 ${mine.length}개를 모두 지울까요? 다른 사람 것은 그대로 둡니다.`)) return;
    try { await store.removeMany(mine.map(h => h.id)); } catch (ex) { console.error(ex); toast("삭제 실패: " + ex.message, 3000); }
  }

  /* ----- 플로팅 툴바 ----- */
  const fl = el('<div class="rd-ui rd-float"><button type="button" data-act="hl">하이라이트</button><button type="button" data-act="memo">메모</button></div>');
  document.body.appendChild(fl);
  function hideFloat() { fl.classList.remove("show"); }
  function showFloat() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !ROOT.contains(sel.anchorNode)) { hideFloat(); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect(); if (!rect.width) { hideFloat(); return; }
    fl.classList.add("show");
    fl.style.left = Math.max(8, Math.min(window.innerWidth - fl.offsetWidth - 8, rect.left + rect.width / 2 - fl.offsetWidth / 2)) + "px";
    fl.style.top = (rect.top + window.scrollY - 44) + "px";
  }
  let selTimer = null;
  const later = () => { clearTimeout(selTimer); selTimer = setTimeout(showFloat, 120); };
  document.addEventListener("mouseup", later);
  document.addEventListener("touchend", later);
  document.addEventListener("selectionchange", later);
  fl.addEventListener("mousedown", e => e.preventDefault());
  fl.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  fl.addEventListener("click", e => { const b = e.target.closest("button"); if (b) add(b.dataset.act === "memo"); });

  /* ----- 하단 바 ----- */
  const bar = el(`<div class="rd-ui rd-bar">
    <span class="rd-title">메모 <em id="rd-count"></em></span>
    <span class="seg" id="rd-scope"><button type="button" data-v="mine" class="on">내 것만</button><button type="button" data-v="all">전체</button></span>
    <button type="button" id="rd-toggle">메모 펼치기</button>
    <button type="button" id="rd-export">AI용 복사</button>
    <button type="button" id="rd-reset" class="rd-quiet">내 것 지우기</button>
    <span class="rd-hint">본문을 드래그하면 하이라이트·메모 버튼이 뜹니다. 내 표시를 누르면 수정·삭제.</span></div>`);
  document.body.appendChild(bar);
  $("#rd-scope", bar).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    mineOnly = b.dataset.v === "mine";
    $$("#rd-scope button", bar).forEach(x => x.classList.toggle("on", x === b));
    render();
  });
  $("#rd-toggle", bar).onclick = toggleAll;
  $("#rd-export", bar).onclick = exportText;
  $("#rd-reset", bar).onclick = reset;

  ROOT.addEventListener("click", e => {
    const t = e.target.closest(".rd-tag");
    if (t) { const n = ROOT.querySelector(`.rd-note[data-id="${t.dataset.id}"]`); if (n) { n.classList.toggle("open"); n.classList.contains("open") ? openSet.add(t.dataset.id) : openSet.delete(t.dataset.id); } return; }
    const m = e.target.closest("mark.rd-mark"); if (m && window.getSelection().isCollapsed) edit(m.dataset.id);
  });

  // 처음 불러온 뒤에 새로 생긴 내 메모는 펼친 상태로 보여 준다(저장 직후 화면이 먼저 갱신되므로 여기서 처리).
  const seen = new Set(); let loaded = false;
  const unsub = store.subscribe(items => {
    state = items.filter(h => h.anchor);
    for (const h of state) { if (!seen.has(h.id)) { seen.add(h.id); if (loaded && h.author === me && h.note) openSet.add(h.id); } }
    loaded = true;
    render();
  });
  return { render, exportText, setMe(id) { me = id; render(); }, destroy: unsub, get state() { return state; } };
}

/* ================= 의견 ================= */
export function mountComments({ sessionId, me = "", store, root, countEl } = {}) {
  root = root || $("#comments");
  store = store || firestoreStore("comments", sessionId);
  let items = [];
  let replyTo = null;

  function needName() { if (!me) { toast("상단에서 이름을 먼저 선택하세요"); return true; } return false; }

  function render() {
    const live = items.filter(c => !c.deleted || items.some(r => r.parentId === c.id));
    const tops = live.filter(c => !c.parentId).sort((a, b) => tsOf(a) - tsOf(b));
    const replies = id => live.filter(c => c.parentId === id).sort((a, b) => tsOf(a) - tsOf(b));
    const one = (c, isReply) => `
      <div class="cm${isReply ? " reply" : ""}" data-id="${esc(c.id)}">
        <div class="hd"><b>${c.deleted ? '<span class="soft">삭제됨</span>' : esc(who(c.author))}</b><time>${fmtTime(c.createdAt)}</time>
          <span class="ops">${!isReply && !c.deleted ? `<button class="link-btn" data-op="reply" data-id="${esc(c.id)}">답글</button>` : ""}${c.author === me && !c.deleted ? `<button class="link-btn danger" data-op="del" data-id="${esc(c.id)}">삭제</button>` : ""}</span></div>
        <div class="tx${c.deleted ? " soft" : ""}">${c.deleted ? "(삭제된 의견)" : esc(c.text)}</div>
      </div>`;
    const list = tops.map(c => one(c, false) + replies(c.id).map(r => one(r, true)).join("") + (replyTo === c.id ? replyForm(c) : "")).join("");
    root.innerHTML = `
      <div class="cm-list">${list || '<div class="empty">아직 의견이 없습니다. 첫 의견을 남겨 보세요.</div>'}</div>
      <form class="cm-form" id="cm-form">
        <div class="field"><textarea id="cm-text" placeholder="${me ? "의견을 남겨 주세요" : "상단에서 이름을 선택하면 의견을 남길 수 있습니다"}"${me ? "" : " disabled"}></textarea></div>
        <div class="actions"><button class="btn" type="submit"${me ? "" : " disabled"}>의견 남기기</button></div>
      </form>`;
    const n = live.filter(c => !c.deleted).length;
    if (countEl) countEl.textContent = n ? `${n}개` : "";
    const rf = $("#cm-reply-text", root); if (rf) rf.focus();
  }
  function replyForm(c) {
    return `<form class="cm reply cm-form" id="cm-reply" data-parent="${esc(c.id)}">
      <div class="field"><textarea id="cm-reply-text" placeholder="${esc(who(c.author))}에게 답글"></textarea></div>
      <div class="actions"><button class="btn quiet sm" type="button" id="cm-reply-cancel">취소</button><button class="btn sm" type="submit">답글 남기기</button></div></form>`;
  }
  async function post(text, parentId = null) {
    if (needName()) return;
    text = text.trim(); if (!text) return;
    try { await store.add({ author: me, text, parentId }); toast("의견을 남겼습니다"); }
    catch (ex) { console.error(ex); toast("저장 실패: " + ex.message, 3000); }
  }
  root.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id === "cm-form") { const ta = $("#cm-text", root); const v = ta.value; ta.value = ""; await post(v); }
    else if (e.target.id === "cm-reply") { const v = $("#cm-reply-text", root).value; const p = e.target.dataset.parent; replyTo = null; await post(v, p); }
  });
  root.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "cm-reply-cancel") { replyTo = null; render(); return; }
    if (b.dataset.op === "reply") { if (needName()) return; replyTo = b.dataset.id; render(); return; }
    if (b.dataset.op === "del") {
      const c = items.find(x => x.id === b.dataset.id); if (!c || c.author !== me) return;
      if (!confirm("이 의견을 삭제할까요?")) return;
      try {
        if (items.some(r => r.parentId === c.id)) await store.update(c.id, { deleted: true, text: "" });
        else await store.remove(c.id);
      } catch (ex) { console.error(ex); toast("삭제 실패: " + ex.message, 3000); }
    }
  });
  const unsub = store.subscribe(list => { items = list; render(); });
  return { render, setMe(id) { me = id; render(); }, destroy: unsub };
}
