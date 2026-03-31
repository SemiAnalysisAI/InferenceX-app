import type { AiProvider } from '@/components/ai-chart/types';

interface ProviderDef {
  label: string;
  buildRequest(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
  ): { url: string; init: RequestInit };
  parseResponse(json: any): string;
}

const PROVIDERS: Record<AiProvider, ProviderDef> = {
  openai: {
    label: 'OpenAI',
    buildRequest(system, user, apiKey) {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        },
      };
    },
    parseResponse(json) {
      return json.choices?.[0]?.message?.content ?? '';
    },
  },

  anthropic: {
    label: 'Anthropic',
    buildRequest(system, user, apiKey) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        },
      };
    },
    parseResponse(json) {
      return json.content?.[0]?.text ?? '';
    },
  },

  xai: {
    label: 'xAI',
    buildRequest(system, user, apiKey) {
      return {
        url: 'https://api.x.ai/v1/chat/completions',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'grok-3',
            temperature: 0,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        },
      };
    },
    parseResponse(json) {
      return json.choices?.[0]?.message?.content ?? '';
    },
  },

  google: {
    label: 'Google',
    buildRequest(system, user, apiKey) {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${system}\n\nUser request: ${user}` }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          }),
        },
      };
    },
    parseResponse(json) {
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    },
  },
};

export function getProviderLabel(provider: AiProvider): string {
  return PROVIDERS[provider].label;
}

export const PROVIDER_OPTIONS: AiProvider[] = ['openai', 'anthropic', 'xai', 'google'];

export async function callLlm(
  provider: AiProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const def = PROVIDERS[provider];
  const { url, init } = def.buildRequest(systemPrompt, userPrompt, apiKey);
  const res = await fetch(url, init);
  const json = await res.json();

  if (!res.ok) {
    const msg =
      json?.error?.message ?? json?.error?.type ?? `${provider} request failed (${res.status})`;
    throw new Error(msg);
  }

  return def.parseResponse(json);
}
