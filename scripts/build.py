"""Dựng giao diện từ src/template.html cho 2 nơi:
  - web/index.html          : bản web / PWA chạy trên GitHub Pages (máy tính, iPad, iPhone)
  - desktop/app/index.html  : bản chạy trong ứng dụng Windows / macOS (Electron, font offline)
Dữ liệu mẫu nhúng vào là samples/demo-FinishedJobs.txt (dữ liệu giả).
Chạy:  python3 scripts/build.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
tpl = (ROOT / 'src/template.html').read_text(encoding='utf-8')
sample = (ROOT / 'samples/demo-FinishedJobs.txt').read_text(encoding='utf-8')
tpl = tpl.replace('__RAW__', json.dumps(sample, ensure_ascii=False).replace('</', '<\\/'))

BASE_CSS = """<style>
:root{color-scheme:light}
html,body{margin:0}
body{font-size:14px}
img{max-width:100%}
[hidden]{display:none!important}
@media print{nav.tabs,.src,.drop,.btn,.filters{display:none!important}.panel[hidden]{display:flex!important}.tablebox{max-height:none!important;overflow:visible!important}.card{break-inside:avoid}}
</style>"""

FONT_FACES = """<style>
@font-face{font-family:"Be Vietnam Pro";font-weight:400;font-display:swap;src:url(fonts/BeVietnamPro-Regular.ttf) format("truetype")}
@font-face{font-family:"Be Vietnam Pro";font-weight:500;font-display:swap;src:url(fonts/BeVietnamPro-Medium.ttf) format("truetype")}
@font-face{font-family:"Be Vietnam Pro";font-weight:600;font-display:swap;src:url(fonts/BeVietnamPro-SemiBold.ttf) format("truetype")}
@font-face{font-family:"Be Vietnam Pro";font-weight:700;font-display:swap;src:url(fonts/BeVietnamPro-Bold.ttf) format("truetype")}
@font-face{font-family:"IBM Plex Mono";font-weight:400;font-display:swap;src:url(fonts/IBMPlexMono-Regular.ttf) format("truetype")}
@font-face{font-family:"IBM Plex Mono";font-weight:500;font-display:swap;src:url(fonts/IBMPlexMono-Medium.ttf) format("truetype")}
</style>"""


def split(t):
    i = t.index('<div class="wrap">')
    return t[:i], t[i:]


# ---------- Web / PWA ----------
a = tpl.index('<link rel="preconnect"'); b = tpl.index('<style>')
head, body = split(tpl[:a] + '<link rel="stylesheet" href="fonts/fonts.css">\n' + tpl[b:])
# Font chữ được kèm sẵn trong web/fonts để chạy offline
web = f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B7480">
<meta name="description" content="Phân tích log FinishedJobs của máy xét nghiệm miễn dịch: kết quả, QC Levey-Jennings, bảo trì, cảnh báo. Dữ liệu xử lý ngay trên thiết bị.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="LabLog">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
{BASE_CSS}
{head}</head>
<body>
{body}
<script>
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {{
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {{}}));
}}
</script>
</body>
</html>
"""
(ROOT / 'web/index.html').write_text(web, encoding='utf-8')
(ROOT / 'web/fonts').mkdir(exist_ok=True)
(ROOT / 'web/fonts/fonts.css').write_text(FONT_FACES.replace('<style>', '').replace('</style>', '').replace('url(fonts/', 'url('), encoding='utf-8')
for f in (ROOT / 'desktop/app/fonts').glob('*.ttf'):
    (ROOT / 'web/fonts' / f.name).write_bytes(f.read_bytes())

# ---------- Desktop (Electron) ----------
a = tpl.index('<link rel="preconnect"'); b = tpl.index('<style>')
dt = tpl[:a] + FONT_FACES + '\n' + BASE_CSS + '\n' + tpl[b:]
head, body = split(dt)
csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:"
desk = f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
{head}</head>
<body>
{body}
</body>
</html>
"""
(ROOT / 'desktop/app/index.html').write_text(desk, encoding='utf-8')
print('OK: web/index.html, desktop/app/index.html')
