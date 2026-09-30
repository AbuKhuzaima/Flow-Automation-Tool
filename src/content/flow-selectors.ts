/**
 * Google Flow Prompt Automator - Flow DOM Selectors & Detection Strategies
 * 
 * IMPORTANT ARCHITECTURAL PRINCIPLE:
 * All Google Flow DOM selectors, URLs, and element inspection heuristics are isolated
 * entirely within this file. If Google updates the Flow UI, update this configuration
 * without modifying any core extension or automation logic.
 * 
 * See FLOW_SELECTORS.md for comprehensive documentation on these selectors.
 */

export interface SelectorConfig {
  urlPatterns: string[];
  inputSelectors: string[];
  submitButtonSelectors: string[];
  submitButtonTextKeywords: string[];
  excludedButtonKeywords: string[];
  generatingIndicators: string[];
  generatingTextKeywords: string[];
  completionIndicators: string[];
  downloadSelectors: string[];
  downloadTextKeywords: string[];
}

export const FLOW_SELECTORS: SelectorConfig = {
  /**
   * URLs that qualify as Google Flow / Google Labs Generative Media platforms
   */
  urlPatterns: [
    'flow.google.com',
    'labs.google/flow',
    'aitestkitchen.withgoogle.com',
    'flow.google',
    'labs.google',
    'google.com',
    'localhost',
    '127.0.0.1',
  ],

  /**
   * Input field detection (ordered by specificity and stability).
   * Supports both native <textarea>/<input>, rich contenteditable <div> elements,
   * ProseMirror, Lexical, Draft.js, Slate, and custom shadow DOM wrappers.
   */
  /**
   * Input field detection (ordered by specificity and stability).
   * Supports both native <textarea>/<input>, rich contenteditable <div> elements,
   * ProseMirror, Lexical, Draft.js, Slate, and custom shadow DOM wrappers.
   */
  inputSelectors: [
    // 0. Verified Google Flow Angular components
    'flow-base-prompt-box textarea',
    'flow-base-prompt-box [contenteditable="true"]',
    'flow-base-prompt-box [role="textbox"]',
    'flow-prompt-box textarea',
    'flow-prompt-box [contenteditable="true"]',
    'flow-prompt-box-instruction-card-wrapper textarea',

    // 1. Semantic ARIA & Accessible labels
    'textarea[aria-label*="prompt" i]',
    'div[contenteditable="true"][aria-label*="prompt" i]',
    'textarea[aria-label*="describe" i]',
    'div[contenteditable="true"][aria-label*="describe" i]',

    // 2. Placeholder attributes
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="describe" i]',
    'textarea[placeholder*="create" i]',
    'textarea[placeholder*="generate" i]',
    'div[contenteditable="true"][data-placeholder*="prompt" i]',
    'div[contenteditable="true"][data-placeholder*="describe" i]',
    'div[contenteditable="true"][data-placeholder*="create" i]',

    // 3. Flow-specific role & generic rich-text editors
    'div[role="textbox"][contenteditable="true"]',
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    'div[contenteditable=""]',
    '[contenteditable]',
    'div.ProseMirror',
    'div.ql-editor',
    'div[data-slate-editor="true"]',
    'div[role="combobox"] textarea',
    'div[role="combobox"] [contenteditable="true"]',

    // 4. Stable DOM element fallbacks
    'form textarea',
    'main textarea',
    '[data-testid*="prompt-input" i]',
    '[data-testid*="prompt" i]',
    'textarea',
    'input[type="text"][placeholder*="prompt" i]',
    'input[type="text"][aria-label*="prompt" i]',
    'input[type="text"]',
  ],

  /**
   * Submit / Generate button selectors (ordered by specificity).
   * Strictly targeted to prompt generation controls.
   * NEVER include generic 'button:has(svg)' or '[role="button"]:has(svg)' which
   * inadvertently match header, navigation, or profile icon buttons!
   */
  submitButtonSelectors: [
    // 0. Verified Google Flow Angular Custom Elements (Matches exact live DOM)
    'flow-generate-icon-button button',
    'flow-generate-icon-button [role="button"]',
    'flow-generate-icon-button',
    'div.bottom-controls flow-generate-icon-button button',
    'div.bottom-controls flow-generate-icon-button',
    'flow-base-prompt-box flow-generate-icon-button button',
    'flow-base-prompt-box .bottom-controls button',
    'flow-prompt-box flow-generate-icon-button button',
    'flow-prompt-box-instruction-card-wrapper flow-generate-icon-button button',

    // 1. Accessible labels & test IDs
    'button[aria-label*="generate" i]',
    'button[aria-label*="create" i]',
    'button[aria-label*="submit" i]',
    'button[aria-label*="run" i]',
    'button[aria-label*="send" i]',
    'button[title*="generate" i]',
    'button[title*="create" i]',
    'button[title*="submit" i]',
    'button[title*="send" i]',
    '[data-testid*="generate-button" i]',
    '[data-testid*="submit-button" i]',
    '[data-testid*="prompt-submit" i]',
    '[role="button"][aria-label*="generate" i]',
    '[role="button"][aria-label*="create" i]',
    '[role="button"][aria-label*="submit" i]',
    '[role="button"][aria-label*="send" i]',

    // 2. Semantic types
    'button[type="submit"]',

    // 3. Flow-specific arrow & send icons (NO GENERIC button:has(svg)!)
    'button:has(svg[data-icon*="arrow"])',
    'button:has(svg[data-icon*="east"])',
    'button:has(svg[data-icon*="forward"])',
    'button:has(svg[data-icon*="send"])',
    'button:has(svg[aria-label*="send" i])',
    'button:has(svg[aria-label*="arrow" i])',
    'button:has(svg[aria-label*="generate" i])',
    'button:has(svg[aria-label*="submit" i])',
    'button:has(svg path[d*="M2.01 21L23 12 2.01 3"])', // Standard Material Send
    'button:has(svg path[d*="M12 4"])',                   // Material arrow_forward
    'button:has(svg path[d*="M15 5"])',                   // Material east
    'button:has(svg path[d*="16.17"])',                  // arrow_forward path
    '[role="button"]:has(svg[data-icon*="arrow"])',
    '[role="button"]:has(svg[data-icon*="east"])',
    '[role="button"]:has(svg[data-icon*="send"])',
  ],

  /**
   * Keywords inside button text that signal submission
   */
  submitButtonTextKeywords: [
    'generate',
    'submit',
    'create video',
    'create',
    'run',
    'send',
    'render',
    'go',
  ],

  /**
   * Keywords for buttons or elements that must NEVER be treated as submit buttons
   * (e.g. user profile avatar, header tools, clear button, attach media button, stop/cancel).
   */
  excludedButtonKeywords: [
    'account',
    'profile',
    'avatar',
    'google',
    'user',
    'clear',
    'close',
    'dismiss',
    'delete',
    'remove',
    'attach',
    'upload',
    'help',
    'support',
    'settings',
    'menu',
    'home',
    'search',
    'filter',
    'nano banana',
    'stop',
    'cancel',
  ],

  /**
   * Selectors indicating an ongoing generation/processing state
   */
  generatingIndicators: [
    '[role="progressbar"]',
    '[aria-busy="true"]',
    '.generating',
    '.loading-spinner',
    'svg.animate-spin',
    'button[aria-label*="stop" i]',
    'button[aria-label*="cancel" i]',
    '[data-state="generating"]',
    '[data-state="loading"]',
    '.skeleton',
    '.shimmer',
  ],

  /**
   * Button text keywords indicating that generation is actively happening
   */
  generatingTextKeywords: [
    'generating',
    'creating',
    'rendering',
    'processing',
    'cancel',
    'stop generation',
  ],

  /**
   * Selectors indicating that a generation has completed
   */
  completionIndicators: [
    'video[src]',
    'video source[src]',
    'canvas.output-canvas',
    'button[aria-label*="download" i]',
    'a[download]',
    '[data-testid*="generation-result" i]',
    '[data-state="completed"]',
  ],

  /**
   * Selectors for downloading generated media
   */
  downloadSelectors: [
    'button[aria-label*="download" i]',
    'a[download]',
    'a[aria-label*="download" i]',
    '[data-testid*="download-button" i]',
    'button:has(svg[data-icon="download"])',
    'button:has(svg path[d*="M19 9h-4V3H9v6H5l7 7 7-7z"])', // Material download icon path
  ],

  /**
   * Keywords for download controls
   */
  downloadTextKeywords: [
    'download',
    'save video',
    'export',
  ],
};
