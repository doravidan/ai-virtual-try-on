-- Create a profiles table that links to Supabase Auth
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  credits int default 3 -- 3 free credits on signup
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Allow users to read their own profile
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'profiles' and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile" on public.profiles
      for select using (auth.uid() = id);
  end if;
end
$$;

-- Automatic Profile Creation on Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, 3);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
