-- Seed data for demo mode and presentation walkthrough.
-- Replace with real demo user IDs when the project is connected to Supabase Auth.

insert into profiles (id, full_name, email, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Resident Demo User', 'resident@example.com', 'resident'),
  ('22222222-2222-2222-2222-222222222222', 'Municipal Admin', 'admin@example.com', 'admin')
on conflict (id) do nothing;

insert into reports (
  id,
  reference_number,
  user_id,
  title,
  description,
  category,
  status,
  priority,
  latitude,
  longitude,
  location_description,
  assigned_to,
  created_at,
  updated_at,
  resolved_at
)
values (
  '33333333-3333-3333-3333-333333333333',
  'CF-2026-1024',
  '11111111-1111-1111-1111-111111111111',
  'Pothole near the traffic lights',
  'Large pothole has formed near the intersection and is causing damage to vehicles after rainfall.',
  'Roads & Potholes',
  'Assigned',
  'High',
  -26.1719,
  28.0107,
  'Main Road and Long Street, Johannesburg South',
  'Road Maintenance Unit',
  now(),
  now(),
  null
) on conflict (reference_number) do nothing;
