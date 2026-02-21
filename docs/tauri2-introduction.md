# Tauri 2 介紹

## 什麼是 Tauri？

[Tauri](https://v2.tauri.app/) 是一個用來建構桌面與行動應用程式的開源框架。它讓你用網頁技術（HTML/CSS/JS）寫前端，用 Rust 寫後端邏輯，打包成原生應用程式。

Tauri 2.0 於 2024 年 10 月正式釋出穩定版。

## Tauri vs Electron 核心差異

| | Tauri 2 | Electron |
|---|---|---|
| 後端語言 | Rust | Node.js |
| 渲染引擎 | 系統內建 WebView（不捆綁瀏覽器） | 捆綁整個 Chromium |
| 最小打包體積 | ~600KB | ~150MB+ |
| 記憶體佔用 | 低 | 高 |
| 行動端支援 | iOS / Android（Tauri 2 新增） | 不支援 |
| 安全模型 | 預設最小權限，capabilities 白名單 | 預設全開放 |

## Tauri 2 的重要新功能

- **行動端支援** — 同一份程式碼可以建構 iOS 和 Android 應用，用 Swift / Kotlin 寫原生擴充
- **Plugin 架構** — 核心功能模組化為 plugin（對話框、檔案系統、通知等），按需引入
- **強化安全模型** — 基於 capabilities 的權限系統，前端只能呼叫明確授權的 API
- **IPC 改進** — 前後端通訊更高效，支援更複雜的資料傳遞

## 知名的 Tauri 應用

以下是一些較知名或有代表性的 Tauri 應用：

| 應用 | 說明 |
|------|------|
| [Spacedrive](https://www.spacedrive.com/) | 跨平台檔案管理器，由 VDFS 虛擬分散式檔案系統驅動，星標數很高的開源專案 |
| [Clash Verge Rev](https://clashvergerev.com/) | 基於 Tauri 的 Clash Meta GUI 客戶端，在代理工具社群中非常流行 |
| [Aptabase](https://aptabase.com/) | 隱私優先的應用分析平台，自身也用 Tauri 建構 |
| [Yaak](https://yaak.app/) | REST / GraphQL / gRPC 請求管理工具（類似 Postman） |
| [MarkFlowy](https://github.com/nicepkg/markflowy) | 現代 Markdown 編輯器，內建 AI 擴充 |
| [CrabNebula DevTools](https://crabnebula.dev/) | Tauri 官方合作夥伴出品的除錯工具 |

目前 Tauri 生態仍在快速成長中。相比 Electron 已有 VS Code、Slack、Discord 等超大型應用，Tauri 的應用多集中在開發者工具、效率工具、小型桌面工具這類場景，但因為體積小、效能好，社群增長很快。

## 為什麼 Lyra Music 選 Tauri 2

對 Lyra Music 這種本地音樂播放器來說，Tauri 2 的優勢特別明顯：

- 播放器需要長時間背景運行，低記憶體佔用很重要
- 打包體積小，使用者不需要為了一個播放器下載 150MB+
- Rust 後端天然適合處理音訊解碼、檔案 I/O 這些效能敏感的工作
- 系統匣、原生對話框等功能透過 Tauri plugin 直接支援

## 參考資料

- [Tauri 2.0 官方網站](https://v2.tauri.app/)
- [Tauri 2.0 Stable Release 公告](https://v2.tauri.app/blog/tauri-20/)
- [Tauri GitHub](https://github.com/tauri-apps/tauri)
- [Awesome Tauri - 應用列表](https://github.com/tauri-apps/awesome-tauri)
- [Made with Tauri](https://madewithtauri.com/)
- [Aptabase - Why Tauri instead of Electron](https://aptabase.com/blog/why-chose-to-build-on-tauri-instead-electron)
