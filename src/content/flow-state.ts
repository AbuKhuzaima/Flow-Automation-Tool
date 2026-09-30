/**
 * Google Flow Prompt Automator - Flow Generation State Detector
 * 
 * Monitors Flow DOM to detect when video/prompt generation starts and finishes.
 * Never hangs indefinitely: every wait method enforces a maximum timeout.
 */

import { FLOW_SELECTORS } from './flow-selectors';
import { FlowDetector } from './flow-detector';

export class FlowGenerationDetector {
  /**
   * Determine if the UI currently indicates active generation or processing.
   */
  public isGenerating(): boolean {
    if (typeof document === 'undefined') return false;

    // 1. Check generating indicator selectors
    for (const sel of FLOW_SELECTORS.generatingIndicators) {
      try {
        const matches = document.querySelectorAll(sel);
        for (const el of matches) {
          if (FlowDetector.isElementVisible(el)) {
            return true;
          }
        }
      } catch {
        // Skip invalid selector
      }
    }

    // 2. Check buttons with generating keywords
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (!FlowDetector.isElementVisible(btn)) continue;
      const text = (btn.textContent || '').trim().toLowerCase();
      for (const kw of FLOW_SELECTORS.generatingTextKeywords) {
        if (text.includes(kw)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Determine if the UI currently exhibits finished generation indicators.
   */
  public isGenerationComplete(): boolean {
    if (typeof document === 'undefined') return false;

    // Check completion indicators
    for (const sel of FLOW_SELECTORS.completionIndicators) {
      try {
        const matches = document.querySelectorAll(sel);
        for (const el of matches) {
          if (FlowDetector.isElementVisible(el)) {
            return true;
          }
        }
      } catch {
        // Skip
      }
    }

    return false;
  }

  /**
   * Wait until generation starts (or timeout occurs).
   * Usually occurs within a few seconds of submitting.
   */
  public async waitForGenerationStart(timeoutMs: number = 8000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.isGenerating()) {
        return true;
      }
      await this.sleep(400);
    }

    return false;
  }

  /**
   * Wait until generation completes (or timeout occurs).
   * Smart detection monitors when isGenerating() switches to false,
   * or completion indicators appear.
   */
  public async waitForGenerationComplete(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    let hasSeenGenerating = false;

    // First, give Flow a short window to initiate generation
    const startConfirmed = await this.waitForGenerationStart(6000);
    if (startConfirmed) {
      hasSeenGenerating = true;
    }

    while (Date.now() - startTime < timeoutMs) {
      const generating = this.isGenerating();

      if (generating) {
        hasSeenGenerating = true;
      } else if (hasSeenGenerating) {
        // It was generating, and now it has stopped!
        // Allow a small settling delay to ensure output elements render
        await this.sleep(1200);
        return true;
      } else if (this.isGenerationComplete()) {
        return true;
      }

      await this.sleep(1000);
    }

    // If timeout reached without explicit completion signal
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
