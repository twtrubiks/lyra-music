# 為什麼 Lyra Music 選擇 Rust

## 1. 零系統依賴的音訊引擎

專案使用 [rodio](https://github.com/RustAudio/rodio)（純 Rust 音訊庫）處理解碼和播放，不需要使用者安裝 GStreamer、MPV、FFmpeg 等系統音訊框架。打包出來就是一個獨立執行檔，部署極為簡單。

## 2. 效能與記憶體安全

- 音訊解碼、檔案遞迴掃描、SQLite 讀寫這些都是 CPU/IO 密集操作，Rust 的效能接近 C/C++，但有編譯期記憶體安全保證，不會出現 use-after-free、buffer overflow 等問題。
- Gapless playback（預先解碼下一首曲目）這類需要精確控制記憶體和時序的功能，Rust 的 ownership 模型非常適合。

## 3. Tauri 2 的原生搭配

Tauri 的後端就是 Rust，選擇 Rust 是自然的搭配。相比 Electron（用 Node.js），Tauri + Rust 的優勢是：

- **打包體積小很多** — 不用捆綁 Chromium
- **記憶體佔用低** — 對音樂播放器這種長時間運行的應用很重要
- 前後端透過 33 個 Tauri commands 做 IPC，型別安全且序列化高效

## 4. 豐富的生態系統剛好覆蓋需求

專案用到的 crate 都是成熟的純 Rust 實作：

| Crate | 用途 |
|-------|------|
| `rodio 0.21` | 音訊解碼與播放 |
| `lofty 0.23` | 讀寫 ID3/Vorbis/MP4 標籤與封面圖 |
| `rusqlite 0.38` (bundled) | SQLite，連 C library 都直接編譯進去 |
| `notify 8` | 檔案系統監視，即時偵測資料夾變化 |
| `walkdir 2.5` | 遞迴掃描目錄 |
| `trash 5` | 跨平台送進垃圾桶 |
| `serde` / `serde_json` | 序列化/反序列化，IPC 資料傳遞 |
| `thiserror 2` | 錯誤型別定義 |
| `base64 0.22` | 封面圖 Base64 編碼 |

全部都是 bundled 或純 Rust，不需要額外的系統 library。

## 5. 跨平台潛力

雖然目前定位是 Linux 桌面播放器，但因為所有依賴都是純 Rust 或 bundled，要移植到 macOS/Windows 基本上只需要重新編譯，不用處理各平台的音訊框架差異。

## 總結

對 Lyra Music 來說，Rust 最核心的價值是：讓一個音樂播放器能以極低的系統依賴、極小的體積、極低的記憶體佔用運行，同時保有接近 C 的效能和編譯期安全保證。這些對一個需要長時間背景運行、處理即時音訊的桌面應用來說都很關鍵。
