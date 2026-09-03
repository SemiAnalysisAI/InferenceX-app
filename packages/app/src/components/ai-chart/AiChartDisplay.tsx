'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowUpRight, Eye, EyeOff, Sparkles } from 'lucide-react';

import { track } from '@/lib/analytics';
import { PROVIDER_OPTIONS, getProviderLabel } from '@/lib/ai-providers';
import { useLocale } from '@/lib/use-locale';
import { useAiChart } from '@/hooks/api/use-ai-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { Heading } from '@/components/ui/heading';
import { Label } from '@/components/ui/label';
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
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';

import type { AiProvider } from './types';
import { EXAMPLE_PROMPTS } from './example-prompts';
import AiChartResult from './AiChartResult';

const STRINGS = {
  en: {
    title: 'AI Chart Generation',
    description:
      'Turn a benchmark question into a chart. Choose an example or describe your own comparison.',
    placeholder: 'Describe the chart you want to see...',
    enterToGenerate: '+Enter to generate',
    generating: 'Generating...',
    generateChart: 'Generate Chart',
    error: 'Error',
    tryAgain: 'Try Again',
    examplePrompts: 'Example prompts',
    hideKey: 'Hide API key',
    showKey: 'Show API key',
    promptLabel: 'What would you like to compare?',
    promptHint: 'Describe a model, workload, and metric — or start with an example.',
    provider: 'AI provider',
    apiKey: 'API key',
    connection: 'Provider access',
    keyHint:
      'Required to generate. The key stays in this page’s memory and is sent only to your selected provider.',
    needsBoth: 'Add a description and your provider’s API key to generate a chart.',
    needsKey: 'Add your provider’s API key to generate this chart.',
    needsPrompt: 'Describe a chart or choose an example to continue.',
    examplesHint: 'Choose a starting point, then edit it to fit your question.',
  },
  zh: {
    title: 'AI 图表生成',
    description: '把基准测试问题转成图表。可从示例开始，也可自行描述要比较的内容。',
    placeholder: '描述想查看的图表……',
    enterToGenerate: '+Enter 生成图表',
    generating: '生成中……',
    generateChart: '生成图表',
    error: '错误',
    tryAgain: '返回修改',
    examplePrompts: '提示词示例',
    hideKey: '隐藏 API 密钥',
    showKey: '显示 API 密钥',
    promptLabel: '想比较什么？',
    promptHint: '描述模型、工作负载和指标，或从示例开始。',
    provider: 'AI 服务商',
    apiKey: 'API 密钥',
    connection: '服务商配置',
    keyHint: '生成图表需要 API 密钥。密钥仅保存在当前页面的内存中，并只发送给所选服务商。',
    needsBoth: '填写图表描述和服务商 API 密钥后即可生成图表。',
    needsKey: '填写服务商 API 密钥后即可生成此图表。',
    needsPrompt: '描述所需图表或选择一个示例后继续。',
    examplesHint: '选择一个示例，再按需要修改。',
  },
} as const;

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
  const [isMac, setIsMac] = useState(false);
  const locale = useLocale();
  const { result, isLoading, error, generate, reset } = useAiChart(locale);
  const t = STRINGS[locale];
  const examples = EXAMPLE_PROMPTS[locale];

  useEffect(() => {
    setIsMac(navigator.userAgent.includes('Mac'));
  }, []);

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
      <DashboardSectionHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-5 shrink-0" />
            {t.title}
          </span>
        }
        description={t.description}
      />
      <div
        className={`grid items-start gap-4 ${!result && !isLoading && !error ? 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}
      >
        <Card className="space-y-4" data-testid="ai-chart-composer">
          <div className="space-y-2">
            <Label htmlFor="ai-chart-prompt" className="font-semibold">
              {t.promptLabel}
            </Label>
            <p id="ai-chart-prompt-hint" className="text-sm text-muted-foreground">
              {t.promptHint}
            </p>
            <Textarea
              id="ai-chart-prompt"
              aria-describedby="ai-chart-prompt-hint"
              placeholder={t.placeholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              className="min-h-28 resize-y"
            />
          </div>
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <Heading level="label" as="h3">
              {t.connection}
            </Heading>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="ai-chart-provider">{t.provider}</Label>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger id="ai-chart-provider" className="w-full">
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
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="ai-chart-key">{t.apiKey}</Label>
                <div className="relative">
                  <Input
                    id="ai-chart-key"
                    aria-describedby="ai-chart-key-hint"
                    className="pr-12"
                    type={showKey ? 'text' : 'password'}
                    placeholder={`${getProviderLabel(provider)} API Key`}
                    value={apiKey}
                    onChange={(e) =>
                      setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                    }
                    data-ph-no-capture
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
                    onClick={() => {
                      setShowKey((visible) => !visible);
                      track('ai_chart_api_key_visibility_toggled', { visible: !showKey });
                    }}
                    aria-label={showKey ? t.hideKey : t.showKey}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p id="ai-chart-key-hint" className="text-xs leading-relaxed text-muted-foreground">
              {t.keyHint}
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-xs text-muted-foreground">
              {(!apiKey.trim() || !prompt.trim()) && (
                <p id="ai-chart-requirements">
                  {!apiKey.trim() && !prompt.trim()
                    ? t.needsBoth
                    : apiKey.trim()
                      ? t.needsPrompt
                      : t.needsKey}
                </p>
              )}
              <p>
                {isMac ? '⌘' : 'Ctrl'}
                {t.enterToGenerate}
              </p>
            </div>
            <Button
              className="shrink-0"
              onClick={handleSubmit}
              aria-describedby={
                !apiKey.trim() || !prompt.trim() ? 'ai-chart-requirements' : undefined
              }
              disabled={isLoading || !apiKey.trim() || !prompt.trim()}
            >
              <Sparkles className="size-4" />
              {isLoading ? t.generating : t.generateChart}
            </Button>
          </div>
        </Card>
        {!result && !isLoading && !error && (
          <Card className="space-y-4" data-testid="ai-chart-examples">
            <div className="space-y-1">
              <Heading level="card" as="h3">
                {t.examplePrompts}
              </Heading>
              <p className="text-sm text-muted-foreground">{t.examplesHint}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {examples.map((example, i) => (
                <button
                  key={i}
                  type="button"
                  className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-left text-sm leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-none"
                  onClick={() => handleExampleClick(example, i)}
                >
                  <span className="flex-1">{example}</span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-100 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3">
            <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" />
            <div data-testid="ai-chart-error">
              <p className="text-destructive text-sm font-medium">{t.error}</p>
              <p className="text-muted-foreground text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  track('ai_chart_retry_clicked');
                  reset();
                }}
              >
                {t.tryAgain}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <>
          <UnofficialDomainNotice />
          <AiChartResult charts={result.charts} summary={result.summary} />
        </>
      )}
    </div>
  );
}
