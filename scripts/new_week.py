"""templates/week.html 을 복제해 weeks/<date>/index.html 을 만든다.

사용:
  python scripts/new_week.py --date 2026-09-15 --title "제목" --content content.html --next "다음 모임 계획" [--week 3] [--force]

  --content : 이날의 내용 HTML 조각 파일(h3, p, a.brief-link 등). 파일 대신 '-' 를 주면 표준입력.
  --week    : 생략하면 weeks/ 아래 기존 폴더 수 + 1.
만든 뒤 scripts/check_week.py 로 점검한다.
"""
import argparse, io, os, re, sys, datetime
sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WD = "일월화수목금토"

def date_label(d):
    y, m, dd = map(int, d.split("-"))
    w = WD[(datetime.date(y, m, dd).weekday() + 1) % 7]
    return f"{y}.{m:02d}.{dd:02d} ({w})"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--content", required=True)
    ap.add_argument("--next", default="")
    ap.add_argument("--week", type=int)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.date):
        sys.exit("--date 는 YYYY-MM-DD 형식")
    out_dir = os.path.join(ROOT, "weeks", a.date)
    out = os.path.join(out_dir, "index.html")
    if os.path.exists(out) and not a.force:
        sys.exit(f"이미 있음: {out} (덮어쓰려면 --force)")
    content = sys.stdin.read() if a.content == "-" else io.open(a.content, encoding="utf-8").read()
    weeks = [d for d in os.listdir(os.path.join(ROOT, "weeks")) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)] if os.path.isdir(os.path.join(ROOT, "weeks")) else []
    week_no = a.week or (len([w for w in weeks if w != a.date]) + 1)
    tpl = io.open(os.path.join(ROOT, "templates", "week.html"), encoding="utf-8").read()
    html = (tpl.replace("{{SESSION_ID}}", a.date).replace("{{WEEK_NO}}", f"{week_no:02d}")
            .replace("{{DATE_LABEL}}", date_label(a.date)).replace("{{TITLE}}", a.title)
            .replace("{{CONTENT}}", content.strip()).replace("{{NEXT_PLAN}}", a.next.strip()))
    # 템플릿 안내 주석 제거
    html = re.sub(r"<!--\n  주차 페이지 템플릿.*?-->\n", "", html, flags=re.S)
    os.makedirs(out_dir, exist_ok=True)
    io.open(out, "w", encoding="utf-8", newline="\n").write(html)
    print("생성:", os.path.relpath(out, ROOT), f"(WEEK {week_no:02d})")

if __name__ == "__main__":
    main()
