# Media and preview tooling

Scripts that produced the banners, screenshots and the GitHub-identical README preview. None of them is needed to run the hub.

- `banner.html`: the banner as a page. Render with headless Chrome, e.g. `chrome --headless=new --window-size=1280,360 --screenshot=docs/media/banner-en-dark.png "file:///.../banner.html?lang=en&theme=dark"` (`lang` en|ru, `theme` dark|light).
- `seed-demo.mjs`: fills a separate data folder with lived-in progress (Era I and II passed, Era III in progress with a gap and a failed gate) for screenshots. `node tools/media/seed-demo.mjs ./data-shots`, then `STUDY_HUB_DATA=./data-shots MENTOR_MODE=replay STUDY_HUB_PORT=4318 npm start`.
- `shoot.mjs`: five 1920×1080 screenshots of that hub with a prepared browser state. Needs `puppeteer-core` (`npm i -D puppeteer-core`) and Chrome (`CHROME_PATH`). `node tools/media/shoot.mjs http://127.0.0.1:4318/ docs/media/shots en`.
- `preview.py`: renders README.md through GitHub's own Markdown API (`gh api /markdown`) and wraps it in GitHub's CSS and page chrome, so the local page matches github.com. `python tools/media/preview.py README.md README.preview.html`, then open the file over any static server.

The films live in `tools/brag/`: `build_comp2.py <en|ru> <out-dir> [short]` writes a Hyperframes composition from `comp_template2.html`; render with `npx hyperframes render` inside `<out-dir>/composition`. The storyboard is `brag-plan.md`.
