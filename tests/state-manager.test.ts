import test from 'node:test';
import assert from 'node:assert';
import { stateManager, DEFAULT_SETTINGS, DEFAULT_STATE } from '../src/core/state-manager';
import { PromptItem } from '../src/types';

test('StateManager - load default settings', async () => {
  const settings = await stateManager.loadSettings();
  assert.strictEqual(settings.submissionDelaySec, DEFAULT_SETTINGS.submissionDelaySec);
  assert.strictEqual(settings.automationMode, 'SMART_DETECTION');
});

test('StateManager - save and reload custom settings', async () => {
  await stateManager.saveSettings({
    submissionDelaySec: 25,
    maxWaitTimeSec: 240,
    automationMode: 'FIXED_DELAY',
    autoDownload: true,
  });

  const updated = await stateManager.loadSettings();
  assert.strictEqual(updated.submissionDelaySec, 25);
  assert.strictEqual(updated.maxWaitTimeSec, 240);
  assert.strictEqual(updated.automationMode, 'FIXED_DELAY');
  assert.strictEqual(updated.autoDownload, true);
});

test('StateManager - save and restore automation state', async () => {
  await stateManager.saveState({
    status: 'RUNNING',
    currentIndex: 3,
    totalCount: 10,
    completedCount: 2,
    currentPromptText: 'Active prompt description',
  });

  const state = await stateManager.loadState();
  assert.strictEqual(state.status, 'RUNNING');
  assert.strictEqual(state.currentIndex, 3);
  assert.strictEqual(state.totalCount, 10);
  assert.strictEqual(state.completedCount, 2);
  assert.strictEqual(state.currentPromptText, 'Active prompt description');
});

test('StateManager - save and restore queue (popup closure recovery)', async () => {
  const testQueue: PromptItem[] = [
    {
      id: 'p-1',
      index: 1,
      text: 'Test Prompt 1',
      status: 'COMPLETED',
      downloadStatus: 'DOWNLOADED',
      createdAt: 1000,
      completedAt: 1050,
    },
    {
      id: 'p-2',
      index: 2,
      text: 'Test Prompt 2',
      status: 'PENDING',
      downloadStatus: 'NOT_REQUESTED',
      createdAt: 1000,
    },
  ];

  await stateManager.saveQueue(testQueue);
  const loaded = await stateManager.loadQueue();

  assert.strictEqual(loaded.length, 2);
  assert.strictEqual(loaded[0].text, 'Test Prompt 1');
  assert.strictEqual(loaded[0].status, 'COMPLETED');
  assert.strictEqual(loaded[1].text, 'Test Prompt 2');
  assert.strictEqual(loaded[1].status, 'PENDING');
});
