# Renders README.md (or README.ru.md) through GitHub's own markdown API and wraps it in GitHub's repository page chrome,
# so the local preview matches github.com: same HTML, same github-markdown-css, dark theme, 1012px column.
# Usage: python tools/media/preview.py README.md README.preview.html [owner/repo]   (needs the gh CLI, signed in)
import json, subprocess, sys, html
src, out = sys.argv[1], sys.argv[2]
repo = sys.argv[3] if len(sys.argv) > 3 else 'criocore/astrolab'
text = open(src, encoding='utf-8').read()
body = subprocess.run(['gh', 'api', '/markdown', '-X', 'POST', '-f', f'text={text}', '-f', 'mode=gfm', '-f', f'context={repo}'], capture_output=True, text=True, encoding='utf-8')
if body.returncode != 0:
    print(body.stderr); sys.exit(1)
rendered = body.stdout
name = repo.split('/')[1]
page = f'''<!doctype html>
<html lang="en" data-color-mode="dark" data-dark-theme="dark">
<head>
<meta charset="utf-8" />
<title>{name} · GitHub preview</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown-dark.min.css" />
<style>
  body {{ margin: 0; background: #0d1117; color: #e6edf3; font-family: -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; }}
  .gh-header {{ background: #010409; border-bottom: 1px solid #3d444d; padding: 16px 32px; display: flex; align-items: center; gap: 12px; font-size: 14px; }}
  .gh-header .repo {{ font-size: 20px; }} .gh-header .repo b {{ color: #e6edf3; }} .gh-header .repo span {{ color: #9198a1; }}
  .gh-header .btn {{ margin-left: auto; border: 1px solid #3d444d; border-radius: 6px; padding: 4px 10px; color: #e6edf3; background: #212830; font-size: 12px; }}
  .gh-tabs {{ background: #010409; border-bottom: 1px solid #3d444d; padding: 0 32px; display: flex; gap: 24px; font-size: 14px; }}
  .gh-tabs div {{ padding: 10px 4px; color: #9198a1; }} .gh-tabs div.on {{ color: #e6edf3; border-bottom: 2px solid #f78166; }}
  .gh-main {{ max-width: 1280px; margin: 24px auto; padding: 0 32px; display: grid; grid-template-columns: minmax(0, 1fr) 296px; gap: 24px; }}
  .gh-readme {{ border: 1px solid #3d444d; border-radius: 6px; }}
  .gh-readme-head {{ border-bottom: 1px solid #3d444d; padding: 8px 16px; font-size: 14px; color: #9198a1; display: flex; gap: 12px; }}
  .markdown-body {{ padding: 32px; }}
  .gh-side h3 {{ font-size: 16px; margin: 0 0 8px; }} .gh-side {{ font-size: 14px; color: #9198a1; }} .gh-side p {{ margin: 0 0 12px; }}
  .gh-side .chip {{ display: inline-block; margin: 2px 4px 2px 0; padding: 2px 10px; border-radius: 2em; background: #121d2f; color: #4493f8; font-size: 12px; }}
  @media (max-width: 1000px) {{ .gh-main {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<div class="gh-header"><span style="color:#9198a1">⌂</span><span class="repo"><span>criocore / </span><b>{name}</b></span><span class="btn">Public</span></div>
<div class="gh-tabs"><div class="on">Code</div><div>Issues</div><div>Pull requests</div><div>Actions</div><div>Security</div></div>
<div class="gh-main">
  <div class="gh-readme"><div class="gh-readme-head"><b style="color:#e6edf3">README</b><span>MIT license</span><span>Security</span></div><article class="markdown-body">{rendered}</article></div>
  <aside class="gh-side"><h3>About</h3><p>A local study hub where your own coding agent is the mentor and the examiner.</p><p><span class="chip">claude-code</span><span class="chip">codex</span><span class="chip">gemini-cli</span><span class="chip">learning</span><span class="chip">local-first</span></p><p>☆ Star · 0 · Readme · MIT license</p></aside>
</div>
</body>
</html>'''
open(out, 'w', encoding='utf-8').write(page)
print('preview written', out, len(rendered), 'chars of rendered html')
