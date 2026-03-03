// LLM / Image generation connector — Fase 6
// Supports Anthropic (Claude), OpenAI, and mock providers
// Includes tool_use / function_calling support

// ============================================================
// Types
// ============================================================

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'mock';
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
  toolCalls?: LLMToolCall[];
  stopReason?: string;
}

export interface ImageGenConfig {
  provider: 'openai' | 'stability' | 'mock';
  apiKey: string;
}

export interface ImageGenResponse {
  url?: string;
  base64?: string;
  revisedPrompt?: string;
}

export interface LLMConnector {
  chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse>;
  generateImage(prompt: string, options?: Record<string, unknown>): Promise<ImageGenResponse>;
}

// ============================================================
// Helpers
// ============================================================

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode || 0;
      // Don't retry on 4xx client errors (except 429 rate limit)
      if (status >= 400 && status < 500 && status !== 429) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ============================================================
// Anthropic provider
// ============================================================

function createAnthropicProvider(config: LLMConfig): LLMConnector {
  const { apiKey, model, maxTokens = 4096, temperature = 0.3, baseUrl } = config;
  const endpoint = baseUrl || 'https://api.anthropic.com';

  async function chatImpl(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    // Separate system message from conversation
    let systemPrompt: string | undefined;
    const conversationMessages: { role: string; content: unknown }[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else if (msg.role === 'tool') {
        conversationMessages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId || '',
            content: msg.content,
          }],
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const blocks: unknown[] = [];
        if (msg.content) blocks.push({ type: 'text', text: msg.content });
        for (const tc of msg.toolCalls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        conversationMessages.push({ role: 'assistant', content: blocks });
      } else {
        conversationMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: conversationMessages,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    const res = await fetch(`${endpoint}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Anthropic API error (${res.status}): ${text}`);
      (err as any).status = res.status;
      throw err;
    }

    const json = await res.json() as {
      content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
      usage: { input_tokens: number; output_tokens: number };
      model: string;
      stop_reason: string;
    };

    let textContent = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of json.content) {
      if (block.type === 'text' && block.text) {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id!,
          name: block.name!,
          input: block.input || {},
        });
      }
    }

    return {
      content: textContent,
      usage: {
        promptTokens: json.usage.input_tokens,
        completionTokens: json.usage.output_tokens,
        totalTokens: json.usage.input_tokens + json.usage.output_tokens,
      },
      model: json.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: json.stop_reason,
    };
  }

  return {
    async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
      return withRetry(() => chatImpl(messages, tools));
    },
    async generateImage(_prompt: string): Promise<ImageGenResponse> {
      throw new Error('Anthropic does not support image generation. Use OpenAI provider for images.');
    },
  };
}

// ============================================================
// OpenAI provider
// ============================================================

function createOpenAIProvider(config: LLMConfig): LLMConnector {
  const { apiKey, model, maxTokens = 4096, temperature = 0.3, baseUrl } = config;
  const endpoint = baseUrl || 'https://api.openai.com';

  async function chatImpl(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    const oaiMessages: { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        oaiMessages.push({ role: 'tool', content: msg.content, tool_call_id: msg.toolCallId });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        oaiMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        });
      } else {
        oaiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: oaiMessages,
    };
    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`OpenAI API error (${res.status}): ${text}`);
      (err as any).status = res.status;
      throw err;
    }

    const json = await res.json() as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
        finish_reason: string;
      }[];
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    const choice = json.choices[0];
    const toolCalls: LLMToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content: choice.message.content || '',
      usage: {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        totalTokens: json.usage.total_tokens,
      },
      model: json.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: choice.finish_reason,
    };
  }

  async function generateImageImpl(prompt: string, options?: Record<string, unknown>): Promise<ImageGenResponse> {
    const body: Record<string, unknown> = {
      prompt,
      model: (options?.model as string) || 'dall-e-3',
      n: 1,
      size: (options?.size as string) || '1024x1024',
      response_format: 'url',
    };

    const res = await fetch(`${endpoint}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI Images API error (${res.status}): ${text}`);
    }

    const json = await res.json() as { data: { url?: string; b64_json?: string; revised_prompt?: string }[] };
    const img = json.data[0];

    return {
      url: img.url,
      base64: img.b64_json,
      revisedPrompt: img.revised_prompt,
    };
  }

  return {
    async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
      return withRetry(() => chatImpl(messages, tools));
    },
    async generateImage(prompt: string, options?: Record<string, unknown>): Promise<ImageGenResponse> {
      return withRetry(() => generateImageImpl(prompt, options));
    },
  };
}

// ============================================================
// Mock provider
// ============================================================

function createMockProvider(config: LLMConfig): LLMConnector {
  return {
    async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
      const lastMsg = messages[messages.length - 1];
      return {
        content: `[MOCK] Received ${messages.length} messages. Last: "${lastMsg?.content?.slice(0, 80)}..."${tools ? ` (${tools.length} tools available)` : ''}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: config.model || 'mock-model',
        stopReason: 'end_turn',
      };
    },
    async generateImage(prompt: string): Promise<ImageGenResponse> {
      return {
        url: 'https://placeholder.example.com/mock-image.png',
        revisedPrompt: `[MOCK] ${prompt}`,
      };
    },
  };
}

// ============================================================
// Factory
// ============================================================

export function createLLMConnector(config: LLMConfig): LLMConnector {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider(config);
    case 'openai':
      return createOpenAIProvider(config);
    case 'mock':
      return createMockProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
