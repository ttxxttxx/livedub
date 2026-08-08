# LiveDub v0.1.0 — 测试改进方案

## 🧠 头脑风暴：已知问题全景

### 🔴 P0 — 严重影响用户体验

| # | 问题 | 现象 | 根因 |
|---|------|------|------|
| 1 | **单词重复** | `nationalnational`、`Specifically Specifically` | `.caption-window` 多元素 textContent 拼接；`cleanCaptionText()` 仅处理双词重复 |
| 2 | **TTS 延迟 ~5s** | 听到语音时视频已经播到了前面 | `_flushPhrase` await TTS 完成 + MyMemory 网络延迟 + speechSynthesis 启动延迟 |
| 3 | **扩展重新加载失败** | Edge 报错必须重启浏览器 | 旧版 service-worker.js 残留注册；MV3 缓存问题 |

### 🟡 P1 — 明显功能缺陷

| # | 问题 | 现象 | 根因 |
|---|------|------|------|
| 4 | **CC 自动开启不可靠** | 有时开了开关但没字幕 | `enableYouTubeCaptions()` 仅点一次 CC 按钮，不验证字幕是否真的出现 |
| 5 | **长句无标点不 flush** | 句子没说出口 | `extractSentences()` 只匹配 `[.!?]` 结尾，无标点长句永远不触发 |
| 6 | **翻译偶尔夹杂原文** | 中文中混有英文单词 | MyMemory 翻译质量不稳定；无翻译质量校验 |
| 7 | **两个 video 元素时选错** | 可能监听侧边栏预览视频 | `querySelector('video.html5-main-video')` 可能匹配到其他 video |

### 🟢 P2 — 边缘情况

| # | 问题 | 现象 | 根因 |
|---|------|------|------|
| 8 | **YouTube 首页不进视频** | 首次打开 youtube.com 无气泡 | boot() 只匹配 `/watch` URL |
| 9 | **原声比例 = 0 时完全静音** | captureStream + muted 模式，mix=0 无声音 | 设计如此但用户可能困惑 |
| 10 | **MyMemory 日限额耗尽** | 翻译突然变回英文 | 无降级提醒；无使用量计数 |
| 11 | **多个 YouTube 标签页** | 可能冲突 | 无标签页 ID 隔离 |
| 12 | **暂停后恢复** | TTS 队列可能丢失 | TTS pause/resume 未与 pipeline 状态同步 |

### ⚪ P3 — 代码质量

| # | 问题 |
|---|------|
| 13 | `test-captions.js` 和 `tests/run.js` 有重复代码 |
| 14 | `fetchCaptionsDirectly` 静默吞掉所有错误 |
| 15 | Mixer 的 `setInterval` 在 SPA 导航时未清理（内存泄漏） |
| 16 | `captureStream` 的 MediaStream 永不释放 |

---

## 🔍 审查发现（Agent 深度扫描）

### 测试体系
- ❌ **测试函数是源码的复制品而非引用** — 源码改了测试不会报错
- ❌ `test-captions.js` 是废弃代码，与 `tests/run.js` 完全重复
- ❌ 6 个核心模块完全无测试：`AudioMixer`、`TtsEngine`、`PipelineOrchestrator`、`BubbleUI`、`translator`（真API）、`SilenceDetector`
- ❌ `pretest` 每次都跑一次 esbuild 构建，浪费时间

### 构建体系
- ❌ `dist/src/content/test.js` 残留文件未清理
- ❌ `src/background/service-worker.js` 死代码（manifest 已删除 background）
- ❌ watch 模式不监听 CSS/HTML/图标变更
- ❌ 无 `clean` 脚本，无 `dev`/`start` 别名

### manifest.json
- ❌ 无 `action`（工具栏图标），气泡关闭后无法恢复
- ❌ `src/background/service-worker.js` 死文件存在但未引用

### package.json
- ❌ `pretest` = `build` 浪费（测试不依赖构建产物）
- ❌ 缺 `clean`、`lint`、`dev` 脚本

---

## 🧪 自测现状

### 已有测试（15 项）
```
📝 extractSentences       — 4 tests ✅
📝 Sentence Dedup (Set)   — 4 tests ✅
📝 Audio Mixer            — 1 test  ✅
📝 Phrase Boundaries      — 2 tests ✅
📝 Word Dedup             — 3 tests ✅
📝 Translator (mock)      — 1 test  ✅
```

### 测试覆盖缺口
1. **无** TTS 引擎测试（浏览器 API 依赖）
2. **无** 翻译 API 集成测试（网络依赖）
3. **无** Mixer captureStream 逻辑测试
4. **无** Pipeline orchestrator 状态机测试
5. **无** UI Bubble 事件测试
6. **无** 单词去重对三连重复、混合大小写的处理
7. **无** SPA 导航逻辑测试

---

## 📋 改进执行计划（3 轮）

### 第一轮：P0 + 代码清理
| # | 任务 | 类型 |
|---|------|------|
| 1 | 删除死代码：`test-captions.js`、`src/background/`、`dist/src/content/test.js` | 清理 |
| 2 | 测试重构：`tests/run.js` 改为 import 真实源码函数 | 测试 |
| 3 | 增强 `cleanCaptionText()` 覆盖更多重复模式 | P0 |
| 4 | 添加无标点长句兜底 flush（200ms 超时） | P0 |
| 5 | 优化 TTS 延迟：poll 间隔 150→100ms，移除不必要的 await | P0 |
| 6 | 修复 Edge 重载：清理 manifest 中残留路径 | P0 |
| 7 | 添加工具栏 `action` 图标，气泡关闭可恢复 | P0 |
| 8 | 修复 `package.json`：`pretest` 改为 `clean`，添加 `dev` 脚本 | 工程 |

### 第二轮：测试扩展
| # | 任务 |
|---|------|
| 9 | 添加 `cleanCaptionText` 边缘测试（空文本、三连重复、混合大小写） |
| 10 | 添加 `extractSentences` 边缘测试（空字符串、仅标点、超长句） |
| 11 | 添加 `segmentsToPhrases` 边缘测试（空数组、单段、零时长、边界值） |
| 12 | 添加 `translate` MyMemory 集成测试（真实网络调用） |
| 13 | 添加 `AudioMixer` 逻辑测试（mock AudioContext） |
| 14 | 扩展至 25+ 项测试 |

### 第三轮：功能修复
| # | 任务 |
|---|------|
| 15 | CC 启用带重试验证 |
| 16 | 翻译后处理（重复词、标点修正） |
| 17 | 改进 video 元素选择（多 video 场景） |
| 18 | 内存泄漏修复（Mixer interval、Stream 释放） |
| 19 | 错误提示优化（API 限额、网络断开） |

---

## 🎯 成功标准
- 单词重复率 < 5%（当前 ~30%）
- TTS 延迟 < 3s（当前 ~5s）
- 自测 25+ 项，100% 通过，**测试真实源码而非复制品**
- 无控制台报错
- 无死代码残留
