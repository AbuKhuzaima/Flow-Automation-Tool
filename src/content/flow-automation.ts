/**
 * Google Flow Prompt Automator - Flow Content Script & Adapter
 * 
 * Implements the FlowAdapter interface to interact with Google Flow's DOM.
 * Supports deep Shadow DOM piercing, execCommand text insertion for modern
 * rich-text editors, and multi-strategy prompt submission.
 */

import { FlowAdapter, ExtensionMessage, MessageResponse } from '../types';
import { FLOW_SELECTORS } from './flow-selectors';
import { FlowDetector } from './flow-detector';
import { FlowGenerationDetector } from './flow-state';

/**
 * Recursively search light DOM and all open shadowRoot elements.
 */
export function querySelectorAllDeep(selector: string, root: ParentNode = document): Element[] {
  const elements: Element[] = [];

  try {
    const directMatches = root.querySelectorAll(selector);
    elements.push(...Array.from(directMatches));
  } catch {
    // Ignore selector syntax issues
  }

  try {
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot) {
        elements.push(...querySelectorAllDeep(selector, el.shadowRoot));
      }
    }
  } catch {
    // Ignore traversal errors
  }

  return elements;
}

export class GoogleFlowAdapter implements FlowAdapter {
  private detector: FlowGenerationDetector;
  private customUrlPattern?: string;

  constructor(customUrlPattern?: string) {
    this.detector = new FlowGenerationDetector();
    this.customUrlPattern = customUrlPattern;
  }

  public setCustomUrlPattern(pattern?: string): void {
    this.customUrlPattern = pattern;
  }

  public async isFlowPage(): Promise<boolean> {
    return FlowDetector.isSupportedUrl(this.customUrlPattern) || FlowDetector.hasFlowDomLandmarks();
  }

  public async findComposer(): Promise<Element | null> {
    // 1. If active element is an input/textarea/contenteditable, prefer it
    if (document.activeElement && this.isInputElement(document.activeElement)) {
      console.log('[FLOW] Prompt composer found via activeElement:', document.activeElement);
      return document.activeElement;
    }

    // 2. Try configured selectors with deep shadow DOM search
    for (const sel of FLOW_SELECTORS.inputSelectors) {
      try {
        const matches = querySelectorAllDeep(sel);
        for (const el of matches) {
          if (FlowDetector.isElementVisible(el)) {
            console.log(`[FLOW] Prompt composer found via selector (${sel}):`, el);
            return el;
          }
        }
      } catch {}
    }

    // 3. Fallback: Search all visible textareas, contenteditables, and text inputs deeply
    const allTextareas = querySelectorAllDeep('textarea');
    for (const el of allTextareas) {
      if (FlowDetector.isElementVisible(el)) {
        console.log('[FLOW] Prompt composer found via textarea fallback:', el);
        return el;
      }
    }

    const allEditable = querySelectorAllDeep('[contenteditable="true"], [contenteditable=""], [contenteditable], [role="textbox"]');
    for (const el of allEditable) {
      if (FlowDetector.isElementVisible(el)) {
        console.log('[FLOW] Prompt composer found via contenteditable fallback:', el);
        return el;
      }
    }

    const allInputs = querySelectorAllDeep('input[type="text"], input:not([type])');
    for (const el of allInputs) {
      if (FlowDetector.isElementVisible(el)) {
        console.log('[FLOW] Prompt composer found via input fallback:', el);
        return el;
      }
    }

    console.warn('[FLOW] Prompt composer could not be found');
    return null;
  }

  public async findPromptInput(): Promise<Element | null> {
    return this.findComposer();
  }

  public async findSubmitButton(): Promise<Element | null> {
    const composer = await this.findComposer();
    const btn = this.findFlowArrowSubmitButton(composer);
    if (btn) {
      console.log('[FLOW] Submit button found:', btn);
    } else {
      console.warn('[FLOW] Submit button not found');
    }
    return btn;
  }

