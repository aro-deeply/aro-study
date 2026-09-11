/* aro-study 공용 계층: Firebase 초기화, 익명 로그인(멤버)과 총무 로그인, 이름 선택, Firestore 헬퍼, 공용 유틸.
   모든 페이지는 <script type="module"> 에서 이 파일을 import 한다.

   사용 예:
     import { ready, db, col, getDocs, query, orderBy, fmtWon } from '../assets/app.js';
     const { me, member, members } = await ready();
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";
import firebaseConfig, { ADMIN_EMAIL } from "./firebase-config.js";

/* ---------- Firebase ---------- */
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
/** 파일 저장소(관련 자료 첨부). Firebase 콘솔에서 Storage를 켜야 동작한다(storage.rules 참고). */
export const storage = getStorage(app);
export { storageRef, uploadBytes, getDownloadURL, deleteObject };
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Timestamp
};

/** 사이트 루트 URL (assets/의 상위). 하위 폴더 페이지에서도 홈 링크가 맞도록 여기서 계산한다. */
export const ROOT = new URL("../", import.meta.url).href;

const LS_ME = "aro-study.me";

/* ---------- 유틸 ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
/** 12345 -> "12,345" (원 표시는 호출부에서) */
export function fmtWon(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("ko-KR");
}
/** 부호 있는 차액: +12,300 / -4,500 / 0 */
export function fmtDiff(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? "+" + fmtWon(v) : fmtWon(v);
}
const WD = ["일", "월", "화", "수", "목", "금", "토"];
/** "2026-09-08" -> "2026.09.08 (화)" / 옵션 short: "9월 8일 (화)" */
export function fmtDate(iso, style = "full") {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  const w = WD[new Date(y, m - 1, d).getDay()];
  if (style === "short") return `${m}월 ${d}일 (${w})`;
  if (style === "month") return `${y}년 ${m}월`;
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")} (${w})`;
}
/** Firestore Timestamp | Date | ms -> "9.8 21:10" */
export function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** 오늘 날짜 "YYYY-MM-DD" (로컬 기준) */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 100원 단위 내림 */
export function floor100(n) { return Math.floor((Number(n) || 0) / 100) * 100; }
/** 100원 단위 올림 */
export function ceil100(n) { return Math.ceil((Number(n) || 0) / 100) * 100; }
/** 발제자처럼 사람을 가리킬 때 이름 뒤에 "님". 빈 이름이면 그대로. */
export function honor(name) { return name ? `${name} 님` : ""; }

let toastTimer = null;
export function toast(msg, ms = 1800) {
  let t = $("#toast");
  if (!t) { t = el('<div id="toast"></div>'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- 멤버 ---------- */
let membersCache = null;
/** members 컬렉션 전체(활성·비활성 포함), order 순. */
export async function loadMembers(force = false) {
  if (membersCache && !force) return membersCache;
  const snap = await getDocs(query(collection(db, "members"), orderBy("order")));
  membersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return membersCache;
}
export function members() { return membersCache || []; }
/** 이미 읽어 둔 목록(또는 미리보기용 예시)을 캐시에 넣는다. */
export function setMembers(list) { membersCache = Array.isArray(list) ? list : null; }
export function activeMembers() { return members().filter(m => m.active !== false); }
export function memberById(id) { return members().find(m => m.id === id) || null; }
export function memberName(id) { return memberById(id)?.name || "(알 수 없음)"; }
export function isAdmin(m = memberById(getMe())) { return !!m && m.role === "admin"; }

export function getMe() { try { return localStorage.getItem(LS_ME) || ""; } catch { return ""; } }
export function setMe(id) { try { id ? localStorage.setItem(LS_ME, id) : localStorage.removeItem(LS_ME); } catch {} }

/* ---------- 인증 ---------- */
/* 2026-09-10 변경. 멤버는 비밀번호 없이 들어온다: 처음 열 때 Firebase 익명 로그인(기기 토큰, 화면 없음)을 자동으로 하고
   이 기기에 유지한다. 총무는 admin.html에서 총무 계정(ADMIN_EMAIL)으로 한 번 로그인한다.
   Firestore·Storage 규칙: 읽기와 의견·메모·자료 쓰기는 접속한 누구나, 관리 데이터 쓰기는 총무 계정만. */
function authError(code) {
  switch (code) {
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return "익명 로그인이 꺼져 있음 · Firebase 콘솔 > Authentication > Sign-in method에서 '익명' 켜기";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/missing-password":
      return "비밀번호가 맞지 않음";
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "총무 계정 없음 · Firebase 콘솔 > Authentication > Users 확인";
    case "auth/network-request-failed":
      return "네트워크 연결 확인";
    case "auth/too-many-requests":
      return "시도가 너무 많음 · 잠시 후 다시";
    default:
      return "접속 실패 (" + code + ")";
  }
}

function currentUser() {
  return new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
}

/** 익명 로그인. 실패하면 이유와 "다시 시도" 버튼을 보여 주고 성공할 때까지 기다린다. */
async function signInSilently() {
  let g = null;
  for (;;) {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await signInAnonymously(auth);
      if (g) g.remove();
      return cred.user;
    } catch (ex) {
      console.error(ex);
      if (!g) {
        g = el(`
          <div class="gate" id="gate">
            <div class="panel">
              <div class="brand"><small>HR STUDY</small><b>접속</b></div>
              <div class="err" id="gate-err"></div>
              <button class="btn block" type="button">다시 시도</button>
            </div>
          </div>`);
        document.body.appendChild(g);
      }
      $("#gate-err", g).textContent = authError(ex.code || "");
      await new Promise(res => $("button", g).addEventListener("click", res, { once: true }));
    }
  }
}

/** 지금 접속이 총무 계정(이메일 로그인)인지. 멤버의 익명 접속이면 false. */
export function isAdminUser() { const u = auth.currentUser; return !!u && !u.isAnonymous; }

/** 총무 로그인 화면(비밀번호 한 칸). 이미 총무 계정이면 바로 통과. 성공하면 이 기기에 유지된다. */
export function requireAdminAuth() {
  if (isAdminUser()) return Promise.resolve(auth.currentUser);
  return new Promise(resolve => {
    const g = el(`
      <div class="gate" id="admin-gate">
        <form class="panel" autocomplete="on">
          <div class="brand"><small>HR STUDY</small><b>총무 로그인</b></div>
          <div class="field"><label for="ag-pw">총무 비밀번호</label>
            <input id="ag-pw" type="password" name="password" autocomplete="current-password" required autofocus>
            <div class="help">관리 화면에만 필요 · 이 기기에 유지됨</div></div>
          <div class="err" id="ag-err"></div>
          <button class="btn block" type="submit">입장</button>
          <div class="help" style="text-align:center;margin-top:12px"><a href="${ROOT}">홈으로</a></div>
        </form>
      </div>`);
    document.body.appendChild(g);
    const form = $("form", g), pw = $("#ag-pw", g), err = $("#ag-err", g), btn = $("button", g);
    setTimeout(() => pw.focus(), 50);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      err.textContent = ""; btn.disabled = true; btn.textContent = "확인 중";
      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pw.value);
        g.remove();
        resolve(auth.currentUser);
      } catch (ex) {
        err.textContent = authError(ex.code || "");
        btn.disabled = false; btn.textContent = "입장";
        pw.select();
      }
    });
  });
}

