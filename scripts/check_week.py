"""주차 페이지(또는 아무 HTML/CSS/JS) 규칙 점검.

사용: python scripts/check_week.py weeks/2026-09-15/index.html [다른 파일 ...]
점검: em dash, 이모지, 세리프 폰트, 남은 {{치환자}}, 주차 페이지면 data-session 과 폴더명 일치, 필수 요소(#content #settle #comments).
문제가 있으면 종료 코드 1.
"""
import io, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")

EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿\U0001F000-\U0001F2FF]")

def check(path):
    s = io.open(path, encoding="utf-8").read()
    errs = []
    for i, line in enumerate(s.split("\n"), 1):
        if "—" in line: errs.append(f"{i}: em dash(U+2014) 사용")
        if EMOJI.search(line): errs.append(f"{i}: 이모지 사용")
        if re.search(r"font-family\s*:[^;]*\bserif\b", line) and "sans-serif" not in line: errs.append(f"{i}: 세리프 폰트")
        if re.search(r"font-family\s*:[^;]*(Noto Serif|Myeongjo|명조|Batang|바탕체)", line, re.I): errs.append(f"{i}: 명조 계열 폰트")
    left = sorted(set(re.findall(r"\{\{[A-Z_]+\}\}", s)))
    if left and path.endswith(".html") and "templates" not in path.replace("\\", "/"): errs.append("치환되지 않은 자리: " + ", ".join(left))
    p = path.replace("\\", "/")
    m = re.search(r"weeks/(\d{4}-\d{2}-\d{2})/index\.html$", p)
    if m:
        ds = re.search(r'data-session="([^"]*)"', s)
        if not ds or ds.group(1) != m.group(1): errs.append(f"data-session 이 폴더명({m.group(1)})과 다름")
        for need in ('id="content"', 'id="settle"', 'id="comments"', "settle.js", "reader.js"):
            if need not in s: errs.append(f"필수 요소 없음: {need}")
        if re.search(r"\d{1,3}(,\d{3})+\s*원", s): errs.append("정적 HTML에 금액으로 보이는 숫자가 있음 (금액은 Firestore에만)")
    return errs

if __name__ == "__main__":
    bad = 0
    for path in sys.argv[1:] or ["templates/week.html"]:
        errs = check(path)
        print(("FAIL " if errs else "OK   ") + path)
        for e in errs: print("   -", e)
        bad += bool(errs)
    sys.exit(1 if bad else 0)