  public async isReadyToSubmit(): Promise<boolean> {
    const composer = await this.findComposer();
    if (!composer) return false;

    const btn = await this.findSubmitButton();
    if (!btn) return false;

    const isDisabled = (btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true';
    if (!isDisabled) {
      console.log('[FLOW] Submit button enabled');
      return true;
    }
    return false;
  }

  public async focusComposer(): Promise<boolean> {
    const composer = await this.findComposer();
    if (!composer) return false;

    if (composer instanceof HTMLElement) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      composer.focus();
    }
    console.log('[FLOW] Prompt composer focused');
    return true;
  }

  public async attemptButtonSubmit(): Promise<boolean> {
    const btn = await this.findSubmitButton();
    if (!btn) {
      console.warn('[FLOW] Button submission failed: Submit button not found');
      return false;
    }

    const isDisabled = (btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true';
    if (isDisabled) {
      console.warn('[FLOW] Button submission failed: Submit button is disabled');
      return false;
    }

    console.log('[FLOW] Attempting button submission');
    this.clickElement(btn);
    return true;
  }

  public async attemptSyntheticEnter(): Promise<boolean> {
    const composer = await this.findComposer();
    if (!composer) {
      console.warn('[FLOW] Attempting keyboard submission failed: Composer not found');
      return false;
    }

    console.log('[FLOW] Attempting keyboard submission');
    await this.focusComposer();
    this.dispatchEnterKeyEvent(composer);
    return true;
  }

  public async detectSubmission(): Promise<boolean> {
    // 1. Check if generating indicator is active
    if (this.detector.isGenerating()) {
      console.log('[FLOW] Submission detected (generation active)');
      return true;
    }

    // 2. Check if composer was cleared/emptied by Flow
    const composer = await this.findComposer();
    if (composer) {
      const val = composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
        ? composer.value
        : (composer.textContent || '');
      if (val.trim().length === 0) {
        console.log('[FLOW] Submission detected (composer cleared)');
        return true;
      }
    }

    // 3. Check if submit button changed to disabled or stop state
    const submitBtn = await this.findSubmitButton();
    if (submitBtn) {
      const isDisabled = (submitBtn as HTMLButtonElement).disabled || submitBtn.getAttribute('aria-disabled') === 'true';
      const isStop = (submitBtn.getAttribute('aria-label') || '').toLowerCase().includes('stop') ||
                     (submitBtn.getAttribute('title') || '').toLowerCase().includes('stop');
      if (isDisabled || isStop) {
        console.log('[FLOW] Submission detected (button disabled/stop state)');
        return true;
      }
    }

    // 4. Check if progress bars / spinners appeared in DOM
    for (const sel of FLOW_SELECTORS.generatingIndicators) {
      try {
        const matches = querySelectorAllDeep(sel);
        for (const el of matches) {
          if (FlowDetector.isElementVisible(el)) {
            console.log('[FLOW] Submission detected (progress element active):', el);
            return true;
          }
        }
      } catch {}
    }

    return false;
  }

  public async detectGenerationStarted(timeoutMs: number = 8000): Promise<boolean> {
    return this.detector.waitForGenerationStart(timeoutMs);
  }

  public async detectGenerationCompleted(timeoutMs: number): Promise<boolean> {
    return this.detector.waitForGenerationComplete(timeoutMs);
  }

  private isInputElement(el: Element): boolean {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') return true;
    if (el.getAttribute('role') === 'textbox') return true;
    return false;
  }

  public async insertPrompt(promptText: string): Promise<boolean> {
    const inputEl = await this.findComposer();
    if (!inputEl) {
      throw new Error('Prompt input field not found on Google Flow page');
    }

    // Scroll into view & focus
    if (inputEl instanceof HTMLElement) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputEl.focus();
    }

    // Strategy 1: document.execCommand('insertText')
    let execSuccess = false;
    try {
      if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
        inputEl.select();
      } else {
        const range = document.createRange();
        range.selectNodeContents(inputEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      execSuccess = document.execCommand('insertText', false, promptText);
    } catch {
      execSuccess = false;
    }

    // Strategy 2: Direct property setter fallback
    if (!execSuccess || !this.hasElementText(inputEl, promptText)) {
      if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
        const proto = Object.getPrototypeOf(inputEl);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(inputEl, promptText);
        } else {
          inputEl.value = promptText;
        }
      } else {
        (inputEl as HTMLElement).innerText = promptText;
      }
    }

