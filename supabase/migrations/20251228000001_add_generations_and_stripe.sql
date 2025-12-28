-- Update profiles table for Stripe
alter table public.profiles 
add column if not exists stripe_customer_id text,
add column if not exists plan text default 'free';

-- Create generations table for history
create table if not exists public.generations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  base_url text not null,
  garment_url text not null,
  result_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on generations
alter table public.generations enable row level security;

-- Allow users to view their own generations
create policy "Users can view own generations" on public.generations
  for select using (auth.uid() = user_id);

-- Allow users to insert their own generations
create policy "Users can insert own generations" on public.generations
  for insert with check (auth.uid() = user_id);
