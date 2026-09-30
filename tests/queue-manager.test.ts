import test from 'node:test';
import assert from 'node:assert';
import { QueueManager } from '../src/core/queue-manager';

test('QueueManager - addPrompts in append and replace mode', () => {
  const qm = new QueueManager();
  assert.strictEqual(qm.getQueue().length, 0);

  // Add 3 prompts
  qm.addPrompts(['Prompt A', 'Prompt B', 'Prompt C'], 'append');
  assert.strictEqual(qm.getQueue().length, 3);
  assert.strictEqual(qm.getQueue()[0].index, 1);
  assert.strictEqual(qm.getQueue()[0].status, 'PENDING');
  assert.strictEqual(qm.getQueue()[2].index, 3);

  // Append 2 more
  qm.addPrompts(['Prompt D', 'Prompt E'], 'append');
  assert.strictEqual(qm.getQueue().length, 5);
  assert.strictEqual(qm.getQueue()[4].index, 5);

  // Replace with 2 new
  qm.addPrompts(['New 1', 'New 2'], 'replace');
  assert.strictEqual(qm.getQueue().length, 2);
  assert.strictEqual(qm.getQueue()[0].text, 'New 1');
  assert.strictEqual(qm.getQueue()[0].index, 1);
});

test('QueueManager - remove prompt and renumber', () => {
  const qm = new QueueManager();
  qm.addPrompts(['Prompt 1', 'Prompt 2', 'Prompt 3']);
  const secondId = qm.getQueue()[1].id;

  const removed = qm.removePrompt(secondId);
  assert.strictEqual(removed, true);
  assert.strictEqual(qm.getQueue().length, 2);
  assert.strictEqual(qm.getQueue()[0].text, 'Prompt 1');
  assert.strictEqual(qm.getQueue()[0].index, 1);
  assert.strictEqual(qm.getQueue()[1].text, 'Prompt 3');
  assert.strictEqual(qm.getQueue()[1].index, 2); // Renumbered!
});

test('QueueManager - updatePromptStatus lifecycle and completion timing', () => {
  const qm = new QueueManager();
  qm.addPrompts(['Prompt A']);
  const id = qm.getQueue()[0].id;

  // Processing
  qm.updatePromptStatus(id, 'PROCESSING');
  assert.strictEqual(qm.getQueue()[0].status, 'PROCESSING');

  // Submitted
  qm.updatePromptStatus(id, 'SUBMITTED');
  assert.strictEqual(qm.getQueue()[0].status, 'SUBMITTED');
  assert.ok(qm.getQueue()[0].submittedAt);

  // Generating
  qm.updatePromptStatus(id, 'GENERATING');
  assert.strictEqual(qm.getQueue()[0].status, 'GENERATING');

  // Completed
  qm.updatePromptStatus(id, 'COMPLETED');
  assert.strictEqual(qm.getQueue()[0].status, 'COMPLETED');
  assert.ok(qm.getQueue()[0].completedAt);
});

test('QueueManager - failure and retry mechanism', () => {
  const qm = new QueueManager();
  qm.addPrompts(['Failing Prompt 1', 'Failing Prompt 2']);
  const id1 = qm.getQueue()[0].id;
  const id2 = qm.getQueue()[1].id;

  qm.updatePromptStatus(id1, 'FAILED', 'Input field missing');
  qm.updatePromptStatus(id2, 'FAILED', 'Generation timeout');

  assert.strictEqual(qm.getQueue()[0].status, 'FAILED');
  assert.strictEqual(qm.getQueue()[0].error, 'Input field missing');
  assert.strictEqual(qm.getQueue()[0].retryCount, 1);

  // Retry single
  const retried = qm.retryPrompt(id1);
  assert.strictEqual(retried, true);
  assert.strictEqual(qm.getQueue()[0].status, 'PENDING');
  assert.strictEqual(qm.getQueue()[0].error, undefined);

  // Retry all failed
  const retriedCount = qm.retryAllFailed();
  assert.strictEqual(retriedCount, 1);
  assert.strictEqual(qm.getQueue()[1].status, 'PENDING');
});

test('QueueManager - skip prompt', () => {
  const qm = new QueueManager();
  qm.addPrompts(['Prompt 1', 'Prompt 2']);
  const id = qm.getQueue()[0].id;

  qm.skipPrompt(id);
  assert.strictEqual(qm.getQueue()[0].status, 'SKIPPED');
  assert.strictEqual(qm.getNextPendingPrompt()?.text, 'Prompt 2');
});

test('QueueManager - statistics and time calculation', () => {
  const qm = new QueueManager();
  qm.addPrompts(['P1', 'P2', 'P3', 'P4']);

  let stats = qm.getStats();
  assert.strictEqual(stats.total, 4);
  assert.strictEqual(stats.remaining, 4);
  assert.strictEqual(stats.percent, 0);

  // Mark P1 completed
  qm.updatePromptStatus(qm.getQueue()[0].id, 'SUBMITTED');
  qm.updatePromptStatus(qm.getQueue()[0].id, 'COMPLETED');

  // Mark P2 failed
  qm.updatePromptStatus(qm.getQueue()[1].id, 'FAILED', 'Timeout');

  stats = qm.getStats({ submissionDelaySec: 10, postGenerationDelaySec: 5, maxWaitTimeSec: 60 });
  assert.strictEqual(stats.total, 4);
  assert.strictEqual(stats.completed, 1);
  assert.strictEqual(stats.failed, 1);
  assert.strictEqual(stats.remaining, 2);
  assert.strictEqual(stats.percent, 25);
  assert.ok(stats.estimatedRemainingSeconds > 0);
});

test('QueueManager - reset progress', () => {
  const qm = new QueueManager();
  qm.addPrompts(['P1', 'P2']);
  qm.updatePromptStatus(qm.getQueue()[0].id, 'COMPLETED');
  qm.updatePromptStatus(qm.getQueue()[1].id, 'FAILED', 'Error');

  qm.resetProgress();
  assert.strictEqual(qm.getQueue()[0].status, 'PENDING');
  assert.strictEqual(qm.getQueue()[1].status, 'PENDING');
  assert.strictEqual(qm.getQueue()[0].completedAt, undefined);
  assert.strictEqual(qm.getQueue()[1].error, undefined);
});
