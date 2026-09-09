"""settle.js(추가 비용 n분의 1) + fund.js(회비 잔액·납부 현황) 계산 검증과 렌더 스크린샷 (예시 데이터, Firestore 접근 없음)."""
import sys, json
from playwright.sync_api import sync_playwright
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"); os.makedirs(OUT, exist_ok=True)

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
        pg.screenshot(path=os.path.join(OUT, f"settle-{name}.png"), full_page=True)
        if name == "mobile":
            r = pg.evaluate("window.__r")
            r2 = pg.evaluate("window.__r2")
            f = pg.evaluate("window.__fund")
        ctx.close()
    b.close()

# 추가 비용(n분의 1): 회비 지출 3건과 회비 보전 송금은 제외되고 자료 인쇄 13,700원만 남아야 한다.
check("split total (fund items excluded)", r["total"], 13700)
check("split count", r["count"], 1)
check("uniform/n", (r["uniform"], r["n"]), (True, 5))
owed = {p["id"]: p["owed"] for p in r["people"]}
paid = {p["id"]: p["paid"] for p in r["people"]}
check("owed admin(a) = 2700 + rest 200", owed["a"], 2900)
check("owed b..e", [owed[k] for k in "bcde"], [2700]*4)
check("paid a", paid["a"], 13700)
diff = {p["id"]: p["diff"] for p in r["people"]}
check("diff", diff, {"a": 10800, "b": -2700, "c": -2700, "d": -2700, "e": -2700})
rem = {p["id"]: p["remaining"] for p in r["people"]}
check("remaining after payment d->a (fund->b ignored)", rem, {"a": 8100, "b": -2700, "c": -2700, "d": 0, "e": -2700})
tr = sorted([(t["from"], t["to"], t["amount"]) for t in r["transfers"]])
check("transfers", tr, sorted([("b", "a", 2700), ("c", "a", 2700), ("e", "a", 2700)]))
check("checks ok", (r["checks"]["itemsOk"], r["checks"]["owedOk"], r["checks"]["dupes"]), (True, True, []))
check("categories (split only)", [(c["name"], c["amount"]) for c in r["categories"]], [("기타", 13700)])
check("dup detected", r2["checks"]["dupes"], ["자료 인쇄"])

# 회비(기금): 납부 4명 200,000 - 회비 지출 (96,500 + 32,000 + 24,000 + 42,000) = 5,500
check("fund income", f["income"], 200000)
check("fund spent", f["spent"], 194500)
check("fund balance", f["balance"], 5500)
check("fund current term", f["current"]["name"], "2026 하반기 회비")
check("fund paid/unpaid", (f["current"]["paidCount"], [u["id"] for u in f["current"]["unpaid"]]), (4, ["d"]))
check("fund expected/collected", (f["current"]["expected"], f["current"]["collected"]), (250000, 200000))
check("fund term spent (in period)", f["current"]["spent"], 194500)
rb = {x["id"]: (x["paid"], x["done"], x["remaining"]) for x in f["reimburse"]}
check("reimburse b (paid 32,000, reimbursed 32,000)", rb, {"b": (32000, 32000, 0)})
check("reimburse total pending", f["reimburseTotal"], 0)
print("--- console ---")
for l in logs: print(l[:300])
print("RESULT:", "ALL PASS" if not fails else f"FAILED: {fails}")
