begin;

insert into public.municipalities (name, province, code, is_active)
values ('Emfuleni Local Municipality', 'Gauteng', 'ZA-GP-EMFULENI', true)
on conflict (code) do update
set name = excluded.name,
    province = excluded.province,
    is_active = true;

insert into public.municipal_teams (municipality_id, name, department)
select m.id, t.name, t.department
from public.municipalities m
cross join (
  values
    ('Roads and Stormwater', 'Roads and Stormwater'),
    ('Water and Sanitation', 'Water and Sanitation'),
    ('Electricity and Streetlights', 'Electricity and Streetlights'),
    ('Waste Management', 'Waste Management'),
    ('Public Infrastructure and Facilities', 'Public Infrastructure and Facilities')
) as t(name, department)
where m.code = 'ZA-GP-EMFULENI'
on conflict (municipality_id, name) do update
set department = excluded.department,
    is_active = true;

commit;
