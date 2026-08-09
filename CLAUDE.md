# LiveDub — 项目开发规范

## 必须遵守的规则

### 1. 每次修改必须自测

- 每次代码修改后，**必须**运行 `node tests/run.js` 确保全部通过
- 如果新增功能，**必须**同步添加测试用例
- 构建成功后**必须**确认 26+ 项测试全部 PASS
- 标准流程：**修改 → 构建(`node build.js`) → 自测(`node tests/run.js`) → 确认通过 → 完成**
- **同问题 3 次未解决 → 必须加诊断日志**，禁止盲改
- **每次修改后生成简要总结**，markdown 表格格式：

| 修改内容 | 对应目的 | 期望效果 |
|----------|----------|----------|
| xxx      | xxx      | xxx      |

### 2. Push 前必须写修改明细

- 每次 push 到 GitHub 前，**必须**更新 [VERSION.md](VERSION.md) 版本记录表
- 明细必须包含：
  - 本次修改的问题/需求描述
  - 具体改动内容
  - 测试结果（通过数/总数）
- Commit message 必须用中文描述本次变更
- commit 格式：`类型: 简短描述`（如 `fix:`, `feat:`, `docs:`, `refactor:`）

## 项目速查

| 命令 | 用途 |
|------|------|
| `node build.js` | 构建到 `dist/` |
| `node tests/run.js` | 运行 26 项自测 |
| `npm test` | 同上 |
| Edge 加载 | `edge://extensions/` → 加载解压缩 → 选 `dist/` 目录 |

## 架构要点

- Content Script 入口: `src/content/index.js`
- 字幕提取: `src/content/capture/caption.js` (DOM 观察 + 句子提取)
- 翻译: `src/content/pipeline/translator.js` (Google → MyMemory → passthrough)
- TTS: `src/content/pipeline/tts.js` (Edge 神经语音)
- 音频混合: `src/content/mixer/audio-mixer.js` (captureStream + GainNode)
- UI: `src/content/ui/bubble.js` (浮动气泡)

## 测试经验教训

| 规则 | 原因 |
|------|------|
| 新增变量必须检查是否 `let` 声明 | `changeN` 未声明 → ReferenceError 静默崩溃，esbuild 不报错 |
| 构建通过 ≠ 代码正确 | 未声明变量是运行时错误，只有浏览器 Console 能看到 |
| 现有自测覆盖不足 | 测试的是源码复制品，不是真实模块；回调/定时器逻辑完全未测 |
| `setInterval` 回调出错会静默终止 | 后续 tick 不再执行，表现像是"没数据"，实际是崩溃了 |
| 重构时必须对比旧版本工作流 | 今天删掉的声明在旧版本里是声明过的，重构时被遗漏 |
