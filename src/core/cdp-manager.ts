/**
 * Google Flow Prompt Automator - Chrome DevTools Protocol (CDP) Manager
 * 
 * Handles trusted browser-level keyboard and pointer events via chrome.debugger API.
 * Dispatches genuine OS/browser-level Enter key events that satisfy framework-level
 * checks (isTrusted === true) where synthetic JavaScript KeyboardEvents are ignored.
 */

import { logger } from './logger';

export class CdpManager {
  private attachedTabs = new Set<number>();
  private activeOperations = new Map<number, Promise<boolean>>();

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.debugger?.onDetach) {
      chrome.debugger.onDetach.addListener((source, reason) => {
        if (source.tabId) {
          this.attachedTabs.delete(source.tabId);
          logger.info(`[FLOW] CDP debugger detached from tab #${source.tabId} (reason: ${reason})`);
        }
      });
    }
  }

  /**
   * Check whether the debugger is currently attached to a given tab
   */
  public isAttached(tabId: number): boolean {
    return this.attachedTabs.has(tabId);
  }

  /**
   * Attach chrome.debugger to the target tab using protocol version 1.3
   */
  public async attach(tabId: number): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.debugger) {
      logger.warn('[FLOW] chrome.debugger API is not available in current environment');
      return false;
    }

    if (this.attachedTabs.has(tabId)) {
      return true;
    }

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      this.attachedTabs.add(tabId);
      logger.info(`[FLOW] CDP debugger attached to tab #${tabId}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Another debugger is already attached')) {
        logger.warn(
          `[FLOW] CDP attach blocked: Another debugger or DevTools is already attached to tab #${tabId}. ` +
          `Please close Chrome DevTools on the Google Flow tab to allow trusted CDP keyboard input.`
        );
      } else {
        logger.warn(`[FLOW] CDP attach failed on tab #${tabId}: ${msg}`);
      }
      return false;
    }
  }

  /**
   * Detach chrome.debugger from target tab cleanly
   */
  public async detach(tabId: number): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.debugger) return;
    if (!this.attachedTabs.has(tabId)) return;

    try {
      await chrome.debugger.detach({ tabId });
      this.attachedTabs.delete(tabId);
      logger.info(`[FLOW] CDP debugger detached cleanly from tab #${tabId}`);
    } catch {
      this.attachedTabs.delete(tabId);
    }
  }

  /**
   * Detach debugger from all active tabs (called on stop / pause / error)
   */
  public async detachAll(): Promise<void> {
    const tabs = Array.from(this.attachedTabs);
    for (const tabId of tabs) {
      await this.detach(tabId);
    }
  }

  /**
   * Dispatches a genuine, trusted browser-level Enter key sequence
   * through Chrome DevTools Protocol Input domain:
   * 1. rawKeyDown (Enter)
   * 2. char (\r)
   * 3. keyUp (Enter)
   * 
   * This generates isTrusted: true events that trigger Angular Material,
   * React, Lit, and browser native form submission handlers.
   */
  public async sendTrustedEnter(tabId: number): Promise<boolean> {
    // Avoid concurrent overlapping CDP commands on the same tab
    const existingOp = this.activeOperations.get(tabId);
    if (existingOp) {
      return existingOp;
    }

    const op = this.executeCdpEnterSequence(tabId);
    this.activeOperations.set(tabId, op);

    try {
      return await op;
    } finally {
      this.activeOperations.delete(tabId);
    }
  }

  private async executeCdpEnterSequence(tabId: number): Promise<boolean> {
    const attached = await this.attach(tabId);
    if (!attached) {
      logger.warn(`[FLOW] Cannot dispatch CDP Enter: debugger not attached to tab #${tabId}`);
      return false;
    }

    try {
      // Step 1: rawKeyDown (Enter)
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        macCharCode: 13,
        code: 'Enter',
        key: 'Enter',
        text: '\r',
        unmodifiedText: '\r',
      });

      // Brief micro-pause matching real hardware key latency (30ms)
      await new Promise((r) => setTimeout(r, 30));

      // Step 2: char event (\r carriage return)
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'char',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        macCharCode: 13,
        code: 'Enter',
        key: 'Enter',
        text: '\r',
        unmodifiedText: '\r',
      });

      // Brief micro-pause
      await new Promise((r) => setTimeout(r, 30));

      // Step 3: keyUp (Enter)
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        macCharCode: 13,
        code: 'Enter',
        key: 'Enter',
      });

      logger.info(`[FLOW] Enter dispatched through CDP`);
      return true;
    } catch (err: unknown) {
      logger.error(`[FLOW] Error sending CDP Input.dispatchKeyEvent to tab #${tabId}:`, err);
      return false;
    } finally {
      // Always detach debugger when operation completes to remove the "Debugging this tab" bar
      await this.detach(tabId);
    }
  }
}

export const cdpManager = new CdpManager();
