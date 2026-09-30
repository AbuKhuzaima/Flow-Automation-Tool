import test from 'node:test';
import assert from 'node:assert';
import { CdpManager } from '../src/core/cdp-manager';
import { GoogleFlowAdapter } from '../src/content/flow-automation';
import { QueueManager } from '../src/core/queue-manager';
import { PromptParser } from '../src/core/prompt-parser';

test('CdpManager - graceful initialization when chrome.debugger unavailable', async () => {
  const cdp = new CdpManager();
  assert.strictEqual(cdp.isAttached(123), false);

  // In Node environment without chrome.debugger, attach returns false without crashing
  const attached = await cdp.attach(123);
  assert.strictEqual(attached, false);

  // sendTrustedEnter returns false without throwing
  const enterOk = await cdp.sendTrustedEnter(123);
  assert.strictEqual(enterOk, false);

  // detach and detachAll complete cleanly
  await cdp.detach(123);
  await cdp.detachAll();
  assert.strictEqual(cdp.isAttached(123), false);
});

test('CdpManager - mock chrome.debugger attach and sendTrustedEnter sequence', async () => {
  const cdp = new CdpManager();
  const sentCommands: Array<{ method: string; params: any }> = [];
  let attachedTab: number | null = null;

  // Mock global chrome.debugger
  (globalThis as any).chrome = {
    debugger: {
      attach: async (target: { tabId: number }, _version: string) => {
        attachedTab = target.tabId;
      },
      detach: async (target: { tabId: number }) => {
        if (attachedTab === target.tabId) attachedTab = null;
      },
      sendCommand: async (_target: { tabId: number }, method: string, params: any) => {
        sentCommands.push({ method, params });
      },
      onDetach: {
        addListener: () => {},
      },
    },
  };

  try {
    const success = await cdp.sendTrustedEnter(456);
    assert.strictEqual(success, true);
    assert.strictEqual(sentCommands.length, 3);
    assert.strictEqual(sentCommands[0].params.type, 'rawKeyDown');
    assert.strictEqual(sentCommands[0].params.windowsVirtualKeyCode, 13);
    assert.strictEqual(sentCommands[1].params.type, 'char');
    assert.strictEqual(sentCommands[1].params.text, '\r');
    assert.strictEqual(sentCommands[2].params.type, 'keyUp');
    assert.strictEqual(sentCommands[2].params.windowsVirtualKeyCode, 13);
    // After execution, debugger should be detached cleanly
    assert.strictEqual(cdp.isAttached(456), false);
  } finally {
    delete (globalThis as any).chrome;
  }
});

test('CdpManager - handles existing debugger session conflict gracefully', async () => {
  const cdp = new CdpManager();

  // Mock global chrome.debugger throwing "Another debugger is already attached"
  (globalThis as any).chrome = {
    debugger: {
      attach: async () => {
        throw new Error('Another debugger is already attached to this target');
      },
      detach: async () => {},
      sendCommand: async () => {},
      onDetach: { addListener: () => {} },
    },
  };

  try {
    const success = await cdp.sendTrustedEnter(789);
    // Must handle error gracefully without throwing unhandled exceptions
    assert.strictEqual(success, false);
    assert.strictEqual(cdp.isAttached(789), false);
  } finally {
    delete (globalThis as any).chrome;
  }
});

test('FlowAdapter - modular API surface verification', () => {
  const adapter = new GoogleFlowAdapter();
  assert.strictEqual(typeof adapter.findComposer, 'function');
  assert.strictEqual(typeof adapter.insertPrompt, 'function');
  assert.strictEqual(typeof adapter.verifyPromptInserted, 'function');
  assert.strictEqual(typeof adapter.findSubmitButton, 'function');
  assert.strictEqual(typeof adapter.isReadyToSubmit, 'function');
  assert.strictEqual(typeof adapter.attemptButtonSubmit, 'function');
  assert.strictEqual(typeof adapter.attemptSyntheticEnter, 'function');
  assert.strictEqual(typeof adapter.focusComposer, 'function');
  assert.strictEqual(typeof adapter.detectSubmission, 'function');
  assert.strictEqual(typeof adapter.detectGenerationStarted, 'function');
  assert.strictEqual(typeof adapter.detectGenerationCompleted, 'function');
});

test('FlowAdapter - prompt sequence and queue stability with varied lengths', () => {
  const qm = new QueueManager();
  
  // Test short prompt, long prompt, and multi-line prompt
  const shortPrompt = 'A cat';
  const longPrompt = 'A cinematic shot of a majestic lion walking across the Serengeti plains at golden hour sunset, 4k ultra-detailed, photorealistic lighting, dramatic depth of field, slow-motion 60fps cinematic camera tracking shot with lens flare and wind blowing in the mane.';
  const multiPromptText = `${shortPrompt}\n\n${longPrompt}\n\nThird prompt with simple description`;

  const parsed = PromptParser.parse(multiPromptText);
  assert.strictEqual(parsed.prompts.length, 3);
  assert.strictEqual(parsed.prompts[0], shortPrompt);
  assert.strictEqual(parsed.prompts[1], longPrompt);
  assert.strictEqual(parsed.prompts[2], 'Third prompt with simple description');

  qm.addPrompts(parsed.prompts);
  assert.strictEqual(qm.getQueue().length, 3);

  // Verify queue progression
  const item1 = qm.getNextPendingPrompt();
  assert.ok(item1);
  assert.strictEqual(item1?.index, 1);
  qm.updatePromptStatus(item1!.id, 'PROCESSING');
  qm.updatePromptStatus(item1!.id, 'SUBMITTED');
  qm.updatePromptStatus(item1!.id, 'COMPLETED');

  const item2 = qm.getNextPendingPrompt();
  assert.ok(item2);
  assert.strictEqual(item2?.index, 2);
  assert.strictEqual(item2?.text, longPrompt);
});
