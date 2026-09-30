/**
 * Google Flow Prompt Automator - State Manager
 * 
 * Persists extension state, settings, queue, and logs to chrome.storage.local
 * with automatic fallback for non-extension / testing environments.
 */

import { AutomationSettings, AutomationState, LogEntry, PromptItem } from '../types';

export const DEFAULT_SETTINGS: AutomationSettings = {
  submissionDelaySec: 10,
  maxWaitTimeSec: 180,
  postGenerationDelaySec: 5,
  automationMode: 'SMART_DETECTION',
  autoDownload: false,
  downloadNamingPattern: 'FlowPrompt_{index}_{timestamp}',
  targetTabId: null,
  anthropicApiKey: '',
  anthropicModel: 'claude-3-5-sonnet-20241022',
  debugMode: false,
  customFlowUrlPattern: '',
};

export const DEFAULT_STATE: AutomationState = {
  status: 'IDLE',
  currentIndex: 0,
  currentPromptId: null,
  totalCount: 0,
  completedCount: 0,
  processingCount: 0,
  failedCount: 0,
  remainingCount: 0,
  skippedCount: 0,
  progressPercent: 0,
  estimatedRemainingSeconds: 0,
  currentPromptText: '',
  currentPromptStateText: 'Ready',
  lastError: null,
  targetTabId: null,
  targetTabUrl: null,
  targetTabConnected: false,
  startedAt: null,
  updatedAt: Date.now(),
};

export interface StoredData {
  settings: AutomationSettings;
  state: AutomationState;
  queue: PromptItem[];
  logs: LogEntry[];
}

export class StateManager {
  private static instance: StateManager;
  private mockStorage: Record<string, unknown> = {};

  private constructor() {}

  public static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  private isChromeStorageAvailable(): boolean {
    return typeof chrome !== 'undefined' && !!chrome?.storage?.local;
  }

  public async loadSettings(): Promise<AutomationSettings> {
    if (this.isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['settings'], (result) => {
          const loaded = result?.settings;
          resolve({
            ...DEFAULT_SETTINGS,
            ...(loaded || {}),
          });
        });
      });
    }

    const stored = this.mockStorage['settings'] as Partial<AutomationSettings> | undefined;
    return {
      ...DEFAULT_SETTINGS,
      ...(stored || {}),
    };
  }

  public async saveSettings(settings: Partial<AutomationSettings>): Promise<AutomationSettings> {
    const current = await this.loadSettings();
    const updated: AutomationSettings = {
      ...current,
      ...settings,
    };

    if (this.isChromeStorageAvailable()) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ settings: updated }, () => resolve());
      });
    } else {
      this.mockStorage['settings'] = updated;
    }

    return updated;
  }

  public async loadState(): Promise<AutomationState> {
    if (this.isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['state'], (result) => {
          const loaded = result?.state;
          resolve({
            ...DEFAULT_STATE,
            ...(loaded || {}),
          });
        });
      });
    }

    const stored = this.mockStorage['state'] as Partial<AutomationState> | undefined;
    return {
      ...DEFAULT_STATE,
      ...(stored || {}),
    };
  }

  public async saveState(state: Partial<AutomationState>): Promise<AutomationState> {
    const current = await this.loadState();
    const updated: AutomationState = {
      ...current,
      ...state,
      updatedAt: Date.now(),
    };

    if (this.isChromeStorageAvailable()) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ state: updated }, () => resolve());
      });
    } else {
      this.mockStorage['state'] = updated;
    }

    return updated;
  }

  public async loadQueue(): Promise<PromptItem[]> {
    if (this.isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['queue'], (result) => {
          const queue = result?.queue;
          resolve(Array.isArray(queue) ? queue : []);
        });
      });
    }

    const stored = this.mockStorage['queue'];
    return Array.isArray(stored) ? (stored as PromptItem[]) : [];
  }

  public async saveQueue(queue: PromptItem[]): Promise<void> {
    if (this.isChromeStorageAvailable()) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ queue }, () => resolve());
      });
    } else {
      this.mockStorage['queue'] = queue;
    }
  }

  public async loadLogs(): Promise<LogEntry[]> {
    if (this.isChromeStorageAvailable()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['logs'], (result) => {
          const logs = result?.logs;
          resolve(Array.isArray(logs) ? logs : []);
        });
      });
    }

    const stored = this.mockStorage['logs'];
    return Array.isArray(stored) ? (stored as LogEntry[]) : [];
  }

  public async saveLogs(logs: LogEntry[]): Promise<void> {
    // Keep max 200 logs in persistent storage to avoid hitting quota
    const trimmed = logs.slice(-200);
    if (this.isChromeStorageAvailable()) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ logs: trimmed }, () => resolve());
      });
    } else {
      this.mockStorage['logs'] = trimmed;
    }
  }

  public async clearAll(): Promise<void> {
    if (this.isChromeStorageAvailable()) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.clear(() => resolve());
      });
    } else {
      this.mockStorage = {};
    }
  }
}

export const stateManager = StateManager.getInstance();
