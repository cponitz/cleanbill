-- Service-role-only key/value settings (fallback for secrets when the dashboard isn't used). RLS on, no policies.
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);
alter table app_settings enable row level security;
