-- Initial Horizon Works schema. Apply after configuring Supabase Auth and reviewing RLS.
create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  niche text not null,
  location text not null,
  service_offer text not null,
  target_count integer not null check (target_count between 1 and 100),
  source_config jsonb not null default '{}'::jsonb,
  demo_exists boolean not null default false,
  status text not null default 'queued' check (status in ('draft','queued','running','paused','completed','cancelled','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  business_name text not null,
  normalized_name text not null,
  location text,
  website_url text,
  website_domain text,
  instagram_username text,
  instagram_url text,
  identity_status text not null default 'unmatched' check (identity_status in ('unmatched','candidate','verified','rejected')),
  status text not null default 'discovered',
  score integer check (score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_campaign_instagram_unique
  on public.leads (campaign_id, lower(instagram_username))
  where instagram_username is not null and instagram_username <> '';
create index if not exists leads_campaign_status_idx on public.leads (campaign_id, status);
create index if not exists leads_domain_idx on public.leads (website_domain) where website_domain is not null;

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  source_type text not null,
  source_url text,
  observed_at timestamptz not null default now(),
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  evidence jsonb not null default '{}'::jsonb
);
create index if not exists lead_sources_lead_idx on public.lead_sources (lead_id);

create table if not exists public.research_observations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  claim text not null,
  source_id uuid references public.lead_sources(id) on delete set null,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  observed_at timestamptz not null default now()
);

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  message_text text not null,
  model text,
  validation_status text not null default 'needs_review' check (validation_status in ('valid','needs_review','rejected')),
  status text not null default 'draft' check (status in ('draft','needs_review','approved_for_manual_use','manually_sent','skipped')),
  created_at timestamptz not null default now(),
  edited_at timestamptz not null default now(),
  unique (lead_id, version)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  current_lead_id uuid references public.leads(id) on delete set null,
  current_step text not null default 'queued',
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  paused_reason text,
  checkpoint_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.lead_sources enable row level security;
alter table public.research_observations enable row level security;
alter table public.drafts enable row level security;
alter table public.agent_runs enable row level security;
alter table public.activity_events enable row level security;

create policy "owners manage own campaigns" on public.campaigns for all to authenticated
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners manage leads in own campaigns" on public.leads for all to authenticated
using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));

create policy "owners manage sources for own leads" on public.lead_sources for all to authenticated
using (exists (select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id where l.id = lead_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id where l.id = lead_id and c.owner_id = auth.uid()));

create policy "owners manage observations for own leads" on public.research_observations for all to authenticated
using (exists (select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id where l.id = lead_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id where l.id = lead_id and c.owner_id = auth.uid()));

create policy "owners manage drafts for own leads" on public.drafts for all to authenticated
using (exists (select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id where l.id = lead_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.leads l join public.campaigns c on c.id = l.campaign_id where l.id = lead_id and c.owner_id = auth.uid()));

create policy "owners manage agent runs for own campaigns" on public.agent_runs for all to authenticated
using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));

create policy "owners manage activity for own campaigns" on public.activity_events for all to authenticated
using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
