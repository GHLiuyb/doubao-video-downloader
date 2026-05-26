# 豆包视频下载器

> Edge 浏览器插件，一键下载豆包（doubao.com）生成的**无水印**视频。

![Version](https://img.shields.io/badge/version-2.0.2-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 功能特点

- 🎬 **无水印下载** — 通过调用豆包内部 API 获取原始视频地址
- 🔘 **页面内下载按钮** — 视频旁边自动显示「无水印下载」按钮
- 📋 **弹窗管理** — 点击插件图标查看所有检测到的视频
- 📝 **内置日志** — 实时记录运行日志，支持导出排查问题
- 🔄 **手动扫描** — 支持手动重新扫描页面提取视频
- 📥 **降级下载** — 多种下载策略确保下载成功

## 📦 安装

### 开发者模式安装（推荐）

1. 打开 Edge 浏览器，地址栏输入 `edge://extensions/`
2. 右下角开启「**开发人员模式**」
3. 点击「**加载解压缩的扩展**」
4. 选择本项目根目录（包含 `manifest.json` 的文件夹）
5. 工具栏出现插件图标即安装成功

> ⚠️ 如果是从旧版升级，请先**移除旧版**再重新加载，否则权限可能不生效。

## 🚀 使用方法

1. 打开 [豆包网页版](https://www.doubao.com/chat/)
2. 在对话中让豆包生成视频
3. 视频生成后，旁边会出现紫色「**无水印下载**」按钮，点击即可下载
4. 也可以点击工具栏插件图标，在弹窗中管理视频

### 手动扫描

如果打开已有视频的对话页面没有检测到视频：
- 点击插件图标 → 「**🔄 重新扫描**」按钮

### 查看日志

- 点击插件图标 → 切换到「**📋 日志**」标签
- 支持「**💾 导出日志**」保存为文件

## 🔧 工作原理

```
用户在豆包对话中生成视频
        ↓
插件拦截 Fetch/XHR 请求（/chat/completion、/im/chain/single）
        ↓
从 EventStream 数据中解析 creations → 提取 video.vid
        ↓
调用豆包内部 API: POST /samantha/media/get_play_info
        ↓
获取 original_media_info.main_url（无水印视频地址）
        ↓
在视频元素旁显示下载按钮 → 用户点击下载
```

> 兜底方案：如果拦截失败，会从页面 HTML 源码中用正则提取 vid。

## 📁 项目结构

```
doubao-video-downloader/
├── manifest.json      # 插件配置（Manifest V3）
├── background.js      # 后台服务（日志 + 下载辅助）
├── content.js         # 内容脚本（拦截请求 + 注入按钮）
├── logger.js          # 日志模块（chrome.storage.local）
├── styles.css         # 下载按钮样式
├── popup.html         # 弹窗界面（视频列表 + 日志面板）
├── popup.js           # 弹窗逻辑
├── icons/             # 插件图标
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── CHANGELOG.md       # 更新日志
└── README.md          # 说明文档
```

## ⚠️ 注意事项

- 本插件仅用于下载**自己生成**的视频，请遵守豆包平台的使用条款
- 所有视频 URL 仅在本地存储，不会上传到任何服务器
- 适用于 Edge / Chrome 浏览器（Manifest V3）

## ❓ 常见问题

<details>
<summary><b>下载的视频还有水印？</b></summary>

v2.0.0 起已重构为调用豆包内部 API 获取原始视频地址，正常情况下不会有水印。如果仍有问题，请导出日志反馈。
</details>

<details>
<summary><b>检测不到视频？</b></summary>

1. 确保已**卸载旧版**后重新加载插件
2. 尝试点击插件弹窗中的「🔄 重新扫描」
3. 如果仍不行，请导出日志反馈
</details>

<details>
<summary><b>下载失败？</b></summary>

插件内置了降级下载方案（fetch + Blob），即使 `chrome.downloads` API 不可用也能下载。如果持续失败，请导出日志。
</details>

## 📄 更新日志

### v2.0.2
- 新增页面源码正则扫描提取 vid（兜底方案）
- 新增「重新扫描」按钮
- 增加详细日志输出

### v2.0.1
- 修复 Fetch 拦截器行缓冲区处理问题
- 增加详细日志便于排查

### v2.0.0
- 完全重构：改为拦截聊天数据流 + 调用内部 API 获取无水印视频
- 移除 webRequest 权限依赖
- 新增日志系统

### v1.0.3
- 新增日志模块
- 新增弹窗日志面板

### v1.0.2
- 新增 chrome.downloads 降级下载方案

### v1.0.0
- 初始版本

## 🙏 致谢

- [doubao-nomark](https://github.com/ihmily/doubao-nomark) — 无水印视频解析方案参考

## 📜 许可证

[MIT License](./LICENSE)

---

**免责声明**：本插件仅供学习研究使用，请遵守豆包平台的使用条款和相关法律法规。
