"""Assemble the whitepaper HTML (cover + two content pages) in the SemiAnalysis house style.

Usage:
    python3 build_pdf.py <spec.json> <out_dir>

Reads the light-theme chart SVGs written by make_charts.py from <out_dir>
(chart-<scenario id>-light.svg) and writes <out_dir>/paper.html. Render it with
render_pdf.js. Every asset (fonts, artwork, chip render, chart SVGs, model logo)
is inlined as a data URI so the HTML is self-contained.

Page plan (fixed; edit this file for a different layout):
    cover   black page, circuit mosaic band, hardware render, title, subtitle, publisher line
    page 1  title + meta, Summary, bold callout, KPI tiles (scenario 0), Figure 1 (scenario 0)
    page 2  KPI tiles (scenario 1), Figure 2 (scenario 1), "How the estimate is built", Sources
"""

import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
FONT_DIR = os.path.join(HERE, "fonts")
B = 1e9


def resolve(spec_dir: str, path: str) -> str:
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(spec_dir, path))


def b64(path: str) -> str:
    return base64.b64encode(open(path, "rb").read()).decode()


def inline_svg(path: str) -> str:
    s = open(path).read()
    s = s[s.index("<svg") :]
    s = re.sub(r'<svg([^>]*?) width="[^"]*" height="[^"]*"', r"<svg\1", s, count=1)
    return re.sub(r"<metadata>.*?</metadata>", "", s, flags=re.S)


def css(fonts: str, mosaic: str) -> str:
    return f"""
{fonts}
@page {{ size: Letter; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ font-family: 'DM Sans', sans-serif; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: 8.5in; height: 11in; position: relative; overflow: hidden; page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}

/* cover */
.cover {{ background: #000; }}
.cover .mosaic {{ position: absolute; top: 0; left: 0; width: 8.5in; height: 5.15in; background: url(data:image/png;base64,{mosaic}) center/cover no-repeat; }}
.cover .titleblock {{ position: absolute; left: 0.55in; right: 0.55in; top: 6.2in; color: #fff; }}
.cover h1 {{ font-size: 25pt; font-weight: 700; line-height: 1.22; letter-spacing: -0.005em; }}
.cover h1 span {{ display: block; font-weight: 400; font-size: 16pt; margin-top: 10pt; color: #e6e6e6; }}
.cover .pub {{ margin-top: 0.42in; font-size: 11pt; color: #fff; }}
.cover .chip {{ position: absolute; right: 0.45in; top: 3.45in; width: 3.7in; filter: drop-shadow(0 14pt 22pt rgba(0,0,0,0.75)); }}

/* KPI tiles */
.kpis {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9pt; margin: 6pt 0 4pt; }}
.kpi {{ background: #eaebec; border-radius: 7pt; padding: 8pt 11pt 7pt; }}
.kpi .v {{ font-size: 22pt; font-weight: 700; color: #ba534b; line-height: 1.05; letter-spacing: -0.01em; }}
.kpi .l {{ font-size: 9.5pt; font-weight: 600; color: #131416; margin-top: 3pt; }}
.kpi .s {{ font-size: 8pt; color: #4b5057; margin-top: 2pt; line-height: 1.3; }}
.kpi .s b {{ color: #ba534b; font-weight: 700; }}

/* dashboard-clone figure card */
.card {{ background: #eaebec; border-radius: 8pt; padding: 10pt 12pt 6pt; }}
.card svg {{ width: 100%; height: auto; display: block; }}
.ctitle {{ display: flex; align-items: center; gap: 6pt; font-size: 10.5pt; font-weight: 700; color: #131416; margin-bottom: 5pt; line-height: 1.25; }}
.ctitle svg {{ width: 15pt; height: 15pt; flex: none; }}
.cmeta {{ font-size: 7.8pt; color: #3a3d42; margin-bottom: 4pt; line-height: 1.5; }} .cmeta b {{ font-weight: 600; color: #131416; }}
.cmeta .sep {{ display: inline-block; width: 10pt; }}
.pill {{ display: inline-block; border: 1px solid #b6bac0; border-radius: 999pt; padding: 0.5pt 6pt; font-size: 7.6pt; color: #131416; background: #fff; vertical-align: middle; }}
.cmeta a {{ color: #3a3d42; text-decoration: underline; }}
.fignum {{ font-size: 9.2pt; font-weight: 700; margin-bottom: 4pt; color: #1a1a1a; }}

/* content pages: header trace top-right with badge, footer trace bottom-left */
.hdr {{ position: absolute; top: -0.02in; right: -0.12in; width: 4.9in; }}
.badge {{ position: absolute; top: 0.13in; right: 0.5in; height: 0.36in; }}
.ftr {{ position: absolute; bottom: -0.1in; left: -0.18in; width: 4.9in; }}
.pageno {{ position: absolute; bottom: 0.72in; right: 0.75in; font-size: 10pt; color: #1a1a1a; }}
.content {{ position: absolute; top: 1.0in; left: 0.75in; right: 0.75in; bottom: 0.95in; }}

.doc-title {{ font-size: 17.5pt; font-weight: 700; line-height: 1.25; color: #1a1a1a; }}
.doc-meta {{ font-size: 9.5pt; color: #555; margin-top: 5pt; }}
.doc-meta b {{ color: #1a1a1a; font-weight: 600; }}
h2 {{ font-size: 12.5pt; font-weight: 700; margin: 10pt 0 4pt; color: #1a1a1a; }}
p {{ font-size: 10.5pt; line-height: 1.42; color: #1a1a1a; margin-bottom: 5pt; }}
p.callout {{ font-size: 10.5pt; font-weight: 700; line-height: 1.4; margin: 5pt 0 6pt; }}
ul {{ margin: 0 0 6pt 0; padding-left: 18pt; }}
li {{ font-size: 10.2pt; line-height: 1.42; margin-bottom: 3.5pt; }}
li b {{ font-weight: 700; }}
figure {{ margin: 7pt 0 6pt; }}
figcaption {{ font-size: 8.5pt; color: #444; line-height: 1.38; margin-top: 5pt; }}
figcaption b {{ font-weight: 700; color: #1a1a1a; }}
a {{ color: #0563c1; text-decoration: none; }}
.small {{ font-size: 8.5pt; color: #444; line-height: 1.4; }}
"""


