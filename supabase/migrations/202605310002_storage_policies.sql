-- Rizky Jaya App - Private Storage buckets and access policies
-- File path convention: <organization_uuid>/<record_uuid>/<filename>
-- Buckets remain private. Applications should use authenticated downloads or signed URLs.

begin;

insert into storage.buckets (id, name, public)
values
  ('attendance-photos', 'attendance-photos', false),
  ('transport-receipts', 'transport-receipts', false),
  ('payroll-slips', 'payroll-slips', false)
on conflict (id) do update set public = false;

-- Attendance evidence: operational admin can upload/read; only owner deletes evidence.
drop policy if exists attendance_photos_read on storage.objects;
create policy attendance_photos_read on storage.objects for select to authenticated
using (
  bucket_id = 'attendance-photos'
  and public.is_operational_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attendance_photos_insert on storage.objects;
create policy attendance_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-photos'
  and public.is_operational_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists attendance_photos_owner_delete on storage.objects;
create policy attendance_photos_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'attendance-photos'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
);

-- Receipts: admin may upload/read operational receipts; only owner removes evidence.
drop policy if exists transport_receipts_read on storage.objects;
create policy transport_receipts_read on storage.objects for select to authenticated
using (
  bucket_id = 'transport-receipts'
  and public.is_operational_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists transport_receipts_insert on storage.objects;
create policy transport_receipts_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'transport-receipts'
  and public.is_operational_admin(((storage.foldername(name))[1])::uuid)
);

drop policy if exists transport_receipts_owner_delete on storage.objects;
create policy transport_receipts_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'transport-receipts'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
);

-- Payroll slips are confidential and owner-only.
drop policy if exists payroll_slips_owner_select on storage.objects;
create policy payroll_slips_owner_select on storage.objects for select to authenticated
using (
  bucket_id = 'payroll-slips'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists payroll_slips_owner_insert on storage.objects;
create policy payroll_slips_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'payroll-slips'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists payroll_slips_owner_update on storage.objects;
create policy payroll_slips_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'payroll-slips'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'payroll-slips'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
);

drop policy if exists payroll_slips_owner_delete on storage.objects;
create policy payroll_slips_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'payroll-slips'
  and public.is_owner(((storage.foldername(name))[1])::uuid)
);

commit;
