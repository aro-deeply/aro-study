"""reader.js 점검(데모 페이지, 메모리 저장소): 하이라이트, 메모, 내 것만/전체, AI용 복사, 수정·삭제, 의견/답글/삭제."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770/demo/index.html"
logs, fails = [], []
def check(name, cond, info=""):
    if not cond: fails.append(name)
    print(("OK  " if cond else "FAIL"), name, info)

prompt_answer = {"v": None}
def on_dialog(d):
    logs.append(f"[dialog:{d.type}] {d.message[:60]}")
    if d.type == "prompt": d.accept(prompt_answer["v"] if prompt_answer["v"] is not None else "")
    else: d.accept()

SELECT_JS = """(args) => {
  // reader.js와 같은 규칙으로 텍스트 노드를 걷고, 전역 오프셋 [gs, ge)를 선택한다.
  const root = document.getElementById('content');
  const skip = n => { let p = n.parentNode; while (p && p !== root) { if (p.classList && (p.classList.contains('rd-ui') || p.classList.contains('rd-note') || p.classList.contains('rd-tag'))) return true; p = p.parentNode; } return false; };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n, pos = 0, sN = null, sO = 0, eN = null, eO = 0;
  while ((n = w.nextNode())) { const len = n.nodeValue.length;
    if (!sN && args.gs < pos + len) { sN = n; sO = args.gs - pos; }
    if (args.ge <= pos + len) { eN = n; eO = args.ge - pos; break; }
    pos += len; }
  const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new Event('selectionchange'));
  document.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
  return r.toString();
}"""

OFFSET_JS = """(needle) => {
  const root = document.getElementById('content');
  const skip = n => { let p = n.parentNode; while (p && p !== root) { if (p.classList && (p.classList.contains('rd-ui') || p.classList.contains('rd-note') || p.classList.contains('rd-tag'))) return true; p = p.parentNode; } return false; };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n, t = ''; while ((n = w.nextNode())) t += n.nodeValue; return t.indexOf(needle);
}"""
def ids(pg, sel):
    return pg.evaluate("sel => new Set(Array.from(document.querySelectorAll(sel)).map(m => m.dataset.id)).size", sel)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
    pg.on("dialog", on_dialog)
    pg.goto(url, wait_until="load")
    pg.wait_for_function("window.__done === true", timeout=20000)

    # 초기: 내 것만 보기 -> 멤버B의 메모는 안 보임
    check("initial: no marks (mine only)", pg.locator("#content mark.rd-mark").count() == 0)
    # 전체 보기 -> 멤버B 메모 보임(other)
    pg.click('#rd-scope button[data-v="all"]'); pg.wait_for_timeout(200)
    check("all: other's mark visible", pg.locator("#content mark.rd-mark.other").count() >= 1)
    check("all: other's tag shows name", "멤버B" in pg.inner_text("#content .rd-tag"))
    pg.click('#rd-scope button[data-v="mine"]'); pg.wait_for_timeout(200)

    # 하이라이트 추가
    g1 = pg.evaluate(OFFSET_JS, "격주 월요일"); sel = pg.evaluate(SELECT_JS, {"gs": g1, "ge": g1 + 12})
    pg.wait_for_timeout(300)
    check("float shown on selection", pg.is_visible(".rd-float.show"))
    pg.click('.rd-float button[data-act="hl"]'); pg.wait_for_timeout(300)
    marks = pg.locator("#content mark.rd-mark:not(.other)")
    check("highlight added", ids(pg, "#content mark.rd-mark:not(.other)") == 1, f"text={marks.first.inner_text() if marks.count() else ''}")
    check("count shows 1", pg.inner_text("#rd-count").strip() == "1개", pg.inner_text("#rd-count"))

    # 메모 추가
    prompt_answer["v"] = "테스트 메모입니다"
    g2 = pg.evaluate(OFFSET_JS, "대규모 해고보다"); pg.evaluate(SELECT_JS, {"gs": g2, "ge": g2 + 20}); pg.wait_for_timeout(300)
    pg.click('.rd-float button[data-act="memo"]'); pg.wait_for_timeout(300)
    check("memo mark has-note", ids(pg, "#content mark.rd-mark.has-note:not(.other)") == 1)
    check("memo note open with text", "테스트 메모입니다" in pg.inner_text("#content .rd-note.open"))
    pg.screenshot(path="reader-1.png", full_page=False)

    # AI용 복사: 전체 메모를 사람별로
    out = pg.evaluate("window.__reader.exportText()")
    check("export grouped by author", "## 멤버A (나)" in out and "## 멤버B" in out and "테스트 메모입니다" in out and "우리 회사도" in out)

    # 겹침 방지
    pg.evaluate(SELECT_JS, {"gs": g1 + 3, "ge": g1 + 8}); pg.wait_for_timeout(300)
    pg.click('.rd-float button[data-act="hl"]'); pg.wait_for_timeout(300)
    check("overlap rejected", ids(pg, "#content mark.rd-mark:not(.other)") == 2)

    # 남의 것 클릭 -> 수정 불가 안내 (전체 보기)
    pg.click('#rd-scope button[data-v="all"]'); pg.wait_for_timeout(200)
    prompt_answer["v"] = "바꾸기"
    pg.locator("#content mark.rd-mark.other").first.click(); pg.wait_for_timeout(300)
    check("other's memo unchanged", "우리 회사도" in pg.evaluate("window.__reader.state.find(h=>h.author==='b').note"))

    # 내 메모 수정 -> '삭제' 입력하면 제거
    prompt_answer["v"] = "삭제"
    pg.locator("#content mark.rd-mark.has-note:not(.other)").first.click(); pg.wait_for_timeout(300)
    check("own memo deleted via prompt", pg.locator("#content mark.rd-mark.has-note:not(.other)").count() == 0)
    check("state size 2 (1 mine + 1 other)", pg.evaluate("window.__reader.state.length") == 2)

    # 의견
    check("comments initial count 2", pg.inner_text("#comment-count").strip() == "2개", pg.inner_text("#comment-count"))
    pg.fill("#cm-text", "새 의견입니다"); pg.click("#cm-form button[type=submit]"); pg.wait_for_timeout(300)
    check("comment posted", "새 의견입니다" in pg.inner_text("#comments") and pg.inner_text("#comment-count").strip() == "3개")
    # 답글
    pg.click('#comments button[data-op="reply"]'); pg.wait_for_timeout(200)
    pg.fill("#cm-reply-text", "답글 테스트"); pg.click("#cm-reply button[type=submit]"); pg.wait_for_timeout(300)
    check("reply posted", pg.locator("#comments .cm.reply").count() == 2 and "답글 테스트" in pg.inner_text("#comments"))
    # 삭제: 내 것만 삭제 버튼 존재
    dels = pg.locator('#comments button[data-op="del"]')
    check("delete buttons only on mine (a): 3", dels.count() == 3, str(dels.count()))
    pg.screenshot(path="reader-2.png", full_page=True)
    # 내 새 의견 삭제
    ids = pg.evaluate("Array.from(document.querySelectorAll('#comments .cm')).map(x=>x.dataset.id)")
    pg.click('#comments .cm:has-text("새 의견입니다") button[data-op="del"]'); pg.wait_for_timeout(300)
    check("comment deleted", "새 의견입니다" not in pg.inner_text("#comments"))
    b.close()

print("--- console ---")
for l in logs: print(l[:200])
print("RESULT:", "ALL PASS" if not fails else f"FAILED: {fails}")