def kpi_tiles(sc: dict, notes: dict, first: bool) -> str:
    style = "" if first else ' style="margin-top:0"'
    return f"""
    <div class="kpis"{style}>
      <div class="kpi"><div class="v">${sc['revenue'] / B:.1f}B</div><div class="l">Revenue per GW-year</div><div class="s">{notes['revenue']}</div></div>
      <div class="kpi"><div class="v">${sc['profit'] / B:.1f}B</div><div class="l">Profit per GW-year</div><div class="s">{sc['kpi_profit_note']} · <b>${sc['profit_per_chip_hr']:.2f}</b> per chip-hour</div></div>
      <div class="kpi"><div class="v">{sc['margin'] * 100:.1f}%</div><div class="l">Profit margin</div><div class="s">{notes['margin']}</div></div>
    </div>"""


def figure(n: int, sc: dict, chart: dict, logo_svg: str, plot_svg: str) -> str:
    return f"""
    <figure>
      <div class="fignum">Figure {n}</div>
      <div class="card">
        <div class="ctitle">{logo_svg}<span>{chart['title'].replace('&', '&amp;')}</span></div>
        <div class="cmeta"><b>Cost Tier:</b> {sc['cost_tier']}<span class="sep"></span><b>Utilization:</b> {chart['utilization']}<span class="sep"></span><b>Model License Fee Assumption:</b> {chart['license_fee']}<span class="sep"></span><b>Updated:</b> {chart['updated']}<span class="sep"></span><b>Source:</b> {chart['source']}</div>
        <div class="cmeta"><b>TCO $/chip/hr:</b> <span class="pill">{chart['sku']}: {sc['tco_badge']}</span><span class="sep"></span><a href="{chart['tco_source_href']}">Source: {chart['tco_source_title'].replace('&', '&amp;')} ↗</a></div>
        <div class="cmeta"><b>Selling Price per Million Tokens:</b> {chart['selling_prices']}</div>
        {plot_svg}
      </div>
      <figcaption>{sc['caption']}</figcaption>
    </figure>"""


