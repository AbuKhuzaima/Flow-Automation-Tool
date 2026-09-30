import test from 'node:test';
import assert from 'node:assert';
import { FLOW_SELECTORS } from '../src/content/flow-selectors';
import { FlowDetector } from '../src/content/flow-detector';

test('FlowSelectors - contains expected URL patterns', () => {
  assert.ok(FLOW_SELECTORS.urlPatterns.includes('flow.google.com'));
  assert.ok(FLOW_SELECTORS.urlPatterns.includes('labs.google/flow'));
  assert.ok(FLOW_SELECTORS.urlPatterns.includes('aitestkitchen.withgoogle.com'));
});

test('FlowSelectors - input selector hierarchy', () => {
  // Should prioritize aria-label and accessible inputs first
  assert.ok(FLOW_SELECTORS.inputSelectors.length > 5);
  const first = FLOW_SELECTORS.inputSelectors[0];
  assert.ok(first.includes('aria-label') || first.includes('prompt'));
});

test('FlowSelectors - submit button keywords', () => {
  assert.ok(FLOW_SELECTORS.submitButtonTextKeywords.includes('generate'));
  assert.ok(FLOW_SELECTORS.submitButtonTextKeywords.includes('submit'));
  assert.ok(FLOW_SELECTORS.submitButtonTextKeywords.includes('create'));
});

test('FlowSelectors - generating indicator keywords', () => {
  assert.ok(FLOW_SELECTORS.generatingTextKeywords.includes('generating'));
  assert.ok(FLOW_SELECTORS.generatingTextKeywords.includes('rendering'));
  assert.ok(FLOW_SELECTORS.generatingTextKeywords.includes('processing'));
});

test('FlowSelectors - download selector coverage', () => {
  assert.ok(FLOW_SELECTORS.downloadSelectors.some((s) => s.includes('download')));
  assert.ok(FLOW_SELECTORS.downloadTextKeywords.includes('download'));
});

test('FlowSelectors - submit selectors strictly exclude generic SVG buttons', () => {
  // CRITICAL REGRESSION TEST: Never allow generic 'button:has(svg)' or '[role="button"]:has(svg)'
  // which causes unintended clicking of user profile avatars or header buttons
  assert.strictEqual(FLOW_SELECTORS.submitButtonSelectors.includes('button:has(svg)'), false);
  assert.strictEqual(FLOW_SELECTORS.submitButtonSelectors.includes('[role="button"]:has(svg)'), false);

  // Must include explicit arrow and send selectors
  assert.ok(FLOW_SELECTORS.submitButtonSelectors.some((s) => s.includes('arrow')));
  assert.ok(FLOW_SELECTORS.submitButtonSelectors.some((s) => s.includes('east')));
  assert.ok(FLOW_SELECTORS.submitButtonSelectors.some((s) => s.includes('send')));
});

test('FlowSelectors - excludedButtonKeywords protects profile avatar and navigation', () => {
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('profile'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('account'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('avatar'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('clear'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('close'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('attach'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('stop'));
  assert.ok(FLOW_SELECTORS.excludedButtonKeywords.includes('cancel'));
});

