import test from 'node:test';
import assert from 'node:assert';
import { PromptProcessor } from '../src/anthropic/prompt-processor';
import { AnthropicClient } from '../src/anthropic/anthropic-client';

test('AnthropicClient - configuration check', () => {
  const invalidClient = new AnthropicClient('some-random-string');
  assert.strictEqual(invalidClient.isConfigured(), false);

  const emptyClient = new AnthropicClient('');
  assert.strictEqual(emptyClient.isConfigured(), false);

  const validClient = new AnthropicClient('sk-ant-api03-abcdef1234567890abcdef');
  assert.strictEqual(validClient.isConfigured(), true);
});

test('PromptProcessor - extractJson from raw valid JSON', () => {
  const raw = JSON.stringify({
    prompts: [
      { id: '1', text: 'Prompt A' },
      { id: '2', text: 'Prompt B' },
    ],
  });

  const parsed = PromptProcessor.extractJson<{ prompts: Array<{ id: string; text: string }> }>(raw);
  assert.strictEqual(parsed.prompts.length, 2);
  assert.strictEqual(parsed.prompts[0].text, 'Prompt A');
});

test('PromptProcessor - extractJson from markdown code block', () => {
  const markdownWrapped = `Here are the cleaned prompts for Google Flow:

\`\`\`json
{
  "prompts": [
    { "id": "1", "text": "Cinematic shot of mountain peak." },
    { "id": "2", "text": "Sunset over emerald lake." }
  ]
}
\`\`\`

Let me know if you need further styling!`;

  const parsed = PromptProcessor.extractJson<{ prompts: Array<{ id: string; text: string }> }>(markdownWrapped);
  assert.strictEqual(parsed.prompts.length, 2);
  assert.strictEqual(parsed.prompts[0].text, 'Cinematic shot of mountain peak.');
  assert.strictEqual(parsed.prompts[1].text, 'Sunset over emerald lake.');
});

test('PromptProcessor - extractJson from conversational text with embedded JSON array', () => {
  const conversational = `Sure! I have processed your input. Here are the prompts:
[
  { "id": "1", "text": "Prompt 1" },
  { "id": "2", "text": "Prompt 2" }
]
Hope this helps!`;

  const parsed = PromptProcessor.extractJson<Array<{ id: string; text: string }>>(conversational);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].text, 'Prompt 1');
});

test('PromptProcessor - extractJson throws on completely invalid input', () => {
  const garbage = 'Sorry, as an AI language model I cannot perform this action.';
  assert.throws(() => {
    PromptProcessor.extractJson(garbage);
  }, /Unable to extract valid JSON/);
});
