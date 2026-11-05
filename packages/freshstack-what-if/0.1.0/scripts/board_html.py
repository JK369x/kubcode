"""Native browser shaping for Thai boards when Pillow has no libraqm."""
import html
import math
import os
import pathlib
import subprocess
from PIL import Image


def board_html(timeline, episode, source, cols):
    width = cols * 960 + (cols + 1) * 24
    rows = math.ceil(len(timeline['shots']) / cols)
    height = rows * 724 + 114
    title = episode.get('title', episode.get('topic', 'Storyboard'))
    if isinstance(title, list):
        title = ' '.join(title)
    heading = f'{title} · storyboard, one key frame per shot · {timeline["total"]/timeline["fps"]:.1f} s'
    cards = []
    for i, shot in enumerate(timeline['shots']):
        uri = (source / (shot['id'] + '.png')).resolve().as_uri()
        label = f'{i+1}  {shot["id"]}  {shot["size"].upper()}'
        spoken = '"' + shot.get('line', '') + '"' if shot.get('line') else '(no words)'
        cards.append(f'<section><img src="{html.escape(uri,quote=True)}"><div class="caption"><header>{html.escape(label)}<time>{shot["first"]/timeline["fps"]:.1f} s</time></header><div class="spoken" lang="th">{html.escape(spoken)}</div><div class="note">{html.escape(shot.get("note",""))}</div></div></section>')
    content = f'''<!doctype html><html lang="th"><meta charset="utf-8"><title>Storyboard — Thai text corrected</title>
<style>
*{{box-sizing:border-box}}html,body{{margin:0;width:{width}px;background:#14111a;color:#f6efe3;font-family:Thonburi,"Noto Sans Thai",sans-serif}}
.heading{{height:90px;padding:26px 24px 0;font-size:34px;font-weight:700;white-space:nowrap}}
.board{{display:grid;grid-template-columns:repeat({cols},960px);gap:24px;padding:24px}}
section{{width:960px;height:700px;overflow:hidden}}img{{display:block;width:960px;height:540px;object-fit:fill}}
.caption{{height:160px;background:#201b28;padding:10px 18px;overflow:hidden}}
header{{position:relative;font-size:34px;line-height:42px;color:#ffb15a;font-weight:700}}
time{{position:absolute;right:0;top:5px;font-size:23px;line-height:30px;color:#aaa0b9;font-weight:400}}
.spoken{{font-size:28px;line-height:34px;font-weight:700;margin-top:4px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}}
.note{{font-size:23px;line-height:28px;color:#aaa0b9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
</style><div class="heading">{html.escape(heading)}</div><main class="board">{''.join(cards)}</main></html>'''
    return content, (width, height)


def render_browser(timeline, episode, source, out, cols, studio):
    document, size = board_html(timeline, episode, source, cols)
    page = out.with_name('storyboard-thai.html')
    page.write_text(document, encoding='utf-8')
    browser = pathlib.Path(os.environ.get('REMOTION_BROWSER_EXECUTABLE', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))
    if not browser.is_file():
        raise RuntimeError('Thai shaping requires Pillow with libraqm or an explicit existing Chrome executable')
    cache = studio.parent / '.cache'
    tmp = cache / 'tmp'
    tmp.mkdir(parents=True, exist_ok=True)
    png = out.with_name('storyboard-thai-shaped.png')
    env = dict(os.environ, TMPDIR=str(tmp))
    command = [str(browser),'--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
               '--hide-scrollbars','--force-device-scale-factor=1', '--virtual-time-budget=1500',
               '--user-data-dir='+str(cache/'board-chrome-profile'), '--window-size='+str(size[0])+','+str(size[1]),
               '--screenshot='+str(png), page.resolve().as_uri()]
    result = subprocess.run(command, capture_output=True, timeout=45, env=env)
    if result.returncode != 0 or not png.exists():
        raise RuntimeError('Browser Thai storyboard render failed; do not accept unshaped Pillow text')
    with Image.open(png) as image:
        if image.size != size:
            raise RuntimeError('Unexpected storyboard screenshot dimensions')
        image.convert('RGB').save(out, quality=92)
    return page, size
