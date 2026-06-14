-- user_feedback: every user-supplied column is base64(iv||ciphertext||authTag) AES-256-GCM.

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
