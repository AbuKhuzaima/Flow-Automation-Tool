/**
 * Google Flow Prompt Automator - Automation Orchestrator
 * 
 * Controls the end-to-end automation lifecycle:
 * - Queue iteration
 * - Tab validation & multi-tab safety
 * - Dynamic content script injection via chrome.scripting
 * - Communication with Content Script
 * - Smart generation monitoring vs fixed delays
 * - Automatic downloads
 * - Pause, Resume, Stop, Skip, Retry
 * - State persistence across popup closures
 */

import {
  AutomationSettings,
  AutomationState,
  ExtensionMessage,
  MessageResponse,
  PromptItem,
} from '../types';
import { QueueManager } from './queue-manager';
import { stateManager } from './state-manager';
import { logger } from './logger';
import { DownloadManager } from './download-manager';
import { cdpManager } from './cdp-manager';

export class AutomationManager {
  private static instance: AutomationManager;
  private queueManager: QueueManager;
  private settings: AutomationSettings;
  private state: AutomationState;
  private isExecuting: boolean = false;
  private abortRequested: boolean = false;
  private pauseRequested: boolean = false;
  private activeSleepReject: ((reason?: unknown) => void) | null = null;

  private constructor() {
    this.queueManager = new QueueManager();
    this.settings = {} as AutomationSettings;
    this.state = {} as AutomationState;
  }

  public static getInstance(): AutomationManager {
    if (!AutomationManager.instance) {
      AutomationManager.instance = new AutomationManager();
    }
    return AutomationManager.instance;
  }

  public async initialize(): Promise<void> {
    this.settings = await stateManager.loadSettings();
    this.state = await stateManager.loadState();
    const storedQueue = await stateManager.loadQueue();
    this.queueManager.setQueue(storedQueue);

    logger.setDebugMode(this.settings.debugMode);
    const storedLogs = await stateManager.loadLogs();
    logger.loadStoredLogs(storedLogs);

    // Subscribe to queue changes for persistence
    this.queueManager.subscribe(async (updatedQueue) => {
      await stateManager.saveQueue(updatedQueue);
      this.updateStateMetrics();
    });

    // Subscribe to logs for persistence
    logger.subscribe(async () => {
      await stateManager.saveLogs(logger.getLogs());
    });

    logger.info('Automation Manager initialized');
  }

  public getQueueManager(): QueueManager {
    return this.queueManager;
  }

  public getSettings(): AutomationSettings {
    return { ...this.settings };
  }

  public getState(): AutomationState {
    return { ...this.state };
  }

  public async updateSettings(newSettings: Partial<AutomationSettings>): Promise<AutomationSettings> {
    this.settings = await stateManager.saveSettings(newSettings);
    logger.setDebugMode(this.settings.debugMode);
    logger.info('Automation settings updated', newSettings);
    return this.settings;
  }

  public async setTargetTab(tabId: number): Promise<void> {
    this.settings.targetTabId = tabId;
    await stateManager.saveSettings({ targetTabId: tabId });
    this.state.targetTabId = tabId;
    await this.verifyTargetTab();
    await this.persistState();
    logger.info(`Target tab set to #${tabId}`);
  }

