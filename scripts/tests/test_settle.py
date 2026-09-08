"""settle.js 계산 검증 + 렌더 스크린샷 (예시 데이터, Firestore 접근 없음)."""
import sys, json
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770/demo/index.html"
logs = []
fails = []
def check(name, got, exp):
    ok = got == exp
    if not ok: fails.append(name)
    print(("OK  " if ok else "FAIL"), name, "=>", got, "" if ok else f"(expected {exp})")

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w in (("mobile", 390), ("desktop", 1100)):
        ctx = b.new_context(viewport={"width": w, "height": 900}, device_scale_factor=2)
        pg = ctx.new_page()
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        pg.goto(url, wait_until="load")
        pg.wait_for_function("window.__done === true", timeout=20000)
        pg.screenshot(path=f"settle-{name}.png", full_page=True)
        if name == "mobile":
            r = pg.evaluate("window.__r")
            r2 = pg.evaluate("window.__r2")
        ctx.close()
    b.close()

check("total", r["total"], 166200)
check("uniform/n", (r["uniform"], r["n"]), (True, 5))
owed = {p["id"]: p["owed"] for p in r["people"]}
paid = {p["id"]: p["paid"] for p in r["people"]}
check("owed admin(a)", owed["a"], 33400)
check("owed b..e", [owed[k] for k in "bcde"], [33200]*4)
check("paid a", paid["a"], 134200)
check("paid b", paid["b"], 32000)
diff = {p["id"]: p["diff"] for p in r["people"]}
check("diff", diff, {"a": 100800, "b": -1200, "c": -33200, "d": -33200, "e": -33200})
rem = {p["id"]: p["remaining"] for p in r["people"]}
check("remaining after payment d->a", rem, {"a": 67600, "b": -1200, "c": -33200, "d": 0, "e": -33200})
tr = sorted([(t["from"], t["to"], t["amount"]) for t in r["transfers"]])
check("transfers", tr, sorted([("c", "a", 33200), ("e", "a", 33200), ("b", "a", 1200)]))
check("checks ok", (r["checks"]["itemsOk"], r["checks"]["owedOk"], r["checks"]["dupes"]), (True, True, []))
check("categories", [(c["name"], c["amount"]) for c in r["categories"]], [("식사", 96500), ("카페", 32000), ("장소", 24000), ("기타", 13700)])
check("byDate order", [d["date"] for d in r["byDate"]], ["2026-09-14", "2026-09-15"])
check("dup detected", r2["checks"]["dupes"], ["카페"])
print("--- console ---")
for l in logs: print(l[:300])
print("RESULT:", "ALL PASS" if not fails else f"FAILED: {fails}")
