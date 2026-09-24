// Maximum conversation-ID search string accepted by the dataset conversation
// index and by every view that forwards to it. Longer strings are rejected with
// 400 rather than being forwarded to the DB: an ILIKE on an unindexed conv_id
// column with a very long pattern (or many stacked wildcards) can exhaust Neon's
// statement timeout and return a 500. 100 chars is generous for any real
// conversation-id prefix while keeping the attack surface small.
export const MAX_CONVERSATION_SEARCH_LENGTH = 100;
