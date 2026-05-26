// 后台服务 - 日志 + 下载辅助
// v2.0.0 - 简化，核心逻辑移至 content.js

importScripts('logger.js');

const SRC = 'background';

// 检测 chrome.downloads API
let downloadsAvailable = false;
try {
  if (chrome.downloads && typeof chrome.downloads.download === 'function') {
    downloadsAvailable = true;
  }
} catch (e) { /* ignore */ }

Logger.info(SRC, '插件已启动 v2.0.0', { downloadsAvailable });

// 存储视频记录（用于 popup 展示）
let capturedVideos = new Map();

// 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id || request.tabId;

  switch (request.action) {
    case 'videoUrlCaptured':
      // content script 发现新视频
      if (tabId > 0) {
        if (!capturedVideos.has(tabId)) capturedVideos.set(tabId, []);
        const list = capturedVideos.get(tabId);
        if (!list.find(v => v.url === request.url)) {
          list.push({
            url: request.url,
            vid: request.vid || '',
            timestamp: Date.now()
          });
          Logger.info(SRC, '捕获无水印视频', { vid: request.vid, url: request.url });
        }
      }
      sendResponse({ success: true });
      break;

    case 'getCapturedVideos':
      sendResponse({ success: true, videos: capturedVideos.get(tabId) || [] });
      break;

    case 'downloadVideo':
      if (request.url && downloadsAvailable) {
        try {
          chrome.downloads.download({
            url: request.url,
            filename: `doubao_video_${Date.now()}.mp4`,
            saveAs: true
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              Logger.error(SRC, '下载失败', chrome.runtime.lastError.message);
              sendResponse({ success: false, fallback: true, error: chrome.runtime.lastError.message });
            } else {
              Logger.info(SRC, '下载成功', { downloadId });
              sendResponse({ success: true, downloadId });
            }
          });
          return true;
        } catch (e) {
          downloadsAvailable = false;
        }
      }
      // 降级：通知 content script
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { action: 'fallbackDownload', url: request.url })
          .then(() => sendResponse({ success: true, method: 'fallback' }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ success: false, error: '无法下载' });
      break;

    case 'clearVideos':
      capturedVideos.delete(tabId);
      sendResponse({ success: true });
      break;

    case 'getLogs':
      Logger.getLogs().then(logs => sendResponse({ success: true, logs }));
      return true;

    case 'clearLogs':
      Logger.clearLogs().then(() => sendResponse({ success: true }));
      return true;

    case 'exportLogs':
      Logger.exportAsText().then(text => sendResponse({ success: true, text }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return true;
});

chrome.tabs.onRemoved.addListener(tabId => capturedVideos.delete(tabId));

chrome.runtime.onInstalled.addListener(() => {
  Logger.info(SRC, '插件已安装 v2.0.0');
});
