/**
 * Google Flow Prompt Automator - Popup Dashboard Controller
 */

import {
  AutomationSettings,
  AutomationState,
  ExtensionMessage,
  LogEntry,
  MessageResponse,
  PromptItem,
  PromptStatus,
} from '../types';
import { PromptParser } from '../core/prompt-parser';

// DOM Element References
const elements = {
  // Tabs
  navTabs: document.querySelectorAll<HTMLButtonElement>('.nav-tab'),
  tabPanes: document.querySelectorAll<HTMLElement>('.tab-pane'),

  // Header status & window controls
  connectionPill: document.getElementById('connectionPill') as HTMLElement,
  connectionText: document.getElementById('connectionText') as HTMLElement,
  openFlowBtn: document.getElementById('openFlowBtn') as HTMLButtonElement,
  pickActiveTabBtn: document.getElementById('pickActiveTabBtn') as HTMLButtonElement,
  openSidePanelBtn: document.getElementById('openSidePanelBtn') as HTMLButtonElement,
  popoutWindowBtn: document.getElementById('popoutWindowBtn') as HTMLButtonElement,
  keepOpenBanner: document.getElementById('keepOpenBanner') as HTMLElement,
  dismissBannerBtn: document.getElementById('dismissBannerBtn') as HTMLButtonElement,

  // Input toggles
  togglePasteBtn: document.getElementById('togglePasteBtn') as HTMLButtonElement,
  toggleUploadBtn: document.getElementById('toggleUploadBtn') as HTMLButtonElement,
  pasteMethodContainer: document.getElementById('pasteMethodContainer') as HTMLElement,
  uploadMethodContainer: document.getElementById('uploadMethodContainer') as HTMLElement,

  // Paste inputs
  promptInputArea: document.getElementById('promptInputArea') as HTMLTextAreaElement,
  inputCountPreview: document.getElementById('inputCountPreview') as HTMLElement,
  clearInputBtn: document.getElementById('clearInputBtn') as HTMLButtonElement,
  appendPasteBtn: document.getElementById('appendPasteBtn') as HTMLButtonElement,
  replacePasteBtn: document.getElementById('replacePasteBtn') as HTMLButtonElement,

  // Upload inputs
  dropZone: document.getElementById('dropZone') as HTMLElement,
  fileInput: document.getElementById('fileInput') as HTMLInputElement,
  fileUploadResult: document.getElementById('fileUploadResult') as HTMLElement,
  fileNameDisplay: document.getElementById('fileNameDisplay') as HTMLElement,
  fileCountDisplay: document.getElementById('fileCountDisplay') as HTMLElement,
  appendUploadBtn: document.getElementById('appendUploadBtn') as HTMLButtonElement,
  replaceUploadBtn: document.getElementById('replaceUploadBtn') as HTMLButtonElement,

  // Controls
  startBtn: document.getElementById('startBtn') as HTMLButtonElement,
  pauseBtn: document.getElementById('pauseBtn') as HTMLButtonElement,
  resumeBtn: document.getElementById('resumeBtn') as HTMLButtonElement,
  stopBtn: document.getElementById('stopBtn') as HTMLButtonElement,
  skipBtn: document.getElementById('skipBtn') as HTMLButtonElement,
  retryFailedBtn: document.getElementById('retryFailedBtn') as HTMLButtonElement,
  resetProgressBtn: document.getElementById('resetProgressBtn') as HTMLButtonElement,
  clearQueueBtn: document.getElementById('clearQueueBtn') as HTMLButtonElement,

  // Queue List
  queueCount: document.getElementById('queueCount') as HTMLElement,
  statusFilter: document.getElementById('statusFilter') as HTMLSelectElement,
  queueList: document.getElementById('queueList') as HTMLElement,

  // Progress metrics
  statTotal: document.getElementById('statTotal') as HTMLElement,
  statCompleted: document.getElementById('statCompleted') as HTMLElement,
  statProcessing: document.getElementById('statProcessing') as HTMLElement,
  statFailed: document.getElementById('statFailed') as HTMLElement,
  statRemaining: document.getElementById('statRemaining') as HTMLElement,
  progressPercent: document.getElementById('progressPercent') as HTMLElement,
  progressBarFill: document.getElementById('progressBarFill') as HTMLElement,
  estimatedRemainingText: document.getElementById('estimatedRemainingText') as HTMLElement,

  // Active prompt
  currentPromptIndexDisplay: document.getElementById('currentPromptIndexDisplay') as HTMLElement,
  currentStatusBadge: document.getElementById('currentStatusBadge') as HTMLElement,
  currentStateActivityText: document.getElementById('currentStateActivityText') as HTMLElement,
  currentPromptTextPreview: document.getElementById('currentPromptTextPreview') as HTMLElement,
  lastErrorAlert: document.getElementById('lastErrorAlert') as HTMLElement,
  lastErrorText: document.getElementById('lastErrorText') as HTMLElement,

  // AI Tools
  aiToolInput: document.getElementById('aiToolInput') as HTMLTextAreaElement,
  aiCleanupBtn: document.getElementById('aiCleanupBtn') as HTMLButtonElement,
  aiSplitBtn: document.getElementById('aiSplitBtn') as HTMLButtonElement,
  aiEnhanceBtn: document.getElementById('aiEnhanceBtn') as HTMLButtonElement,
  aiValidateBtn: document.getElementById('aiValidateBtn') as HTMLButtonElement,
  aiTransformInstruction: document.getElementById('aiTransformInstruction') as HTMLInputElement,
  aiTransformBtn: document.getElementById('aiTransformBtn') as HTMLButtonElement,
  aiLoadingIndicator: document.getElementById('aiLoadingIndicator') as HTMLElement,
  aiResultContainer: document.getElementById('aiResultContainer') as HTMLElement,
  aiResultCount: document.getElementById('aiResultCount') as HTMLElement,
  aiResultContent: document.getElementById('aiResultContent') as HTMLElement,
  aiInsertQueueBtn: document.getElementById('aiInsertQueueBtn') as HTMLButtonElement,

  // Settings
  settingSubmissionDelay: document.getElementById('settingSubmissionDelay') as HTMLInputElement,
  settingMaxWaitTime: document.getElementById('settingMaxWaitTime') as HTMLInputElement,
  settingPostGenDelay: document.getElementById('settingPostGenDelay') as HTMLInputElement,
  settingAutomationMode: document.getElementById('settingAutomationMode') as HTMLSelectElement,
  settingAutoDownload: document.getElementById('settingAutoDownload') as HTMLInputElement,
  settingDownloadPattern: document.getElementById('settingDownloadPattern') as HTMLInputElement,
  settingAnthropicApiKey: document.getElementById('settingAnthropicApiKey') as HTMLInputElement,
  settingAnthropicModel: document.getElementById('settingAnthropicModel') as HTMLSelectElement,
  settingCustomUrl: document.getElementById('settingCustomUrl') as HTMLInputElement,
  settingDebugMode: document.getElementById('settingDebugMode') as HTMLInputElement,
  saveSettingsBtn: document.getElementById('saveSettingsBtn') as HTMLButtonElement,
  settingsSavedBadge: document.getElementById('settingsSavedBadge') as HTMLElement,

  // Logs
  logsConsole: document.getElementById('logsConsole') as HTMLElement,
  copyLogsBtn: document.getElementById('copyLogsBtn') as HTMLButtonElement,
  clearLogsBtn: document.getElementById('clearLogsBtn') as HTMLButtonElement,

  // Modal
  confirmModal: document.getElementById('confirmModal') as HTMLElement,
  modalTitle: document.getElementById('modalTitle') as HTMLElement,
  modalMessage: document.getElementById('modalMessage') as HTMLElement,
  modalCancelBtn: document.getElementById('modalCancelBtn') as HTMLButtonElement,
  modalConfirmBtn: document.getElementById('modalConfirmBtn') as HTMLButtonElement,
};

