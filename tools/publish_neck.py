#!/usr/bin/env python3
"""Publish the Hero Mode "Neck 3D" gameplay concept next to the main prototype, at <site>/neck/.

GitHub Pages serves only `main`, and the concept lives on the branch `concept/neck-gameplay`. This copies the few
files that differ on that branch into neck/ and points everything else (media, data, vendor, assets, the other
scripts) at the site root with <base href="../">, so nothing heavy is duplicated and the main page is untouched.

    python3 tools/publish_neck.py        # run from the prototype folder, on main; then commit neck/
"""
import pathlib, subprocess

BRANCH = 'concept/neck-gameplay'
OWN = ['neckplay.js', 'hero.js', 'guitar3d.js', 'app.js']        # scripts taken from the branch
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'neck'; out.mkdir(exist_ok=True)
show = lambda f: subprocess.run(['git', 'show', f'{BRANCH}:{f}'], cwd=root, check=True, capture_output=True, text=True).stdout

def swap(s, a, b):
    assert a in s, a
    return s.replace(a, b, 1)

html = show('index.html')
html = swap(html, '<script>window.LJ_BASE_URL = new URL(".", location.href).pathname;', '<base href="../">\n<script>window.LJ_BASE_URL = new URL(".", document.baseURI).pathname;')
for f in OWN:
    html = swap(html, f'<script src="{f}"></script>', f'<script src="neck/{f}"></script>')
html = html.replace('<title>', '<title>Neck 3D concept · ', 1)
(out / 'index.html').write_text(html)
for f in OWN:
    s = show(f)
    if f == 'guitar3d.js':   # a dynamic import resolves against the script's own URL, which is now one folder down
        s = swap(s, "import('./vendor/guitar3d/guitar/guitar-stage.mjs')", "import('../vendor/guitar3d/guitar/guitar-stage.mjs')")
    (out / f).write_text(s)
print('wrote', ', '.join(sorted(p.name for p in out.iterdir())), 'from', subprocess.run(['git', 'rev-parse', '--short', BRANCH], cwd=root, capture_output=True, text=True).stdout.strip())