def chrome(trace: str, badge: str) -> str:
    return f'<img class="hdr" src="data:image/png;base64,{trace}" alt=""><img class="badge" src="data:image/png;base64,{badge}" alt="SemiAnalysis">'


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    spec_path, out_dir = sys.argv[1], sys.argv[2]
    spec_dir = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path))
    scenarios = spec["scenarios"]
    if len(scenarios) != 2:
        sys.exit("this template lays out exactly two scenarios (one figure per page); edit build_pdf.py for another shape")

    fonts = "".join(
        f"@font-face{{font-family:'DM Sans';font-weight:{w};src:url(data:font/ttf;base64,{b64(os.path.join(FONT_DIR, f'DMSans-{n}.ttf'))}) format('truetype');}}"
        for n, w in [("Regular", 400), ("Medium", 500), ("SemiBold", 600), ("Bold", 700)]
    )
    mosaic, trace, badge = (b64(os.path.join(ASSETS, f"{n}.png")) for n in ("cover_mosaic", "trace", "badge"))
    chip = b64(resolve(spec_dir, spec["cover"]["hardware_image"]))
    logo = open(resolve(spec_dir, spec["chart"]["model_logo_svg"])).read().replace('height="1em"', 'height="18"').replace('width="1em"', 'width="18"')
    plots = [inline_svg(os.path.join(out_dir, f"chart-{sc['id']}-light.svg")) for sc in scenarios]
    notes = spec["kpi_notes"]
    a, b = scenarios

    cover = f"""
<div class="page cover">
  <div class="mosaic"></div>
  <img class="chip" src="data:image/png;base64,{chip}" alt="{spec['cover']['hardware_alt']}">
  <div class="titleblock">
    <h1>{spec['title']}<span>{spec['subtitle']}</span></h1>
    <div class="pub">{spec['publisher_line']}</div>
  </div>
</div>"""

    summary = "".join(f"<p>{p}</p>" for p in spec["summary"])
    page1 = f"""
<div class="page">
  {chrome(trace, badge)}
  <div class="content">
    <div class="doc-title">{spec['title']}</div>
    <div class="doc-meta"><b>{spec['subtitle']}</b> · {spec['meta_line']}</div>
    <h2>Summary</h2>
    {summary}
    <p class="callout">{spec['callout']}</p>
    {kpi_tiles(a, notes, True)}
    {figure(1, a, spec['chart'], logo, plots[0])}
  </div>
  <img class="ftr" src="data:image/png;base64,{trace}" alt="">
  <div class="pageno">Page 1</div>
</div>"""

    method = "".join(f"<li>{m}</li>" for m in spec["method"])
    sources = " · ".join(f'<a href="{s["href"]}">{s["label"]}</a>' for s in spec["sources"])
    page2 = f"""
<div class="page">
  {chrome(trace, badge)}
  <div class="content">
    {kpi_tiles(b, notes, False)}
    {figure(2, b, spec['chart'], logo, plots[1])}
    <h2>{spec['method_heading']}</h2>
    <ul>{method}</ul>
    <p class="small"><b>Sources:</b> {sources}. {spec['footnote']}</p>
  </div>
  <img class="ftr" src="data:image/png;base64,{trace}" alt="">
  <div class="pageno">Page 2</div>
</div>"""

    html = f"<!doctype html><html><head><meta charset='utf-8'><title>{spec['title']}</title><style>{css(fonts, mosaic)}</style></head><body>{cover}{page1}{page2}</body></html>"
    out = os.path.join(out_dir, "paper.html")
    open(out, "w").write(html)
    print(out)


if __name__ == "__main__":
    main()
