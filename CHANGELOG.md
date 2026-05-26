# 豆包视频下载器 - 错误日志与分析

## 版本: v1.0.1 → v1.0.2

---

## 错误记录 #1 (用户反馈)
- **时间**: 2026-05-26
- **错误信息**: `TypeError: Cannot read properties of undefined (reading 'download')`
- **位置**: `background.js:137` → `chrome.downloads.download(...)` 调用处
- **页面**: `https://www.doubao.com/chat/38427242042539778`
- **堆栈**: `content.js:60` → 发送 `downloadVideo` 消息到 background → background 调用 `chrome.downloads.download` 失败

## 根因分析

### 直接原因
`chrome.downloads` API 在 Service Worker 中为 `undefined`。

### 可能原因排查

| # | 可能原因 | 可能性 | 说明 |
|---|---------|--------|------|
| 1 | manifest.json 权限未生效 | ⭐⭐⭐ 高 | 修改权限后仅"重新加载"插件，Edge 可能未重新注册权限 |
| 2 | Edge 策略限制 downloads API | ⭐⭐ 中 | 某些企业/教育版 Edge 可能通过策略禁用 downloads API |
| 3 | Service Worker 中 chrome.downloads 不可用 | ⭐ 低 | MV3 规范中 Service Worker 应支持 downloads API |

### 最可能原因: #1
Manifest V3 中，修改 `permissions` 后需要**完全卸载旧插件 → 重新加载**，仅点击"重新加载"按钮可能不会重新注册新的权限。

## 修复方案 (v1.0.2)

### 方案: 双重下载策略
1. **优先使用 chrome.downloads API**（如果可用）
2. **降级方案**: 如果 `chrome.downloads` 不可用，background 将视频 URL 返回给 content script，由 content script 通过 `<a>` 标签 + `fetch` + Blob 方式下载

### 代码改动
- `background.js`: 添加 `chrome.downloads` 可用性检测，不可用时返回 URL 让 content script 处理
- `content.js`: 添加降级下载逻辑（fetch → Blob → 创建下载链接）

---

## 错误记录 #2 (首次修复后)
- **时间**: 2026-05-26
- **错误信息**: 同上，`chrome.downloads` 仍为 undefined
- **结论**: 确认 #1 原因，权限未生效。需要卸载重装 + 增加降级方案

---

## 操作建议
1. **先卸载旧版插件**（在 edge://extensions/ 中点击"移除"）
2. **重新加载新版插件**（点击"加载解压缩的扩展"）
3. 如果仍有问题，降级方案会自动生效
