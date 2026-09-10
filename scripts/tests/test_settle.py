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
            pg_sched = pg.evaluate("window.__sched")
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

# 회비(기금): 납부 4명 200,000 - 회비 지출 (20,500 + 9,000 + 12,000 + 22,000) = 136,500
check("fund income", f["income"], 200000)
check("fund spent", f["spent"], 63500)
check("fund balance", f["balance"], 136500)
check("fund current term", f["current"]["name"], "2026 하반기 회비")
check("fund paid/unpaid", (f["current"]["paidCount"], [u["id"] for u in f["current"]["unpaid"]]), (4, ["d"]))
check("fund expected/collected", (f["current"]["expected"], f["current"]["collected"]), (250000, 200000))
check("fund term spent (in period)", f["current"]["spent"], 63500)
check("fund term end derived from months", f["current"]["endEff"], "2027-02-28")
rb = {x["id"]: (x["paid"], x["done"], x["remaining"]) for x in f["reimburse"]}
check("reimburse b (paid 9,000, reimbursed 9,000)", rb, {"b": (9000, 9000, 0)})
check("reimburse total pending", f["reimburseTotal"], 0)

# 월별 가용 금액: 250,000 / 6개월. 9월 배정 41,667 - 지출 41,500 = 167 이월, 10월 41,666 + 167 - 22,000 = 19,833
b = f["current"]["budget"]
check("budget months/monthly/total", (b["months"], b["monthly"], b["total"]), (6, 41667, 250000))
check("budget status/current", (b["status"], b["current"]["ym"]), ("during", "2026-10"))
rows = {r["ym"]: (r["alloc"], r["carried"], r["spent"], r["remaining"]) for r in b["rows"]}
check("budget 2026-09", rows["2026-09"], (41667, 0, 41500, 167))
check("budget 2026-10", rows["2026-10"], (41666, 167, 22000, 19833))
check("budget 2026-11 carry", rows["2026-11"][1], 19833)
check("budget last month sums to total", sum(r["alloc"] for r in b["rows"]), 250000)
check("budget last ym", b["rows"][-1]["ym"], "2027-02")

# 일정과 발제: 매월 둘째 화요일, 순서 a b c d e (2026-09 시작). 오늘 2026-10-20 -> 다음은 11월 10일, 발제 c
sch = pg_sched
check("sched next date", sch["next"]["date"], "2026-11-10")
check("sched next presenter (c = 3/5)", (sch["next"]["presenter"], sch["next"]["index"]), ("c", 3))
by = {r["ym"]: r for r in sch["rows"]}
check("sched oct uses session date/presenter", (by["2026-10"]["date"], by["2026-10"]["presenter"], by["2026-10"]["fromSession"], by["2026-10"]["status"]), ("2026-10-13", "b", True, "done"))
check("sched rotation wraps (2027-02 -> a)", by["2027-02"]["presenter"], "a")
check("sched 2027-01 2nd tuesday", by["2027-01"]["date"], "2027-01-12")
check("sched dec 2nd tuesday", by["2026-12"]["date"], "2026-12-08")
print("--- console ---")
for l in logs: print(l[:300])
print("RESULT:", "ALL PASS" if not fails else f"FAILED: {fails}")
