/**
 * Google Flow Prompt Automator - Anthropic API Client
 * 
 * Provides an optional, secure, client-side interface to Anthropic's Claude API.
 * The API key is entered locally by the user and never exposed in source code or telemetry.
 */

import { logger } from '../core/logger';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  messages: AnthropicMessage[];
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
}

export class AnthropicClient {
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string = 'https://api.anthropic.com/v1/messages';

  constructor(apiKey: string, defaultModel: string = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey.trim();
    this.defaultModel = defaultModel || 'claude-3-5-sonnet-20241022';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('sk-ant-'));
  }

  public async complete(options: AnthropicRequestOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(
        'Anthropic API Key is not configured. Please enter your API key in Extension Settings / AI Tools.'
      );
    }

    const payload = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.7,
      system: options.system,
      messages: options.messages,
    };

    logger.debug(`Calling Anthropic API with model ${payload.model}...`);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errMessage = `Anthropic API Error (${response.status} ${response.statusText})`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMessage += `: ${errData.error.message}`;
          }
        } catch {
          // Ignore JSON parse error on error body
        }
        throw new Error(errMessage);
      }

      const data = (await response.json()) as AnthropicResponse;
      const textBlock = data.content?.find((c) => c.type === 'text');
      if (!textBlock || !textBlock.text) {
        throw new Error('Anthropic API returned an empty text response.');
      }

      logger.info('Anthropic API call completed successfully.');
      return textBlock.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Anthropic API request failed: ${msg}`);
      throw err;
    }
  }
}
