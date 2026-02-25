// LLM / Image generation connector — stub for Fase 4
// Real implementation in Fase 6+ (agent logic)

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'mock';
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
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
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  generateImage(prompt: string, options?: Record<string, unknown>): Promise<ImageGenResponse>;
}

export function createLLMConnector(_config: LLMConfig): LLMConnector {
  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      console.log('[STUB] LLM chat', messages.length, 'messages');
      return {
        content: 'This is a mock LLM response.',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'mock-model',
      };
    },
    async generateImage(prompt: string): Promise<ImageGenResponse> {
      console.log(`[STUB] LLM generateImage: ${prompt}`);
      return {
        url: 'https://placeholder.example.com/image.png',
        revisedPrompt: prompt,
      };
    },
  };
}
