// 弹窗脚本 v1.0.3 - 支持视频列表 + 日志面板

document.addEventListener('DOMContentLoaded', async () => {
  // === Tab 切换 ===
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'logs') loadLogs();
    });
  });

  // === 视频面板 ===
  const videoItems = document.getElementById('video-items');
  const videoCount = document.getElementById('video-count');
  const errorBox = document.getElementById('error-box');

  function showError(msg) {
    errorBox.innerHTML = `<div class="error-msg">${msg}</div>`;
    setTimeout(() => { errorBox.innerHTML = ''; }, 5000);
  }

  function formatUrl(url) {
    try {
      const p = new URL(url).pathname;
      const f = p.split('/').pop() || 'video';
      return f.length > 30 ? f.substring(0, 30) + '...' : f;
    } catch { return url.length > 40 ? url.substring(0, 40) + '...' : url; }
  }

  function formatTime(ts) {
    const d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return `${Math.floor(d / 60000)}分钟前`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}小时前`;
    return new Date(ts).toLocaleDateString('zh-CN');
  }

  function renderVideos(videos) {
    if (!videos || videos.length === 0) {
      videoItems.innerHTML = '<div class="empty-state">暂无检测到的视频<br>请在豆包页面生成视频</div>';
      videoCount.textContent = '0';
      return;
    }
    const sorted = [...videos].sort((a, b) => b.timestamp - a.timestamp);
    videoItems.innerHTML = sorted.map(v => `
      <div class="video-item">
        <div class="video-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
        <div class="video-info">
          <div class="video-url" title="${v.url}">${formatUrl(v.url)}</div>
          <div class="video-time">${formatTime(v.timestamp)}</div>
        </div>
        <button class="dl-btn" data-url="${v.url}">下载</button>
      </div>
    `).join('');
    videoCount.textContent = videos.length.toString();

    videoItems.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const url = e.target.dataset.url;
        e.target.textContent = '...';
        e.target.disabled = true;
        try {
          const res = await chrome.runtime.sendMessage({ action: 'downloadVideo', url });
          if (res.success) {
            e.target.textContent = '✓';
            e.target.style.background = '#48bb78';
          } else {
            throw new Error(res.error || '下载失败');
          }
        } catch (err) {
          e.target.textContent = '✗';
          e.target.style.background = '#f56565';
          showError('下载失败: ' + err.message);
        }
        setTimeout(() => {
          e.target.textContent = '下载';
          e.target.style.background = '';
          e.target.disabled = false;
        }, 2000);
      });
    });
  }

  async function loadVideos() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const res = await chrome.runtime.sendMessage({ action: 'getCapturedVideos', tabId: tab.id });
      if (res.success) renderVideos(res.videos);
    } catch (err) {
      console.error('加载视频失败:', err);
    }
  }

  document.getElementById('clear-videos-btn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.runtime.sendMessage({ action: 'clearVideos', tabId: tab.id });
        renderVideos([]);
      }
    } catch (err) { showError('清除失败'); }
  });

  // 重新扫描页面
  document.getElementById('rescan-btn').addEventListener('click', async () => {
    try {
      const btn = document.getElementById('rescan-btn');
      btn.textContent = '扫描中...';
      btn.disabled = true;

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'rescanPage' });
        if (res?.success) {
          // 等待 API 请求完成后刷新列表
          setTimeout(async () => {
            await loadVideos();
            btn.textContent = '🔄 重新扫描';
            btn.disabled = false;
          }, 3000);
        } else {
          btn.textContent = '🔄 重新扫描';
          btn.disabled = false;
          showError('扫描失败');
        }
      }
    } catch (err) {
      showError('扫描失败: ' + err.message);
      document.getElementById('rescan-btn').textContent = '🔄 重新扫描';
      document.getElementById('rescan-btn').disabled = false;
    }
  });

  // === 日志面板 ===
  const logContainer = document.getElementById('log-container');

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      logContainer.innerHTML = '<div class="log-empty">暂无日志</div>';
      return;
    }
    logContainer.innerHTML = logs.map(entry => {
      const time = entry.time.replace('T', ' ').substring(0, 19);
      const levelClass = 'level-' + entry.level.toLowerCase();
      let detail = '';
      if (entry.detail) {
        detail = typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail);
      }
      return `<div class="log-line"><span class="time">${time}</span> <span class="${levelClass}">[${entry.level}]</span> <span class="source">[${entry.source}]</span> ${entry.message}${detail ? ' ' + detail : ''}</div>`;
    }).join('');
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  async function loadLogs() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'getLogs' });
      if (res.success) renderLogs(res.logs);
    } catch (err) {
      logContainer.innerHTML = '<div class="log-empty">加载日志失败</div>';
    }
  }

  // 导出日志为文件
  document.getElementById('log-export-btn').addEventListener('click', async () => {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'exportLogs' });
      if (res.success) {
        const blob = new Blob([res.text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `doubao_video_downloader_log_${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      showError('导出失败: ' + err.message);
    }
  });

  // 复制日志到剪贴板
  document.getElementById('log-copy-btn').addEventListener('click', async () => {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'exportLogs' });
      if (res.success) {
        await navigator.clipboard.writeText(res.text);
        const btn = document.getElementById('log-copy-btn');
        btn.textContent = '✓ 已复制';
        setTimeout(() => { btn.textContent = '📋 复制日志'; }, 1500);
      }
    } catch (err) {
      showError('复制失败: ' + err.message);
    }
  });

  // 清空日志
  document.getElementById('log-clear-btn').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'clearLogs' });
      renderLogs([]);
    } catch (err) {
      showError('清空失败');
    }
  });

  // 初始化
  await loadVideos();
  setInterval(loadVideos, 2000);
});
