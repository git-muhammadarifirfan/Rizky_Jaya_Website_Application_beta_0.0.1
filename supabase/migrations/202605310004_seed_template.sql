-- Jalankan setelah membuat user Owner pada Authentication > Users.
-- Ganti OWNER_AUTH_UUID dengan UUID user Owner, tanpa tanda < >.

begin;

insert into public.organizations (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Rizky Jaya')
on conflict (id) do update set name = excluded.name;

insert into public.profiles (id, full_name)
values ('OWNER_AUTH_UUID'::uuid, 'Owner Rizky Jaya')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organization_users (organization_id, user_id, role, created_by)
values ('11111111-1111-4111-8111-111111111111', 'OWNER_AUTH_UUID'::uuid, 'owner', 'OWNER_AUTH_UUID'::uuid)
on conflict (organization_id, user_id) do update set role = excluded.role;

insert into public.employees (organization_id, employee_code, full_name, position, created_by)
values
 ('11111111-1111-4111-8111-111111111111','KRY-001','Budi Santoso','Manager Operasional','OWNER_AUTH_UUID'::uuid),
 ('11111111-1111-4111-8111-111111111111','KRY-002','Siti Aisyah','Staf Admin','OWNER_AUTH_UUID'::uuid),
 ('11111111-1111-4111-8111-111111111111','KRY-003','Andi Pratama','Sales Executive','OWNER_AUTH_UUID'::uuid),
 ('11111111-1111-4111-8111-111111111111','KRY-004','Dewi Lestari','Kasir','OWNER_AUTH_UUID'::uuid),
 ('11111111-1111-4111-8111-111111111111','KRY-005','Rizky Maulana','Teknisi','OWNER_AUTH_UUID'::uuid)
on conflict (organization_id, employee_code) do nothing;

insert into public.employee_pay_rates (organization_id, employee_id, daily_rate, valid_from, created_by)
select e.organization_id, e.id,
  case e.employee_code when 'KRY-001' then 120000 when 'KRY-002' then 100000 when 'KRY-003' then 90000 else 85000 end,
  current_date, 'OWNER_AUTH_UUID'::uuid
from public.employees e
where e.organization_id = '11111111-1111-4111-8111-111111111111'
and not exists (select 1 from public.employee_pay_rates r where r.employee_id = e.id);

-- Tidak memakai max(uuid), sehingga seed aman dijalankan di PostgreSQL/Supabase.
insert into public.vehicles (
 organization_id, fleet_code, plate_number, vehicle_year, tax_due_date,
 default_driver_id, default_helper_1_id, default_helper_2_id, created_by
)
select
 '11111111-1111-4111-8111-111111111111', 'Truck 1', 'N 1234 WA', 2015, date '2027-05-15',
 (select id from public.employees where organization_id='11111111-1111-4111-8111-111111111111' and employee_code='KRY-001' limit 1),
 (select id from public.employees where organization_id='11111111-1111-4111-8111-111111111111' and employee_code='KRY-002' limit 1),
 (select id from public.employees where organization_id='11111111-1111-4111-8111-111111111111' and employee_code='KRY-003' limit 1),
 'OWNER_AUTH_UUID'::uuid
on conflict (organization_id, fleet_code) do nothing;

commit;
