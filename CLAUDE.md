# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

Lyra Music 是一個輕量級 Linux 桌面音樂播放器，採用 **Tauri 2**（Rust 後端 + Svelte 5 前端）。音訊播放使用 **rodio**（純 Rust，無需 FFmpeg/GStreamer）。資料儲存於 **SQLite**（rusqlite，WAL 模式）。音樂元資料透過 **lofty** 讀寫。

## 常用指令

### 開發

```bash
npm install                  # 安裝前端依賴
npm run tauri dev            # 啟動開發模式（Vite + Tauri 視窗）
```

### 測試

```bash
# 前端（Vitest, jsdom）
npm run test                 # 執行所有前端測試
npm run test:watch           # 監看模式
npx vitest run src/lib/logic/format.test.ts   # 執行單一測試檔案

# 後端（Rust 整合測試）
cd src-tauri && cargo test                          # 所有測試
cd src-tauri && cargo test storage_test             # 單一測試檔案
cd src-tauri && cargo test --features audio-tests   # 包含音訊裝置測試
```

### 程式碼檢查與格式化

```bash
npm run quality              # 完整檢查：prettier + eslint + stylelint + rust fmt + clippy + 型別檢查
npm run lint                 # ESLint（僅 src/）
npm run format               # Prettier 格式化
npm run stylelint            # CSS/Svelte lint
npm run rust:fmt             # cargo fmt
npm run rust:clippy          # cargo clippy -D warnings
npm run check                # svelte-check + tsc
```

### 建置

```bash
npm run tauri build          # 正式建置（輸出 deb/AppImage/rpm 至 src-tauri/target/release/bundle/）
```

## 架構

```text
Frontend (Svelte 5)  ──IPC (invoke/listen)──  Backend (Rust/Tauri 2)
```

**前端**（`src/`）：

- `lib/api/` — Tauri IPC 封裝（`playback.ts`、`library.ts`、`playlist.ts`）
- `lib/state/` — Svelte 5 runes 響應式狀態（透過 `getPlayerState()` 等取得單例）
- `lib/logic/` — 抽離的純函式，便於測試（播放動作、斷點續播、鍵盤快捷鍵、排序、選取、虛擬捲動、格式化）
- `lib/components/` — 依功能分組的 UI 元件（Player/、Library/、Browse/、Playlist/、Sidebar/、Settings/）
- `lib/types/index.ts` — 所有 TypeScript 介面（Track、Playlist 等）
- `lib/__mocks__/` — 測試用 Tauri/dialog mock
- 路徑別名：`$lib` → `src/lib`

**後端**（`src-tauri/src/`）：

- `commands/` — Tauri command handler（playback、library、playlist）
- `storage/` — Repository 模式：`library_repo.rs`（Track CRUD）、`playlist_repo.rs`（Playlist CRUD）、`db.rs`（schema + migrations）
- `audio/player.rs` — rodio sink 封裝，支援無縫播放（pre-decode + 排入同一 sink）
- `scanner/` — `folder_scanner.rs`（walkdir 掃描）、`watcher.rs`（notify 即時監控）
- `metadata/` — `reader.rs`（lofty 讀取；含歌詞：sidecar `.lrc` 優先、fallback 內嵌標籤）、`writer.rs`（標籤寫入）
- `models/` — Serde 結構體：Track、Playlist、PlayerState、ArtistSummary、AlbumSummary
- `error.rs` — `AppError` 列舉（thiserror）
- `tray.rs` — 系統匣整合
- `lib.rs` — 應用程式初始化：DB 設定、音訊播放器、資料夾監控、系統匣、播放器輪詢執行緒（250ms；**play_count 在此入帳**——完成偵測與 DB 寫入同執行緒同鎖，前端僅透過 level-triggered 的 `completion_seq` 鏡像顯示，不再經 IPC 計數）

## 關鍵慣例

### Rust

- **Clippy pedantic** 強制啟用（`-D warnings`），`unsafe_code` 禁用
- `unwrap_used` = warn、`clone_on_ref_ptr` = warn
- rustfmt：`max_width = 100`、`use_field_init_shorthand = true`
- MSRV：1.87（edition 2024）

### Pre-commit Hook

執行 `lint-staged`（prettier + eslint + stylelint + rustfmt + clippy）及 `npm run check`。

### 版本一致性

版本號必須在 `package.json`、`src-tauri/Cargo.toml` 及 `src-tauri/tauri.conf.json` 之間保持一致。Release CI 會驗證版本號與 git tag 是否吻合。

## 開發原則

- 簡單方案優先，不要 over-engineer
- README 不要用過多 emoji 和行銷語調，保持開發者風格

### 可逆性與回滾優先

- 保持變更易於還原（小範圍、小型 commit、清晰的影響範圍）
- 對於有風險的變更，在合併前定義回滾路徑
- 避免阻礙安全回滾的混合巨型補丁
- 實作前用程式碼搜尋驗證假設
- 優先選擇確定性行為而非聰明的捷徑
- 如果不確定，留下帶有驗證脈絡的具體 TODO，而非隱藏的猜測

### 反模式（禁止事項）

- 不要為了小便利而新增重量級相依
- 不要靜默弱化安全策略或存取約束
- 不要「以防萬一」地新增推測性的設定/功能旗標
- 不要將大量純格式化變更與功能變更混合
- 不要「順便」修改無關模組
- 不要在沒有明確說明的情況下繞過失敗的檢查
- 不要在重構 commit 中隱藏改變行為的副作用
- 不要在測試資料、範例、文件或 commit 中包含個人身分或敏感資訊
- 除非維護者明確要求，否則不要嘗試儲存庫品牌重塑/身分替換
- 除非維護者明確要求，否則不要引入新的平台面（例如 `web` 應用、儀表板、UI 入口）

## 已知問題

- **lofty**：含非數字 ASCII 字元的 timestamp（如 `H17.10.26`）在預設的 `BestAttempt` 解析模式下會讓整個檔案讀取失敗。`metadata/reader.rs` 因此統一使用 `ParsingMode::Relaxed`（壞的 timestamp frame 會被跳過，其餘標籤保留）。
- **watcher 與搬移/改名**：同檔案系統的搬移/改名由 notify 的 rename cookie 配對成 `RenameMode::Both` 事件（`watcher.rs` 的 `apply_rename_events`），直接 UPDATE `file_path` 保留 play_count 與播放清單歸屬；目錄改名以前綴 UPDATE 子曲目（inotify 不發子檔案事件）。跨檔案系統搬移（copy+delete，無 cookie）仍是 delete + re-import，歷史不保留。
- **封面 asset protocol scope 耦合**：專輯牆封面經 `convertFileSrc` 直接載檔，`tauri.conf.json` 的 assetProtocol scope（`$APPDATA/covers/**`）與 `metadata/reader.rs` `save_cover_art` 的 `covers` 目錄名稱耦合——改目錄名必須同步改 scope，否則封面會靜默載不出來。
- **lofty 歌詞 ItemKey**：ID3 的 USLT frame 對映到 `ItemKey::UnsyncLyrics`，不是 `ItemKey::Lyrics`（後者對映 Vorbis `LYRICS`/MP4 `©lyr`）。`read_lyrics` 兩個都查才同時支援 MP3 與 FLAC。sidecar `.lrc` 僅支援 UTF-8，非 UTF-8（GBK/Big5 常見）會跳過並 fallback 內嵌標籤，不會顯示亂碼。
