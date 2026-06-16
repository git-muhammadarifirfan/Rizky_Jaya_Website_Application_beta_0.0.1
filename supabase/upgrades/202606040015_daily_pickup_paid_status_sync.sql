-- Rizky Jaya App beta 0.0.19
-- Sinkronisasi tampilan/status gaji harian setelah simbol ❌ dipilih pada Absensi Cepat.
-- Jalankan setelah 202606040014_owner_detail_attendance_rls_fix.sql.
--
-- // BUSINESS RULE:
-- Untuk karyawan bergaji harian, satu tanda ❌ berarti terdapat gaji harian
-- yang sudah diterima pada periode tersebut. Slip yang sudah tersedia langsung
-- ditandai `dibayar`, sedangkan nominal sisa tetap dihitung ulang dari hari
-- yang belum diambil melalui aplikasi agar tidak terjadi pembayaran ganda.

begin;

-- // PERFORMANCE: Indeks ini sudah dibuat pada migration 012, namun tetap
-- dituliskan idempotent agar database lama aman saat hanya menerima hotfix ini.
create index if not exists idx_attendance_org_employee_date_paid
  on public.attendance_records(organization_id, employee_id, attendance_date, paid_at);

-- // SYNC: Ketika simbol absensi berubah, status slip harian pada periode yang
-- sama mengikuti keberadaan tanda ambil gaji. Kondisi `> 0` dipakai sesuai
-- proses bisnis client: setiap hari gaji dapat diambil terpisah.
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
           when totals.sudah_diambil > 0
             then 'dibayar'::public.payroll_status
           else 'draft'::public.payroll_status
         end,
         paid_at = case
           when totals.sudah_diambil > 0
             then coalesce(ps.paid_at, clock_timestamp())
           else null
         end,
         updated_by = coalesce(auth.uid(), ps.updated_by)
    from public.payroll_periods pp
    cross join lateral (
      select count(*) filter (
        where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
          and ar.paid_at is not null
      )::integer as sudah_diambil
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

-- // BACKFILL: Slip harian lama yang sudah memiliki tanda ❌ langsung berubah
-- menjadi status hijau Dibayar setelah migration dijalankan, tanpa menunggu edit ulang.
update public.payroll_slips ps
   set status = 'dibayar'::public.payroll_status,
       paid_at = coalesce(ps.paid_at, clock_timestamp())
  from public.payroll_periods pp
 where ps.payroll_period_id = pp.id
   and ps.organization_id = pp.organization_id
   and ps.salary_type = 'harian'
   and exists (
     select 1
     from public.attendance_records ar
     where ar.organization_id = ps.organization_id
       and ar.employee_id = ps.employee_id
       and ar.attendance_date between pp.start_date and pp.end_date
       and ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
       and ar.paid_at is not null
   );

commit;