/** 총무 로그인 해제. 다음 방문부터 이 기기는 멤버(익명) 접속이 된다. */
export async function adminLogout() {
  await signOut(auth);
  location.reload();
}

/** 이름 선택 화면. 선택한 memberId를 resolve. 멤버가 없으면 빈 문자열로 계속. */
export function showNamePicker(list = activeMembers()) {
  return new Promise(resolve => {
    const cur = getMe();
    const opts = list.map(m => `<option value="${esc(m.id)}"${m.id === cur ? " selected" : ""}>${esc(m.name)}</option>`).join("");
    const g = el(`
      <div class="gate" id="namepick">
        <form class="panel">
          <div class="brand"><small>HR STUDY</small><b>이름 선택</b></div>
          ${list.length ? `
          <div class="field"><label for="np-sel">이름</label>
            <select id="np-sel" required><option value="" disabled${cur ? "" : " selected"}>선택</option>${opts}</select>
            <div class="help">이 기기에 기억됨 · 상단 이름에서 변경</div></div>
          <button class="btn block" type="submit">계속</button>` : `
          <div class="note">등록된 멤버 없음 · 총무가 관리 화면에서 추가</div>
          <button class="btn block" type="submit">이름 없이 계속</button>`}
        </form>
      </div>`);
    document.body.appendChild(g);
    $("form", g).addEventListener("submit", e => {
      e.preventDefault();
      const id = list.length ? $("#np-sel", g).value : "";
      if (list.length && !id) return;
      setMe(id);
      g.remove();
      renderTopbar();
      resolve(id);
    });
  });
}

/* ---------- 상단 바 ---------- */
export function renderTopbar() {
  let bar = $("#topbar");
  if (!bar) { bar = el('<div id="topbar"></div>'); document.body.prepend(bar); }
  const me = memberById(getMe());
  bar.className = "topbar";
  bar.innerHTML = `<div class="in">
    <a class="brand" href="${ROOT}"><b class="solo">HR STUDY</b></a>
    <div class="who">
      ${isAdmin(me) ? `<a class="link-btn" href="${ROOT}admin.html">관리</a>` : ""}
      <button class="me" type="button" title="이름 바꾸기">${esc(me?.name || "이름 선택")}</button>
    </div></div>`;
  $(".me", bar).addEventListener("click", async () => { await showNamePicker(); document.dispatchEvent(new CustomEvent("aro:me", { detail: getMe() })); });
  return bar;
}

/* ---------- 진입점 ---------- */
/**
 * 익명 로그인(자동) -> 멤버 로드 -> 이름 선택 -> 상단 바 표시.
 * @param {{requireName?: boolean}} opt
 * @returns {Promise<{user, me: string, member: object|null, members: object[]}>}
 */
export async function ready(opt = {}) {
  const requireName = opt.requireName !== false;
  let user = await currentUser();
  if (!user) user = await signInSilently();
  let list;
  try { list = await loadMembers(); }
  catch (ex) { console.error(ex); toast("멤버 목록을 읽지 못함 · Firestore 규칙 확인"); list = []; }
  let me = getMe();
  const valid = me && list.some(m => m.id === me && m.active !== false);
  if (requireName && !valid) me = await showNamePicker();
  renderTopbar();
  return { user, me, member: memberById(me), members: list };
}
