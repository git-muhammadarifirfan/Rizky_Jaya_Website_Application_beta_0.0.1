-- Rizky Jaya App - realtime refresh, owner read-only attendance, and safe profile-name editing.
-- Run after 202605310001...202605310004 for a fresh project.

begin;

-- // FEATURE: Role khusus input absensi. Owner tetap dapat SELECT untuk monitoring, namun tidak dapat CRUD absensi.
create or replace function public.is_attendance_admin(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users ou
    join public.profiles p on p.id = ou.user_id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.role = 'admin_operasional'::public.user_role
      and p.is_active = true
  );
$$;
revoke all on function public.is_attendance_admin(uuid) from public;
grant execute on function public.is_attendance_admin(uuid) to authenticated;

drop policy if exists attendance_member_insert on public.attendance_records;
create policy attendance_member_insert on public.attendance_records for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_attendance_admin(organization_id)
  and attendance_date = current_date
);

drop policy if exists attendance_admin_update_today on public.attendance_records;
create policy attendance_admin_update_today on public.attendance_records for update to authenticated
using (
  public.is_attendance_admin(organization_id)
  and created_by = auth.uid()
  and attendance_date = current_date
)
with check (
  public.is_attendance_admin(organization_id)
  and created_by = auth.uid()
  and attendance_date = current_date
);

drop policy if exists attendance_owner_delete on public.attendance_records;

-- // FEATURE: Owner boleh melihat bukti absensi, hanya Admin Absensi yang dapat mengunggah bukti baru.
drop policy if exists attendance_photos_insert on storage.objects;
create policy attendance_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-photos'
  and public.is_attendance_admin(((storage.foldername(name))[1])::uuid)
);

-- // FEATURE: User boleh mengganti nama sendiri tanpa dapat mengubah role/status aktif.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update(full_name) on public.profiles to authenticated;

-- // FEATURE: CRUD realtime untuk dashboard, grafik, dan seluruh tab.
-- Supabase Realtime harus mempublikasikan tabel sebelum client .stream() menerima perubahan.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'employees', 'employee_pay_rates', 'attendance_records', 'payroll_periods',
      'payroll_slips', 'vehicles', 'transport_jobs', 'fuel_expenses',
      'vehicle_expenses', 'report_exports'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;
