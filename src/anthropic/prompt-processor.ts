/**
 * Google Flow Prompt Automator - Anthropic Prompt Processor
 * 
 * Provides high-level AI prompt processing utilities:
 * - Cleanup: Fix typos/punctuation while retaining creative intent
 * - Splitting: Intelligently separate messy or unformatted text into prompts
 * - Enhancement: Add cinematic details, lighting, and camera styles
 * - Transformation: Convert prompts using custom instructions
 * - Validation: Analyze prompt completeness and quality
 */

import { AnthropicClient } from './anthropic-client';
import { logger } from '../core/logger';

export interface AIProcessedPrompt {
  id: string;
  text: string;
  notes?: string;
}

export interface PromptValidationResult {
  isValid: boolean;
  score: number; // 0 - 100
  issues: string[];
  suggestions: string[];
}

export class PromptProcessor {
  private client: AnthropicClient;

  constructor(apiKey: string, model?: string) {
    this.client = new AnthropicClient(apiKey, model);
  }

  /**
   * Safely extract and parse JSON from Claude's response, handling markdown blocks or conversational text.
   */
  public static extractJson<T>(rawResponse: string): T {
    const text = rawResponse.trim();

    // Try parsing directly
    try {
      return JSON.parse(text) as T;
    } catch {
      // Direct parse failed, try extracting markdown code blocks
    }

    // Match ```json ... ``` or ``` ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim()) as T;
      } catch {
        // Fall through
      }
    }

    // Try finding first '[' and last ']' for array, or first '{' and last '}' for object
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(text.substring(firstBracket, lastBracket + 1)) as T;
      } catch {
        // Fall through
      }
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1)) as T;
      } catch {
        // Fall through
      }
    }

    throw new Error('Unable to extract valid JSON from AI response: ' + text.substring(0, 150));
  }

  /**
   * Clean up formatting and fix typos without altering creative intent.
   */
  public async cleanupPrompts(rawText: string): Promise<string[]> {
    const systemPrompt = `You are a prompt engineering specialist for Google Flow video generation.
Your task is to take the provided text containing one or more prompts, clean up any awkward phrasing, fix typos, grammar, and formatting inconsistencies, while strictly preserving the user's creative vision, subjects, and style.
Return a valid JSON object strictly matching this schema:
{
  "prompts": [
    { "id": "1", "text": "cleaned prompt text" }
  ]
}
Do not include any additional conversational commentary outside the JSON block.`;

    const response = await this.client.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: rawText }],
    });

    const parsed = PromptProcessor.extractJson<{ prompts: Array<{ id: string; text: string }> }>(response);
    if (!parsed || !Array.isArray(parsed.prompts)) {
      throw new Error('AI response did not contain a valid prompts array');
    }

    return parsed.prompts.map((p) => p.text.trim()).filter((t) => t.length > 0);
  }

  /**
   * Intelligently split poorly-formatted or merged text into distinct prompts.
   */
  public async splitPrompts(unstructuredText: string): Promise<string[]> {
    const systemPrompt = `You are an expert prompt analyst.
The user will provide text that may contain multiple merged, numbered, bulleted, or messy prompts without clean line separations.
Identify each distinct prompt concept and extract them into individual standalone prompts.
Return a valid JSON object strictly matching this schema:
{
  "prompts": [
    { "id": "1", "text": "individual prompt text" }
  ]
}
Do not include any conversational commentary.`;

    const response = await this.client.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: unstructuredText }],
    });

    const parsed = PromptProcessor.extractJson<{ prompts: Array<{ id: string; text: string }> }>(response);
    if (!parsed || !Array.isArray(parsed.prompts)) {
      throw new Error('AI response did not contain a valid prompts array');
    }

    return parsed.prompts.map((p) => p.text.trim()).filter((t) => t.length > 0);
  }

  /**
   * Enhance prompts with rich cinematic, lighting, and camera motion descriptors.
   */
  public async enhancePrompts(rawText: string, styleInstruction?: string): Promise<string[]> {
    const styleNote = styleInstruction ? `Apply this stylistic focus: "${styleInstruction}".` : '';
    const systemPrompt = `You are a world-class prompt engineer specializing in Google Flow generative video and media.
The user provides simple or basic prompts. Enhance each prompt with rich, production-quality details:
- Camera movement (e.g. slow pan, sweeping crane, orbit, macro close-up)
- Lighting and atmosphere (e.g. golden hour, volumetric haze, neon backlight, soft diffuse rim light)
- Texture and cinematic depth of field (e.g. 35mm lens, f/1.8, bokeh, photorealistic)
${styleNote}
Keep the core subject intact.
Return a valid JSON object strictly matching this schema:
{
  "prompts": [
    { "id": "1", "text": "enhanced cinematic prompt" }
  ]
}
Do not include commentary outside the JSON block.`;

    const response = await this.client.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: rawText }],
    });

    const parsed = PromptProcessor.extractJson<{ prompts: Array<{ id: string; text: string }> }>(response);
    if (!parsed || !Array.isArray(parsed.prompts)) {
      throw new Error('AI response did not contain a valid prompts array');
    }

    return parsed.prompts.map((p) => p.text.trim()).filter((t) => t.length > 0);
  }

  /**
   * Custom prompt transformation based on user-provided instructions.
   */
  public async transformPrompts(rawText: string, instruction: string): Promise<string[]> {
    const systemPrompt = `You are an AI prompt transformation engine.
Transform the provided prompts strictly according to this user instruction:
"${instruction}"

Return a valid JSON object strictly matching this schema:
{
  "prompts": [
    { "id": "1", "text": "transformed prompt text" }
  ]
}
Do not include commentary outside the JSON block.`;

    const response = await this.client.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: rawText }],
    });

    const parsed = PromptProcessor.extractJson<{ prompts: Array<{ id: string; text: string }> }>(response);
    if (!parsed || !Array.isArray(parsed.prompts)) {
      throw new Error('AI response did not contain a valid prompts array');
    }

    return parsed.prompts.map((p) => p.text.trim()).filter((t) => t.length > 0);
  }

  /**
   * Analyze prompt validity and quality.
   */
  public async validatePrompts(promptText: string): Promise<PromptValidationResult> {
    const systemPrompt = `You are a prompt quality auditor for generative video platforms like Google Flow.
Analyze the prompt for:
- Clarity of subject
- Potential trigger words or vague phrasing
- Adequacy of motion/action description
- Lighting and stylistic clarity
Return a valid JSON object strictly matching this schema:
{
  "isValid": true,
  "score": 85,
  "issues": ["list of potential ambiguities or flaws"],
  "suggestions": ["specific actionable improvements"]
}
Do not include commentary outside the JSON block.`;

    const response = await this.client.complete({
      system: systemPrompt,
      messages: [{ role: 'user', content: promptText }],
    });

    return PromptProcessor.extractJson<PromptValidationResult>(response);
  }
}
