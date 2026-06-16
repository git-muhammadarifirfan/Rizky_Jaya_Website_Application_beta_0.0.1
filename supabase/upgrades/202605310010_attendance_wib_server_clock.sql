-- Rizky Jaya App - Realtime Attendance Clock in WIB (UTC+7)
-- // TIMEZONE: Jalankan file ini satu kali pada database Supabase yang sudah aktif.
-- Timestamp disimpan sebagai timestamptz (instant absolut), sedangkan tanggal
-- bisnis absensi selalu diturunkan menggunakan zona Asia/Jakarta.

begin;

create or replace function public.force_attendance_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recorded_at timestamptz;
begin
  if tg_op = 'INSERT' then
    -- // SECURITY: Gunakan jam server; client APK tidak boleh menentukan jam absen.
    v_recorded_at := clock_timestamp();
    new.input_time := v_recorded_at;
    -- // TIMEZONE: Tanggal absensi berubah pada tengah malam WIB, bukan UTC.
    new.attendance_date := (v_recorded_at at time zone 'Asia/Jakarta')::date;
  end if;
  return new;
end;
$$;

-- // RLS: Pertahankan hak akses yang sudah ada; hanya ganti validasi hari
-- berjalan menjadi kalender WIB yang berasal dari timestamp tepercaya server.
drop policy if exists attendance_member_insert on public.attendance_records;
create policy attendance_member_insert on public.attendance_records for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_attendance_admin(organization_id)
  and attendance_date = (input_time at time zone 'Asia/Jakarta')::date
);

commit;
