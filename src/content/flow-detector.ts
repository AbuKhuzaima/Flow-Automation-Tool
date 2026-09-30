/**
 * Google Flow Prompt Automator - Flow Page Detector
 * 
 * Verifies whether the current tab/frame is an active Google Flow instance.
 */

import { FLOW_SELECTORS } from './flow-selectors';

export class FlowDetector {
  /**
   * Check whether the current window URL matches any supported Flow pattern.
   */
  public static isSupportedUrl(customPattern?: string): boolean {
    if (typeof window === 'undefined' || !window.location) {
      return false;
    }

    const currentUrl = window.location.href.toLowerCase();

    // Check custom pattern if provided
    if (customPattern && customPattern.trim().length > 0) {
      try {
        const regex = new RegExp(customPattern.trim(), 'i');
        if (regex.test(currentUrl)) {
          return true;
        }
      } catch {
        if (currentUrl.includes(customPattern.trim().toLowerCase())) {
          return true;
        }
      }
    }

    // Check built-in patterns
    for (const pattern of FLOW_SELECTORS.urlPatterns) {
      if (currentUrl.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check whether key Flow DOM landmarks exist in the current page.
   */
  public static hasFlowDomLandmarks(): boolean {
    if (typeof document === 'undefined') return false;

    // Check for any input match
    for (const sel of FLOW_SELECTORS.inputSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && this.isElementVisible(el)) {
          return true;
        }
      } catch {
        // Ignore selector errors
      }
    }

    return false;
  }

  /**
   * Helper to check if an element is visible and interactive.
   */
  public static isElementVisible(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