// Local UI state
let currentQueue: PromptItem[] = [];
let currentState: AutomationState | null = null;
let uploadedFilePrompts: string[] = [];
let aiGeneratedPrompts: string[] = [];
let modalConfirmCallback: (() => void) | null = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupInputMethods();
  setupQueueControls();
  setupAITools();
  setupSettings();
  setupLogs();
  setupModal();
  setupRuntimeListener();

  // Load initial data from Service Worker
  await refreshAll();
});

// Runtime Messaging Helper
async function sendBgMessage<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response || !response.success) {
        reject(new Error(response?.error || 'Background request failed'));
      } else {
        resolve(response.data as T);
      }
    });
  });
}

// Global Refresh
async function refreshAll(): Promise<void> {
  try {
    const [state, queue, logs] = await Promise.all([
      sendBgMessage<AutomationState>({ type: 'GET_STATE' }),
      sendBgMessage<PromptItem[]>({ type: 'GET_QUEUE' }),
      sendBgMessage<LogEntry[]>({ type: 'GET_LOGS' }),
    ]);

    currentState = state;
    currentQueue = queue;
    renderState(state);
    renderQueue(queue);
    renderLogs(logs);
  } catch (err) {
    console.error('Failed to refresh data from service worker:', err);
  }
}

// Runtime Listener for Background State Updates
function setupRuntimeListener(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'STATE_CHANGED') {
      currentState = message.state;
      renderState(message.state);
    } else if (message.type === 'QUEUE_CHANGED') {
      currentQueue = message.queue;
      renderQueue(message.queue);
    } else if (message.type === 'LOG_ADDED') {
      appendLogLine(message.log);
    }
  });
}

