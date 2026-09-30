import test from 'node:test';
import assert from 'node:assert';
import { automationManager } from '../src/core/automation-manager';

test('AutomationManager - initialization and default state', async () => {
  await automationManager.initialize();
  const state = automationManager.getState();
  assert.ok(state);
  assert.ok(['IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'ERROR'].includes(state.status));
});

test('AutomationManager - start without pending prompts marks COMPLETED', async () => {
  const qm = automationManager.getQueueManager();
  qm.clearQueue();

  await automationManager.start();
  const state = automationManager.getState();
  assert.strictEqual(state.status, 'COMPLETED');
});

test('AutomationManager - stop terminates cleanly', async () => {
  await automationManager.stop();
  const state = automationManager.getState();
  assert.strictEqual(state.status, 'STOPPED');
});

test('AutomationManager - skip current prompt', async () => {
  const qm = automationManager.getQueueManager();
  qm.clearQueue();
  qm.addPrompts(['Skip me', 'Keep me']);

  await automationManager.skipCurrent();
  const queue = qm.getQueue();
  assert.strictEqual(queue[0].status, 'SKIPPED');
  assert.strictEqual(queue[1].status, 'PENDING');
});
