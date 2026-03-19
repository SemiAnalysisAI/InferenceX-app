export const GITHUB_OWNER = 'SemiAnalysisAI';
export const GITHUB_REPO = 'InferenceX';
export const GITHUB_REPO_FULL = `${GITHUB_OWNER}/${GITHUB_REPO}`;

/** Current + legacy repo slugs (for matching old workflow runs). */
export const GITHUB_REPOS = [GITHUB_REPO_FULL, 'InferenceMAX/InferenceMAX'];

export const GITHUB_API_BASE = 'https://api.github.com';

/** GCS backup bucket for expired GitHub artifacts (artifacts expire after 90 days). */
export const GCS_BUCKET_BASE = 'https://storage.googleapis.com/inferencemax-gha-backup';