// Tab Navigation
function setupNavigation(): void {
  elements.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      elements.navTabs.forEach((t) => t.classList.remove('active'));
      elements.tabPanes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      if (targetId) {
        document.getElementById(targetId)?.classList.add('active');
      }
    });
  });

  elements.openFlowBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://flow.google.com' });
  });

  // Pick / Lock Active Tab
  elements.pickActiveTabBtn?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        const tab = tabs[0];
        await sendBgMessage({ type: 'SET_TARGET_TAB', tabId: tab.id });
        elements.connectionText.textContent = `TARGET: TAB #${tab.id}`;
        elements.connectionPill.className = 'status-pill connected';
        await refreshAll();
      }
    });
  });

  // Dock to Side Panel
  elements.openSidePanelBtn?.addEventListener('click', async () => {
    try {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        const win = await chrome.windows.getCurrent();
        if (win && win.id) {
          await chrome.sidePanel.open({ windowId: win.id });
          window.close();
          return;
        }
      }
    } catch (err) {
      console.warn('Side panel open error:', err);
    }
    // Fallback: pop-out window
    openPopoutWindow();
  });

  // Pop-out Window
  elements.popoutWindowBtn?.addEventListener('click', () => {
    openPopoutWindow();
  });

  // Dismiss tip banner
  elements.dismissBannerBtn?.addEventListener('click', () => {
    elements.keepOpenBanner?.classList.add('hidden');
    chrome.storage.local.set({ bannerDismissed: true });
  });

  // Hide banner if dismissed or if already in popout window mode
  if (window.location.search.includes('mode=window')) {
    elements.keepOpenBanner?.classList.add('hidden');
    elements.popoutWindowBtn?.classList.add('hidden');
  } else {
    chrome.storage.local.get(['bannerDismissed'], (res) => {
      if (res?.bannerDismissed) {
        elements.keepOpenBanner?.classList.add('hidden');
      }
    });
  }
}

function openPopoutWindow(): void {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/index.html?mode=window'),
    type: 'popup',
    width: 540,
    height: 680,
    focused: true,
  });
  window.close();
}

