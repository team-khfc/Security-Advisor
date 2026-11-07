"""partials/shell.html 의 공통 머리글·메뉴·바닥글을 모든 페이지에 반영합니다.
사용: 프로젝트 폴더에서  python tools/sync-shell.py
"""
import glob, os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shell = open(os.path.join(root, 'partials', 'shell.html'), encoding='utf-8').read().strip()
pat = re.compile(r'(<!-- shell:start[^>]*-->\n).*?(\n<!-- shell:end -->)', re.S)
n = 0
for f in sorted(glob.glob(os.path.join(root, '*.html'))):
    s = open(f, encoding='utf-8').read()
    if not pat.search(s):
        continue
    t = pat.sub(lambda m: m.group(1) + shell + m.group(2), s)
    if t != s:
        open(f, 'w', encoding='utf-8').write(t); n += 1
        print('반영:', os.path.basename(f))
print(f'완료: {n}개 페이지')
