/**
 * 豆包视频下载器 - 日志模块
 * 使用 chrome.storage.local 存储日志，支持导出
 */

const Logger = {
  STORAGE_KEY: 'doubao_downloader_logs',
  MAX_LOGS: 500, // 最多保留500条日志

  // 日志级别
  LEVELS: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
  },

  /**
   * 写入一条日志
   * @param {string} level - 日志级别
   * @param {string} source - 来源 (background/content/popup)
   * @param {string} message - 日志消息
   * @param {object} [detail] - 可选的详细信息
   */
  async log(level, source, message, detail) {
    const entry = {
      time: new Date().toISOString(),
      level: level,
      source: source,
      message: message,
      detail: detail || null
    };

    // 同时输出到控制台
    const prefix = `[豆包视频下载器][${source}]`;
    switch (level) {
      case 'ERROR':
        console.error(prefix, message, detail || '');
        break;
      case 'WARN':
        console.warn(prefix, message, detail || '');
        break;
      case 'DEBUG':
        console.debug(prefix, message, detail || '');
        break;
      default:
        console.log(prefix, message, detail || '');
    }

    // 存储到 chrome.storage.local
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      let logs = result[this.STORAGE_KEY] || [];

      logs.push(entry);

      // 限制日志数量
      if (logs.length > this.MAX_LOGS) {
        logs = logs.slice(-this.MAX_LOGS);
      }

      await chrome.storage.local.set({ [this.STORAGE_KEY]: logs });
    } catch (e) {
      // storage 不可用时静默失败
      console.warn('[日志模块] 写入失败:', e.message);
    }
  },

  info(source, message, detail) {
    return this.log(this.LEVELS.INFO, source, message, detail);
  },

  warn(source, message, detail) {
    return this.log(this.LEVELS.WARN, source, message, detail);
  },

  error(source, message, detail) {
    return this.log(this.LEVELS.ERROR, source, message, detail);
  },

  debug(source, message, detail) {
    return this.log(this.LEVELS.DEBUG, source, message, detail);
  },

  /**
   * 读取所有日志
   * @returns {Promise<Array>}
   */
  async getLogs() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || [];
    } catch (e) {
      console.error('[日志模块] 读取失败:', e.message);
      return [];
    }
  },

  /**
   * 清空日志
   */
  async clearLogs() {
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: [] });
    } catch (e) {
      console.error('[日志模块] 清空失败:', e.message);
    }
  },

  /**
   * 导出日志为文本格式（用于保存为文件）
   * @returns {Promise<string>}
   */
  async exportAsText() {
    const logs = await this.getLogs();
    let text = '=== 豆包视频下载器 - 运行日志 ===\n';
    text += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
    text += `日志条数: ${logs.length}\n`;
    text += '='.repeat(50) + '\n\n';

    logs.forEach(entry => {
      text += `[${entry.time}] [${entry.level}] [${entry.source}] ${entry.message}`;
      if (entry.detail) {
        if (typeof entry.detail === 'string') {
          text += ` | ${entry.detail}`;
        } else {
          text += ` | ${JSON.stringify(entry.detail)}`;
        }
      }
      text += '\n';
    });

    return text;
  }
};

// content script 环境下挂载到 window，方便跨脚本共享
if (typeof window !== 'undefined') {
  window.__DoubaoLogger = Logger;
}