    // Strategy 3: Fire full sequence of Input Events with composed: true
    try {
      const beforeInputEvt = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'insertText',
        data: promptText,
      });
      inputEl.dispatchEvent(beforeInputEvt);
    } catch {}

    inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true, cancelable: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true, cancelable: true }));

    // Strategy 4: Simulate brief keystroke to ensure reactive state updates
    try {
      inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, composed: true }));
      inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, composed: true }));
    } catch {}

    console.log(`[FLOW] Prompt inserted (${promptText.length} characters)`);
    return true;
  }

  public async verifyPromptInserted(expectedText: string): Promise<boolean> {
    const composer = await this.findComposer();
    if (!composer) {
      console.warn('[FLOW] Cannot verify prompt: composer not found');
      return false;
    }

    const currentText = composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? composer.value
      : (composer.textContent || '');

    const expectedTrimmed = expectedText.trim();
    const currentTrimmed = currentText.trim();

    const isMatched = currentTrimmed.length > 0 && (
      currentTrimmed === expectedTrimmed ||
      currentTrimmed.includes(expectedTrimmed.slice(0, 50)) ||
      expectedTrimmed.includes(currentTrimmed.slice(0, 50))
    );

    if (isMatched) {
      console.log(`[FLOW] Prompt state verified`);
      return true;
    } else {
      console.warn('[FLOW] Prompt insertion verification mismatch');
      return false;
    }
  }

  private hasElementText(el: Element, text: string): boolean {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value.trim().length > 0;
    }
    return (el.textContent || '').trim().length > 0;
  }

  /**
   * Strict disqualification check to guarantee we NEVER click or interact with:
   * - Top navigation bar buttons (y < 120px)
   * - Profile / Google Account / Avatar buttons
   * - Prompt clear/close ('✕') buttons
   * - Media attachment ('+') buttons
   * - Model selector badges
   * - Stop / Cancel buttons
   */
  public isDisqualifiedButton(el: Element, rect?: DOMRect): boolean {
    if (!rect) {
      rect = el.getBoundingClientRect();
    }

    // Rule 0: NEVER disqualify verified Google Flow generate components
    if (el.closest('flow-generate-icon-button') || el.tagName.toLowerCase() === 'flow-generate-icon-button') {
      return false;
    }

    // Must be visible
    if (!FlowDetector.isElementVisible(el)) return true;

    // Disabled buttons
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return true;

    // RULE 1: Never interact with elements in the top navigation/header bar (y < 120px)
    if (rect.top < 120 || rect.bottom < 150) {
      return true;
    }

    // Collect accessible descriptor attributes
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const testId = (el.getAttribute('data-testid') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const text = (el.textContent || '').trim().toLowerCase();
    const attrDesc = `${aria} ${title} ${testId} ${id}`;

    // RULE 2: Excluded keywords from configuration checked on accessible attributes
    for (const kw of FLOW_SELECTORS.excludedButtonKeywords) {
      if (attrDesc.includes(kw)) {
        return true;
      }
    }

    // RULE 3: Never match user avatar or image buttons (Google Account, profile picture)
    if (el.querySelector('img')) {
      const img = el.querySelector('img')!;
      const src = (img.src || '').toLowerCase();
      const alt = (img.alt || '').toLowerCase();
      if (
        src.includes('googleusercontent') ||
        src.includes('avatar') ||
        src.includes('profile') ||
        alt.includes('profile') ||
        alt.includes('account')
      ) {
        return true;
      }
    }

    // RULE 4: Exact symbol checks for clear ('✕') or attach ('+')
    if (text === '✕' || text === '×' || text === 'x' || text === '+') {
      return true;
    }

    return false;
  }

  /**
   * Scores an element based on how closely it matches Google Flow's
   * circular white submit button with the right arrow (➔).
   */
  public scoreArrowCandidate(el: Element, rect: DOMRect, inputRect?: DOMRect | null): number {
    let score = 0;

    const comp = window.getComputedStyle(el);
    const text = (el.textContent || '').trim();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const testId = (el.getAttribute('data-testid') || '').toLowerCase();

    // 1. Arrow glyph or icon text
    if (text.includes('➔') || text.includes('➜') || text.includes('→') || text.includes('➤') || text.includes('►')) {
      score += 60;
    }

    // 2. SVG Arrow or Send indicators
    const svgs = el.querySelectorAll('svg');
    if (svgs.length > 0) {
      score += 20;
      for (const svg of svgs) {
        const svgIcon = (svg.getAttribute('data-icon') || '').toLowerCase();
        const svgAria = (svg.getAttribute('aria-label') || '').toLowerCase();
        if (
          svgIcon.includes('arrow') ||
          svgIcon.includes('east') ||
          svgIcon.includes('forward') ||
          svgIcon.includes('send')
        ) {
          score += 50;
        }
        if (
          svgAria.includes('arrow') ||
          svgAria.includes('east') ||
          svgAria.includes('forward') ||
          svgAria.includes('send') ||
          svgAria.includes('generate') ||
          svgAria.includes('submit')
        ) {
          score += 50;
        }
        const paths = svg.querySelectorAll('path');
        for (const p of paths) {
          const d = p.getAttribute('d') || '';
          if (
            d.includes('M12 4') ||
            d.includes('M15 5') ||
            d.includes('16.17') ||
            d.includes('M2.01 21') ||
            d.includes('arrow') ||
            d.includes('east')
          ) {
            score += 50;
          }
        }
      }
    }

    // 3. Aria / title submit keywords
    if (
      aria.includes('generate') ||
      aria.includes('submit') ||
      aria.includes('create') ||
      aria.includes('send') ||
      aria.includes('run')
    ) {
      score += 40;
    }
    if (
      title.includes('generate') ||
      title.includes('submit') ||
      title.includes('create') ||
      title.includes('send')
    ) {
      score += 40;
    }
    if (testId.includes('submit') || testId.includes('generate')) {
      score += 40;
    }

    // 4. Circular shape (In Flow screenshot, the submit button is a white circle)
    const borderRadius = comp.borderRadius || '';
    const isCircular = borderRadius.includes('50%') || parseFloat(borderRadius) >= 16;
    if (isCircular) {
      score += 30;
    }
    const aspect = rect.width / (rect.height || 1);
    if (aspect >= 0.75 && aspect <= 1.35) {
      score += 15;
    }
    if (rect.width >= 24 && rect.width <= 64 && rect.height >= 24 && rect.height <= 64) {
      score += 15;
    }

    // 5. White / bright background color (contrasting against dark theme)
    const bg = comp.backgroundColor;
    const rgbMatch = bg.match(/\d+/g);
    if (rgbMatch && rgbMatch.length >= 3) {
      const r = parseInt(rgbMatch[0], 10);
      const g = parseInt(rgbMatch[1], 10);
      const b = parseInt(rgbMatch[2], 10);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance > 0.7) {
        score += 30; // Prominent white/light button
      }
    }

    // 6. Relative positioning: Bottom-right corner of prompt input
    if (inputRect) {
      // Must not be above the prompt input
      if (rect.bottom < inputRect.top) {
        return -1000;
      }
      // Horizontally in the right half of the prompt container
      const inputCenterX = inputRect.left + inputRect.width / 2;
      if (rect.left >= inputCenterX) {
        score += 25;
      }
      // Close to the right edge
      if (rect.right >= inputRect.right - 80) {
        score += 30;
      }
      // Near or below the bottom of the input
      if (rect.bottom >= inputRect.bottom - 40) {
        score += 25;
      }
    }

    return score;
  }

  /**
   * Accurately finds the white circular right-arrow (➔) submit button in Google Flow.
   * Strictly prevents selecting the user profile icon, header icons, clear button, or media attach button.
   */
  public findFlowArrowSubmitButton(inputEl?: Element | null): Element | null {
    // Strategy 0: Direct Google Flow Angular custom element selector (VERIFIED LIVE DOM)
    const directFlowSelectors = [
      'flow-generate-icon-button button',
      'div.bottom-controls flow-generate-icon-button button',
      'flow-base-prompt-box flow-generate-icon-button button',
      'flow-prompt-box flow-generate-icon-button button',
      'flow-prompt-box-instruction-card-wrapper flow-generate-icon-button button',
      'flow-generate-icon-button',
      'div.bottom-controls flow-generate-icon-button',
      'flow-base-prompt-box .bottom-controls button',
    ];

    for (const sel of directFlowSelectors) {
      try {
        const matches = querySelectorAllDeep(sel);
        for (const btn of matches) {
          if (FlowDetector.isElementVisible(btn)) {
            console.log(`[FlowAutomator] MATCHED EXACT GOOGLE FLOW GENERATE BUTTON (${sel}):`, btn);
            return btn;
          }
        }
      } catch {}
    }

    const inputRect = inputEl ? inputEl.getBoundingClientRect() : null;

    let bestCandidate: Element | null = null;
    let highestScore = 0;

    // Strategy 1: Prompt Card Ancestor Traversal (Highest Priority & Precision)
    // Walk up from inputEl to find the prompt card container and inspect all buttons inside it
    if (inputEl) {
      let current: Element | null = inputEl;
      for (let i = 0; i < 6 && current; i++) {
        const parent: Element | null =
          current.parentElement || ((current.getRootNode() as ShadowRoot)?.host as Element | null);
        if (!parent || parent === document.body || parent === document.documentElement) break;

        const candidateButtons = querySelectorAllDeep(
          'button, [role="button"], [class*="button" i], [class*="arrow" i], [class*="submit" i], md-icon-button, mwc-icon-button, cr-icon-button, div[tabindex], svg',
          parent
        );

        for (const btn of candidateButtons) {
          if (btn === inputEl) continue;
          const rect = btn.getBoundingClientRect();
          if (this.isDisqualifiedButton(btn, rect)) continue;

          const score = this.scoreArrowCandidate(btn, rect, inputRect);
          if (score > highestScore) {
            highestScore = score;
            bestCandidate = btn;
          }
        }

        // If high confidence match found inside prompt card container, return immediately!
        if (bestCandidate && highestScore >= 60) {
          console.log('[FlowAutomator] Found prompt submit arrow inside prompt card:', bestCandidate, 'score:', highestScore);
          return bestCandidate;
        }

        current = parent;
      }
    }

    // Strategy 2: Targeted Flow submit button selectors across the page
    for (const sel of FLOW_SELECTORS.submitButtonSelectors) {
      try {
        const matches = querySelectorAllDeep(sel);
        for (const btn of matches) {
          if (btn === inputEl) continue;
          const rect = btn.getBoundingClientRect();
          if (this.isDisqualifiedButton(btn, rect)) continue;

          const score = this.scoreArrowCandidate(btn, rect, inputRect);
          if (score > highestScore) {
            highestScore = score;
            bestCandidate = btn;
          }
        }
      } catch {}
    }

    // Strategy 3: Page-wide search among all visible buttons in the bottom half of the screen
    if (!bestCandidate || highestScore < 30) {
      const allButtons = querySelectorAllDeep(
        'button, [role="button"], [class*="button" i], [class*="arrow" i], md-icon-button, svg'
      );
      for (const btn of allButtons) {
        if (btn === inputEl) continue;
        const rect = btn.getBoundingClientRect();
        if (this.isDisqualifiedButton(btn, rect)) continue;

        // Must be in the lower portion of the viewport (prompt area)
        if (typeof window !== 'undefined' && rect.top < window.innerHeight * 0.3) continue;

        const score = this.scoreArrowCandidate(btn, rect, inputRect);
        if (score > highestScore) {
          highestScore = score;
          bestCandidate = btn;
        }
      }
    }

    if (bestCandidate) {
      console.log('[FlowAutomator] Selected submit arrow button:', bestCandidate, 'score:', highestScore);
    } else {
      console.warn('[FlowAutomator] No submit arrow candidate reached threshold.');
    }

    return highestScore >= 25 ? bestCandidate : null;
  }

  /**
   * Triggers submission by:
   * 1. Dispatching Enter & Ctrl+Enter keyboard events exclusively on the prompt input.
   * 2. Finding and clicking the Google Flow white circular right-arrow (➔) submit button.
   * Strictly isolates events to the prompt box and NEVER targets the user profile icon or header buttons.
   */
  public triggerEnterAndSubmit(inputEl: Element): void {
    // If generation is already underway, do not double-trigger
    if (this.detector.isGenerating()) {
      return;
    }

    // 1. Focus the prompt input field
    if (inputEl instanceof HTMLElement) {
      inputEl.focus();
    }

    // 2. Dispatch Enter & Ctrl+Enter keyboard events DIRECTLY on the prompt input
    this.dispatchEnterKeyEvent(inputEl);

    // 3. Staggered attempts to click the button to allow Angular Reactive Forms change detection to enable it
    const clickSubmitIfFound = () => {
      const btn = this.findFlowArrowSubmitButton(inputEl);
      if (btn && !this.detector.isGenerating()) {
        console.log('[FlowAutomator] Triggering click on Google Flow generate button:', btn);
        this.clickElement(btn);
        return true;
      }
      return false;
    };

    // Immediate attempt
    clickSubmitIfFound();

    // Form submission fallback if inside a <form>
    if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement) {
      if (inputEl.form) {
        try {
          inputEl.form.requestSubmit();
        } catch {}
      }
    }

    // Attempt 2: After 100ms (Angular microtask / input event settling)
    setTimeout(() => {
      if (inputEl instanceof HTMLElement && document.activeElement !== inputEl) {
        inputEl.focus();
      }
      this.dispatchEnterKeyEvent(inputEl);
      clickSubmitIfFound();
    }, 100);

    // Attempt 3: After 250ms
    setTimeout(() => {
      clickSubmitIfFound();
    }, 250);

    // Attempt 4: After 500ms
    setTimeout(() => {
      clickSubmitIfFound();
    }, 500);
  }

  private dispatchEnterKeyEvent(target: Element): void {
    if (target instanceof HTMLElement) {
      target.focus();
    }

    const fireKey = (key: string, code: string, keyCode: number, ctrlKey = false) => {
      for (const type of ['keydown', 'keypress', 'keyup'] as const) {
        if (type === 'keypress' && ctrlKey) continue;
        const evt = new KeyboardEvent(type, {
          key,
          code,
          keyCode,
          which: keyCode,
          charCode: type === 'keypress' ? keyCode : 0,
          ctrlKey,
          metaKey: ctrlKey, // Cmd+Enter on macOS
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
        });

        try {
          Object.defineProperty(evt, 'keyCode', { value: keyCode });
          Object.defineProperty(evt, 'which', { value: keyCode });
          Object.defineProperty(evt, 'key', { value: key });
          Object.defineProperty(evt, 'code', { value: code });
        } catch {}

        target.dispatchEvent(evt);
      }
    };

    // 1. Standard Enter
    fireKey('Enter', 'Enter', 13, false);

    // 2. Simulated paragraph insertion event
    try {
      target.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: 'insertParagraph',
        })
      );
    } catch {}

    // 3. Ctrl+Enter / Cmd+Enter (universal generative AI submit shortcut)
    fireKey('Enter', 'Enter', 13, true);

    // CRITICAL: Only dispatch on activeElement IF activeElement is a text input inside the prompt card,
    // NEVER if activeElement is a button, avatar, or external element!
    const active = document.activeElement;
    if (
      active &&
      active !== target &&
      this.isInputElement(active) &&
      !this.isDisqualifiedButton(active)
    ) {
      fireKey('Enter', 'Enter', 13, false);
      fireKey('Enter', 'Enter', 13, true);
    }
  }

  public async submitPrompt(): Promise<boolean> {
    // If already generating, don't double-trigger
    if (this.detector.isGenerating()) {
      return true;
    }

    const inputEl = await this.findPromptInput();
    if (inputEl) {
      this.triggerEnterAndSubmit(inputEl);
      return true;
    }

    // Fallback: Find arrow submit button directly
    const arrowBtn = this.findFlowArrowSubmitButton(null);
    if (arrowBtn) {
      this.clickElement(arrowBtn);
      return true;
    }

    return false;
  }

  public async waitForGenerationStart(timeoutMs?: number): Promise<boolean> {
    return this.detector.waitForGenerationStart(timeoutMs);
  }

  public async waitForGenerationComplete(timeoutMs: number): Promise<boolean> {
    return this.detector.waitForGenerationComplete(timeoutMs);
  }

  public isGenerating(): boolean {
    return this.detector.isGenerating();
  }

  public isGenerationComplete(): boolean {
    return this.detector.isGenerationComplete();
  }

  public async findDownloadControl(): Promise<Element | null> {
    for (const sel of FLOW_SELECTORS.downloadSelectors) {
      try {
        const matches = querySelectorAllDeep(sel);
        for (const el of matches) {
          if (FlowDetector.isElementVisible(el)) {
            return el;
          }
        }
      } catch {
        // Skip
      }
    }

    const buttons = querySelectorAllDeep('button, a');
    for (const el of buttons) {
      if (!FlowDetector.isElementVisible(el)) continue;
      const text = (el.textContent || '').trim().toLowerCase();
      for (const kw of FLOW_SELECTORS.downloadTextKeywords) {
        if (text.includes(kw)) {
          return el;
        }
      }
    }

    return null;
  }

  public async downloadResult(_filename?: string): Promise<boolean> {
    const downloadEl = await this.findDownloadControl();
    if (!downloadEl) {
      return false;
    }

    this.clickElement(downloadEl, true);
    return true;
  }

  public getStatus(): { isFlow: boolean; hasInput: boolean; isBusy: boolean; pageUrl: string } {
    const isFlow = FlowDetector.isSupportedUrl(this.customUrlPattern) || FlowDetector.hasFlowDomLandmarks();
    const hasInput = FlowDetector.hasFlowDomLandmarks();
    const isBusy = this.detector.isGenerating();
    const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

    return {
      isFlow,
      hasInput,
      isBusy,
      pageUrl,
    };
  }

  private clickElement(el: Element, skipDisqualificationCheck = false): void {
    if (!skipDisqualificationCheck && this.isDisqualifiedButton(el)) {
      return;
    }

    if (el instanceof HTMLElement) {
      el.focus();
    }

    // 1. Native click method invocation (required for Angular Material components)
    try {
      if (typeof (el as HTMLElement).click === 'function') {
        (el as HTMLElement).click();
      }
    } catch {}

    // 2. Fire full sequence of pointer & mouse events
    const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const eventName of mouseEvents) {
      try {
        const evt = new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
        });
        el.dispatchEvent(evt);
      } catch {}
    }

    // 3. Angular Material component child propagation
    if (el.tagName.toLowerCase() === 'flow-generate-icon-button') {
      const innerBtn = el.querySelector('button');
      if (innerBtn && innerBtn !== el) {
        try {
          innerBtn.click();
        } catch {}
      }
    } else if (el.tagName.toLowerCase() === 'button') {
      const parentTag = el.parentElement?.tagName.toLowerCase();
      if (parentTag === 'flow-generate-icon-button') {
        try {
          (el.parentElement as HTMLElement).click();
        } catch {}
      }
    }
  }
}

