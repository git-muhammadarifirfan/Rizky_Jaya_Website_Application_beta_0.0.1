-- Rizky Jaya App - Realtime & Notification Maintenance Beta 0.0.26
-- Tujuan:
-- 1. Menjaga tabel pendukung notifikasi/realtime tetap kecil tanpa menghapus data inti.
-- 2. Menambah index optional untuk tabel notifications bila suatu saat tabel itu dipakai.
-- 3. Menyediakan RPC maintenance_cleanup_lightweight yang dipanggil app maksimal 1x/hari.
-- Aman dijalankan berkali-kali.

begin;

-- // PERFORMANCE: Index tambahan untuk approval notification source.
-- Owner membaca pending; Admin membaca status resolved miliknya.
create index if not exists idx_change_requests_org_requester_status_updated
  on public.change_requests(organization_id, requested_by, status, updated_at desc);

create index if not exists idx_change_requests_org_resolved_cleanup
  on public.change_requests(organization_id, status, resolved_at)
  where status <> 'pending';

-- // MAINTENANCE: Report export adalah riwayat proses file, bukan data bisnis inti.
create index if not exists idx_report_exports_org_status_requested
  on public.report_exports(organization_id, status, requested_at desc);

-- // OPTIONAL: Jika project kelak punya tabel notifications, index dibuat tanpa
-- memaksa schema baru. Guard ini membuat upgrade aman pada database Beta 0.0.9.
do $rj_optional_notification_indexes$
begin
  if to_regclass('public.notifications') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_at'
    ) then
      execute 'create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc)';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'is_read'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_at'
    ) then
      execute 'create index if not exists idx_notifications_user_read_created on public.notifications(user_id, is_read, created_at desc)';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'organization_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_at'
    ) then
      execute 'create index if not exists idx_notifications_org_created on public.notifications(organization_id, created_at desc)';
    end if;
  end if;
end;
$rj_optional_notification_indexes$;

create or replace function public.maintenance_cleanup_lightweight(p_organization_id uuid)
returns table(cleaned_table text, deleted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
  v_sql text;
  v_has_notification_org boolean;
  v_has_notification_created boolean;
  v_has_notification_is_read boolean;
  v_has_notification_read_at boolean;
begin
  if p_organization_id is null then
    raise exception 'organization_id wajib diisi.';
  end if;

  -- // SECURITY: Cleanup dijalankan oleh Owner saja. Admin tetap bisa memakai
  -- aplikasi normal; jika RPC ini dipanggil oleh Admin dari app, error ditelan
  -- oleh NotificationMaintenanceService agar UI tidak terganggu.
  if not public.is_owner(p_organization_id) then
    raise exception 'Maintenance hanya tersedia untuk Owner.';
  end if;

  -- // RETENTION: Riwayat export yang gagal lebih dari 90 hari dan export siap
  -- lebih dari 365 hari dibersihkan. File Excel hasil export tetap bisa dibuat
  -- ulang dari data sumber kapan saja.
  delete from public.report_exports
  where organization_id = p_organization_id
    and (
      (status = 'failed' and requested_at < now() - interval '90 days')
      or (status = 'ready' and requested_at < now() - interval '365 days')
    );
  get diagnostics v_deleted = row_count;
  cleaned_table := 'report_exports'; deleted_count := v_deleted; return next;

  -- // RETENTION: Pengajuan koreksi adalah audit penting; hanya resolved yang
  -- lebih dari 2 tahun dibersihkan. Pending tidak pernah disentuh.
  delete from public.change_requests
  where organization_id = p_organization_id
    and status <> 'pending'
    and resolved_at is not null
    and resolved_at < now() - interval '730 days';
  get diagnostics v_deleted = row_count;
  cleaned_table := 'change_requests_resolved_old'; deleted_count := v_deleted; return next;

  -- // RETENTION: Audit log disimpan 2 tahun. Data inti absensi/payroll/transport
  -- tidak ikut dihapus, hanya jejak log sangat lama.
  delete from public.audit_logs
  where organization_id = p_organization_id
    and created_at < now() - interval '730 days';
  get diagnostics v_deleted = row_count;
  cleaned_table := 'audit_logs_old'; deleted_count := v_deleted; return next;

  -- // OPTIONAL: Tabel notifications tidak wajib ada di Beta 0.0.9. Jika ada,
  -- notifikasi read >90 hari dan semua notifikasi >180 hari dibersihkan.
  if to_regclass('public.notifications') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'organization_id'
    ) into v_has_notification_org;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_at'
    ) into v_has_notification_created;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'is_read'
    ) into v_has_notification_is_read;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name = 'read_at'
    ) into v_has_notification_read_at;

    if v_has_notification_created then
      v_sql := 'delete from public.notifications where ';
      if v_has_notification_org then
        v_sql := v_sql || 'organization_id = $1 and ';
      end if;
      if v_has_notification_is_read then
        v_sql := v_sql || '((is_read = true and created_at < now() - interval ''90 days'') or created_at < now() - interval ''180 days'')';
      elsif v_has_notification_read_at then
        v_sql := v_sql || '((read_at is not null and created_at < now() - interval ''90 days'') or created_at < now() - interval ''180 days'')';
      else
        v_sql := v_sql || 'created_at < now() - interval ''180 days''';
      end if;

      if v_has_notification_org then
        execute v_sql using p_organization_id;
      else
        execute v_sql;
      end if;
      get diagnostics v_deleted = row_count;
      cleaned_table := 'notifications_optional'; deleted_count := v_deleted; return next;
    end if;
  end if;

  -- // PLANNER: Statistik tabel diperbarui setelah cleanup agar query berikutnya
  -- tetap memilih index yang benar. ANALYZE aman dan ringan untuk jadwal harian.
  execute 'analyze public.report_exports';
  execute 'analyze public.change_requests';
  execute 'analyze public.audit_logs';
end;
$$;

revoke all on function public.maintenance_cleanup_lightweight(uuid) from public;
grant execute on function public.maintenance_cleanup_lightweight(uuid) to authenticated;

commit;
