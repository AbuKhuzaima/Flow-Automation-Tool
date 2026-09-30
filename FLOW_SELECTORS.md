# Google Flow DOM Selectors & Adapter Architecture

## 1. Architectural Overview

Google Flow does not offer an official public API for sequential prompt automation. Therefore, the **Flow Prompt Automator** interacts directly with the Flow web application in Google Chrome using content scripts and DOM inspection techniques.

To prevent fragility when Google updates the Flow UI, all selectors, detection heuristics, and event dispatch logic are isolated in the Flow Adapter layer:

```
src/content/
├── flow-selectors.ts      <-- Pure selector constants, URL patterns, text keywords
├── flow-detector.ts       <-- Page validation and element visibility heuristics
├── flow-state.ts          <-- Generation state detection and timeout guards
└── flow-automation.ts     <-- Concrete GoogleFlowAdapter implementing FlowAdapter interface
```

Core extension components (Service Worker, Queue Manager, State Manager, Popup) never reference raw DOM elements or selectors. They interact exclusively through the abstract `FlowAdapter` interface:

```typescript
export interface FlowAdapter {
  isFlowPage(): Promise<boolean>;
  findPromptInput(): Promise<Element | null>;
  insertPrompt(prompt: string): Promise<boolean>;
  submitPrompt(): Promise<boolean>;
  waitForGenerationStart(timeoutMs?: number): Promise<boolean>;
  waitForGenerationComplete(timeoutMs: number): Promise<boolean>;
  isGenerating(): boolean;
  isGenerationComplete(): boolean;
  findDownloadControl(): Promise<Element | null>;
  downloadResult(filename?: string): Promise<boolean>;
  getStatus(): { isFlow: boolean; hasInput: boolean; isBusy: boolean; pageUrl: string };
}
```

---

## 2. Selector Configuration (`src/content/flow-selectors.ts`)

### A. Supported URL Patterns
Located in `FLOW_SELECTORS.urlPatterns`:
- `flow.google.com`
- `labs.google/flow`
- `aitestkitchen.withgoogle.com`
- `flow.google`
- `labs.google.com`

*Note: Users can also specify custom URLs or regex in the extension's Settings tab.*

### B. Prompt Input Selectors & Insertion Strategies
Located in `FLOW_SELECTORS.inputSelectors`. Evaluated sequentially with **recursive Shadow DOM piercing** (`querySelectorAllDeep`) until a visible, interactive element is found:

1. **Semantic ARIA & Accessible Labels**:
   - `textarea[aria-label*="prompt" i]`
   - `div[contenteditable="true"][aria-label*="prompt" i]`
   - `textarea[aria-label*="describe" i]`
   - `div[contenteditable="true"][aria-label*="describe" i]`

2. **Placeholder Attributes**:
   - `textarea[placeholder*="prompt" i]`
   - `textarea[placeholder*="describe" i]`
   - `textarea[placeholder*="create" i]`
   - `textarea[placeholder*="generate" i]`
   - `div[contenteditable="true"][data-placeholder*="prompt" i]`

3. **Rich Text Editors & Shadow Roots**:
   - `div[role="textbox"]`, `div.ProseMirror`, `div.ql-editor`, `div[data-slate-editor]`
   - Native `<textarea>` or `<input>` nested inside Lit/Polymer/Material Web Component shadow roots.

4. **Reliable Insertion Pipeline**:
   - Focus element and select all existing text.
   - Execute `document.execCommand('insertText', false, text)` to trigger browser native typing pipelines recognized by ProseMirror/Lexical/React/Lit.
   - Dispatch `beforeinput`, `input`, and `change` with `{ bubbles: true, composed: true }` so events cross Shadow DOM boundaries.
   - `textarea[placeholder*="create" i]`
   - `textarea[placeholder*="generate" i]`
   - `div[contenteditable="true"][data-placeholder*="prompt" i]`

3. **Roles & Containers**:
   - `div[role="textbox"][contenteditable="true"]`
   - `div[role="combobox"] textarea`
   - `div[role="combobox"] [contenteditable="true"]`

4. **DOM Structure Fallbacks**:
   - `form textarea`
   - `main textarea`
   - `[data-testid*="prompt-input" i]`
   - `textarea`