// Instantiate adapter in content script context
const adapter = new GoogleFlowAdapter();

// Listen for messages from extension service worker
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse: (response: MessageResponse) => void) => {
      handleContentMessage(message)
        .then((res) => sendResponse(res))
        .catch((err) => {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return true; // Keep message channel open for async response
    }
  );
}

async function handleContentMessage(message: ExtensionMessage): Promise<MessageResponse> {
  switch (message.type) {
    case 'FLOW_CHECK_STATUS': {
      const status = adapter.getStatus();
      return { success: true, data: status };
    }

    case 'FLOW_INSERT_PROMPT': {
      const ok = await adapter.insertPrompt(message.prompt);
      return { success: ok };
    }

    case 'FLOW_VERIFY_INSERTION': {
      const ok = await adapter.verifyPromptInserted(message.prompt);
      const isReady = await adapter.isReadyToSubmit();
      return { success: ok, data: { verified: ok, isReady } };
    }

    case 'FLOW_ATTEMPT_BUTTON_SUBMIT': {
      const attempted = await adapter.attemptButtonSubmit();
      return { success: true, data: { attempted } };
    }

    case 'FLOW_ATTEMPT_SYNTHETIC_ENTER': {
      const attempted = await adapter.attemptSyntheticEnter();
      return { success: true, data: { attempted } };
    }

    case 'FLOW_FOCUS_COMPOSER': {
      const ok = await adapter.focusComposer();
      return { success: ok };
    }

    case 'FLOW_DETECT_SUBMISSION': {
      const submitted = await adapter.detectSubmission();
      return { success: true, data: { submitted } };
    }

    case 'FLOW_SUBMIT_PROMPT': {
      const ok = await adapter.submitPrompt();
      return { success: ok };
    }

    case 'FLOW_CHECK_GENERATION_STATE': {
      const isGen = adapter.isGenerating();
      const isComp = adapter.isGenerationComplete();
      return {
        success: true,
        data: { isGenerating: isGen, isComplete: isComp },
      };
    }

    case 'FLOW_WAIT_GENERATION_COMPLETE': {
      const completed = await adapter.waitForGenerationComplete(message.timeoutMs);
      return {
        success: true,
        data: { completed },
      };
    }

    case 'FLOW_TRIGGER_DOWNLOAD': {
      const downloaded = await adapter.downloadResult(message.filename);
      return { success: downloaded };
    }

    default:
      return { success: false, error: 'Unknown message type received in content script' };
  }
}

// Expose diagnostic debugging tool in browser console
if (typeof window !== 'undefined') {
  (window as any).__flowAutomatorDebug = async () => {
    console.log('=== [FlowAutomator Diagnostics] ===');
    const input = await adapter.findPromptInput();
    console.log('1. Prompt Input Element:', input);
    if (!input) {
      console.warn('No prompt input detected with current selectors!');
      return;
    }
    const inputRect = input.getBoundingClientRect();
    console.log('   Input Rect:', inputRect);
    const arrow = adapter.findFlowArrowSubmitButton(input);
    console.log('2. Detected Arrow Submit Button:', arrow);
    if (arrow) {
      console.log('   Arrow Outer HTML:', arrow.outerHTML);
      console.log('   Arrow Rect:', arrow.getBoundingClientRect());
      console.log('   Arrow Computed Style:', window.getComputedStyle(arrow).borderRadius, window.getComputedStyle(arrow).backgroundColor);
    } else {
      console.warn('No arrow submit button matched with sufficient confidence.');
    }
    return { input, arrow };
  };
}