// Input Methods (Paste vs Upload .TXT)
function setupInputMethods(): void {
  // Method toggles
  elements.togglePasteBtn.addEventListener('click', () => {
    elements.togglePasteBtn.classList.add('active');
    elements.toggleUploadBtn.classList.remove('active');
    elements.pasteMethodContainer.classList.remove('hidden');
    elements.uploadMethodContainer.classList.add('hidden');
  });

  elements.toggleUploadBtn.addEventListener('click', () => {
    elements.toggleUploadBtn.classList.add('active');
    elements.togglePasteBtn.classList.remove('active');
    elements.uploadMethodContainer.classList.remove('hidden');
    elements.pasteMethodContainer.classList.add('hidden');
  });

  // Prompt count preview on typing
  elements.promptInputArea.addEventListener('input', () => {
    const parsed = PromptParser.parse(elements.promptInputArea.value);
    elements.inputCountPreview.textContent = `${parsed.count} prompt${parsed.count === 1 ? '' : 's'} detected`;
  });

  elements.clearInputBtn.addEventListener('click', () => {
    elements.promptInputArea.value = '';
    elements.inputCountPreview.textContent = '0 prompts detected';
  });

  elements.appendPasteBtn.addEventListener('click', async () => {
    const parsed = PromptParser.parse(elements.promptInputArea.value);
    if (parsed.count === 0) return;
    const queue = await sendBgMessage<PromptItem[]>({
      type: 'SET_QUEUE',
      prompts: parsed.prompts,
      mode: 'append',
    });
    currentQueue = queue;
    renderQueue(queue);
    elements.promptInputArea.value = '';
    elements.inputCountPreview.textContent = '0 prompts detected';
    refreshAll();
  });

  elements.replacePasteBtn.addEventListener('click', async () => {
    const parsed = PromptParser.parse(elements.promptInputArea.value);
    if (parsed.count === 0) return;

    const proceed = () => {
      sendBgMessage<PromptItem[]>({
        type: 'SET_QUEUE',
        prompts: parsed.prompts,
        mode: 'replace',
      }).then((queue) => {
        currentQueue = queue;
        renderQueue(queue);
        elements.promptInputArea.value = '';
        elements.inputCountPreview.textContent = '0 prompts detected';
        refreshAll();
      });
    };

    if (currentQueue.length > 0 && hasProgress(currentQueue)) {
      showModal(
        'Replace Existing Queue?',
        'Your queue currently has prompts with completed or in-progress work. Replacing it will remove current progress.',
        proceed
      );
    } else {
      proceed();
    }
  });

  // File Upload (.TXT)
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());

  elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
  });

  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
  });

  elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  elements.fileInput.addEventListener('change', () => {
    if (elements.fileInput.files && elements.fileInput.files[0]) {
      handleSelectedFile(elements.fileInput.files[0]);
    }
  });

  elements.appendUploadBtn.addEventListener('click', async () => {
    if (uploadedFilePrompts.length === 0) return;
    const queue = await sendBgMessage<PromptItem[]>({
      type: 'SET_QUEUE',
      prompts: uploadedFilePrompts,
      mode: 'append',
    });
    currentQueue = queue;
    renderQueue(queue);
    elements.fileUploadResult.classList.add('hidden');
    uploadedFilePrompts = [];
    refreshAll();
  });

  elements.replaceUploadBtn.addEventListener('click', async () => {
    if (uploadedFilePrompts.length === 0) return;
    const proceed = () => {
      sendBgMessage<PromptItem[]>({
        type: 'SET_QUEUE',
        prompts: uploadedFilePrompts,
        mode: 'replace',
      }).then((queue) => {
        currentQueue = queue;
        renderQueue(queue);
        elements.fileUploadResult.classList.add('hidden');
        uploadedFilePrompts = [];
        refreshAll();
      });
    };

    if (currentQueue.length > 0 && hasProgress(currentQueue)) {
      showModal(
        'Replace Existing Queue?',
        'Your queue contains existing progress. Replacing will overwrite it.',
        proceed
      );
    } else {
      proceed();
    }
  });
}

function handleSelectedFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.txt')) {
    alert('Please select a valid .txt file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (evt) => {
    const content = evt.target?.result as string;
    const parsed = PromptParser.parseFileContent(content);
    uploadedFilePrompts = parsed.prompts;

    elements.fileNameDisplay.textContent = file.name;
    elements.fileCountDisplay.textContent = `${parsed.count} prompt${parsed.count === 1 ? '' : 's'} detected`;
    elements.fileUploadResult.classList.remove('hidden');
  };
  reader.readAsText(file);
}

