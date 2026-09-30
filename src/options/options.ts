/**
 * Google Flow Prompt Automator - Options Page Controller
 */

import { AutomationSettings, ExtensionMessage } from '../types';
import { AnthropicClient } from '../anthropic/anthropic-client';

const elements = {
  submissionDelaySec: document.getElementById('submissionDelaySec') as HTMLInputElement,
  maxWaitTimeSec: document.getElementById('maxWaitTimeSec') as HTMLInputElement,
  postGenerationDelaySec: document.getElementById('postGenerationDelaySec') as HTMLInputElement,
  automationMode: document.getElementById('automationMode') as HTMLSelectElement,
  autoDownload: document.getElementById('autoDownload') as HTMLInputElement,
  downloadNamingPattern: document.getElementById('downloadNamingPattern') as HTMLInputElement,
  anthropicApiKey: document.getElementById('anthropicApiKey') as HTMLInputElement,
  anthropicModel: document.getElementById('anthropicModel') as HTMLSelectElement,
  testApiKeyBtn: document.getElementById('testApiKeyBtn') as HTMLButtonElement,
  apiKeyTestStatus: document.getElementById('apiKeyTestStatus') as HTMLElement,
  customFlowUrlPattern: document.getElementById('customFlowUrlPattern') as HTMLInputElement,
  debugMode: document.getElementById('debugMode') as HTMLInputElement,
  saveAllOptionsBtn: document.getElementById('saveAllOptionsBtn') as HTMLButtonElement,
  saveStatusMsg: document.getElementById('saveStatusMsg') as HTMLElement,
  openFlowTabBtn: document.getElementById('openFlowTabBtn') as HTMLButtonElement,
};

document.addEventListener('DOMContentLoaded', () => {
  loadOptions();
  setupEventListeners();
});

function loadOptions(): void {
  chrome.storage.local.get(['settings'], (res) => {
    const s = res?.settings as Partial<AutomationSettings> | undefined;
    if (!s) return;

    if (s.submissionDelaySec !== undefined) elements.submissionDelaySec.value = String(s.submissionDelaySec);
    if (s.maxWaitTimeSec !== undefined) elements.maxWaitTimeSec.value = String(s.maxWaitTimeSec);
    if (s.postGenerationDelaySec !== undefined) elements.postGenerationDelaySec.value = String(s.postGenerationDelaySec);
    if (s.automationMode) elements.automationMode.value = s.automationMode;
    if (s.autoDownload !== undefined) elements.autoDownload.checked = s.autoDownload;
    if (s.downloadNamingPattern) elements.downloadNamingPattern.value = s.downloadNamingPattern;
    if (s.anthropicApiKey) elements.anthropicApiKey.value = s.anthropicApiKey;
    if (s.anthropicModel) elements.anthropicModel.value = s.anthropicModel;
    if (s.customFlowUrlPattern) elements.customFlowUrlPattern.value = s.customFlowUrlPattern;
    if (s.debugMode !== undefined) elements.debugMode.checked = s.debugMode;
  });
}

function setupEventListeners(): void {
  elements.saveAllOptionsBtn.addEventListener('click', saveOptions);

  elements.openFlowTabBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://flow.google.com' });
  });

  elements.testApiKeyBtn.addEventListener('click', async () => {
    const apiKey = elements.anthropicApiKey.value.trim();
    const model = elements.anthropicModel.value;

    if (!apiKey) {
      showTestStatus('Please enter an Anthropic API key first.', false);
      return;
    }

    elements.testApiKeyBtn.disabled = true;
    showTestStatus('Testing connection to Anthropic Claude...', null);

    try {
      const client = new AnthropicClient(apiKey, model);
      const res = await client.complete({
        maxTokens: 10,
        messages: [{ role: 'user', content: "Respond with only the single word 'CONNECTED'." }],
      });

      if (res && res.length > 0) {
        showTestStatus('✓ Connection successful! Anthropic Claude responded.', true);
      } else {
        showTestStatus('Received empty response from Anthropic.', false);
      }
    } catch (err: unknown) {
      showTestStatus(`Connection error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      elements.testApiKeyBtn.disabled = false;
    }
  });
}

async function saveOptions(): Promise<void> {
  const settings: Partial<AutomationSettings> = {
    submissionDelaySec: Number(elements.submissionDelaySec.value) || 10,
    maxWaitTimeSec: Number(elements.maxWaitTimeSec.value) || 180,
    postGenerationDelaySec: Number(elements.postGenerationDelaySec.value) || 5,
    automationMode: elements.automationMode.value as 'SMART_DETECTION' | 'FIXED_DELAY',
    autoDownload: elements.autoDownload.checked,
    downloadNamingPattern: elements.downloadNamingPattern.value.trim() || 'FlowPrompt_{index}_{timestamp}',
    anthropicApiKey: elements.anthropicApiKey.value.trim(),
    anthropicModel: elements.anthropicModel.value,
    customFlowUrlPattern: elements.customFlowUrlPattern.value.trim(),
    debugMode: elements.debugMode.checked,
  };

  // Notify background service worker
  const msg: ExtensionMessage = {
    type: 'UPDATE_SETTINGS',
    settings,
  };

  chrome.runtime.sendMessage(msg, () => {
    elements.saveStatusMsg.classList.remove('hidden');
    setTimeout(() => {
      elements.saveStatusMsg.classList.add('hidden');
    }, 2500);
  });
}

function showTestStatus(msg: string, success: boolean | null): void {
  elements.apiKeyTestStatus.textContent = msg;
  elements.apiKeyTestStatus.classList.remove('hidden', 'success', 'error');

  if (success === true) {
    elements.apiKeyTestStatus.classList.add('success');
  } else if (success === false) {
    elements.apiKeyTestStatus.classList.add('error');
  }
}
