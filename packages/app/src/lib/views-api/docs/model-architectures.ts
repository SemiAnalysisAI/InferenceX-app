import type { ApiOperation } from '@/lib/api/api-documentation';
import { API_BASE_URL } from '@/lib/api/api-documentation-base';
import {
  arraySchema,
  booleanSchema,
  errorSchema,
  integerSchema,
  nullableStringSchema,
  numberSchema,
  objectSchema,
  parameterErrorSchema,
  queryParameter,
  stringSchema,
  text,
} from '@/lib/api/api-documentation-helpers';

const architectureSchema = {
  ...objectSchema(
    {
      model: stringSchema,
      totalParams: {
        ...numberSchema,
        description:
          'Billions of parameters; see model-specific features for excluded auxiliary modules.',
      },
      activeParams: {
        ...numberSchema,
        description:
          'Billions of active parameters per token; decode count when activeParamsPrefill is present.',
      },
      activeParamsPrefill: numberSchema,
      conditionalMemoryParams: numberSchema,
      conditionalMemoryName: stringSchema,
      architectureType: { type: 'string' as const, enum: ['dense', 'moe'] },
      attentionType: stringSchema,
      attentionLabel: stringSchema,
      numLayers: integerSchema,
      hiddenSize: integerSchema,
      numHeads: integerSchema,
      numKVHeads: integerSchema,
      headDim: integerSchema,
      vocabSize: integerSchema,
      ffnDim: integerSchema,
      numExperts: integerSchema,
      activeExperts: integerSchema,
      hasSharedExpert: booleanSchema,
      sharedExperts: integerSchema,
      denseFFNLayers: integerSchema,
      denseFFNDim: integerSchema,
      hashRoutedLayers: integerSchema,
      slidingWindow: integerSchema,
      hyperConnections: integerSchema,
      contextWindow: integerSchema,
      advertisedContextWindow: integerSchema,
      features: arraySchema(stringSchema),
      featuresZh: arraySchema(stringSchema),
      developer: stringSchema,
      sourceUrl: stringSchema,
      attentionExpandable: booleanSchema,
      alternatingAttentionExpandable: booleanSchema,
      alternatingNote: stringSchema,
      alternatingNoteZh: stringSchema,
      denseLayerAttentionLabel: stringSchema,
      ffnVariant: stringSchema,
      ffnGateActivation: stringSchema,
      ffnSwiGLUOAI: booleanSchema,
      ffnClamp: numberSchema,
      routedExpertHiddenSize: integerSchema,
      residualType: { type: 'string' as const, enum: ['AttnRes', 'gated'] },
      alternatingLayers: arraySchema(
        objectSchema(
          {
            label: stringSchema,
            description: stringSchema,
            count: integerSchema,
            colorKey: stringSchema,
            slidingWindow: integerSchema,
            attentionShape: stringSchema,
          },
          ['label', 'description', 'count', 'colorKey'],
        ),
      ),
      encoderDecoder: objectSchema({
        encoderLayers: integerSchema,
        decoderLayers: integerSchema,
        globalKVSource: { type: 'string', enum: ['final-encoder-hidden-states'] },
        encoderSlidingOnlyLayers: integerSchema,
        decoderAttention: { type: 'string', enum: ['joint-local-swa-and-shared-global-kv'] },
      }),
    },
    ['model', 'totalParams', 'activeParams', 'architectureType', 'attentionType'],
  ),
  additionalProperties: true,
};

export const operations: ApiOperation[] = [
  {
    id: 'get-model-architectures-view',
    group: 'views',
    method: 'GET',
    path: '/api/v1/views/model-architectures',
    summary: text('Read model architecture specifications', '读取模型架构规格'),
    description: text(
      'Returns the same compiled architecture registry used by the English and Chinese model pages and dashboard diagrams. Omit model for all registry entries, including models without a canonical compare slug (slug is null). Supply an exact model display name or canonical compare slug for one entry; aliases, empty values, unknown or repeated parameters return 400. Optional facts remain omitted when unspecified. Parameter counts use billions, dimensions and context windows use exact integer counts; sourceUrl identifies the vendor source. Diagram expansion is presentation only. This catalog reads no database, benchmark measurements, private data or unofficial runs; use the inference view for model-page benchmark controls. Public, no authentication, JSON only. Successful responses use Cache-Control: public, max-age=0, s-maxage=300.',
      '返回英文、中文模型页面和仪表盘架构图共用的静态架构注册表。不传 model 时返回全部条目，包括没有规范 compare slug 的模型（slug 为 null）。传入完整模型显示名称或规范 compare slug 时返回对应条目；别名、空值、未知或重复参数均返回 400。未提供的可选规格保持省略。参数量以十亿为单位，维度和上下文长度使用精确整数；sourceUrl 指向厂商来源。架构图展开仅影响展示。该目录不读取数据库、基准测试结果、私有数据或非官方 run；模型页的基准测试控件请使用 inference 视图。公开访问，无需认证，仅返回 JSON。成功响应使用 Cache-Control: public, max-age=0, s-maxage=300。',
    ),
    audience: 'public',
    stability: 'beta',
    parameters: [
      queryParameter(
        'model',
        false,
        'string',
        'Exact display name or canonical compare slug. Omit to return all architectures; empty values and aliases are rejected.',
        '完整模型显示名称或规范 compare slug。省略时返回全部架构；不接受空值或别名。',
        stringSchema,
        'kimi-k3',
      ),
    ],
    responses: [
      {
        status: '200',
        description: text(
          'Architecture facts with resolved model selection and canonical slugs.',
          '架构规格、解析后的模型选择及规范 slug。',
        ),
        schema: objectSchema({
          view: { type: 'string', enum: ['model-architectures'] },
          apiVersion: { type: 'string', enum: ['v1'] },
          params: objectSchema({ model: nullableStringSchema }),
          models: arraySchema(
            objectSchema({ slug: nullableStringSchema, architecture: architectureSchema }),
          ),
        }),
        example: {
          view: 'model-architectures',
          apiVersion: 'v1',
          params: { model: 'Kimi-K3' },
          models: [
            {
              slug: 'kimi-k3',
              architecture: {
                model: 'Kimi-K3',
                totalParams: 2800,
                activeParams: 104,
                architectureType: 'moe',
                attentionType: 'Hybrid',
                numLayers: 93,
                hiddenSize: 7168,
                numExperts: 898,
                activeExperts: 16,
                sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
              },
            },
          ],
        },
      },
      {
        status: '400',
        description: text(
          'Invalid model, empty model, unknown parameter or repeated parameter.',
          '模型无效、model 为空、参数未知或重复。',
        ),
        schema: parameterErrorSchema,
        example: { error: 'Unknown model: missing', param: 'model' },
      },
      {
        status: '500',
        description: text('Architecture catalog assembly failed.', '架构目录组装失败。'),
        schema: errorSchema,
        example: { error: 'Internal server error' },
      },
    ],
    responseShapeName: 'ModelArchitecturesView',
    curlUrl: `${API_BASE_URL}/api/v1/views/model-architectures?model=kimi-k3`,
  },
];
