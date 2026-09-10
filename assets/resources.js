/* aro-study 관련 자료: 발제 주제와 관련해 멤버 누구나 링크·메모를 올리는 목록 (2026-09-10 추가).

   Firestore resources/{id}: { sessionId, author: memberId, title, url, note, createdAt }
   저장소(store)는 reader.js와 같은 인터페이스(subscribe/add/update/remove). 예시 화면은 memoryStore를 넘긴다.
   파일 자체를 올리는 기능은 없다(Firebase Storage 미사용). 파일은 드라이브 등에 올리고 링크를 붙인다.

   사용:
     import { mountResources } from "../../assets/resources.js";
     mountResources({ sessionId, me, root: $("#resources"), countEl: $("#res-count") });
*/
import { memberName, memberById, esc, toast, $, fmtTime } from "./app.js";
import { firestoreStore } from "./reader.js";

const who = id => memberById(id) ? memberName(id) : "(이름 없음)";
const tsOf = x => x.createdAt?.toDate ? x.createdAt.toDate().getTime() : (x.createdAt ? new Date(x.createdAt).getTime() : Date.now());
/** 링크에 프로토콜이 없으면 https:// 를 붙인다. 빈 값이면 "". */
export function normalizeUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "https://" + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; }
}
const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export function mountResources({ sessionId, me = "", store, root, countEl } = {}) {
  root = root || $("#resources");
  store = store || firestoreStore("resources", sessionId);
  let items = [];

  function render() {
    const list = items.slice().sort((a, b) => tsOf(b) - tsOf(a));
    const one = r => `
      <div class="res" data-id="${esc(r.id)}">
        <div class="ttl">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><span class="dom">${esc(domainOf(r.url))}</span>` : esc(r.title || "(제목 없음)")}</div>
        ${r.note ? `<div class="nt">${esc(r.note)}</div>` : ""}
        <div class="hd"><b>${esc(who(r.author))}</b><time>${fmtTime(r.createdAt)}</time>
          <span class="ops">${r.author === me ? `<button class="link-btn danger" data-op="del" data-id="${esc(r.id)}">삭제</button>` : ""}</span></div>
      </div>`;
    root.innerHTML = `
      <div class="res-list">${list.map(one).join("") || '<div class="empty">아직 올라온 자료 없음. 발제 주제와 관련된 글, 자료, 생각을 자유롭게 올려 주세요.</div>'}</div>
      <form class="res-form" id="res-form">
        <div class="row stack">
          <div class="field"><label for="res-title">제목</label><input id="res-title" type="text" required placeholder="자료 이름이나 한 줄 요약" autocomplete="off"${me ? "" : " disabled"}></div>
          <div class="field"><label for="res-url">링크</label><input id="res-url" type="text" inputmode="url" placeholder="선택. 글, 드라이브 파일, 영상 주소" autocomplete="off"${me ? "" : " disabled"}></div>
        </div>
        <div class="field"><textarea id="res-note" style="min-height:72px" placeholder="${me ? "선택. 왜 관련 있는지, 어떤 부분을 보면 좋은지" : "상단에서 이름을 선택하면 올릴 수 있습니다"}"${me ? "" : " disabled"}></textarea></div>
        <div class="actions"><button class="btn" type="submit"${me ? "" : " disabled"}>자료 올리기</button></div>
      </form>`;
    if (countEl) countEl.textContent = list.length ? `${list.length}건` : "";
  }
  root.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id !== "res-form") return;
    if (!me) { toast("상단에서 이름을 먼저 선택하세요"); return; }
    const title = $("#res-title", root).value.trim(), rawUrl = $("#res-url", root).value.trim(), note = $("#res-note", root).value.trim();
    const url = normalizeUrl(rawUrl);
    if (!title) { toast("제목을 입력하세요"); return; }
    if (rawUrl && !url) { toast("링크 주소 형식을 확인하세요"); return; }
    try { await store.add({ author: me, title, url, note }); toast("올렸습니다"); }
    catch (ex) { console.error(ex); toast("저장 실패: " + ex.message, 3000); }
  });
  root.addEventListener("click", async e => {
    const b = e.target.closest("button[data-op=del]"); if (!b) return;
    const r = items.find(x => x.id === b.dataset.id); if (!r || r.author !== me) return;
    if (!confirm("이 자료를 삭제할까요?")) return;
    try { await store.remove(r.id); } catch (ex) { console.error(ex); toast("삭제 실패: " + ex.message, 3000); }
  });
  const unsub = store.subscribe(list => { items = list; render(); });
  return { render, setMe(id) { me = id; render(); }, destroy: unsub };
}
