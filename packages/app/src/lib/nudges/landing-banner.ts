export const LANDING_BANNER_STORAGE_KEY = 'inferencex-huawei-ascend-950pr-ubenchx-banner-dismissed';
export const LANDING_BANNER_DISMISSED_ATTRIBUTE = 'data-landing-banner-dismissed';
export const HUAWEI_UBENCHX_URL = '/ubenchx/core-memory-profiles';
export const OPERATORX_URL = '/operatorx';
export const TPUV7_QWEN_3_5_AGENTX_URL =
  '/inference/qwen-3-5?g_model=Qwen-3.5-397B-A17B&i_xmode=interactivity&i_seq=agentic-traces&i_prec=fp8';

/**
 * A/B test of the landing banner destination. Each visitor is assigned one arm with
 * equal probability before first paint, and the arm is kept in localStorage so it
 * stays the same across visits. Both arms share one dismissal key.
 */
export const LANDING_BANNER_VARIANTS = ['ubenchx', 'operatorx'] as const;
export type LandingBannerVariant = (typeof LANDING_BANNER_VARIANTS)[number];
export const LANDING_BANNER_VARIANT_STORAGE_KEY = 'inferencex-landing-banner-variant';
export const LANDING_BANNER_VARIANT_ATTRIBUTE = 'data-landing-banner-variant';
export const LANDING_BANNER_EXPERIMENT = 'landing_banner_destination';
/** PostHog super property carrying the arm on every event, so any insight can break down by it. */
export const LANDING_BANNER_VARIANT_PROPERTY = 'landing_banner_variant';
/** Both arms share event names so one PostHog funnel can compare them by `variant`. */
export const LANDING_BANNER_ANALYTICS_EVENTS = {
  shown: 'landing_banner_shown',
  dismissed: 'landing_banner_dismissed',
  action: 'landing_banner_clicked',
} as const;

/** The arm the pre-paint script assigned to this visitor, or null before it has run. */
export function assignedLandingBannerVariant(): LandingBannerVariant | null {
  if (typeof document === 'undefined') return null;
  const value = document.documentElement.getAttribute(LANDING_BANNER_VARIANT_ATTRIBUTE);
  return (LANDING_BANNER_VARIANTS as readonly string[]).includes(value ?? '')
    ? (value as LandingBannerVariant)
    : null;
}

/** Inline script run before first paint: marks a dismissed banner and assigns the A/B arm. */
export function landingBannerPrepaintScript(): string {
  const html = 'document.documentElement';
  return [
    `try{if(localStorage.getItem(${JSON.stringify(LANDING_BANNER_STORAGE_KEY)})){${html}.setAttribute(${JSON.stringify(LANDING_BANNER_DISMISSED_ATTRIBUTE)},'')}}catch{}`,
    `var v=null,vs=${JSON.stringify(LANDING_BANNER_VARIANTS)};`,
    `try{v=localStorage.getItem(${JSON.stringify(LANDING_BANNER_VARIANT_STORAGE_KEY)})}catch{}`,
    `if(vs.indexOf(v)<0){v=vs[Math.random()<0.5?0:1];try{localStorage.setItem(${JSON.stringify(LANDING_BANNER_VARIANT_STORAGE_KEY)},v)}catch{}}`,
    `${html}.setAttribute(${JSON.stringify(LANDING_BANNER_VARIANT_ATTRIBUTE)},v);`,
  ].join('');
}

/** Hides a dismissed banner and every banner arm other than the assigned one before hydration. */
export function landingBannerPrepaintStyle(): string {
  const hideOtherArms = LANDING_BANNER_VARIANTS.flatMap((assigned) =>
    LANDING_BANNER_VARIANTS.filter((arm) => arm !== assigned).map(
      (arm) =>
        `html[${LANDING_BANNER_VARIANT_ATTRIBUTE}="${assigned}"] [data-banner-variant="${arm}"]`,
    ),
  ).join(',');
  return `html[${LANDING_BANNER_DISMISSED_ATTRIBUTE}] [data-initial-banner],${hideOtherArms}{display:none}`;
}
