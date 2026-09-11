/* aro-study 관련 자료: 발제 주제와 관련해 멤버 누구나 링크·파일·메모를 올리는 목록 (2026-09-10 추가).

   Firestore resources/{id}: { sessionId, author: memberId, title, url, note, createdAt,
                               fileName, filePath, fileUrl, fileSize, fileType }   (파일을 첨부했을 때만)
   파일은 Firebase Storage의 resources/<sessionId>/<시각>_<파일명> 에 올린다(storage.rules). Storage를 아직 켜지 않았으면
   업로드가 실패하고 안내만 뜬다(링크·메모는 그대로 동작).
   저장소(store)는 reader.js와 같은 인터페이스. 예시 화면은 memoryStore와 가짜 upload를 넘긴다.

   사용:
     import { mountResources } from "../../assets/resources.js";
     mountResources({ sessionId, me, root: $("#resources"), countEl: $("#res-count") });
*/
import { auth, memberName, memberById, esc, toast, $, fmtTime, storage, storageRef, uploadBytes, getDownloadURL, deleteObject } from "./app.js";
import { firestoreStore } from "./reader.js";

export const MAX_FILE = 20 * 1024 * 1024;
export const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.zip";

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
export const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : n >= 1024 ? Math.round(n / 1024) + "KB" : n + "B";
const safeName = n => String(n || "file").replace(/[\\/:*?"<>|#%]+/g, "_").slice(-80);

/** 기본 업로드: Firebase Storage. 반환 { fileName, filePath, fileUrl, fileSize, fileType } */
async function storageUpload(file, sessionId) {
  const filePath = `resources/${sessionId}/${Date.now()}_${safeName(file.name)}`;
  const r = storageRef(storage, filePath);
  await uploadBytes(r, file, { contentType: file.type || "application/octet-stream", customMetadata: { uid: auth.currentUser?.uid || "" } });
  const fileUrl = await getDownloadURL(r);
  return { fileName: file.name, filePath, fileUrl, fileSize: file.size, fileType: file.type || "" };
}
async function storageDelete(filePath) { try { await deleteObject(storageRef(storage, filePath)); } catch (ex) { console.warn("파일 삭제 실패(무시)", ex); } }
/** Storage 미설정·권한 오류를 사람이 읽을 말로. */
function uploadError(ex) {
  const code = ex?.code || "";
  if (/unauthorized|unauthenticated/.test(code)) return "파일 저장소 권한 없음 · 총무가 storage.rules를 게시했는지 확인";
  if (/retry-limit|unknown|object-not-found|bucket-not-found|project-not-found/.test(code) || /404|CORS|Failed to fetch/i.test(ex?.message || "")) return "파일 저장소가 아직 준비되지 않음 · 링크로 올리거나 총무에게 문의";
  if (/quota/.test(code)) return "파일 저장소 용량 초과";
  return "파일 업로드 실패: " + (ex?.message || ex);
}

export function mountResources({ sessionId, me = "", store, root, countEl, upload, remove } = {}) {
  root = root || $("#resources");
  store = store || firestoreStore("resources", sessionId);
  upload = upload || (file => storageUpload(file, sessionId));
  remove = remove || storageDelete;
  let items = [], busy = false;

  function render() {
    const list = items.slice().sort((a, b) => tsOf(b) - tsOf(a));
    const one = r => `
      <div class="res" data-id="${esc(r.id)}">
        <div class="ttl">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title || r.url)}</a><span class="dom">${esc(domainOf(r.url))}</span>` : esc(r.title || r.fileName || "(제목 없음)")}</div>
        ${r.fileUrl ? `<div class="file"><a href="${esc(r.fileUrl)}" target="_blank" rel="noopener">${esc(r.fileName || "파일")}</a><span class="dom">${r.fileSize ? fmtSize(r.fileSize) : "파일"}</span></div>` : ""}
        ${r.note ? `<div class="nt">${esc(r.note)}</div>` : ""}
        <div class="hd"><b>${esc(who(r.author))}</b><time>${fmtTime(r.createdAt)}</time>
          <span class="ops">${r.author === me ? `<button class="link-btn danger" data-op="del" data-id="${esc(r.id)}">삭제</button>` : ""}</span></div>
      </div>`;
    const dis = me ? "" : " disabled";
    root.innerHTML = `
      <div class="res-list">${list.map(one).join("") || '<div class="empty">아직 올라온 자료 없음</div>'}</div>
      <form class="res-form" id="res-form">
        <div class="row stack">
          <div class="field"><label for="res-title">제목</label><input id="res-title" type="text" placeholder="자료 이름 또는 한 줄 요약" autocomplete="off"${dis}></div>
          <div class="field"><label for="res-url">링크</label><input id="res-url" type="text" inputmode="url" placeholder="선택 · 글, 영상 주소" autocomplete="off"${dis}></div>
        </div>
        <div class="field"><label for="res-file">파일</label><input id="res-file" type="file" accept="${FILE_ACCEPT}"${dis}><div class="help">선택 · 20MB 이하 · PDF, 이미지, 오피스 문서, 한글, 압축</div></div>
        <div class="field"><textarea id="res-note" style="min-height:72px" placeholder="${me ? "선택 · 관련된 이유, 볼 만한 부분" : "상단에서 이름을 선택하면 올릴 수 있음"}"${dis}></textarea></div>
        <div class="actions"><button class="btn" type="submit" id="res-submit"${dis}>올리기</button></div>
      </form>`;
    if (countEl) countEl.textContent = list.length ? `${list.length}건` : "";
  }
  root.addEventListener("submit", async e => {
    e.preventDefault();
    if (e.target.id !== "res-form" || busy) return;
    if (!me) { toast("상단에서 이름을 먼저 선택"); return; }
    const titleIn = $("#res-title", root).value.trim(), rawUrl = $("#res-url", root).value.trim(), note = $("#res-note", root).value.trim();
    const file = $("#res-file", root).files[0] || null;
    const url = normalizeUrl(rawUrl);
    const title = titleIn || (file ? file.name : "");
    if (!title) { toast("제목 입력 필요"); return; }
    if (rawUrl && !url) { toast("링크 주소 형식 확인"); return; }
    if (file && file.size > MAX_FILE) { toast(`파일이 큼 · ${fmtSize(file.size)} (20MB 이하)`); return; }
    const btn = $("#res-submit", root); busy = true; btn.disabled = true; btn.textContent = file ? "올리는 중" : "저장 중";
    try {
      let attach = {};
      if (file) attach = await upload(file);
      await store.add({ author: me, title, url, note, ...attach });
      toast("등록됨");
    } catch (ex) {
      console.error(ex);
      toast(file ? uploadError(ex) : "저장 실패: " + ex.message, 4000);
      busy = false; btn.disabled = false; btn.textContent = "올리기";
    } finally { busy = false; }
  });
  root.addEventListener("click", async e => {
    const b = e.target.closest("button[data-op=del]"); if (!b) return;
    const r = items.find(x => x.id === b.dataset.id); if (!r || r.author !== me) return;
    if (!confirm("이 자료를 삭제할까요?")) return;
    try { await store.remove(r.id); if (r.filePath) await remove(r.filePath); }
    catch (ex) { console.error(ex); toast("삭제 실패: " + ex.message, 3000); }
  });
  const unsub = store.subscribe(list => { items = list; render(); });
  return { render, setMe(id) { me = id; render(); }, destroy: unsub };
}
