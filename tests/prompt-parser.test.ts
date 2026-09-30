import test from 'node:test';
import assert from 'node:assert';
import { PromptParser } from '../src/core/prompt-parser';

test('PromptParser - single prompt with no blank lines', () => {
  const input = 'A cinematic shot of a sunset over the Pacific ocean.';
  const result = PromptParser.parse(input);
  assert.strictEqual(result.count, 1);
  assert.strictEqual(result.prompts[0], input);
});

test('PromptParser - multiple prompts separated by blank lines', () => {
  const input = `Prompt 1: Aerial drone view of Alps.

Prompt 2: Macro shot of a water droplet on green leaf.

Prompt 3: Cyberpunk street market in the rain.`;

  const result = PromptParser.parse(input);
  assert.strictEqual(result.count, 3);
  assert.strictEqual(result.prompts[0], 'Prompt 1: Aerial drone view of Alps.');
  assert.strictEqual(result.prompts[1], 'Prompt 2: Macro shot of a water droplet on green leaf.');
  assert.strictEqual(result.prompts[2], 'Prompt 3: Cyberpunk street market in the rain.');
});

test('PromptParser - multiple consecutive blank lines', () => {
  const input = `First prompt.



Second prompt with three blank lines above.


Third prompt with two blank lines.`;

  const result = PromptParser.parse(input);
  assert.strictEqual(result.count, 3);
  assert.strictEqual(result.prompts[0], 'First prompt.');
  assert.strictEqual(result.prompts[1], 'Second prompt with three blank lines above.');
  assert.strictEqual(result.prompts[2], 'Third prompt with two blank lines.');
});

test('PromptParser - preserves ordinary single line breaks within a single prompt', () => {
  const input = `Cinematic character portrait:
Style: 35mm film, f/1.8
Subject: Old sailor with weathered face
Lighting: Golden hour rim lighting

Next prompt: Drone sweep over canyon
Camera: 4K slow motion`;

  const result = PromptParser.parse(input);
  assert.strictEqual(result.count, 2);
  assert.ok(result.prompts[0].includes('Style: 35mm film, f/1.8'));
  assert.ok(result.prompts[0].includes('Lighting: Golden hour rim lighting'));
  assert.strictEqual(result.prompts[0].split('\n').length, 4);
  assert.strictEqual(result.prompts[1].split('\n').length, 2);
});

test('PromptParser - leading and trailing whitespace trimming', () => {
  const input = `
    
   Spaced prompt one with leading spaces.   
   
   
   Spaced prompt two.   
   
  `;

  const result = PromptParser.parse(input);
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.prompts[0], 'Spaced prompt one with leading spaces.');
  assert.strictEqual(result.prompts[1], 'Spaced prompt two.');
});

test('PromptParser - empty and whitespace-only text', () => {
  assert.strictEqual(PromptParser.parse('').count, 0);
  assert.strictEqual(PromptParser.parse('   \n\n  \t  \n  ').count, 0);
});

test('PromptParser - Windows CRLF line endings', () => {
  const input = "Prompt one\r\n\r\nPrompt two\r\n\r\nPrompt three";
  const result = PromptParser.parse(input);
  assert.strictEqual(result.count, 3);
  assert.strictEqual(result.prompts[0], 'Prompt one');
  assert.strictEqual(result.prompts[1], 'Prompt two');
  assert.strictEqual(result.prompts[2], 'Prompt three');
});

test('PromptParser - very large input with 500 prompts', () => {
  const largeBatch: string[] = [];
  for (let i = 1; i <= 500; i++) {
    largeBatch.push(`Prompt number ${i}: Detailed visual scene description for test ${i}.`);
  }
  const rawText = largeBatch.join('\n\n');

  const start = Date.now();
  const result = PromptParser.parse(rawText);
  const elapsed = Date.now() - start;

  assert.strictEqual(result.count, 500);
  assert.strictEqual(result.prompts[0], 'Prompt number 1: Detailed visual scene description for test 1.');
  assert.strictEqual(result.prompts[499], 'Prompt number 500: Detailed visual scene description for test 500.');
  assert.ok(elapsed < 100, `Large batch parse should take < 100ms, took ${elapsed}ms`);
});
