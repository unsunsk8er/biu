/**
 * 托盘面板 HTML。
 *
 * 由主进程以 data: URL 载入，只通过 tray-preload.cjs 暴露的最小桥接与主进程通信。
 * 单独成文件，避免 main.ts 继续膨胀。
 */
export function getTrayHtml(accent: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <!-- 托盘面板是纯本地静态页：只允许自身的内联样式/脚本与封面图 -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-src 'none'" />
  <style>
    /* 深色为默认，body.light 切换为浅色，跟随 app 主题 */
    :root {
      --tray-accent: ${accent};
      --tray-menu-bg: #292c30;
      --tray-menu-border: #3b4045;
      --tray-menu-shadow: 0 8px 24px rgba(0, 0, 0, .38);
      --tray-text: #fcfcfc;
      --tray-now-bg: #202326;
      --tray-now-border: #3b4045;
      --tray-cover-fallback: #a1a9b1;
      --tray-meta-sub: #a1a9b1;
      --tray-status: #a1a9b1;
      --tray-btn-bg: #3a3f44;
      --tray-btn-bg-hover: #454b51;
      --tray-btn-text: #fcfcfc;
      --tray-actions-border: #3b4045;
      --tray-row-text: #c7cdd2;
      --tray-row-hover: #2f3941;
      --tray-count: #8f979f;
    }
    body.light {
      --tray-menu-bg: #fcfcfc;
      --tray-menu-border: #c9ced2;
      --tray-menu-shadow: 0 8px 24px rgba(0, 0, 0, .16);
      --tray-text: #232629;
      --tray-now-bg: #eff0f1;
      --tray-now-border: #c9ced2;
      --tray-cover-fallback: #7b838a;
      --tray-meta-sub: #5f666d;
      --tray-status: #5f666d;
      --tray-btn-bg: #eff0f1;
      --tray-btn-bg-hover: #d6e8f5;
      --tray-btn-text: #232629;
      --tray-actions-border: #c9ced2;
      --tray-row-text: #4b5157;
      --tray-row-hover: #d6e8f5;
      --tray-count: #7b838a;
    }
    * { box-sizing: border-box; user-select: none; }
    body {
      width: 330px;
      height: 292px;
      margin: 0;
      overflow: hidden;
      color: var(--tray-text);
      font-family: 'Noto Sans', 'Noto Sans CJK SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: transparent;
    }
    .menu {
      width: 100%;
      height: 100%;
      padding: 12px;
      border-radius: 6px;
      background: var(--tray-menu-bg);
      border: 1px solid var(--tray-menu-border);
      box-shadow: var(--tray-menu-shadow);
    }
    .now {
      display: flex;
      gap: 10px;
      align-items: center;
      min-height: 64px;
      padding: 8px;
      border-radius: 4px;
      background: var(--tray-now-bg);
      border: 1px solid var(--tray-now-border);
    }
    .cover {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      overflow: hidden;
      flex: 0 0 auto;
      border-radius: 3px;
      background: color-mix(in srgb, var(--tray-accent) 22%, var(--tray-now-bg));
      border: 1px solid var(--tray-now-border);
    }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: none; }
    .cover span { color: var(--tray-cover-fallback); font-size: 22px; }
    .meta { min-width: 0; flex: 1; }
    .meta strong, .meta small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta strong { font-size: 14px; line-height: 1.2; font-weight: 760; }
    .meta small { margin-top: 5px; color: var(--tray-meta-sub); font-size: 12px; font-weight: 560; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 10px 2px 8px;
      color: var(--tray-status);
      font-size: 11px;
      font-weight: 680;
    }
    .dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #8e8e93;
      box-shadow: 0 0 0 transparent;
    }
    .status.is-playing .dot {
      background: #30d158;
      box-shadow: 0 0 14px rgba(48,209,88,.65);
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr 1.25fr 1fr;
      gap: 8px;
      padding: 0 2px 10px;
    }
    button {
      height: 36px;
      border: 0;
      border-radius: 999px;
      color: var(--tray-btn-text);
      background: var(--tray-btn-bg);
      cursor: pointer;
      font: 780 13px/1 system-ui, sans-serif;
      transition: transform .16s ease, background .16s ease, opacity .16s ease;
    }
    button:hover { background: var(--tray-btn-bg-hover); transform: translateY(-1px); }
    button:active { transform: scale(.96); }
    button:disabled { opacity: .42; cursor: default; transform: none; }
    button svg { width: 18px; height: 18px; display: block; fill: currentColor; }
    .play svg { width: 20px; height: 20px; }
    .play {
      background: var(--tray-accent);
      color: #fff;
      box-shadow: none;
      font-size: 15px;
    }
    .play:hover { background: color-mix(in srgb, var(--tray-accent) 86%, #000); }
    .actions {
      display: grid;
      gap: 8px;
      border-top: 1px solid var(--tray-actions-border);
      padding-top: 9px;
    }
    .row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 13px;
      text-align: left;
      border-radius: 3px;
      background: transparent;
      color: var(--tray-row-text);
    }
    .row:hover { background: var(--tray-row-hover); }
    .row.danger { color: #da4453; }
    .count { color: var(--tray-count); font-size: 12px; }
  </style>
</head>
<body>
  <div class="menu">
    <div class="now">
      <div class="cover"><img id="cover" /><span id="fallback">♪</span></div>
      <div class="meta">
        <strong id="title">未在播放</strong>
        <small id="artist">搜索并播放音乐</small>
      </div>
    </div>
    <div id="status" class="status"><span class="dot"></span><span id="statusText">空闲</span></div>
    <div class="controls">
      <button id="prev" title="上一首" aria-label="上一首">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2.4v12H6zm12 0v12l-9.2-6z"/></svg>
      </button>
      <button id="play" class="play" title="播放/暂停" aria-label="播放/暂停">
        <svg id="playIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg>
        <svg id="pauseIcon" viewBox="0 0 24 24" aria-hidden="true" style="display:none"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>
      </button>
      <button id="next" title="下一首" aria-label="下一首">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 6H18v12h-2.4zM6 6l9.2 6L6 18z"/></svg>
      </button>
    </div>
    <div class="actions">
      <button class="row" id="show"><span>显示 biu</span><span class="count" id="queue">0 首</span></button>
      <button class="row danger" id="quit"><span>退出应用</span><span>${process.platform === 'darwin' ? '⌘Q' : 'Ctrl+Q'}</span></button>
    </div>
  </div>
  <script>
    const $ = (id) => document.getElementById(id)
    let state = { hasTrack: false, title: '未在播放', artist: '搜索并播放音乐', coverUrl: '', isPlaying: false, queueLength: 0, theme: 'dark' }
    function render(next) {
      state = next || state
      document.body.classList.toggle('light', (state.theme || 'dark') === 'light')
      $('title').textContent = state.title || '未在播放'
      $('artist').textContent = state.artist || '搜索并播放音乐'
      $('status').className = 'status' + (state.isPlaying ? ' is-playing' : '')
      $('statusText').textContent = state.hasTrack ? (state.isPlaying ? '正在播放' : '已暂停') : '空闲'
      $('playIcon').style.display = state.isPlaying ? 'none' : 'block'
      $('pauseIcon').style.display = state.isPlaying ? 'block' : 'none'
      $('queue').textContent = (state.queueLength || 0) + ' 首'
      $('prev').disabled = $('play').disabled = $('next').disabled = !state.hasTrack
      if (state.coverUrl) {
        $('cover').src = state.coverUrl
        $('cover').style.display = 'block'
        $('fallback').style.display = 'none'
      } else {
        $('cover').removeAttribute('src')
        $('cover').style.display = 'none'
        $('fallback').style.display = 'block'
      }
    }
    window.trayAPI.onState(render)
    window.trayAPI.getState().then(render)
    $('prev').onclick = () => window.trayAPI.command('prev')
    $('play').onclick = () => window.trayAPI.command('toggle-play')
    $('next').onclick = () => window.trayAPI.command('next')
    $('show').onclick = () => window.trayAPI.command('show-window')
    $('quit').onclick = () => window.trayAPI.command('quit')
  </script>
</body>
</html>`
}
