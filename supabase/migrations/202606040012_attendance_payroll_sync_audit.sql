-- Rizky Jaya App beta 0.0.17
-- Sinkronisasi penanda ambil gaji pada absensi cepat dengan status slip harian.
-- Jalankan setelah 202606040011_quick_attendance_transport_catalog.sql.

begin;

-- // PERFORMANCE: Indeks gabungan mempercepat pembacaan absensi bulanan,
-- sinkronisasi pengambilan gaji, dan pencarian slip per karyawan/periode.
create index if not exists idx_attendance_org_employee_date_paid
  on public.attendance_records(organization_id, employee_id, attendance_date, paid_at);
create index if not exists idx_payroll_periods_org_range
  on public.payroll_periods(organization_id, start_date, end_date);
create index if not exists idx_payroll_slips_org_employee_period
  on public.payroll_slips(organization_id, employee_id, payroll_period_id);

-- // INTEGRITY: Penanda gaji hanya boleh berada pada hari yang dihitung hadir.
-- Bila status dikoreksi menjadi izin/sakit/libur/tidak hadir, tanda pembayaran
-- dibersihkan agar laporan payroll tidak menghitung pengambilan yang salah.
create or replace function public.normalize_attendance_daily_pickup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status not in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status) then
    new.paid_at := null;
    new.paid_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_normalize_daily_pickup on public.attendance_records;
create trigger attendance_records_normalize_daily_pickup
before insert or update on public.attendance_records
for each row execute function public.normalize_attendance_daily_pickup();

-- // SYNC: Bila slip harian untuk bulan tersebut sudah ada, perubahan simbol
-- ❌ pada absensi langsung memperbarui status pembayaran slip. Nominal tetap
-- dihitung ulang oleh aksi Hitung Gaji agar bonus/potongan manual tidak berubah
-- diam-diam tanpa persetujuan Owner.
create or replace function public.sync_daily_payroll_status_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_employee_id uuid;
  v_attendance_date date;
begin
  v_organization_id := coalesce(new.organization_id, old.organization_id);
  v_employee_id := coalesce(new.employee_id, old.employee_id);
  v_attendance_date := coalesce(new.attendance_date, old.attendance_date);

  update public.payroll_slips ps
     set status = case
           when totals.hadir > 0 and totals.sudah_diambil >= totals.hadir
             then 'dibayar'::public.payroll_status
           else 'draft'::public.payroll_status
         end,
         paid_at = case
           when totals.hadir > 0 and totals.sudah_diambil >= totals.hadir
             then coalesce(ps.paid_at, clock_timestamp())
           else null
         end,
         updated_by = coalesce(auth.uid(), ps.updated_by)
    from public.payroll_periods pp
    cross join lateral (
      select
        count(*) filter (where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status))::integer as hadir,
        count(*) filter (where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status) and ar.paid_at is not null)::integer as sudah_diambil
      from public.attendance_records ar
      where ar.organization_id = v_organization_id
        and ar.employee_id = v_employee_id
        and ar.attendance_date between pp.start_date and pp.end_date
    ) totals
   where ps.organization_id = v_organization_id
     and ps.employee_id = v_employee_id
     and ps.salary_type = 'harian'
     and ps.payroll_period_id = pp.id
     and v_attendance_date between pp.start_date and pp.end_date;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_sync_daily_payroll on public.attendance_records;
create trigger attendance_records_sync_daily_payroll
after insert or update or delete on public.attendance_records
for each row execute function public.sync_daily_payroll_status_from_attendance();

commit;