### C. Submit / Generate Button Selectors
Located in `FLOW_SELECTORS.submitButtonSelectors`, `FLOW_SELECTORS.submitButtonTextKeywords`, and `FLOW_SELECTORS.excludedButtonKeywords`:

1. **Google Flow Arrow Button Targeting (`findFlowArrowSubmitButton`)**:
   - Google Flow features a distinct **white circular button with a black right-facing arrow (`➔`)** situated at the bottom-right corner of the floating prompt box card.
   - **Candidate Scoring**: Evaluates circular shape (`border-radius: 50%`), white/light background contrast, right-arrow SVG glyphs (`arrow_forward`, `east`, `send`, `➔`), and positioning relative to the prompt input's bottom-right corner.
   - **Strict Disqualification**: Rigorously excludes elements located in the top navigation bar (`y < 120px`), user profile/avatar buttons, prompt clear (`✕`) buttons, media upload (`+`) buttons, model selector pills, and cancel/stop buttons.

2. **Accessible Labels & Test IDs**:
   - `button[aria-label*="generate" i]`
   - `button[aria-label*="submit" i]`
   - `button[aria-label*="create" i]`
   - `button[aria-label*="run" i]`
   - `button[aria-label*="send" i]`
   - `[data-testid*="generate-button" i]`
   - `[data-testid*="submit-button" i]`

3. **SVG Icon Markers (Strictly Targeted)**:
   - `button:has(svg[data-icon*="arrow"])`
   - `button:has(svg[data-icon*="east"])`
   - `button:has(svg[data-icon*="send"])`
   - `button:has(svg path[d*="M2.01 21L23 12 2.01 3"])` (Standard Material Send icon path)
   - `button:has(svg path[d*="M12 4"])`, `button:has(svg path[d*="M15 5"])` (Material arrow_forward / east)
   - *(Note: Generic `button:has(svg)` is strictly prohibited to prevent matching top-bar or profile icons).*

4. **Direct Prompt Keyboard Dispatching**:
   - Upon prompt pasting, full `Enter` (code 13) and `Ctrl+Enter` / `Cmd+Enter` keyboard event pipelines are dispatched directly onto the prompt textarea, immediately followed by clicking the verified arrow button.


### D. Generation State Detection
Located in `FLOW_SELECTORS.generatingIndicators` and `FLOW_SELECTORS.generatingTextKeywords`:

1. **Active Progress Elements**:
   - `[role="progressbar"]`
   - `[aria-busy="true"]`
   - `.generating`
   - `.loading-spinner`
   - `svg.animate-spin`
   - `button[aria-label*="stop" i]`
   - `button[aria-label*="cancel" i]`
   - `[data-state="generating"]`
   - `[data-state="loading"]`
   - `.skeleton`, `.shimmer`

2. **Button State Text**:
   - Matches buttons reading `"generating"`, `"creating"`, `"rendering"`, `"processing"`, `"cancel"`, `"stop generation"`.

3. **Completion Signals**:
   - Appearance of `video[src]`, `video source[src]`, or `canvas.output-canvas`
   - Appearance of `button[aria-label*="download" i]` or `a[download]`
   - `[data-state="completed"]`

### E. Download Control Selectors
Located in `FLOW_SELECTORS.downloadSelectors` and `FLOW_SELECTORS.downloadTextKeywords`:
- `button[aria-label*="download" i]`
- `a[download]`
- `[data-testid*="download-button" i]`
- `button:has(svg[data-icon="download"])`
- Buttons or links containing text: `"download"`, `"save video"`, `"export"`.

---

## 3. How to Update Selectors When Google Changes Flow

If Google alters the Flow interface, you can update the extension in 3 simple steps:

1. **Inspect the New Element in Chrome**:
   - Open Developer Tools on the Flow page (`Ctrl+Shift+I` or `Cmd+Option+I`).
   - Use the Element Inspector to click on the new prompt input, submit button, or download button.
   - Note unique attributes like `aria-label`, `placeholder`, `role`, `data-testid`, or text content.

2. **Edit `src/content/flow-selectors.ts`**:
   - Add the new selector or keyword to the corresponding array at the top of the list.

3. **Rebuild the Extension**:
   ```bash
   npm run build
   ```
   Then navigate to `chrome://extensions` and click the **Reload** icon on the **Google Flow Prompt Automator** card.

No changes to the Service Worker, Queue Manager, or UI are needed.
