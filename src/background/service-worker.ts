/**
 * Google Flow Prompt Automator - Background Service Worker
 * 
 * Serves as the persistent background orchestrator. Keeps automation running
 * even when popup is closed, handles tab monitoring, and processes extension messages.
 */

import { ExtensionMessage, MessageResponse } from '../types';
import { automationManager } from '../core/automation-manager';
import { logger } from '../core/logger';
import { PromptProcessor } from '../anthropic/prompt-processor';

// Initialize the automation manager immediately upon service worker launch
automationManager.initialize().catch((err) => {
  console.error('Failed to initialize AutomationManager in service worker:', err);
});

// Tab Safety Listeners
chrome.tabs.onRemoved.addListener((tabId) => {
  const settings = automationManager.getSettings();
  const state = automationManager.getState();
  if (tabId === settings.targetTabId || tabId === state.targetTabId) {
    logger.warn(`Monitored Flow tab #${tabId} was closed by the user`);
    if (state.status === 'RUNNING') {
      automationManager.pause().catch(console.error);
    }
    automationManager.verifyTargetTab().catch(console.error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const settings = automationManager.getSettings();
    const state = automationManager.getState();
    if (tabId === settings.targetTabId || tabId === state.targetTabId) {
      automationManager.verifyTargetTab().catch(console.error);
    }
  }
});

// Runtime Message Dispatcher
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (res: MessageResponse) => void) => {
    handleExtensionMessage(message)
      .then((res) => sendResponse(res))
      .catch((err) => {
        logger.error(`Error handling extension message [${message.type}]:`, err);
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return true; // Keep message channel open for async response
  }
);

async function handleExtensionMessage(message: ExtensionMessage): Promise<MessageResponse> {
  const queueManager = automationManager.getQueueManager();

  switch (message.type) {
    case 'GET_STATE': {
      await automationManager.verifyTargetTab();
      return { success: true, data: automationManager.getState() };
    }

    case 'GET_QUEUE': {
      return { success: true, data: queueManager.getQueue() };
    }

    case 'GET_LOGS': {
      return { success: true, data: logger.getLogs() };
    }

    case 'CLEAR_LOGS': {
      logger.clear();
      return { success: true };
    }

    case 'START_AUTOMATION': {
      await automationManager.start();
      return { success: true, data: automationManager.getState() };
    }

    case 'PAUSE_AUTOMATION': {
      await automationManager.pause();
      return { success: true, data: automationManager.getState() };
    }

    case 'RESUME_AUTOMATION': {
      await automationManager.resume();
      return { success: true, data: automationManager.getState() };
    }

    case 'STOP_AUTOMATION': {
      await automationManager.stop();
      return { success: true, data: automationManager.getState() };
    }

    case 'SKIP_CURRENT_PROMPT': {
      await automationManager.skipCurrent();
      return { success: true, data: automationManager.getState() };
    }

    case 'RETRY_PROMPT': {
      await automationManager.retryPrompt(message.promptId);
      return { success: true, data: automationManager.getState() };
    }

    case 'RETRY_ALL_FAILED': {
      await automationManager.retryAllFailed();
      return { success: true, data: automationManager.getState() };
    }

    case 'REMOVE_PROMPT': {
      queueManager.removePrompt(message.promptId);
      return { success: true, data: queueManager.getQueue() };
    }

    case 'SET_QUEUE': {
      queueManager.addPrompts(message.prompts, message.mode);
      return { success: true, data: queueManager.getQueue() };
    }

    case 'CLEAR_QUEUE': {
      queueManager.clearQueue();
      return { success: true, data: [] };
    }

    case 'RESET_PROGRESS': {
      queueManager.resetProgress();
      return { success: true, data: queueManager.getQueue() };
    }

    case 'UPDATE_SETTINGS': {
      const updated = await automationManager.updateSettings(message.settings);
      return { success: true, data: updated };
    }

    case 'SET_TARGET_TAB': {
      await automationManager.setTargetTab(message.tabId);
      return { success: true, data: automationManager.getState() };
    }

    case 'FIND_FLOW_TABS': {
      const tabs = await automationManager.findFlowTabs();
      return { success: true, data: tabs };
    }

    // AI Tools
    case 'AI_CLEANUP_PROMPTS': {
      const settings = automationManager.getSettings();
      if (!settings.anthropicApiKey) {
        throw new Error('Anthropic API Key not configured');
      }
      const processor = new PromptProcessor(settings.anthropicApiKey, settings.anthropicModel);
      const cleaned = await processor.cleanupPrompts(message.text);
      return { success: true, data: cleaned };
    }

    case 'AI_SPLIT_PROMPTS': {
      const settings = automationManager.getSettings();
      if (!settings.anthropicApiKey) {
        throw new Error('Anthropic API Key not configured');
      }
      const processor = new PromptProcessor(settings.anthropicApiKey, settings.anthropicModel);
      const split = await processor.splitPrompts(message.text);
      return { success: true, data: split };
    }

    case 'AI_ENHANCE_PROMPTS': {
      const settings = automationManager.getSettings();
      if (!settings.anthropicApiKey) {
        throw new Error('Anthropic API Key not configured');
      }
      const processor = new PromptProcessor(settings.anthropicApiKey, settings.anthropicModel);
      const enhanced = await processor.enhancePrompts(message.text, message.style);
      return { success: true, data: enhanced };
    }

    case 'AI_TRANSFORM_PROMPTS': {
      const settings = automationManager.getSettings();
      if (!settings.anthropicApiKey) {
        throw new Error('Anthropic API Key not configured');
      }
      const processor = new PromptProcessor(settings.anthropicApiKey, settings.anthropicModel);
      const transformed = await processor.transformPrompts(message.text, message.instruction);
      return { success: true, data: transformed };
    }

    case 'AI_VALIDATE_PROMPTS': {
      const settings = automationManager.getSettings();
      if (!settings.anthropicApiKey) {
        throw new Error('Anthropic API Key not configured');
      }
      const processor = new PromptProcessor(settings.anthropicApiKey, settings.anthropicModel);
      const validation = await processor.validatePrompts(message.text);
      return { success: true, data: validation };
    }

    default:
      return { success: false, error: 'Unknown message type received in service worker' };
  }
}