// Queue Controls
function setupQueueControls(): void {
  elements.startBtn.addEventListener('click', async () => {
    try {
      elements.startBtn.disabled = true;

      // Auto-target current active tab in the browser window
      const tabs = await new Promise<chrome.tabs.Tab[]>((res) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (t) => res(t || []));
      });
      if (tabs.length > 0 && tabs[0].id) {
        await sendBgMessage({ type: 'SET_TARGET_TAB', tabId: tabs[0].id });
      }

      const state = await sendBgMessage<AutomationState>({ type: 'START_AUTOMATION' });
      currentState = state;
      renderState(state);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      elements.startBtn.disabled = false;
    }
  });

  elements.pauseBtn.addEventListener('click', async () => {
    const state = await sendBgMessage<AutomationState>({ type: 'PAUSE_AUTOMATION' });
    currentState = state;
    renderState(state);
  });

  elements.resumeBtn.addEventListener('click', async () => {
    const state = await sendBgMessage<AutomationState>({ type: 'RESUME_AUTOMATION' });
    currentState = state;
    renderState(state);
  });

  elements.stopBtn.addEventListener('click', async () => {
    const state = await sendBgMessage<AutomationState>({ type: 'STOP_AUTOMATION' });
    currentState = state;
    renderState(state);
  });

  elements.skipBtn.addEventListener('click', async () => {
    const state = await sendBgMessage<AutomationState>({ type: 'SKIP_CURRENT_PROMPT' });
    currentState = state;
    renderState(state);
  });

  elements.retryFailedBtn.addEventListener('click', async () => {
    const state = await sendBgMessage<AutomationState>({ type: 'RETRY_ALL_FAILED' });
    currentState = state;
    renderState(state);
    refreshAll();
  });

  elements.resetProgressBtn.addEventListener('click', () => {
    showModal(
      'Reset All Progress?',
      'This will reset all completed and failed prompts back to PENDING status so they can be run again.',
      async () => {
        const queue = await sendBgMessage<PromptItem[]>({ type: 'RESET_PROGRESS' });
        currentQueue = queue;
        renderQueue(queue);
        refreshAll();
      }
    );
  });

  elements.clearQueueBtn.addEventListener('click', () => {
    if (currentQueue.length === 0) return;

    const doClear = async () => {
      await sendBgMessage<PromptItem[]>({ type: 'CLEAR_QUEUE' });
      currentQueue = [];
      renderQueue([]);
      refreshAll();
    };

    if (hasProgress(currentQueue)) {
      showModal(
        'Clear Entire Queue?',
        'Warning: Your queue contains active or completed prompts. Clearing will permanently remove all progress.',
        doClear
      );
    } else {
      doClear();
    }
  });

  elements.statusFilter.addEventListener('change', () => {
    renderQueue(currentQueue);
  });
}

function hasProgress(queue: PromptItem[]): boolean {
  return queue.some(
    (item) => item.status === 'COMPLETED' || item.status === 'PROCESSING' || item.status === 'GENERATING'
  );
}

// Render Queue List
function renderQueue(queue: PromptItem[]): void {
  elements.queueCount.textContent = String(queue.length);
  const filter = elements.statusFilter.value;

  const filtered = filter === 'ALL' ? queue : queue.filter((item) => item.status === filter);

  if (filtered.length === 0) {
    elements.queueList.innerHTML = `
      <div class="empty-queue-placeholder">
        <p>${queue.length === 0 ? 'Queue is empty.' : 'No prompts match filter.'}</p>
        <span>${queue.length === 0 ? 'Paste prompts above or upload a .txt file to begin.' : ''}</span>
      </div>
    `;
    return;
  }

  elements.queueList.innerHTML = '';

  filtered.forEach((item) => {
    const card = document.createElement('div');
    card.className = `prompt-card ${item.status.toLowerCase()}`;
    card.id = `card-${item.id}`;

    const padIndex = String(item.index).padStart(2, '0');
    const dlBadge =
      item.downloadStatus === 'DOWNLOADED'
        ? '<span class="badge badge-dl-ok">DL ✓</span>'
        : item.downloadStatus === 'DOWNLOAD_FAILED'
        ? '<span class="badge badge-failed">DL ✗</span>'
        : '';

    card.innerHTML = `
      <div class="prompt-card-header">
        <span class="prompt-index">#${padIndex}</span>
        <div class="prompt-status-badges">
          ${dlBadge}
          <span class="badge badge-${item.status.toLowerCase()}">${item.status}</span>
        </div>
      </div>
      <div class="prompt-text" title="Click to expand/collapse">${escapeHtml(item.text)}</div>
      ${item.error ? `<div class="prompt-error-msg">⚠️ ${escapeHtml(item.error)}</div>` : ''}
      <div class="prompt-card-actions">
        ${
          item.status === 'FAILED'
            ? `<button class="btn btn-xs btn-outline retry-btn" data-id="${item.id}">Retry</button>`
            : ''
        }
        ${
          item.status === 'PENDING' || item.status === 'PROCESSING'
            ? `<button class="btn btn-xs btn-outline skip-item-btn" data-id="${item.id}">Skip</button>`
            : ''
        }
        <button class="btn btn-xs btn-ghost remove-item-btn" data-id="${item.id}" title="Remove prompt">✕</button>
      </div>
    `;

    // Click to toggle expansion
    card.querySelector('.prompt-text')?.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    // Retry single
    card.querySelector('.retry-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendBgMessage({ type: 'RETRY_PROMPT', promptId: item.id });
      refreshAll();
    });

    // Skip single
    card.querySelector('.skip-item-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendBgMessage({ type: 'SKIP_CURRENT_PROMPT' });
      refreshAll();
    });

    // Remove single
    card.querySelector('.remove-item-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendBgMessage({ type: 'REMOVE_PROMPT', promptId: item.id });
      refreshAll();
    });

    elements.queueList.appendChild(card);
  });
}

