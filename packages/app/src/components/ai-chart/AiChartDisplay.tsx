'use client';

import { useCallback, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Sparkles } from 'lucide-react';

import { track } from '@/lib/analytics';
import { PROVIDER_OPTIONS, getProviderLabel } from '@/lib/ai-providers';
import { useAiChart } from '@/hooks/api/use-ai-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

import type { AiProvider } from './types';
import { EXAMPLE_PROMPTS } from './example-prompts';
import AiChartResult from './AiChartResult';

export default function AiChartDisplay() {
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [apiKeys, setApiKeys] = useState<Record<AiProvider, string>>({
    openai: '',
    anthropic: '',
    xai: '',
    google: '',
  });
  const [prompt, setPrompt] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { result, isLoading, error, generate, reset } = useAiChart();

  const apiKey = apiKeys[provider];

  const handleProviderChange = useCallback((value: string) => {
    const newProvider = value as AiProvider;
    setProvider(newProvider);
    track('ai_chart_provider_changed', { provider: newProvider });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!apiKey.trim() || !prompt.trim()) return;
    track('ai_chart_prompt_submitted', { provider, prompt_length: prompt.length });
    generate(prompt, provider, apiKey);
  }, [apiKey, prompt, provider, generate]);

  const handleExampleClick = useCallback((example: string, index: number) => {
    setPrompt(example);
    track('ai_chart_example_clicked', { example_index: index });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Title, description & API Key */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            AI Chart Generation
          </CardTitle>
          <CardDescription>
            Describe the chart you want in natural language. Your API key is stored in your browser
            and only used by your selected provider. We never see it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-full sm:w-48">
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {getProviderLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1">
              <Input
                className="pr-9"
                type={showKey ? 'text' : 'password'}
                placeholder={`${getProviderLabel(provider)} API Key`}
                value={apiKey}
                onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                data-ph-no-capture
                autoComplete="off"
              />
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Textarea
              placeholder="Describe the chart you want to see..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to generate
              </span>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !apiKey.trim() || !prompt.trim()}
              >
                {isLoading ? 'Generating...' : 'Generate Chart'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-100 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-destructive text-sm font-medium">Error</p>
              <p className="text-muted-foreground text-sm">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={reset}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && <AiChartResult charts={result.charts} summary={result.summary} />}

      {/* Example prompts (shown when no result) */}
      {!result && !isLoading && !error && (
        <div className="space-y-3">
          <h3 className="text-muted-foreground text-sm font-medium">Example prompts</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXAMPLE_PROMPTS.map((example, i) => (
              <button
                key={i}
                type="button"
                className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg border p-3 text-left text-sm transition-colors"
                onClick={() => handleExampleClick(example, i)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
