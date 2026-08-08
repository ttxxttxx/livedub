# 🎙 LiveDub

**Real-time voice translation for videos — watch any video in your language.**

LiveDub is a browser extension that automatically translates video audio in real-time. It extracts captions (or captures audio), translates the text, and speaks it using high-quality text-to-speech — all with minimal delay.

## ✨ Features

- 🎬 **YouTube-first**: Works with YouTube videos out of the box
- 🧠 **Smart dual-path**: Caption extraction (primary) + Audio ASR (fallback)
- ⚡ **Phrase-level streaming**: ~300ms silent boundary detection for natural translation flow
- 🎛️ **Independent controls**: TTS volume, original audio mix ratio, toggle switch
- 🎨 **Floating bubble UI**: Non-intrusive, draggable, auto-fading control panel
- 🌐 **Microsoft Translator**: Free tier (2M chars/month) for English → Chinese
- 🗣️ **Neural TTS**: Edge's Microsoft Xiaoxiao voice for natural Chinese output

## 🚀 Quick Start

### Prerequisites

1. **Microsoft Edge** browser (recommended for China users)
2. **Microsoft Translator API Key** (free):
   - Go to [Azure Portal](https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation)
   - Create a free Translator resource
   - Copy the subscription key
3. **Generate icons** (one-time):
   - Open `icons/generate.html` in your browser
   - Click each download button
   - Save the PNGs to the `icons/` folder

### Install (Developer Mode)

1. Open Edge and go to `edge://extensions/`
2. Enable **Developer mode** (toggle in bottom-left)
3. Click **Load unpacked**
4. Select the `voice_speech_translator` folder
5. The LiveDub icon should appear in your toolbar

### Configure

1. Right-click the LiveDub icon → **Options** (or go to extension details → Extension options)
2. Enter your Microsoft Translator API Key
3. Select region: **East Asia** (recommended for China)
4. Adjust TTS volume and mix ratio defaults
5. Click **Save**

### Use

1. Go to any YouTube video with English audio/captions
2. Click the LiveDub floating bubble (right side of video)
3. Toggle the switch **ON**
4. Enjoy translated Chinese voice-over!

## 🏗️ Architecture

```
YouTube Page
    │
    ├─ Primary: Caption data (ytInitialPlayerResponse)
    │   └─ TTML/JSON3 parse → timed segments
    │
    └─ Fallback: Web Audio API + Web Speech API
        └─ AnalyserNode → RMS silence detection → phrase boundary
              │
              ▼
        Phrase Buffer (gap-based boundary @ 500ms)
              │
              ▼
        Microsoft Translator API (fetch)
              │
              ▼
        speechSynthesis (Edge Neural TTS)
              │
              ▼
        Audio Mixer (GainNode: original × mixRatio, TTS @ volume)
```

## 📁 Project Structure

```
voice_speech_translator/
├── manifest.json                  # MV3 manifest
├── icons/                         # Extension icons (PNG)
├── src/
│   ├── background/
│   │   └── service-worker.js      # MV3 service worker
│   ├── content/
│   │   ├── index.js               # Entry point
│   │   ├── ui/
│   │   │   ├── bubble.js          # Floating control panel
│   │   │   └── bubble.css
│   │   ├── capture/
│   │   │   ├── caption.js         # YouTube caption extractor
│   │   │   ├── audio.js           # Web Speech API audio capture
│   │   │   └── silence-detector.js # RMS-based silence detection
│   │   ├── pipeline/
│   │   │   ├── orchestrator.js    # Pipeline coordinator
│   │   │   ├── translator.js      # MS Translator API
│   │   │   └── tts.js            # speechSynthesis wrapper
│   │   └── mixer/
│   │       └── audio-mixer.js     # Audio gain control
│   ├── shared/
│   │   ├── constants.js           # Configuration constants
│   │   ├── storage.js             # chrome.storage wrapper
│   │   └── i18n.js               # i18n placeholder
│   └── options/
│       ├── index.html
│       ├── index.css
│       └── index.js
└── README.md
```

## 🔧 Development

### No Build Step

This project uses plain ES modules — no bundler needed. The extension loads directly from source in developer mode.

### Debugging

1. Open YouTube video → F12 Developer Tools
2. Filter console by `[LiveDub]` prefix
3. All pipeline stages log their activity:
   - `[Pipeline] State: capturing → translating → speaking`
   - `[Translator] Translating: "..." → Result: "..."`
   - `[TTS] Speaking: "..."`

### Testing Without API Key

The extension works in **mock mode** without an API key:
- Translation is skipped (English text passed through)
- TTS reads the English text directly
- Useful for verifying the caption extraction and TTS pipeline

## 🛣️ Roadmap

- [x] YouTube caption extraction (primary path)
- [x] Phrase-level streaming translation
- [x] Floating bubble UI with independent controls
- [x] Audio mixer (GainNode)
- [x] Audio ASR fallback (Web Speech API)
- [x] Options page with settings persistence
- [x] SPA navigation handling
- [x] Ad detection
- [ ] Chrome browser support (alternative ASR backend)
- [ ] Bilibili platform support
- [ ] Netflix platform support
- [ ] Multi-language (ja↔zh, ko↔zh, zh↔en)
- [ ] Local Whisper model (WebGPU) for offline ASR
- [ ] Pre-translation mode (full video pre-process)

## 📄 License

MIT

---

Made with ❤️ for breaking language barriers one video at a time.
