// 内容脚本 - 拦截聊天数据流，提取视频ID，调用API获取无水印视频
// v2.0.1 - 修复视频识别问题，增加详细日志

(function() {
  'use strict';

  const SRC = 'content';
  const log = window.__DoubaoLogger || {
    info: (s, m, d) => console.log(`[豆包][${s}]`, m, d || ''),
    warn: (s, m, d) => console.warn(`[豆包][${s}]`, m, d || ''),
    error: (s, m, d) => console.error(`[豆包][${s}]`, m, d || ''),
    debug: (s, m, d) => console.debug(`[豆包][${s}]`, m, d || ''),
  };

  log.info(SRC, '内容脚本已加载 v2.0.1');
  log.info(SRC, '当前页面URL', window.location.href);

  // 存储检测到的无水印视频信息
  let videoList = []; // [{vid, url, width, height, definition, poster_url}]
  let videoObserver = null;

  // ==================== 核心：获取无水印视频信息 ====================

  async function getDoubaoVideoInfo(vid) {
    if (!vid) {
      log.warn(SRC, 'getDoubaoVideoInfo: vid 为空');
      return null;
    }

    const params = {
      version_code: '20800',
      language: 'zh-CN',
      device_platform: 'web',
      aid: '497858',
      real_aid: '497858',
      pkg_type: 'release_version',
      device_id: '',
      pc_version: '2.51.7',
      region: '',
      sys_region: '',
      samantha_web: '1',
      'use-olympus-account': '1',
      web_tab_id: '',
    };

    const queryString = new URLSearchParams(params).toString();
    const apiUrl = `https://www.doubao.com/samantha/media/get_play_info?${queryString}`;

    try {
      log.info(SRC, '请求无水印视频API', { vid, apiUrl });

      const response = await fetch(apiUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'origin': 'https://www.doubao.com',
        },
        body: JSON.stringify({ key: vid }),
      });

      const result = await response.json();

      if (!result || !result.data) {
        log.warn(SRC, 'API返回数据异常', result);
        return null;
      }

      const originalMediaInfo = result.data.original_media_info || {};
      const meta = originalMediaInfo.meta || {};

      const videoInfo = {
        vid: vid,
        width: meta.width || 0,
        height: meta.height || 0,
        definition: meta.definition || '',
        duration: meta.duration || 0,
        poster_url: result.data.poster_url || '',
        url: originalMediaInfo.main_url || '',
      };

      log.info(SRC, '获取无水印视频成功', { vid, url: videoInfo.url, definition: videoInfo.definition });
      return videoInfo;
    } catch (e) {
      log.error(SRC, '获取视频播放信息失败', { vid, error: e.message });
      return null;
    }
  }

  // ==================== 解析聊天数据流中的视频ID ====================

  function addVideoInfo(videoInfo) {
    if (!videoInfo || !videoInfo.url) {
      log.warn(SRC, 'addVideoInfo: 视频信息无效', videoInfo);
      return;
    }
    if (videoList.find(v => v.vid === videoInfo.vid || v.url === videoInfo.url)) {
      log.info(SRC, '视频已存在，跳过', { vid: videoInfo.vid });
      return;
    }
    videoList.push(videoInfo);
    log.info(SRC, '新增无水印视频', { vid: videoInfo.vid, url: videoInfo.url, total: videoList.length });
    addDownloadButtons();
    chrome.runtime.sendMessage({
      action: 'videoUrlCaptured',
      url: videoInfo.url,
      vid: videoInfo.vid
    }).catch(() => {});
  }

  // 从 creations 数组中提取视频和图片
  function parseCreations(creations) {
    if (!Array.isArray(creations)) {
      log.warn(SRC, 'parseCreations: creations 不是数组', creations);
      return;
    }

    log.info(SRC, '解析 creations', { count: creations.length });

    for (const creation of creations) {
      log.debug(SRC, '检查 creation', { type: typeof creation, hasVideo: !!creation?.video });

      if (creation?.video) {
        const vid = creation.video.vid;
        if (vid) {
          log.info(SRC, '从聊天流中提取到视频ID', { vid, videoObj: creation.video });
          getDoubaoVideoInfo(vid).then(info => {
            if (info) addVideoInfo(info);
            else log.warn(SRC, 'getDoubaoVideoInfo 返回空', { vid });
          });
        } else {
          log.warn(SRC, 'creation.video 存在但 vid 为空', creation.video);
        }
      }
    }
  }

  // 解析 StreamChunk（EventStream 格式的聊天数据）
  function parseStreamChunk(data) {
    try {
      log.debug(SRC, 'parseStreamChunk 被调用', { hasEventData: !!data.event_data, hasPatchOp: !!data.patch_op });

      if (!data.event_data && !data.patch_op) {
        log.debug(SRC, '数据不包含 event_data 或 patch_op，跳过');
        return;
      }

      let creations = [];

      if (data.patch_op) {
        log.info(SRC, '解析 patch_op 格式数据');

        for (const op of data.patch_op) {
          if (op.patch_value && Array.isArray(op.patch_value.content_block)) {
            for (const block of op.patch_value.content_block) {
              if (block?.content?.creation_block && Array.isArray(block.content.creation_block.creations)) {
                creations = block.content.creation_block.creations;
                log.info(SRC, '从 patch_op.content_block 找到 creations', { count: creations.length });
                break;
              }
            }
          }
        }

        // 尝试从 ext.creation_full_content 解析
        if (creations.length === 0) {
          const extPatch = data.patch_op.find(op =>
            op.patch_value && typeof op.patch_value === 'object' &&
            op.patch_value.ext?.creation_full_content
          );
          if (extPatch) {
            try {
              const parsed = JSON.parse(extPatch.patch_value.ext.creation_full_content);
              for (const item of parsed) {
                const content = item?.BlockInfo?.BlockContent?.content;
                if (content?.creation_block?.creations) {
                  creations = content.creation_block.creations;
                  log.info(SRC, '从 creation_full_content 找到 creations', { count: creations.length });
                  break;
                }
              }
            } catch (e) {
              log.warn(SRC, '解析 creation_full_content 失败', e.message);
            }
          }
        }
      } else {
        log.info(SRC, '解析 event_data 格式数据');
        let eventData;
        try {
          eventData = JSON.parse(data.event_data);
        } catch (e) {
          log.warn(SRC, '解析 event_data JSON 失败', e.message);
          return;
        }

        if (!eventData.message?.content) {
          log.debug(SRC, 'eventData.message.content 不存在');
          return;
        }

        let messageContent;
        try {
          messageContent = JSON.parse(eventData.message.content);
        } catch (e) {
          log.warn(SRC, '解析 message.content JSON 失败', e.message);
          return;
        }

        if (messageContent.creations) {
          creations = messageContent.creations;
          log.info(SRC, '从 message.content 找到 creations', { count: creations.length });
        }
      }

      parseCreations(creations);
    } catch (e) {
      log.error(SRC, '解析 StreamChunk 失败', { error: e.message, stack: e.stack });
    }
  }

  // 解析聊天历史消息（XHR 响应格式）
  function parseChatHistoryMessages(messages) {
    if (!Array.isArray(messages)) {
      log.warn(SRC, 'parseChatHistoryMessages: messages 不是数组');
      return;
    }

    log.info(SRC, '解析聊天历史消息', { count: messages.length });

    for (const item of messages) {
      try {
        for (const content of (item.content_block || [])) {
          const creationBlock = content.content?.creation_block;
          if (creationBlock?.creations) {
            log.info(SRC, '从聊天历史找到 creations');
            parseCreations(creationBlock.creations);
          }
        }
      } catch (e) {
        log.debug(SRC, '解析单条消息失败', e.message);
      }
    }
  }

  // 从分享页面提取视频
  function extractSharePageVideos() {
    try {
      const scriptElement = document.querySelector('script[data-script-src="modern-run-router-data-fn"]');
      if (!scriptElement) {
        log.debug(SRC, '未找到 modern-run-router-data-fn 脚本');
        return;
      }

      const dataFnArgs = scriptElement.getAttribute('data-fn-args');
      if (!dataFnArgs) {
        log.debug(SRC, 'data-fn-args 属性为空');
        return;
      }

      const jsonStr = dataFnArgs.replace(/&quot;/g, '"');
      const jsonData = JSON.parse(jsonStr);

      for (const data of jsonData) {
        if (data?.data?.message_snapshot?.message_list) {
          for (const message of data.data.message_snapshot.message_list) {
            for (const block of (message.content_block || [])) {
              try {
                const contentData = JSON.parse(block.content_v2);
                if (contentData.creation_block?.creations) {
                  log.info(SRC, '从分享页找到 creations');
                  parseCreations(contentData.creation_block.creations);
                }
              } catch (e) { /* continue */ }
            }
          }
        }
      }
    } catch (e) {
      log.error(SRC, '提取分享页视频失败', e.message);
    }
  }

  // ==================== 兜底：从页面源码正则提取 vid ====================

  function scanPageForVids() {
    log.info(SRC, '开始扫描页面源码提取 vid');

    // 方法1：从所有 script 标签的内容中提取
    const scripts = document.querySelectorAll('script');
    let foundVids = [];

    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text.includes('vid')) continue;

      // 匹配各种 vid 格式
      const patterns = [
        /"vid"\s*:\s*"([^"]+)"/g,
        /'vid'\s*:\s*'([^']+)'/g,
        /vid\\?\s*:\\?\s*"?([^"\\,\s}]+)"?/g,
        /&quot;vid&quot;:&quot;([^&]+)&quot/g,
        /\\&quot;vid\\&quot;:\\&quot;([^\\&]+)\\&quot/g,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const vid = match[1];
          if (vid && vid.startsWith('v0') && !foundVids.includes(vid)) {
            foundVids.push(vid);
          }
        }
      }
    }

    // 方法2：从整个 HTML 源码中提取（处理转义的 JSON）
    const htmlStr = document.documentElement.innerHTML;
    const htmlPatterns = [
      /\\&quot;vid\\&quot;:\\&quot;(.*?)\\&quot/g,
      /&quot;vid&quot;:&quot;(.*?)&quot/g,
      /"vid":"(v0[^"]+)"/g,
    ];

    for (const pattern of htmlPatterns) {
      let match;
      while ((match = pattern.exec(htmlStr)) !== null) {
        const vid = match[1];
        if (vid && vid.startsWith('v0') && !foundVids.includes(vid)) {
          foundVids.push(vid);
        }
      }
    }

    // 方法3：从 __NEXT_DATA__ 或类似的全局数据中提取
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) {
      try {
        const data = JSON.parse(nextData.textContent);
        const jsonStr = JSON.stringify(data);
        const vidMatches = jsonStr.match(/"vid":"(v0[^"]+)"/g);
        if (vidMatches) {
          for (const m of vidMatches) {
            const vid = m.match(/"vid":"(v0[^"]+)"/)[1];
            if (vid && !foundVids.includes(vid)) {
              foundVids.push(vid);
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    log.info(SRC, '页面扫描结果', { foundVids, count: foundVids.length });

    // 为每个找到的 vid 获取无水印视频信息
    for (const vid of foundVids) {
      getDoubaoVideoInfo(vid).then(info => {
        if (info) addVideoInfo(info);
      });
    }

    return foundVids;
  }

  // ==================== 拦截网络请求 ====================

  // 拦截 XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._url;
    this.addEventListener('load', function() {
      if (url && url.includes('/im/chain/single')) {
        log.info(SRC, 'XHR: 拦截到 /im/chain/single 请求');
        try {
          const data = JSON.parse(this.responseText);
          const messages = data?.downlink_body?.pull_singe_chain_downlink_body?.messages;
          if (messages) {
            log.info(SRC, 'XHR: 解析到消息', { count: messages.length });
            parseChatHistoryMessages(messages);
          } else {
            log.debug(SRC, 'XHR: 响应中没有 messages');
          }
        } catch (e) {
          log.error(SRC, 'XHR 解析聊天数据失败', e.message);
        }
      }
    });
    return originalXHRSend.apply(this, args);
  };

  log.info(SRC, 'XHR 拦截已安装');

  // 拦截 Fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];

    // 检查是否是豆包聊天请求
    if (url && typeof url === 'string' && url.includes('/chat/completion')) {
      log.info(SRC, 'Fetch: 检测到 /chat/completion 请求', { url });

      try {
        const response = await originalFetch.apply(this, args);

        // 检查是否是 EventStream
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('event-stream')) {
          log.debug(SRC, '响应不是 event-stream，跳过拦截', { contentType });
          return response;
        }

        log.info(SRC, '确认是 EventStream，开始拦截数据');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            let lineBuffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              lineBuffer += chunk;

              const lines = lineBuffer.split('\n');
              lineBuffer = lines.pop(); // 保留未完成的行

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.substring(6).trim();
                  if (!jsonStr) continue;

                  // 关键：检查是否包含视频/图片相关字段
                  if (jsonStr.includes('video') || jsonStr.includes('creation') || jsonStr.includes('patch_op')) {
                    try {
                      const data = JSON.parse(jsonStr);
                      log.debug(SRC, '解析到 data 行', { hasEventData: !!data.event_data, hasPatchOp: !!data.patch_op });
                      parseStreamChunk(data);
                    } catch (e) {
                      log.debug(SRC, 'JSON 解析失败', { error: e.message, jsonStr: jsonStr.substring(0, 100) });
                    }
                  }
                }
              }

              controller.enqueue(value);
            }

            // 处理最后剩余的数据
            if (lineBuffer.trim()) {
              const line = lineBuffer.trim();
              if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6).trim();
                if (jsonStr && (jsonStr.includes('video') || jsonStr.includes('creation'))) {
                  try {
                    const data = JSON.parse(jsonStr);
                    parseStreamChunk(data);
                  } catch (e) { /* ignore */ }
                }
              }
            }

            controller.close();
          }
        });

        return new Response(stream, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText
        });
      } catch (err) {
        log.error(SRC, 'Fetch 拦截失败', { error: err.message });
        return originalFetch.apply(this, args);
      }
    }

    return originalFetch.apply(this, args);
  };

  log.info(SRC, 'Fetch 拦截已安装');

  // ==================== 下载功能 ====================

  async function downloadVideo(url, filename) {
    log.info(SRC, '开始下载视频', { url, filename });
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || `doubao_video_${Date.now()}.mp4`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      }, 1000);

      log.info(SRC, '视频下载成功', { filename });
      return true;
    } catch (err) {
      log.error(SRC, '视频下载失败', { error: err.message });
      window.open(url, '_blank');
      return false;
    }
  }

  // ==================== 下载按钮 UI ====================

  function createDownloadButton(videoInfo) {
    const button = document.createElement('button');
    button.className = 'doubao-video-download-btn';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>无水印下载</span>
    `;
    button.title = `下载无水印视频 (${videoInfo.definition || '未知清晰度'})`;
    button.dataset.vid = videoInfo.vid;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        button.classList.add('downloading');
        button.innerHTML = '<span>下载中...</span>';

        log.info(SRC, '用户点击下载', { vid: videoInfo.vid, url: videoInfo.url });

        const filename = `doubao_${videoInfo.definition || 'video'}_${videoInfo.vid}_${Date.now()}.mp4`;
        const success = await downloadVideo(videoInfo.url, filename);

        button.classList.remove('downloading');
        button.classList.add(success ? 'success' : 'error');
        button.innerHTML = success ? '<span>✓ 已下载</span>' : '<span>✗ 失败</span>';

        setTimeout(() => {
          button.classList.remove('success', 'error');
          button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>无水印下载</span>
          `;
        }, 2000);
      } catch (error) {
        log.error(SRC, '下载异常', { error: error.message });
        button.classList.remove('downloading');
        button.classList.add('error');
        button.innerHTML = '<span>✗ 失败</span>';
        setTimeout(() => {
          button.classList.remove('error');
          button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>无水印下载</span>
          `;
        }, 2000);
      }
    });

    return button;
  }

  // 在视频元素旁边添加下载按钮
  function addDownloadButtons() {
    const videos = document.querySelectorAll('video');
    if (videos.length === 0) return;

    log.debug(SRC, '检查视频元素', { count: videos.length, videoListCount: videoList.length });

    videos.forEach((video, index) => {
      const parent = video.closest('[class*="video"], [class*="player"]') || video.parentElement;
      if (!parent || parent.querySelector('.doubao-video-download-btn')) return;

      // 为每个视频元素匹配对应的视频信息
      const videoInfo = videoList[index] || videoList[videoList.length - 1];
      if (!videoInfo) {
        log.debug(SRC, '没有匹配的视频信息', { index });
        return;
      }

      const button = createDownloadButton(videoInfo);
      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(button);
      log.info(SRC, '已添加无水印下载按钮', { vid: videoInfo.vid, index });
    });
  }

  // ==================== 监听来自 background 的消息 ====================

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log.debug(SRC, '收到消息', { action: request.action });

    if (request.action === 'fallbackDownload') {
      downloadVideo(request.url).then(success => {
        sendResponse({ success: success });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (request.action === 'getVideoList') {
      sendResponse({ success: true, videos: videoList });
      return true;
    }

    if (request.action === 'rescanPage') {
      log.info(SRC, '收到手动重新扫描请求');
      const vids = scanPageForVids();
      sendResponse({ success: true, vids: vids, videoList: videoList });
      return true;
    }

    sendResponse({ success: true });
    return true;
  });

  // ==================== 初始化 ====================

  function init() {
    log.info(SRC, '初始化');

    // 兜底方案：扫描页面源码提取已有的 vid
    setTimeout(scanPageForVids, 1500);

    // 如果是分享页面，尝试从页面数据中提取视频
    if (window.location.pathname.includes('/thread/') || window.location.pathname.includes('/share/')) {
      log.info(SRC, '检测到分享页面，尝试提取视频');
      setTimeout(extractSharePageVideos, 1000);
    }

    // 监听 DOM 变化
    videoObserver = new MutationObserver((mutations) => {
      let hasVideo = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
              hasVideo = true;
              break;
            }
          }
        }
        if (hasVideo) break;
      }
      if (hasVideo) {
        log.debug(SRC, 'DOM 变化检测到视频元素');
        addDownloadButtons();
      }
    });

    videoObserver.observe(document.body, { childList: true, subtree: true });

    // 定期检查
    setInterval(() => {
      if (videoList.length > 0) {
        addDownloadButtons();
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') addDownloadButtons();
  });

})();