// Render Automation State
function renderState(state: AutomationState): void {
  // Connection Pill
  if (state.targetTabConnected && state.targetTabId) {
    elements.connectionPill.className = 'status-pill connected';
    elements.connectionText.textContent = `TARGET: TAB #${state.targetTabId}`;
    elements.openFlowBtn.classList.add('hidden');
  } else {
    elements.connectionPill.className = 'status-pill disconnected';
    elements.connectionText.textContent = 'NO TARGET TAB';
    elements.openFlowBtn.classList.remove('hidden');
  }

  // Primary Action Controls (Start / Pause / Resume / Stop)
  if (state.status === 'RUNNING') {
    elements.startBtn.classList.add('hidden');
    elements.resumeBtn.classList.add('hidden');
    elements.pauseBtn.classList.remove('hidden');
    elements.stopBtn.disabled = false;
  } else if (state.status === 'PAUSED') {
    elements.startBtn.classList.add('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.resumeBtn.classList.remove('hidden');
    elements.stopBtn.disabled = false;
  } else {
    // IDLE, STOPPED, COMPLETED, ERROR
    elements.startBtn.classList.remove('hidden');
    elements.pauseBtn.classList.add('hidden');
    elements.resumeBtn.classList.add('hidden');
    elements.stopBtn.disabled = state.status === 'IDLE';
  }

  // Metrics
  elements.statTotal.textContent = String(state.totalCount);
  elements.statCompleted.textContent = String(state.completedCount);
  elements.statProcessing.textContent = String(state.processingCount);
  elements.statFailed.textContent = String(state.failedCount);
  elements.statRemaining.textContent = String(state.remainingCount);

  // Progress Bar
  elements.progressPercent.textContent = `${state.progressPercent}%`;
  elements.progressBarFill.style.width = `${state.progressPercent}%`;

  // Estimated Time
  elements.estimatedRemainingText.textContent = formatRemainingTime(state.estimatedRemainingSeconds);

  // Active Prompt Details
  if (state.currentIndex > 0 && state.totalCount > 0) {
    elements.currentPromptIndexDisplay.textContent = `${state.currentIndex} / ${state.totalCount}`;
  } else {
    elements.currentPromptIndexDisplay.textContent = `-- / ${state.totalCount || '--'}`;
  }

  elements.currentStatusBadge.className = `badge badge-${state.status.toLowerCase()}`;
  elements.currentStatusBadge.textContent = state.status;
  elements.currentStateActivityText.textContent = state.currentPromptStateText || 'Idle';

  if (state.currentPromptText) {
    elements.currentPromptTextPreview.textContent = state.currentPromptText;
  } else {
    elements.currentPromptTextPreview.textContent =
      state.status === 'COMPLETED'
        ? '✓ All prompts in queue completed!'
        : 'Queue is currently idle. Press Start to begin submitting prompts.';
  }

  // Error Alert
  if (state.lastError) {
    elements.lastErrorAlert.classList.remove('hidden');
    elements.lastErrorText.textContent = state.lastError;
  } else {
    elements.lastErrorAlert.classList.add('hidden');
  }
}

// AI Tools Controller
function setupAITools(): void {
  const triggerAi = async (action: () => Promise<string[]>) => {
    const rawInput = elements.aiToolInput.value.trim();
    if (!rawInput) {
      alert('Please enter prompt text in the input box first.');
      return;
    }

    elements.aiLoadingIndicator.classList.remove('hidden');
    elements.aiResultContainer.classList.add('hidden');

    try {
      const results = await action();
      aiGeneratedPrompts = results;
      elements.aiResultCount.textContent = String(results.length);
      elements.aiResultContent.textContent = results
        .map((p, idx) => `${idx + 1}. ${p}`)
        .join('\n\n');
      elements.aiResultContainer.classList.remove('hidden');
    } catch (err: unknown) {
      alert(`AI Operation Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      elements.aiLoadingIndicator.classList.add('hidden');
    }
  };

  elements.aiCleanupBtn.addEventListener('click', () => {
    triggerAi(() =>
      sendBgMessage<string[]>({
        type: 'AI_CLEANUP_PROMPTS',
        text: elements.aiToolInput.value,
      })
    );
  });

  elements.aiSplitBtn.addEventListener('click', () => {
    triggerAi(() =>
      sendBgMessage<string[]>({
        type: 'AI_SPLIT_PROMPTS',
        text: elements.aiToolInput.value,
      })
    );
  });

  elements.aiEnhanceBtn.addEventListener('click', () => {
    triggerAi(() =>
      sendBgMessage<string[]>({
        type: 'AI_ENHANCE_PROMPTS',
        text: elements.aiToolInput.value,
      })
    );
  });

  elements.aiTransformBtn.addEventListener('click', () => {
    const instruction = elements.aiTransformInstruction.value.trim();
    if (!instruction) {
      alert('Please enter a transformation instruction first.');
      return;
    }
    triggerAi(() =>
      sendBgMessage<string[]>({
        type: 'AI_TRANSFORM_PROMPTS',
        text: elements.aiToolInput.value,
        instruction,
      })
    );
  });

  elements.aiValidateBtn.addEventListener('click', async () => {
    const rawInput = elements.aiToolInput.value.trim();
    if (!rawInput) return;

    elements.aiLoadingIndicator.classList.remove('hidden');
    try {
      const res = await sendBgMessage<{
        isValid: boolean;
        score: number;
        issues: string[];
        suggestions: string[];
      }>({
        type: 'AI_VALIDATE_PROMPTS',
        text: rawInput,
      });

      elements.aiResultCount.textContent = `Score: ${res.score}/100`;
      elements.aiResultContent.textContent =
        `Status: ${res.isValid ? 'Valid' : 'Needs Improvement'}\n\n` +
        `Issues:\n${res.issues.map((i) => `• ${i}`).join('\n')}\n\n` +
        `Suggestions:\n${res.suggestions.map((s) => `• ${s}`).join('\n')}`;
      elements.aiResultContainer.classList.remove('hidden');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      elements.aiLoadingIndicator.classList.add('hidden');
    }
  });

  elements.aiInsertQueueBtn.addEventListener('click', async () => {
    if (aiGeneratedPrompts.length === 0) return;
    const queue = await sendBgMessage<PromptItem[]>({
      type: 'SET_QUEUE',
      prompts: aiGeneratedPrompts,
      mode: 'append',
    });
    currentQueue = queue;
    renderQueue(queue);
    alert(`Added ${aiGeneratedPrompts.length} prompts to queue!`);
    refreshAll();
  });
}

// Settings
async function setupSettings(): Promise<void> {
  // Load current settings
  chrome.storage.local.get(['settings'], (res) => {
    const s = res?.settings as Partial<AutomationSettings> | undefined;
    if (s) {
      if (s.submissionDelaySec !== undefined)
        elements.settingSubmissionDelay.value = String(s.submissionDelaySec);
      if (s.maxWaitTimeSec !== undefined)
        elements.settingMaxWaitTime.value = String(s.maxWaitTimeSec);
      if (s.postGenerationDelaySec !== undefined)
        elements.settingPostGenDelay.value = String(s.postGenerationDelaySec);
      if (s.automationMode) elements.settingAutomationMode.value = s.automationMode;
      if (s.autoDownload !== undefined) elements.settingAutoDownload.checked = s.autoDownload;
      if (s.downloadNamingPattern) elements.settingDownloadPattern.value = s.downloadNamingPattern;
      if (s.anthropicApiKey) elements.settingAnthropicApiKey.value = s.anthropicApiKey;
      if (s.anthropicModel) elements.settingAnthropicModel.value = s.anthropicModel;
      if (s.customFlowUrlPattern) elements.settingCustomUrl.value = s.customFlowUrlPattern;
      if (s.debugMode !== undefined) elements.settingDebugMode.checked = s.debugMode;
    }
  });

  elements.saveSettingsBtn.addEventListener('click', async () => {
    const updatedSettings: Partial<AutomationSettings> = {
      submissionDelaySec: Number(elements.settingSubmissionDelay.value) || 10,
      maxWaitTimeSec: Number(elements.settingMaxWaitTime.value) || 180,
      postGenerationDelaySec: Number(elements.settingPostGenDelay.value) || 5,
      automationMode: elements.settingAutomationMode.value as 'SMART_DETECTION' | 'FIXED_DELAY',
      autoDownload: elements.settingAutoDownload.checked,
      downloadNamingPattern: elements.settingDownloadPattern.value.trim() || 'FlowPrompt_{index}_{timestamp}',
      anthropicApiKey: elements.settingAnthropicApiKey.value.trim(),
      anthropicModel: elements.settingAnthropicModel.value,
      customFlowUrlPattern: elements.settingCustomUrl.value.trim(),
      debugMode: elements.settingDebugMode.checked,
    };

    await sendBgMessage({
      type: 'UPDATE_SETTINGS',
      settings: updatedSettings,
    });

    elements.settingsSavedBadge.classList.remove('hidden');
    setTimeout(() => {
      elements.settingsSavedBadge.classList.add('hidden');
    }, 2000);
  });
}

// Logs
function setupLogs(): void {
  elements.copyLogsBtn.addEventListener('click', async () => {
    const logs = await sendBgMessage<LogEntry[]>({ type: 'GET_LOGS' });
    const text = logs
      .map((l) => `[${l.timeFormatted}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    alert('Logs copied to clipboard!');
  });

  elements.clearLogsBtn.addEventListener('click', async () => {
    await sendBgMessage({ type: 'CLEAR_LOGS' });
    elements.logsConsole.innerHTML = '';
  });
}

function renderLogs(logs: LogEntry[]): void {
  elements.logsConsole.innerHTML = '';
  logs.forEach(appendLogLine);
}

function appendLogLine(log: LogEntry): void {
  if (!log.message) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `
    <span class="log-time">[${log.timeFormatted}]</span>
    <span class="log-level log-level-${log.level}">[${log.level.toUpperCase()}]</span>
    <span class="log-msg">${escapeHtml(log.message)}</span>
  `;
  elements.logsConsole.appendChild(line);
  elements.logsConsole.scrollTop = elements.logsConsole.scrollHeight;
}

// Modal
function setupModal(): void {
  elements.modalCancelBtn.addEventListener('click', () => {
    elements.confirmModal.classList.add('hidden');
    modalConfirmCallback = null;
  });

  elements.modalConfirmBtn.addEventListener('click', () => {
    elements.confirmModal.classList.add('hidden');
    if (modalConfirmCallback) {
      modalConfirmCallback();
      modalConfirmCallback = null;
    }
  });
}

function showModal(title: string, message: string, onConfirm: () => void): void {
  elements.modalTitle.textContent = title;
  elements.modalMessage.textContent = message;
  modalConfirmCallback = onConfirm;
  elements.confirmModal.classList.remove('hidden');
}

// Helpers
function formatRemainingTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `~${hrs}h ${remMins}m`;
  }
  return `~${mins}m ${secs}s`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
