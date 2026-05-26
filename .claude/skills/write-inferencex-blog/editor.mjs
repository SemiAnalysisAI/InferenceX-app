#!/usr/bin/env node
// Browser-based MDX editor for InferenceX blog drafts.
// Usage: node .claude/skills/write-inferencex-blog/editor.mjs <path-to-mdx>
// Opens http://127.0.0.1:4747/ with CodeMirror on the left and live-rendered
// markdown on the right. Auto-saves to disk ~1s after the last keystroke.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const FILE = process.argv[2];
if (!FILE) {
  console.error('Usage: node editor.mjs <path-to-mdx>');
  process.exit(1);
}
const ABS = path.resolve(FILE);
const PORT = parseInt(process.env.MDX_EDITOR_PORT || '4747', 10);
const HOME = os.homedir();
const DISPLAY_PATH = ABS.startsWith(HOME) ? `~${ABS.slice(HOME.length)}` : ABS;
const FILE_NAME = path.basename(ABS);

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MDX Editor — ${FILE_NAME}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.css">
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/yaml-frontmatter/yaml-frontmatter.min.js"></script>
<style>
  html, body { height: 100%; margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
  .toolbar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; position: sticky; top: 0; z-index: 10; }
  .toolbar button { padding: 4px 12px; border: 1px solid #d0d7de; background: white; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .toolbar button:hover { background: #f3f4f6; }
  .toolbar .status { margin-left: auto; font-size: 12px; color: #57606a; min-width: 200px; text-align: right; }
  .toolbar .status.saved { color: #1a7f37; }
  .toolbar .status.saving { color: #bf8700; }
  .toolbar .status.dirty { color: #bf8700; }
  .toolbar .status.error { color: #cf222e; }
  .toolbar .filename { font-size: 12px; color: #57606a; font-family: ui-monospace, monospace; }
  .panes { display: grid; grid-template-columns: 1fr 1fr; height: calc(100vh - 41px); }
  .pane { overflow: auto; border-right: 1px solid #d0d7de; }
  .pane:last-child { border-right: none; }
  .CodeMirror { height: 100% !important; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  .markdown-body { padding: 32px; max-width: 900px; box-sizing: border-box; }
  .markdown-body table { display: table; width: 100%; }
  .markdown-body table th, .markdown-body table td { padding: 6px 13px; border: 1px solid #d0d7de; }
  .mdx-DashboardCTA, .mdx-Figure, .mdx-JsonLd { display: block; padding: 12px; margin: 12px 0; background: #fff8c5; border-left: 4px solid #d4a72c; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 12px; color: #57606a; word-break: break-all; }
  .mdx-DashboardCTA::before { content: "🔗 DashboardCTA → "; font-weight: bold; }
  .mdx-Figure::before { content: "🖼 Figure → "; font-weight: bold; }
  .mdx-JsonLd::before { content: "📋 JsonLd FAQ block (collapsed in preview)"; font-weight: bold; }
</style>
</head>
<body>
<div class="toolbar">
  <span class="filename">${DISPLAY_PATH}</span>
  <button id="reload">↻ Reload from disk</button>
  <button id="toggleLayout">⇄ Toggle layout</button>
  <span class="status" id="status">Loading…</span>
</div>
<div class="panes" id="panes">
  <div class="pane"><textarea id="src"></textarea></div>
  <div class="pane"><div class="markdown-body" id="preview"></div></div>
</div>
<script>
  const AUTOSAVE_MS = 800;
  let editor;
  let lastSaved = '';
  let pendingSave = null;
  let saving = false;
  const status = document.getElementById('status');
  function setStatus(text, cls) {
    status.textContent = text;
    status.className = 'status ' + (cls || '');
  }
  function renderPreview() {
    let mdx = editor.getValue();
    mdx = mdx.replace(/^---[\\s\\S]*?---/, '');
    mdx = mdx.replace(/<DashboardCTA[\\s\\S]*?<\\/DashboardCTA>/g, (m) => {
      const href = (m.match(/href="([^"]+)"/) || [, ''])[1];
      return '<div class="mdx-DashboardCTA">' + href + '</div>';
    });
    mdx = mdx.replace(/<Figure[\\s\\S]*?\\/>/g, (m) => {
      const src = (m.match(/srcLight="([^"]+)"/) || [, ''])[1];
      const cap = (m.match(/caption="([^"]+)"/) || [, ''])[1];
      return '<div class="mdx-Figure">' + src + (cap ? ' — ' + cap : '') + '</div>';
    });
    mdx = mdx.replace(/<JsonLd>[\\s\\S]*?<\\/JsonLd>/g, '<div class="mdx-JsonLd"></div>');
    document.getElementById('preview').innerHTML = marked.parse(mdx);
  }
  async function loadFile() {
    setStatus('Loading…');
    try {
      const r = await fetch('/api/load');
      if (!r.ok) throw new Error(await r.text());
      const text = await r.text();
      editor.setValue(text);
      lastSaved = text;
      setStatus('Loaded · ' + text.length + ' chars', 'saved');
      renderPreview();
    } catch (e) {
      setStatus('Load error: ' + e.message, 'error');
    }
  }
  async function doSave() {
    // If a save is already in flight, schedule another one so the latest
    // buffer doesn't get stranded. The in-flight save's finally{} block also
    // reschedules, but a Cmd+S during the network round-trip would otherwise
    // be silently dropped.
    if (saving) {
      scheduleSave();
      return;
    }
    const value = editor.getValue();
    if (value === lastSaved) {
      setStatus('Up to date · ' + new Date().toLocaleTimeString(), 'saved');
      return;
    }
    saving = true;
    setStatus('Auto-saving…', 'saving');
    try {
      const r = await fetch('/api/save', { method: 'POST', headers: {'Content-Type': 'text/plain; charset=utf-8'}, body: value });
      if (!r.ok) throw new Error(await r.text());
      lastSaved = value;
      setStatus('Saved · ' + new Date().toLocaleTimeString(), 'saved');
    } catch (e) {
      setStatus('Save error: ' + e.message, 'error');
    } finally {
      saving = false;
      // If more edits came in while saving, save again
      if (editor.getValue() !== lastSaved) {
        scheduleSave();
      }
    }
  }
  function scheduleSave() {
    clearTimeout(pendingSave);
    setStatus('Unsaved changes', 'dirty');
    pendingSave = setTimeout(doSave, AUTOSAVE_MS);
  }
  document.addEventListener('DOMContentLoaded', () => {
    editor = CodeMirror.fromTextArea(document.getElementById('src'), {
      mode: { name: 'yaml-frontmatter', base: 'markdown' },
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
    });
    let renderTimer;
    editor.on('change', () => {
      scheduleSave();
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderPreview, 200);
    });
    document.getElementById('reload').onclick = loadFile;
    document.getElementById('toggleLayout').onclick = () => {
      const p = document.getElementById('panes');
      p.style.gridTemplateColumns = p.style.gridTemplateColumns === '1fr' ? '1fr 1fr' : '1fr';
    };
    // Cmd/Ctrl-S triggers an immediate save instead of waiting for the debounce
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        clearTimeout(pendingSave);
        doSave();
      }
    });
    // Flush any pending edit on page hide / close
    window.addEventListener('beforeunload', () => {
      if (pendingSave) {
        clearTimeout(pendingSave);
        // best-effort sync save via sendBeacon
        navigator.sendBeacon('/api/save', new Blob([editor.getValue()], { type: 'text/plain' }));
      }
    });
    loadFile();
  });
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/load') {
      const text = await fs.readFile(ABS, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
    } else if (req.url === '/api/save' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      await fs.writeFile(ABS, body, 'utf8');
      res.writeHead(200);
      res.end('ok');
    } else if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  } catch (error) {
    res.writeHead(500);
    res.end(String(error.message || error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MDX editor: http://127.0.0.1:${PORT}`);
  console.log(`Editing:    ${DISPLAY_PATH}`);
});
