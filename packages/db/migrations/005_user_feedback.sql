-- user_feedback: every user-supplied column is base64(iv||ciphertext||authTag) AES-256-GCM.
-- feedback_rate_limits: ip_hash = peppered sha256 (pepper = FEEDBACK_ENCRYPTION_KEY).

create table user_feedback (
  id                       bigserial   primary key,
  created_at               timestamptz not null default now(),
  doing_well_ciphertext    text,
  doing_poorly_ciphertext  text,
  want_to_see_ciphertext   text,
  user_agent_ciphertext    text,
  page_path_ciphertext     text
);

create index user_feedback_created_at_idx on user_feedback (created_at desc);

create table feedback_rate_limits (
  ip_hash      text        primary key,
  count        integer     not null,
  window_start timestamptz not null
);

create index feedback_rate_limits_window_start_idx
  on feedback_rate_limits (window_start);
