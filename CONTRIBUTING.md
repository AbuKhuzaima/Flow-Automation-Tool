# Contributing to Flow Prompt Automator

Thank you for your interest in contributing to **Google Flow Prompt Automator**! We welcome all contributions, including bug fixes, DOM selector updates, performance improvements, new features, and documentation enhancements.

---

## Code of Conduct

Please be respectful, collaborative, and considerate of others when submitting issues or pull requests.

---

## Development Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v20+ recommended).
- **npm**: v9.0.0 or later.
- **Google Chrome**: Stable or Dev/Canary.
- **Python 3**: (Optional) Only needed if regenerating custom extension PNG icons via `generate-icons.py`.

### 2. Clone and Install
```bash
git clone https://github.com/<your-username>/flow-prompt-automator.git
cd flow-prompt-automator
npm install
```

### 3. Build Extension
```bash
# Production bundle into /dist
npm run build

# Or live watch mode during development
npm run watch
```

### 4. Load into Chrome
1. Navigate to `chrome://extensions` in Google Chrome.
2. Enable **Developer mode** toggle in the upper-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/` directory inside this repository.
5. After making code changes (while running `npm run watch`), simply click the circular **Reload** icon on the extension's card in `chrome://extensions`.

---

## Running Unit Tests

The test suite runs using Node.js's native test runner (`node:test`) and compiles test suites via `esbuild`:

```bash
npm test
```

All 40+ unit tests cover:
- Blank-line prompt delimiter parsing and whitespace preservation
- Queue manager lifecycle, statuses, and rolling ETA estimation
- State persistence and options syncing (`chrome.storage.local`)
- Anthropic Claude client prompt transformation and JSON extraction
- Isolated Google Flow DOM selector heuristics and arrow submit targeting
- Chrome DevTools Protocol (CDP) native keyboard event handling

Ensure all tests pass before opening a pull request.

---

## Project Architecture & Directory Layout

```
flow-prompt-automator/
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Persistent MV3 orchestrator & tab monitor
│   ├── content/
│   │   ├── flow-selectors.ts      # Pure DOM selectors, URLs, and heuristics
│   │   ├── flow-detector.ts       # Tab validation and element visibility heuristics
│   │   ├── flow-state.ts          # Generation progress detector & timeout guards
│   │   └── flow-automation.ts     # FlowAdapter implementation & content script entry
│   ├── core/
│   │   ├── prompt-parser.ts       # Blank-line delimiter parser & TXT reader
│   │   ├── queue-manager.ts       # Queue lifecycle, statuses, metrics & estimates
│   │   ├── automation-manager.ts  # Loop execution, timeouts, pause/resume/stop
│   │   ├── cdp-manager.ts         # Chrome DevTools Protocol trusted keyboard dispatch
│   │   ├── state-manager.ts       # chrome.storage.local persistence & mock fallback
│   │   ├── download-manager.ts    # Filename formatting & Chrome downloads API
│   │   └── logger.ts              # Circular buffer logger with key redaction
│   ├── anthropic/
│   │   ├── anthropic-client.ts    # Secure direct Claude API interface
│   │   └── prompt-processor.ts    # Resilient JSON extraction & prompt engineering
│   ├── popup/
│   │   ├── index.html             # Sleek dark dashboard UI
│   │   ├── popup.css              # Custom design system stylesheet
│   │   └── popup.ts               # Popup & Side Panel controller
│   ├── options/
│   │   ├── index.html             # Full-page options & settings
│   │   ├── options.css            # Options stylesheet
│   │   └── options.ts             # Settings management & API testing
│   ├── icons/                     # 16, 32, 48, 128 PNG extension icons
│   ├── types/
│   │   └── index.ts               # Core TypeScript definitions & interfaces
│   └── manifest.json              # Chrome Manifest V3 configuration
├── tests/                         # Unit tests covering all subsystems
├── examples/                      # Sample prompt text files
├── build.js                       # esbuild bundler script
├── run-tests.js                   # Node:test test runner
├── FLOW_SELECTORS.md              # Detailed guide for maintaining DOM selectors
└── generate-icons.py              # Pure Python icon generator (no PIL required)
```

---

## Updating DOM Selectors When Google Changes Flow

Google Flow frequently updates its user interface. To update DOM selectors without touching core automation logic:

1. Inspect the new element in Chrome Developer Tools on Google Flow (`Ctrl+Shift+I` / `Cmd+Option+I`).
2. Open [`src/content/flow-selectors.ts`](src/content/flow-selectors.ts).
3. Add the selector or attribute to the relevant array (`inputSelectors`, `submitButtonSelectors`, `generatingIndicators`, etc.).
4. Run `npm test` to verify selector integrity.
5. Rebuild with `npm run build` and reload the extension in Chrome.
6. Check [`FLOW_SELECTORS.md`](FLOW_SELECTORS.md) for full selector documentation.

---

## Submitting Pull Requests

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. **Make your changes** following TypeScript strict mode conventions.
3. **Run tests** and verify everything passes:
   ```bash
   npm test
   ```
4. **Commit** your changes with clear, descriptive commit messages:
   ```bash
   git commit -m "feat(cdp): add fallback for virtual keyboard events"
   ```
5. **Push** to your fork:
   ```bash
   git push origin feature/my-new-feature
   ```
6. **Open a Pull Request** using the provided PR template.

---

## Security & Secrets Policy

- **Never** commit API keys or personal credentials.
- All Anthropic Claude API keys must be handled via `chrome.storage.local` and never hardcoded in any test or source file.
- The built-in logger automatically redacts `sk-ant-...` keys.