  /**
   * Scan browser tabs for active Google Flow / Labs instances
   */
  public async findFlowTabs(): Promise<chrome.tabs.Tab[]> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return [];
    }

    return new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        const flowTabs = tabs.filter((t) => {
          const url = (t.url || '').toLowerCase();
          return (
            url.includes('flow.google') ||
            url.includes('labs.google') ||
            url.includes('aitestkitchen') ||
            url.includes('google.com') ||
            (this.settings.customFlowUrlPattern &&
              url.includes(this.settings.customFlowUrlPattern.toLowerCase()))
          );
        });
        resolve(flowTabs);
      });
    });
  }

  /**
   * Ensure the content script is active in the target tab.
   * If not active (e.g. pre-existing tab before extension load), injects it via chrome.scripting.
   */
  public async ensureContentScriptInjected(tabId: number): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return true;
    }

    // Ping content script to check if it's already listening
    const isResponding = await new Promise<boolean>((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'FLOW_CHECK_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (isResponding) {
      return true;
    }

    // Not responding: dynamically inject content script
    if (chrome.scripting?.executeScript) {
      try {
        logger.info(`Injecting flow-automation content script into tab #${tabId}...`);
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: false },
          files: ['content/flow-automation.js'],
        });
        // Give the script a moment to register listeners
        await new Promise((r) => setTimeout(r, 250));
        return true;
      } catch (err) {
        logger.warn(`Could not inject content script into tab #${tabId}:`, err);
        return false;
      }
    }

    return false;
  }

  public async verifyTargetTab(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return true; // Non-chrome test environment
    }

    let tabId = this.settings.targetTabId || this.state.targetTabId;

    // If no tabId explicitly set, try the currently active tab first
    if (!tabId) {
      const activeTabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
      });

      if (activeTabs.length > 0 && activeTabs[0].id) {
        tabId = activeTabs[0].id;
        this.state.targetTabId = tabId;
        this.state.targetTabUrl = activeTabs[0].url || null;
      }
    }

    // If still no tab, search all open tabs
    if (!tabId) {
      const flowTabs = await this.findFlowTabs();
      if (flowTabs.length > 0 && flowTabs[0].id) {
        tabId = flowTabs[0].id;
        this.state.targetTabId = tabId;
        this.state.targetTabUrl = flowTabs[0].url || null;
      }
    }

    if (!tabId) {
      this.state.targetTabConnected = false;
      return false;
    }

    return new Promise((resolve) => {
      chrome.tabs.get(tabId!, async (tab) => {
        if (chrome.runtime.lastError || !tab) {
          logger.warn(`Target tab #${tabId} not accessible`);
          this.state.targetTabConnected = false;
          this.state.targetTabId = null;
          await this.persistState();
          resolve(false);
          return;
        }

        this.state.targetTabConnected = true;
        this.state.targetTabId = tab.id || null;
        this.state.targetTabUrl = tab.url || null;

        // Ensure script is injected
        if (tab.id) {
          await this.ensureContentScriptInjected(tab.id);
        }

        await this.persistState();
        resolve(true);
      });
    });
  }

  /**
   * Start or resume automation
   */
  public async start(): Promise<void> {
    if (this.isExecuting) {
      if (this.state.status === 'PAUSED') {
        return this.resume();
      }
      logger.warn('Automation is already running');
      return;
    }

    const isTabReady = await this.verifyTargetTab();
    if (!isTabReady) {
      const msg = 'Please open Google Flow in a browser tab before starting.';
      logger.error(msg);
      this.state.lastError = msg;
      this.state.status = 'ERROR';
      await this.persistState();
      throw new Error(msg);
    }

    const nextPrompt = this.queueManager.getNextPendingPrompt();
    if (!nextPrompt) {
      logger.warn('No pending prompts in queue to automate');
      this.state.status = 'COMPLETED';
      await this.persistState();
      return;
    }

    this.isExecuting = true;
    this.abortRequested = false;
    this.pauseRequested = false;
    this.state.status = 'RUNNING';
    this.state.lastError = null;
    this.state.startedAt = this.state.startedAt || Date.now();
    await this.persistState();

    logger.info('Automation started');

    // Run execution loop asynchronously in background
    this.runLoop().catch(async (err) => {
      logger.error('Unhandled error in automation loop', err);
      this.state.status = 'ERROR';
      this.state.lastError = err instanceof Error ? err.message : String(err);
      this.isExecuting = false;
      await this.persistState();
    });
  }

  public async pause(): Promise<void> {
    if (!this.isExecuting || this.state.status !== 'RUNNING') {
      return;
    }

    logger.info('Pausing automation...');
    this.pauseRequested = true;
    this.state.status = 'PAUSED';
    this.state.currentPromptStateText = 'Paused';

    // Cancel active sleep immediately
    if (this.activeSleepReject) {
      this.activeSleepReject(new Error('PAUSE_TRIGGERED'));
      this.activeSleepReject = null;
    }

    try {
      await cdpManager.detachAll();
    } catch {}

    await this.persistState();
  }

  public async resume(): Promise<void> {
    if (this.state.status !== 'PAUSED') {
      return;
    }

    logger.info('Resuming automation...');
    this.pauseRequested = false;
    this.abortRequested = false;
    this.state.status = 'RUNNING';
    this.state.lastError = null;
    await this.persistState();

    if (!this.isExecuting) {
      this.isExecuting = true;
      this.runLoop().catch(async (err) => {
        logger.error('Unhandled error in resumed automation loop', err);
        this.state.status = 'ERROR';
        this.state.lastError = err instanceof Error ? err.message : String(err);
        this.isExecuting = false;
        await this.persistState();
      });
    }
  }

  public async stop(): Promise<void> {
    logger.info('Stopping automation...');
    this.abortRequested = true;
    this.pauseRequested = false;
    this.isExecuting = false;
    this.state.status = 'STOPPED';
    this.state.currentPromptStateText = 'Stopped';

    if (this.activeSleepReject) {
      this.activeSleepReject(new Error('STOP_TRIGGERED'));
      this.activeSleepReject = null;
    }

    try {
      await cdpManager.detachAll();
    } catch {}

    await this.persistState();
  }

  public async skipCurrent(): Promise<void> {
    if (this.state.currentPromptId) {
      this.queueManager.skipPrompt(this.state.currentPromptId);
      logger.info(`Skipped prompt ${this.state.currentPromptId}`);
      if (this.activeSleepReject) {
        this.activeSleepReject(new Error('SKIP_TRIGGERED'));
        this.activeSleepReject = null;
      }
    } else {
      const next = this.queueManager.getNextPendingPrompt();
      if (next) {
        this.queueManager.skipPrompt(next.id);
        logger.info(`Skipped prompt #${next.index}`);
      }
    }
    this.updateStateMetrics();
    await this.persistState();
  }

  public async retryPrompt(promptId: string): Promise<void> {
    this.queueManager.retryPrompt(promptId);
    logger.info(`Retrying prompt ${promptId}`);
    this.updateStateMetrics();
    await this.persistState();
  }

  public async retryAllFailed(): Promise<void> {
    const count = this.queueManager.retryAllFailed();
    logger.info(`Retrying ${count} failed prompts`);
    this.updateStateMetrics();
    await this.persistState();
  }

  /**
   * The core automation execution loop
   */
  private async runLoop(): Promise<void> {
    while (this.isExecuting && !this.abortRequested) {
      if (this.pauseRequested) {
        this.state.status = 'PAUSED';
        await this.persistState();
        break;
      }

      const nextItem = this.queueManager.getNextPendingPrompt();
      if (!nextItem) {
        logger.info('All prompts in queue have been processed!');
        this.state.status = 'COMPLETED';
        this.state.currentPromptStateText = 'Completed all prompts';
        this.state.currentPromptId = null;
        this.isExecuting = false;
        await this.persistState();
        break;
      }

      await this.processSinglePrompt(nextItem);
    }

    this.isExecuting = false;
  }


  /**
   * Activates the target tab and focuses its window so browser-level
   * trusted keyboard input (CDP) and focus events are properly received.
   */
  public async activateFlowTab(tabId: number): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return true;
    try {
      const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
        chrome.tabs.get(tabId, (t) => resolve(chrome.runtime.lastError ? undefined : t));
      });
      if (tab?.windowId) {
        await new Promise<void>((resolve) => {
          chrome.windows.update(tab.windowId, { focused: true }, () => resolve());
        });
      }
      await new Promise<void>((resolve) => {
        chrome.tabs.update(tabId, { active: true }, () => resolve());
      });
      return true;
    } catch (err) {
      logger.warn(`Could not activate tab #${tabId}:`, err);
      return false;
    }
  }

  /**
   * Multi-Layer Submission System:
   * ATTEMPT 1: Actual Flow submit button
   * ATTEMPT 2: Normal synthetic keyboard event
   * ATTEMPT 3: Chrome DevTools Protocol (CDP) trusted Enter
   * ATTEMPT 4: Re-focus Flow tab/composer and retry CDP input once
   */
  private async executeSubmissionHierarchy(targetTabId: number, item: PromptItem): Promise<boolean> {
    // 0. Quick check: Is Flow ALREADY generating? (e.g. if previous action triggered it)
    const initialState = await this.sendMessageToTab(targetTabId, { type: 'FLOW_DETECT_SUBMISSION' });
    if (initialState.success && (initialState.data as any)?.submitted) {
      logger.info('[FLOW] Submission detected prior to submission pipeline');
      return true;
    }

    // --- ATTEMPT 1: Actual Flow submit button ---
    logger.info('[FLOW] [ATTEMPT 1] Attempting button submission...');
    const btnRes = await this.sendMessageToTab(targetTabId, { type: 'FLOW_ATTEMPT_BUTTON_SUBMIT' });
    if (btnRes.success && (btnRes.data as any)?.attempted) {
      await this.interruptibleSleep(600);
      const sub1 = await this.sendMessageToTab(targetTabId, { type: 'FLOW_DETECT_SUBMISSION' });
      if (sub1.success && (sub1.data as any)?.submitted) {
        logger.info('[FLOW] Submission detected via submit button');
        return true;
      }
      logger.warn('[FLOW] Button submission did not trigger generation reaction');
    } else {
      logger.warn('[FLOW] Submit button was not available or not enabled');
    }

    if (this.abortRequested || this.pauseRequested) return false;

    // --- ATTEMPT 2: Normal keyboard event ---
    logger.info('[FLOW] [ATTEMPT 2] Attempting synthetic keyboard Enter submission...');
    await this.sendMessageToTab(targetTabId, { type: 'FLOW_ATTEMPT_SYNTHETIC_ENTER' });
    await this.interruptibleSleep(600);
    const sub2 = await this.sendMessageToTab(targetTabId, { type: 'FLOW_DETECT_SUBMISSION' });
    if (sub2.success && (sub2.data as any)?.submitted) {
      logger.info('[FLOW] Submission detected via keyboard event');
      return true;
    }
    logger.warn('[FLOW] Synthetic Enter did not trigger submission (likely ignored by framework)');

    if (this.abortRequested || this.pauseRequested) return false;

    // --- ATTEMPT 3: Chrome debugger / CDP keyboard input ---
    logger.info('[FLOW] [ATTEMPT 3] Attempting trusted CDP Enter...');
    await this.activateFlowTab(targetTabId);
    await this.sendMessageToTab(targetTabId, { type: 'FLOW_FOCUS_COMPOSER' });
    await this.interruptibleSleep(150);

    const cdpSuccess = await cdpManager.sendTrustedEnter(targetTabId);
    if (cdpSuccess) {
      await this.interruptibleSleep(800);
      const sub3 = await this.sendMessageToTab(targetTabId, { type: 'FLOW_DETECT_SUBMISSION' });
      if (sub3.success && (sub3.data as any)?.submitted) {
        logger.info('[FLOW] Submission detected via CDP Enter');
        return true;
      }
      logger.warn('[FLOW] CDP Enter did not trigger submission on first attempt');
    }

    if (this.abortRequested || this.pauseRequested) return false;

    // --- ATTEMPT 4: Re-focus Flow tab/composer and retry CDP input once ---
    logger.info('[FLOW] [ATTEMPT 4] Re-focusing Flow tab & composer for final CDP retry...');
    await this.activateFlowTab(targetTabId);
    await this.sendMessageToTab(targetTabId, { type: 'FLOW_FOCUS_COMPOSER' });
    await this.interruptibleSleep(250);

    const cdpRetrySuccess = await cdpManager.sendTrustedEnter(targetTabId);
    if (cdpRetrySuccess) {
      await this.interruptibleSleep(800);
      const sub4 = await this.sendMessageToTab(targetTabId, { type: 'FLOW_DETECT_SUBMISSION' });
      if (sub4.success && (sub4.data as any)?.submitted) {
        logger.info('[FLOW] Submission detected via final CDP retry');
        return true;
      }
    }

    // Final safety check: Has generation started anyway?
    const genCheck = await this.sendMessageToTab(targetTabId, { type: 'FLOW_CHECK_GENERATION_STATE' });
    if (genCheck.success && (genCheck.data as any)?.isGenerating) {
      logger.info('[FLOW] Submission detected via generation state active');
      return true;
    }

    logger.error(`[FLOW] All 4 submission attempts failed to trigger Flow generation for prompt #${item.index}`);
    return false;
  }

  private async processSinglePrompt(item: PromptItem): Promise<void> {
    this.state.currentPromptId = item.id;
    this.state.currentIndex = item.index;
    this.state.currentPromptText = item.text;
    this.state.currentPromptStateText = `Preparing prompt #${item.index}...`;
    this.queueManager.updatePromptStatus(item.id, 'PROCESSING');
    await this.persistState();

    logger.info(`[FLOW] Starting prompt #${item.index} of ${this.queueManager.getQueue().length}`);

    try {
      // 1. Validate Target Tab
      const tabOk = await this.verifyTargetTab();
      if (!tabOk) {
        throw new Error('Target browser tab is missing or disconnected');
      }

      const targetTabId = this.state.targetTabId!;

      // Ensure Flow tab/window is active and brought to front
      await this.activateFlowTab(targetTabId);

      // 2. Insert Prompt into Flow Composer
      this.state.currentPromptStateText = `Pasting prompt #${item.index}...`;
      await this.persistState();

      const insertRes = await this.sendMessageToTab(targetTabId, {
        type: 'FLOW_INSERT_PROMPT',
        prompt: item.text,
      });

      if (!insertRes.success) {
        throw new Error(insertRes.error || 'Failed to insert prompt into Flow composer');
      }

      // 3. Verify Prompt Insertion & UI Readiness
      this.state.currentPromptStateText = `Verifying prompt #${item.index}...`;
      await this.persistState();

      const verifyRes = await this.sendMessageToTab(targetTabId, {
        type: 'FLOW_VERIFY_INSERTION',
        prompt: item.text,
      });

      if (!verifyRes.success) {
        throw new Error(verifyRes.error || 'Prompt insertion could not be verified in Flow composer');
      }

      // Micro-pause for framework reactive validation
      await this.interruptibleSleep(300);
      if (this.abortRequested || this.pauseRequested) return;

      // 4. Multi-Layer Submission Execution
      this.state.currentPromptStateText = `Submitting prompt #${item.index}...`;
      await this.persistState();

      const submitted = await this.executeSubmissionHierarchy(targetTabId, item);
      if (!submitted) {
        throw new Error(`Failed to submit prompt #${item.index} after all submission strategies`);
      }

      this.queueManager.updatePromptStatus(item.id, 'SUBMITTED');
      await this.persistState();

      // 5. Generation Phase
      this.queueManager.updatePromptStatus(item.id, 'GENERATING');
      this.state.currentPromptStateText = `Generating video for prompt #${item.index}...`;
      await this.persistState();
      logger.info(`[FLOW] Generation started for prompt #${item.index}`);

      if (this.settings.automationMode === 'SMART_DETECTION') {
        logger.info(
          `Waiting for generation completion using Smart Detection (timeout: ${this.settings.maxWaitTimeSec}s)...`
        );

        const genRes = await this.sendMessageToTab(targetTabId, {
          type: 'FLOW_WAIT_GENERATION_COMPLETE',
          timeoutMs: this.settings.maxWaitTimeSec * 1000,
        });

        if (genRes.success && (genRes.data as { completed: boolean })?.completed) {
          logger.info(`Generation complete detected for prompt #${item.index}`);
        } else {
          logger.warn(
            `Generation timeout of ${this.settings.maxWaitTimeSec}s reached. Proceeding to post-generation phase.`
          );
        }
      } else {
        // Fixed Delay Mode
        logger.info(
          `Waiting for generation with fixed delay of ${this.settings.maxWaitTimeSec}s...`
        );
        await this.interruptibleSleep(this.settings.maxWaitTimeSec * 1000);
      }

      // Check if paused or stopped
      if (this.abortRequested || this.pauseRequested) return;

      // 5. Post-generation delay
      if (this.settings.postGenerationDelaySec > 0) {
        this.state.currentPromptStateText = `Post-generation delay (${this.settings.postGenerationDelaySec}s)...`;
        await this.persistState();
        await this.interruptibleSleep(this.settings.postGenerationDelaySec * 1000);
      }

      // 6. Optional Download
      if (this.settings.autoDownload) {
        this.state.currentPromptStateText = `Attempting automatic download for prompt #${item.index}...`;
        this.queueManager.updateDownloadStatus(item.id, 'DOWNLOAD_PENDING');
        await this.persistState();

        const filename = DownloadManager.formatFilename(
          this.settings.downloadNamingPattern,
          item.index,
          item.text
        );

        const dlRes = await this.sendMessageToTab(targetTabId, {
          type: 'FLOW_TRIGGER_DOWNLOAD',
          filename,
        });

        if (dlRes.success) {
          this.queueManager.updateDownloadStatus(item.id, 'DOWNLOADED');
          logger.info(`Download triggered successfully for prompt #${item.index}`);
        } else {
          this.queueManager.updateDownloadStatus(item.id, 'DOWNLOAD_FAILED');
          logger.warn(`Download control could not be triggered for prompt #${item.index}`);
        }
      }

      // 7. Mark Prompt COMPLETED
      this.queueManager.updatePromptStatus(item.id, 'COMPLETED');
      logger.info(`Prompt #${item.index} COMPLETED`);

      // 8. Submission delay before next prompt
      if (this.settings.submissionDelaySec > 0 && this.queueManager.getNextPendingPrompt()) {
        this.state.currentPromptStateText = `Waiting ${this.settings.submissionDelaySec}s before next prompt...`;
        await this.persistState();
        await this.interruptibleSleep(this.settings.submissionDelaySec * 1000);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (errMsg === 'PAUSE_TRIGGERED' || errMsg === 'STOP_TRIGGERED' || errMsg === 'SKIP_TRIGGERED') {
        logger.info(`Single prompt execution interrupted: ${errMsg}`);
        return;
      }

      logger.error(`Prompt #${item.index} FAILED: ${errMsg}`);
      this.queueManager.updatePromptStatus(item.id, 'FAILED', errMsg);
      this.state.lastError = `Prompt #${item.index} failed: ${errMsg}`;
      this.state.currentPromptStateText = `Failed on #${item.index}: ${errMsg}`;
      await this.persistState();

      // Pause automation on failure so user has full control to inspect, retry, or skip
      await this.pause();
    }
  }

  private updateStateMetrics(): void {
    const stats = this.queueManager.getStats({
      submissionDelaySec: this.settings.submissionDelaySec,
      postGenerationDelaySec: this.settings.postGenerationDelaySec,
      maxWaitTimeSec: this.settings.maxWaitTimeSec,
    });

    this.state.totalCount = stats.total;
    this.state.completedCount = stats.completed;
    this.state.processingCount = stats.processing;
    this.state.failedCount = stats.failed;
    this.state.remainingCount = stats.remaining;
    this.state.skippedCount = stats.skipped;
    this.state.progressPercent = stats.percent;
    this.state.estimatedRemainingSeconds = stats.estimatedRemainingSeconds;
  }

  private async persistState(): Promise<void> {
    this.updateStateMetrics();
    this.state.updatedAt = Date.now();
    await stateManager.saveState(this.state);
    this.broadcastState();
  }

  private broadcastState(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'STATE_CHANGED',
          state: this.getState(),
        }).catch(() => {
          // No active popup listener, ignore
        });
      } catch {
        // Ignore
      }
    }
  }

  private async sendMessageToTab(tabId: number, message: ExtensionMessage): Promise<MessageResponse> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      return { success: true };
    }

    // Ensure content script is injected and ready
    await this.ensureContentScriptInjected(tabId);

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, async (response) => {
        if (chrome.runtime.lastError) {
          // Retry once with fresh injection
          try {
            if (chrome.scripting?.executeScript) {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/flow-automation.js'],
              });
              await new Promise((r) => setTimeout(r, 200));
              chrome.tabs.sendMessage(tabId, message, (retryRes) => {
                if (chrome.runtime.lastError) {
                  resolve({
                    success: false,
                    error: chrome.runtime.lastError.message || 'Error communicating with Flow tab',
                  });
                } else {
                  resolve(retryRes || { success: true });
                }
              });
              return;
            }
          } catch {}

          resolve({
            success: false,
            error: chrome.runtime.lastError.message || 'Error communicating with Flow tab',
          });
        } else {
          resolve(response || { success: true });
        }
      });
    });
  }

  private interruptibleSleep(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.activeSleepReject = null;
        resolve();
      }, ms);

      this.activeSleepReject = (reason) => {
        clearTimeout(timer);
        reject(reason);
      };
    });
  }
}

export const automationManager = AutomationManager.getInstance();
