import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminMember, AppData, AttendanceRecord, AttendanceMode, AttendanceStatus, ChangeRequest, Employee,
  FuelExpense, GeneralTransportExpense, Membership, PayrollJobItem, PayrollPeriod, PayrollSlip, ProductPrice,
  QuickMarker, Role, TransportDestination, TransportJob, Vehicle, VehicleExpense
} from '../types';
import { asArray, client, currentUserId, isConfigured, normalizeSingle } from '../lib/supabase';
import { monthRange, todayISO, toISO } from '../lib/date';
import { attendanceStatusFromMarker, cleanNumber } from '../lib/format';
import { compressImageFile } from '../lib/image';

type State = AppData & {
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  configured: boolean;
};

type ToastKind = 'success' | 'error';

type SaveEmployeePayload = Partial<Employee> & {
  salary_type?: Employee['salary_type'];
  daily_rate?: number;
  monthly_rate?: number;
  allowed_absence_days?: number;
  absence_deduction?: number;
  ktpFile?: File | null;
};

type SaveVehiclePayload = Partial<Vehicle> & {
  stnkFile?: File | null;
};

type DetailedAttendancePayload = {
  employee_id: string;
  attendance_date?: string;
  status: AttendanceStatus;
  notes?: string;
  photo?: File | null;
};

const emptyMembership: Membership = {
  userId: '',
  organizationId: '',
  organizationName: 'Rizki Jaya App',
  fullName: 'Pengguna',
  role: 'owner',
  adminAttendanceMode: 'both',
  adminAttendanceRequiresPhoto: false
};

const emptyData: AppData = {
  membership: emptyMembership,
  employees: [],
  attendance: [],
  periods: [],
  slips: [],
  payrollItems: [],
  vehicles: [],
  destinations: [],
  jobs: [],
  fuelExpenses: [],
  vehicleExpenses: [],
  generalExpenses: [],
  products: [],
  requests: [],
  admins: [],
  reportLogs: []
};

const orgTables = [
  'employees', 'employee_pay_rates', 'attendance_records', 'payroll_periods', 'payroll_slips', 'payroll_job_items',
  'vehicles', 'transport_jobs', 'transport_destinations', 'transport_general_expenses', 'product_prices', 'change_requests', 'report_exports'
];

async function readFunctionFailure(error?: unknown, data?: any) {
  // // FIX: Supabase FunctionsHttpError often stores the real JSON response inside error.context.
  // Reading it here prevents the UI from showing only a generic "Gagal memproses admin" message.
  const serverMessage = data?.error || data?.message;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage.trim();

  const context = (error as any)?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const cloned = context.clone();
      const json = await cloned.json();
      if (typeof json?.error === 'string' && json.error.trim()) return json.error.trim();
      if (typeof json?.message === 'string' && json.message.trim()) return json.message.trim();
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) return text.trim();
      } catch {
        // Ignore parse errors and fall back to the normal error message below.
      }
    }
  }

  return error instanceof Error ? error.message : '';
}

function explainAdminFailureMessage(rawMessage: string) {
  const lower = rawMessage.toLowerCase();
  if (lower.includes('failed to send') || lower.includes('function not found') || lower.includes('not found') || lower.includes('fetch')) {
    return 'Fitur Kelola Admin butuh Edge Function manage-admin yang sudah dideploy di project database ini. Deploy folder supabase/functions/manage-admin ke project database yang sama, lalu coba lagi.';
  }
  if (lower.includes('jwt') || lower.includes('token') || lower.includes('authorization') || lower.includes('unauthorized')) {
    return 'Sesi login tidak terbaca saat memanggil Edge Function. Silakan login ulang, lalu coba buat admin lagi.';
  }
  return rawMessage || 'Gagal memproses admin.';
}

async function currentAccessToken(db: any) {
  // // FIX: Kirim JWT secara eksplisit ke Edge Function agar server bisa memverifikasi bahwa pemanggil adalah Owner.
  const { data, error } = await db.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Sesi login tidak valid. Silakan login ulang.');
  return data.session.access_token;
}

// // FEATURE: Single data hook. Semua layar membaca sumber realtime yang sama,
// sehingga grafik, tabel, export, dan notifikasi selalu memakai data produksi yang sama.
export function useAppData() {
  const [state, setState] = useState<State>({ ...emptyData, loading: true, error: null, authenticated: false, configured: isConfigured });

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, kind } }));
  }, []);

  const requireDb = useCallback(() => {
    if (!client) throw new Error('Konfigurasi koneksi belum diatur.');
    return client as any;
  }, []);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!isConfigured || !client) {
      setState((s) => ({ ...s, loading: false, configured: false, authenticated: false, error: 'Konfigurasi koneksi belum diatur.' }));
      return;
    }
    if (!options?.silent) setState((s) => ({ ...s, loading: true, error: null, configured: true }));
    try {
      const db = client as any;
      const { data: auth } = await client.auth.getSession();
      if (!auth.session) {
        setState({ ...emptyData, loading: false, error: null, authenticated: false, configured: true });
        return;
      }
      const userId = auth.session.user.id;
      const { data: membershipRow, error: membershipError } = await db
        .from('organization_users')
        .select('organization_id, role, profiles(full_name), organizations(name, admin_attendance_mode, admin_attendance_requires_photo)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membershipRow) throw new Error('Akun belum terhubung ke organisasi.');

      const profile = normalizeSingle<Record<string, unknown>>(membershipRow.profiles);
      const orgInfo = normalizeSingle<Record<string, unknown>>(membershipRow.organizations);
      const membership: Membership = {
        userId,
        organizationId: String(membershipRow.organization_id),
        role: String(membershipRow.role) as Role,
        fullName: String(profile?.full_name || 'Pengguna'),
        organizationName: String(orgInfo?.name || 'Rizki Jaya App'),
        adminAttendanceMode: String(orgInfo?.admin_attendance_mode || 'both') as AttendanceMode,
        adminAttendanceRequiresPhoto: Boolean(orgInfo?.admin_attendance_requires_photo ?? false)
      };

      const org = membership.organizationId;
      const isOwner = membership.role === 'owner';
      const baseReads = [
        db.from('employees').select('*').eq('organization_id', org).order('full_name'),
        db.from('attendance_records').select('*').eq('organization_id', org).order('attendance_date', { ascending: false }).order('input_time', { ascending: false }).limit(3000),
        db.from('vehicles').select('*').eq('organization_id', org).order('fleet_code'),
        db.from('transport_destinations').select('*').eq('organization_id', org).order('name'),
        db.from('transport_jobs').select('*').eq('organization_id', org).order('operation_date', { ascending: false }).order('created_at', { ascending: false }).limit(1500),
        db.from('fuel_expenses').select('*').order('created_at', { ascending: false }).limit(1500),
        db.from('vehicle_expenses').select('*').order('created_at', { ascending: false }).limit(1500),
        db.from('transport_general_expenses').select('*').eq('organization_id', org).order('expense_date', { ascending: false }).limit(1500),
        db.from('product_prices').select('*').eq('organization_id', org).order('product_name'),
        db.from('change_requests').select('*, requester:profiles!change_requests_requested_by_fkey(full_name)').eq('organization_id', org).order('created_at', { ascending: false }).limit(300),
        db.from('report_exports').select('*').eq('organization_id', org).order('requested_at', { ascending: false }).limit(100)
      ];

      const ownerReads = isOwner ? [
        db.from('employee_pay_rates').select('*').eq('organization_id', org).or(`valid_to.is.null,valid_to.gte.${todayISO()}`).order('valid_from', { ascending: false }),
        db.from('payroll_periods').select('*').eq('organization_id', org).order('start_date', { ascending: false }),
        db.from('payroll_slips').select('*').eq('organization_id', org).order('created_at', { ascending: false }).limit(2000),
        db.from('payroll_job_items').select('*').eq('organization_id', org).order('work_date', { ascending: false }).limit(2000),
        db.from('organization_users').select('user_id, role, profiles(full_name,is_active)').eq('organization_id', org).order('created_at')
      ] : [];

      const results = await Promise.all([...baseReads, ...ownerReads]);
      const firstError = results.find((r: any) => r.error)?.error;
      if (firstError) throw firstError;

      const [employeesRes, attendanceRes, vehiclesRes, destinationsRes, jobsRes, fuelRes, vehicleExpenseRes, generalRes, productsRes, requestsRes, reportLogsRes, ratesRes, periodsRes, slipsRes, payrollItemsRes, adminsRes] = results;
      const rates = isOwner ? asArray<any>(ratesRes?.data) : [];
      const rateByEmployee = new Map<string, any>();
      for (const rate of rates) if (!rateByEmployee.has(rate.employee_id)) rateByEmployee.set(rate.employee_id, rate);

      const employees = asArray<any>(employeesRes.data).map((e) => {
        const rate = rateByEmployee.get(e.id);
        return {
          ...e,
          salary_type: rate?.salary_type || 'harian',
          daily_rate: Number(rate?.daily_rate || 0),
          monthly_rate: Number(rate?.monthly_rate || 0),
          allowed_absence_days: Number(rate?.allowed_absence_days ?? 4),
          absence_deduction: Number(rate?.absence_deduction || 0)
        } as Employee;
      });

      const requests = asArray<any>(requestsRes.data).map((row) => ({
        ...row,
        requester_name: normalizeSingle<Record<string, unknown>>(row.requester)?.full_name ? String(normalizeSingle<Record<string, unknown>>(row.requester)?.full_name) : null
      })) as ChangeRequest[];

      const admins = isOwner ? asArray<any>(adminsRes?.data).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        full_name: String(normalizeSingle<Record<string, unknown>>(row.profiles)?.full_name || '-'),
        is_active: Boolean(normalizeSingle<Record<string, unknown>>(row.profiles)?.is_active ?? true)
      })) as AdminMember[] : [];

      setState({
        membership,
        employees,
        attendance: asArray<AttendanceRecord>(attendanceRes.data),
        periods: isOwner ? asArray<PayrollPeriod>(periodsRes?.data) : [],
        slips: isOwner ? asArray<PayrollSlip>(slipsRes?.data) : [],
        payrollItems: isOwner ? asArray<PayrollJobItem>(payrollItemsRes?.data) : [],
        vehicles: asArray<Vehicle>(vehiclesRes.data),
        destinations: asArray<TransportDestination>(destinationsRes.data),
        jobs: asArray<TransportJob>(jobsRes.data),
        fuelExpenses: asArray<FuelExpense>(fuelRes.data),
        vehicleExpenses: asArray<VehicleExpense>(vehicleExpenseRes.data),
        generalExpenses: asArray<GeneralTransportExpense>(generalRes.data),
        // Kolom katalog harus mengikuti source Android/database: special_sale_price, store_sale_price, retail_sale_price.
        // Fallback *_sell_price dipertahankan agar build lama tetap bisa dibaca saat migrasi.
        products: asArray<any>(productsRes.data).map((row) => ({
          ...row,
          product_code: String(row.product_code || ''),
          purchase_price: Number(row.purchase_price || 0),
          special_sale_price: Number(row.special_sale_price ?? row.special_sell_price ?? 0),
          store_sale_price: Number(row.store_sale_price ?? row.store_sell_price ?? 0),
          retail_sale_price: Number(row.retail_sale_price ?? row.retail_sell_price ?? 0),
          is_active: Boolean(row.is_active ?? true)
        })) as ProductPrice[],
        requests,
        admins,
        reportLogs: asArray(reportLogsRes.data),
        loading: false,
        error: null,
        authenticated: true,
        configured: true
      });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, authenticated: Boolean(s.membership.userId), configured: true, error: error instanceof Error ? error.message : 'Gagal memuat data.' }));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!client || !state.authenticated || !state.membership.organizationId) return;
    const db = client as any;
    const org = state.membership.organizationId;
    const channel = db.channel(`rj-web-org-${org}`);
    for (const table of orgTables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `organization_id=eq.${org}` }, () => void load({ silent: true }));
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'organizations', filter: `id=eq.${org}` }, () => void load({ silent: true }));
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_expenses' }, () => void load({ silent: true }));
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_expenses' }, () => void load({ silent: true }));
    channel.subscribe();
    return () => { void db.removeChannel(channel); };
  }, [load, state.authenticated, state.membership.organizationId]);

  const login = useCallback(async (email: string, password: string) => {
    const db = requireDb();
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Email atau password salah.');
    await load();
  }, [load, requireDb]);

  const loginWithGoogle = useCallback(async () => {
    const db = requireDb();
    const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error;
  }, [requireDb]);

  const logout = useCallback(async () => {
    if (client) await client.auth.signOut();
    setState({ ...emptyData, loading: false, error: null, authenticated: false, configured: isConfigured });
  }, []);

  const uploadFile = useCallback(async (bucket: string, folder: string, file?: File | null) => {
    if (!file) return null;
    const db = requireDb();
    const optimized = await compressImageFile(file);
    const ext = optimized.name.split('.').pop() || 'webp';
    const key = `${state.membership.organizationId}/${folder}/${crypto.randomUUID()}.${ext}`;
    // // FEATURE: Semua upload gambar dikompresi sebelum masuk Storage agar beban halaman rendah.
    const { data, error } = await db.storage.from(bucket).upload(key, optimized, { upsert: true, contentType: optimized.type || undefined });
    if (error) throw error;
    return data.path as string;
  }, [requireDb, state.membership.organizationId]);

  const saveEmployee = useCallback(async (payload: SaveEmployeePayload) => {
    const db = requireDb();
    const org = state.membership.organizationId;
    const userId = await currentUserId();
    if (!String(payload.full_name || '').trim()) throw new Error('Nama karyawan wajib diisi.');
    const salaryType = payload.salary_type || 'harian';
    if (salaryType === 'harian' && Number(payload.daily_rate || 0) <= 0) throw new Error('Gaji harian harus lebih dari 0.');
    if (salaryType === 'bulanan' && Number(payload.monthly_rate || 0) <= 0) throw new Error('Gaji bulanan harus lebih dari 0.');
    const ktpPath = await uploadFile('master-documents', 'employees/ktp', payload.ktpFile);
    const employeeValues: Record<string, unknown> = {
      organization_id: org,
      full_name: String(payload.full_name || '').trim(),
      phone: payload.phone?.trim() || null,
      position: payload.position?.trim() || null,
      joined_date: payload.joined_date || null,
      is_active: payload.is_active ?? true,
      notes: payload.notes?.trim() || null,
      updated_by: userId
    };
    if (ktpPath) employeeValues.ktp_photo_path = ktpPath;
    else if (payload.ktp_photo_path) employeeValues.ktp_photo_path = payload.ktp_photo_path;
    let employeeId = payload.id;
    if (!employeeId) {
      employeeValues.created_by = userId;
      if (payload.employee_code) employeeValues.employee_code = payload.employee_code;
      const { data, error } = await db.from('employees').insert(employeeValues).select('id').single();
      if (error) throw error;
      employeeId = data.id;
    } else {
      const { error } = await db.from('employees').update(employeeValues).eq('organization_id', org).eq('id', employeeId);
      if (error) throw error;
    }

    const rateValues = {
      salary_type: salaryType,
      daily_rate: salaryType === 'harian' ? Number(payload.daily_rate || 0) : 0,
      monthly_rate: salaryType === 'bulanan' ? Number(payload.monthly_rate || 0) : 0,
      overtime_rate: 0,
      allowed_absence_days: salaryType === 'bulanan' ? Number(payload.allowed_absence_days ?? 4) : 0,
      absence_deduction: salaryType === 'bulanan' ? Number(payload.absence_deduction || 0) : 0
    };
    const { data: activeRate } = await db.from('employee_pay_rates').select('id, valid_from').eq('organization_id', org).eq('employee_id', employeeId).is('valid_to', null).order('valid_from', { ascending: false }).limit(1).maybeSingle();
    const today = todayISO();
    if (activeRate && activeRate.valid_from === today) {
      const { error } = await db.from('employee_pay_rates').update(rateValues).eq('id', activeRate.id);
      if (error) throw error;
    } else {
      if (activeRate) {
        const yesterday = toISO(new Date(Date.now() - 24 * 60 * 60 * 1000));
        await db.from('employee_pay_rates').update({ valid_to: yesterday }).eq('id', activeRate.id);
      }
      const { error } = await db.from('employee_pay_rates').insert({ organization_id: org, employee_id: employeeId, ...rateValues, valid_from: today, created_by: userId });
      if (error) throw error;
    }
    toast('Data karyawan tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.organizationId, toast, uploadFile]);

  const setEmployeeActive = useCallback(async (id: string, active: boolean) => {
    const db = requireDb();
    const { error } = await db.from('employees').update({ is_active: active, updated_by: state.membership.userId }).eq('organization_id', state.membership.organizationId).eq('id', id);
    if (error) throw error;
    toast(active ? 'Karyawan diaktifkan.' : 'Karyawan dinonaktifkan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const saveDetailedAttendance = useCallback(async (payload: DetailedAttendancePayload) => {
    const db = requireDb();
    const org = state.membership.organizationId;
    const userId = await currentUserId();
    const date = payload.attendance_date || todayISO();
    const existing = state.attendance.find((a) => a.employee_id === payload.employee_id && a.attendance_date === date);
    const photoPath = await uploadFile('attendance-proofs', `attendance/${date}`, payload.photo);
    const fraction = payload.status === 'hadir' || payload.status === 'terlambat' ? 1 : 0;
    const values: Record<string, unknown> = {
      organization_id: org,
      employee_id: payload.employee_id,
      attendance_date: date,
      status: payload.status,
      input_method: 'detail',
      quick_marker: null,
      attendance_fraction: fraction,
      notes: payload.notes?.trim() || null,
      updated_by: userId
    };
    if (photoPath) values.photo_path = photoPath;

    if (state.membership.role !== 'owner' && existing) {
      const { error } = await db.from('change_requests').insert({
        organization_id: org,
        request_type: 'attendance_edit',
        entity_id: existing.id,
        payload: values,
        reason: `Koreksi absensi ${date}`,
        requested_by: userId
      });
      if (error) throw error;
      toast('Koreksi dikirim ke Owner.');
    } else {
      const row = { id: existing?.id || crypto.randomUUID(), ...values, created_by: existing?.created_by || userId };
      const { error } = await db.from('attendance_records').upsert(row, { onConflict: 'organization_id,employee_id,attendance_date' });
      if (error) throw error;
      toast('Absensi tersimpan.');
    }
    await load({ silent: true });
  }, [load, requireDb, state.attendance, state.membership, toast, uploadFile]);

  const setQuickAttendance = useCallback(async (employeeId: string, date: string, marker: QuickMarker) => {
    const db = requireDb();
    const { error } = await db.rpc('record_quick_attendance', { p_organization_id: state.membership.organizationId, p_employee_id: employeeId, p_attendance_date: date, p_marker: marker });
    if (error) throw error;
    toast('Absensi cepat tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.organizationId, toast]);

  const ensurePeriod = useCallback(async (periodKey: string) => {
    const found = state.periods.find((p) => p.start_date.startsWith(periodKey));
    if (found) return found;
    const db = requireDb();
    const { start, end } = monthRange(periodKey);
    const { data, error } = await db.from('payroll_periods').insert({ organization_id: state.membership.organizationId, period_name: `Payroll ${periodKey}`, start_date: start, end_date: end, created_by: state.membership.userId }).select('*').single();
    if (error) throw error;
    await load({ silent: true });
    return data as PayrollPeriod;
  }, [load, requireDb, state.membership, state.periods]);

  const generatePayrollSlip = useCallback(async (periodKey: string, employeeId: string, bonus = 0, manualDeduction = 0) => {
    const db = requireDb();
    const period = await ensurePeriod(periodKey);
    const employee = state.employees.find((e) => e.id === employeeId);
    if (!employee) throw new Error('Karyawan tidak ditemukan.');
    const attendance = state.attendance.filter((a) => a.employee_id === employeeId && a.attendance_date >= period.start_date && a.attendance_date <= period.end_date);
    let attendedRecords = 0;
    let attendedUnits = 0;
    let paidUnits = 0;
    let absentDays = 0;
    for (const record of attendance) {
      if (record.status === 'hadir' || record.status === 'terlambat') {
        const fraction = Number(record.attendance_fraction ?? 1);
        attendedRecords += 1;
        attendedUnits += fraction;
        if (record.paid_at) paidUnits += fraction;
      } else if (['tidak_hadir', 'izin', 'sakit', 'libur'].includes(record.status)) {
        absentDays += 1;
      }
    }
    const items = state.payrollItems.filter((item) => item.employee_id === employeeId && item.work_date >= period.start_date && item.work_date <= period.end_date);
    let baseAmount = 0;
    let autoDeduction = 0;
    let status: PayrollSlip['status'] = 'draft';
    let calculation = '';
    if (employee.salary_type === 'bulanan') {
      const excess = Math.max(0, absentDays - Number(employee.allowed_absence_days || 0));
      baseAmount = Number(employee.monthly_rate || 0);
      autoDeduction = excess * Number(employee.absence_deduction || 0);
      calculation = `Bulanan: ${baseAmount}; tidak bekerja ${absentDays} hari; jatah ${employee.allowed_absence_days} hari; potongan otomatis ${autoDeduction}.`;
    } else if (employee.salary_type === 'borongan') {
      baseAmount = items.reduce((sum, item) => sum + Number(item.total_amount ?? Number(item.quantity || 0) * Number(item.unit_rate || 0)), 0);
      calculation = `Borongan: ${items.length} item pekerjaan.`;
    } else {
      baseAmount = attendedUnits * Number(employee.daily_rate || 0);
      if (attendedUnits > 0 && paidUnits + 0.001 >= attendedUnits) status = 'dibayar';
      calculation = `Harian: ${employee.daily_rate} x ${attendedUnits} hari. Sudah diambil ${paidUnits} hari.`;
    }
    const existing = state.slips.find((s) => s.payroll_period_id === period.id && s.employee_id === employeeId);
    const values = {
      id: existing?.id || crypto.randomUUID(),
      organization_id: state.membership.organizationId,
      payroll_period_id: period.id,
      employee_id: employeeId,
      salary_type: employee.salary_type,
      attended_days: attendedRecords,
      attended_day_units: attendedUnits,
      absent_days: absentDays,
      base_amount: baseAmount,
      bonus_amount: Number(bonus || 0),
      automatic_deduction: autoDeduction,
      deduction_amount: Number(manualDeduction || 0) + autoDeduction,
      calculation_notes: calculation,
      status,
      paid_at: status === 'dibayar' ? new Date().toISOString() : null,
      created_by: state.membership.userId,
      updated_by: state.membership.userId
    };
    const { error } = await db.from('payroll_slips').upsert(values, { onConflict: 'payroll_period_id,employee_id' });
    if (error) throw error;
    toast('Slip gaji dibuat.');
    await load({ silent: true });
  }, [ensurePeriod, load, requireDb, state, toast]);

  const calculatePayroll = useCallback(async (periodKey: string, employeeIds: string[]) => {
    for (const id of employeeIds) await generatePayrollSlip(periodKey, id);
  }, [generatePayrollSlip]);

  const markSlipPaid = useCallback(async (slipIds: string[]) => {
    const db = requireDb();
    const paidAt = new Date().toISOString();
    for (const slipId of slipIds) {
      const slip = state.slips.find((s) => s.id === slipId);
      const period = state.periods.find((p) => p.id === slip?.payroll_period_id);
      if (!slip || !period) continue;
      if ((slip.salary_type || 'harian') === 'harian') {
        await db.from('attendance_records').update({ paid_at: paidAt, paid_by: state.membership.userId, updated_by: state.membership.userId })
          .eq('organization_id', state.membership.organizationId)
          .eq('employee_id', slip.employee_id)
          .gte('attendance_date', period.start_date)
          .lte('attendance_date', period.end_date)
          .in('status', ['hadir', 'terlambat'])
          .is('paid_at', null);
      }
    }
    const { error } = await db.from('payroll_slips').update({ status: 'dibayar', paid_at: paidAt, updated_by: state.membership.userId }).in('id', slipIds);
    if (error) throw error;
    toast('Slip ditandai dibayar.');
    await load({ silent: true });
  }, [load, requireDb, state, toast]);

  const savePayrollItem = useCallback(async (item: Partial<PayrollJobItem>) => {
    const db = requireDb();
    const values = {
      id: item.id || crypto.randomUUID(),
      organization_id: state.membership.organizationId,
      employee_id: item.employee_id,
      work_date: item.work_date || todayISO(),
      item_kind: item.item_kind || 'lainnya',
      description: item.description || '-',
      quantity: Number(item.quantity || 0),
      unit_label: item.unit_label || 'job',
      unit_rate: Number(item.unit_rate || 0),
      created_by: state.membership.userId
    };
    const { error } = await db.from('payroll_job_items').upsert(values, { onConflict: 'id' });
    if (error) throw error;
    toast('Item borongan tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const deletePayrollItem = useCallback(async (id: string) => {
    const db = requireDb();
    const { error } = await db.from('payroll_job_items').delete().eq('organization_id', state.membership.organizationId).eq('id', id);
    if (error) throw error;
    toast('Item borongan dihapus.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.organizationId, toast]);

  const saveVehicle = useCallback(async (vehicle: SaveVehiclePayload) => {
    const db = requireDb();
    if (!String(vehicle.fleet_code || '').trim()) throw new Error('Kode armada wajib diisi.');
    if (!String(vehicle.plate_number || '').trim()) throw new Error('Plat nomor wajib diisi.');
    const stnkPath = await uploadFile('master-documents', 'vehicles/stnk', vehicle.stnkFile);
    const values = {
      id: vehicle.id || crypto.randomUUID(),
      organization_id: state.membership.organizationId,
      fleet_code: vehicle.fleet_code || '',
      plate_number: String(vehicle.plate_number || '').toUpperCase(),
      vehicle_year: Number(vehicle.vehicle_year || new Date().getFullYear()),
      tax_due_date: vehicle.tax_due_date || todayISO(),
      default_driver_id: vehicle.default_driver_id || null,
      default_helper_1_id: vehicle.default_helper_1_id || null,
      default_helper_2_id: vehicle.default_helper_2_id || null,
      stnk_photo_path: stnkPath || vehicle.stnk_photo_path || null,
      is_active: vehicle.is_active ?? true,
      notes: vehicle.notes || null,
      created_by: state.membership.userId,
      updated_by: state.membership.userId
    };
    const { error } = await db.from('vehicles').upsert(values, { onConflict: 'id' });
    if (error) throw error;
    toast('Armada tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast, uploadFile]);

  const ensureDestination = useCallback(async (name: string) => {
    const db = requireDb();
    const clean = name.trim().replace(/\s+/g, ' ');
    const normalized = clean.toLowerCase();
    const found = state.destinations.find((d) => d.normalized_name === normalized || d.name.trim().toLowerCase() === normalized);
    if (found) return found.id;
    const { data, error } = await db.from('transport_destinations').upsert({
      organization_id: state.membership.organizationId,
      name: clean,
      normalized_name: normalized,
      is_active: true,
      created_by: state.membership.userId,
      updated_by: state.membership.userId
    }, { onConflict: 'organization_id,normalized_name' }).select('id').single();
    if (error) throw error;
    return data.id as string;
  }, [requireDb, state.destinations, state.membership]);

  const saveTransportJob = useCallback(async (job: Partial<TransportJob>) => {
    const db = requireDb();
    const org = state.membership.organizationId;
    const destination = String(job.destination || '').trim();
    if (!destination) throw new Error('Tujuan keberangkatan wajib diisi.');
    const destinationId = destination ? await ensureDestination(destination) : null;
    const values = {
      organization_id: org,
      vehicle_id: job.vehicle_id || null,
      destination_id: destinationId,
      operation_date: job.operation_date || todayISO(),
      destination,
      driver_id: job.driver_id || null,
      helper_1_id: job.helper_1_id || null,
      helper_2_id: job.helper_2_id || null,
      status: job.status || (job.vehicle_id ? 'berjalan' : 'draft'),
      odometer_start: job.odometer_start ?? null,
      odometer_end: job.odometer_end ?? null,
      notes: job.notes || null,
      is_locked: job.is_locked || false,
      updated_by: state.membership.userId
    };
    if (job.id && state.membership.role !== 'owner') {
      const { error } = await db.from('change_requests').insert({ organization_id: org, request_type: 'transport_job_edit', entity_id: job.id, payload: values, reason: `Koreksi keberangkatan ${destination}`, requested_by: state.membership.userId });
      if (error) throw error;
      toast('Koreksi transport dikirim ke Owner.');
    } else {
      const row = { id: job.id || crypto.randomUUID(), ...values, created_by: state.membership.userId };
      const { error } = await db.from('transport_jobs').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      toast('Keberangkatan tersimpan.');
    }
    await load({ silent: true });
  }, [ensureDestination, load, requireDb, state.membership, toast]);

  const changeJobStatus = useCallback(async (id: string, status: TransportJob['status']) => {
    const db = requireDb();
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return;
    if (state.membership.role !== 'owner') {
      await saveTransportJob({ ...job, status });
      return;
    }
    const { error } = await db.from('transport_jobs').update({ status, updated_by: state.membership.userId }).eq('organization_id', state.membership.organizationId).eq('id', id);
    if (error) throw error;
    toast('Status keberangkatan diperbarui.');
    await load({ silent: true });
  }, [load, requireDb, saveTransportJob, state.jobs, state.membership, toast]);

  const lockJob = useCallback(async (id: string, locked: boolean) => {
    const db = requireDb();
    const { error } = await db.from('transport_jobs').update({ is_locked: locked, updated_by: state.membership.userId }).eq('organization_id', state.membership.organizationId).eq('id', id);
    if (error) throw error;
    toast(locked ? 'Keberangkatan dikunci.' : 'Kunci dibuka.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const saveFuelExpense = useCallback(async (expense: Partial<FuelExpense>) => {
    const db = requireDb();
    if (!expense.transport_job_id) throw new Error('Trip wajib dipilih.');
    if (Number(expense.amount || 0) <= 0) throw new Error('Nominal BBM harus lebih dari 0.');
    const { error } = await db.from('fuel_expenses').upsert({ id: expense.id || crypto.randomUUID(), transport_job_id: expense.transport_job_id, fuel_type: expense.fuel_type || 'BBM', liters: expense.liters || null, amount: Number(expense.amount || 0), notes: expense.notes || null, created_by: state.membership.userId, updated_by: state.membership.userId }, { onConflict: 'id' });
    if (error) throw error;
    toast('Biaya BBM tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.userId, toast]);

  const saveVehicleExpense = useCallback(async (expense: Partial<VehicleExpense>) => {
    const db = requireDb();
    if (!expense.transport_job_id) throw new Error('Trip wajib dipilih.');
    if (Number(expense.amount || 0) <= 0) throw new Error('Nominal biaya kendaraan harus lebih dari 0.');
    const { error } = await db.from('vehicle_expenses').upsert({ id: expense.id || crypto.randomUUID(), transport_job_id: expense.transport_job_id, category: expense.category || 'lainnya', vendor_name: expense.vendor_name || '-', amount: Number(expense.amount || 0), notes: expense.notes || null, created_by: state.membership.userId, updated_by: state.membership.userId }, { onConflict: 'id' });
    if (error) throw error;
    toast('Biaya kendaraan tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.userId, toast]);

  const saveGeneralExpense = useCallback(async (expense: Partial<GeneralTransportExpense>) => {
    const db = requireDb();
    if (Number(expense.amount || 0) <= 0) throw new Error('Nominal biaya harus lebih dari 0.');
    const values = {
      id: expense.id || crypto.randomUUID(),
      organization_id: state.membership.organizationId,
      expense_date: expense.expense_date || todayISO(),
      amount: Number(expense.amount || 0),
      category: expense.category || 'lainnya',
      vehicle_identity: expense.vehicle_identity || null,
      requester_name: expense.requester_name || state.membership.fullName,
      receipt_path: expense.receipt_path || null,
      notes: expense.notes || null,
      created_by: state.membership.userId,
      updated_by: state.membership.userId
    };
    const { error } = await db.from('transport_general_expenses').upsert(values, { onConflict: 'id' });
    if (error) throw error;
    toast('Biaya umum tersimpan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const saveProduct = useCallback(async (product: Partial<ProductPrice>) => {
    const db = requireDb();
    if (state.membership.role !== 'owner') throw new Error('Hanya Owner dapat mengubah daftar harga.');

    const productName = String(product.product_name || '').trim();
    const productCode = String(product.product_code || '').trim().toUpperCase();
    if (!productName) throw new Error('Nama barang wajib diisi.');
    if (!productCode) throw new Error('Kode barang wajib diisi.');

    const purchase = Number(product.purchase_price || 0);
    const special = Number(product.special_sale_price || 0);
    const store = Number(product.store_sale_price || 0);
    const retail = Number(product.retail_sale_price || 0);
    if ([purchase, special, store, retail].some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Harga tidak boleh negatif.');

    // Nama kolom disamakan persis dengan Android: *_sale_price, bukan *_sell_price.
    const values = {
      organization_id: state.membership.organizationId,
      product_name: productName,
      product_code: productCode,
      purchase_price: purchase,
      special_sale_price: special,
      store_sale_price: store,
      retail_sale_price: retail,
      is_active: product.is_active ?? true,
      notes: String(product.notes || '').trim() || null,
      updated_by: state.membership.userId
    };

    const result = product.id
      ? await db.from('product_prices').update(values).eq('id', product.id).eq('organization_id', state.membership.organizationId)
      : await db.from('product_prices').insert({ ...values, created_by: state.membership.userId });

    if (result.error) throw result.error;
    toast(product.id ? 'Harga barang diperbarui.' : 'Harga barang berhasil ditambahkan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const setProductActive = useCallback(async (productId: string, active: boolean) => {
    const db = requireDb();
    if (state.membership.role !== 'owner') throw new Error('Hanya Owner dapat mengubah status barang.');
    const { error } = await db.from('product_prices')
      .update({ is_active: active, updated_by: state.membership.userId })
      .eq('id', productId)
      .eq('organization_id', state.membership.organizationId);
    if (error) throw error;
    toast(active ? 'Barang diaktifkan.' : 'Barang dinonaktifkan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const deleteProduct = useCallback(async (productId: string) => {
    const db = requireDb();
    if (state.membership.role !== 'owner') throw new Error('Hanya Owner dapat menghapus barang.');
    const { error } = await db.from('product_prices')
      .delete()
      .eq('id', productId)
      .eq('organization_id', state.membership.organizationId);
    if (error) throw error;
    toast('Harga barang dihapus.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const resolveRequest = useCallback(async (id: string, approve: boolean, note?: string) => {
    const db = requireDb();
    const { error } = await db.rpc('resolve_change_request', { p_request_id: id, p_approve: approve, p_note: note || null });
    if (error) throw error;
    toast(approve ? 'Pengajuan disetujui.' : 'Pengajuan ditolak.');
    await load({ silent: true });
  }, [load, requireDb, toast]);

  const updateSettings = useCallback(async (mode: AttendanceMode, requiresPhoto?: boolean) => {
    const db = requireDb();
    const patch: Record<string, unknown> = { admin_attendance_mode: mode };
    if (typeof requiresPhoto === 'boolean') patch.admin_attendance_requires_photo = requiresPhoto;
    const { error } = await db.from('organizations').update(patch).eq('id', state.membership.organizationId);
    if (error) throw error;
    toast('Pengaturan absensi admin diperbarui.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.organizationId, toast]);

  const updateProfileName = useCallback(async (name: string) => {
    const db = requireDb();
    const { error } = await db.from('profiles').update({ full_name: name.trim() }).eq('id', state.membership.userId);
    if (error) throw error;
    toast('Nama profil diperbarui.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.userId, toast]);

  const updatePassword = useCallback(async (password: string) => {
    const db = requireDb();
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;
    toast('Password diperbarui.');
  }, [requireDb, toast]);

  const createAdmin = useCallback(async (payload: { fullName: string; email: string; password: string }) => {
    const db = requireDb();
    if (state.membership.role !== 'owner') throw new Error('Hanya Owner dapat membuat admin.');
    if (!payload.fullName.trim()) throw new Error('Nama admin wajib diisi.');
    if (!payload.email.trim()) throw new Error('Email admin wajib diisi.');
    if (payload.password.length < 6) throw new Error('Password awal minimal 6 karakter.');
    // // FEATURE: Kelola Admin memakai Edge Function karena membuat user Auth butuh service role.
    // // FIX: JWT dikirim eksplisit + error server dibaca supaya masalah create admin tidak lagi menjadi toast generic.
    const token = await currentAccessToken(db);
    const { data, error } = await db.functions.invoke('manage-admin', {
      body: {
        action: 'create',
        organizationId: state.membership.organizationId,
        fullName: payload.fullName.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    if (error || data?.error || data?.ok === false) {
      const rawMessage = await readFunctionFailure(error, data);
      throw new Error(explainAdminFailureMessage(rawMessage));
    }
    toast(data?.createdNewUser === false ? 'Admin sudah ada dan berhasil diaktifkan.' : 'Admin berhasil dibuat.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.organizationId, state.membership.role, toast]);

  const setAdminActive = useCallback(async (userId: string, active: boolean) => {
    const db = requireDb();
    if (state.membership.role !== 'owner') throw new Error('Hanya Owner dapat mengubah status admin.');
    // // FEATURE: Aktivasi/nonaktif admin juga via Edge Function supaya status profil aman.
    const token = await currentAccessToken(db);
    const { data, error } = await db.functions.invoke('manage-admin', {
      body: { action: active ? 'activate' : 'deactivate', organizationId: state.membership.organizationId, userId },
      headers: { Authorization: `Bearer ${token}` }
    });
    if (error || data?.error || data?.ok === false) {
      const rawMessage = await readFunctionFailure(error, data);
      throw new Error(explainAdminFailureMessage(rawMessage));
    }
    toast(active ? 'Admin diaktifkan.' : 'Admin dinonaktifkan.');
    await load({ silent: true });
  }, [load, requireDb, state.membership.organizationId, state.membership.role, toast]);


  const notifyOwner = useCallback(async (payload: { request_type: string; entity_id?: string | null; reason: string; after_data?: Record<string, unknown> }) => {
    const db = requireDb();
    const { error } = await db.from('change_requests').insert({
      organization_id: state.membership.organizationId,
      request_type: payload.request_type,
      entity_id: payload.entity_id || null,
      payload: payload.after_data || {},
      reason: payload.reason,
      requested_by: state.membership.userId
    });
    if (error) throw error;
    toast('Notifikasi dikirim ke Owner.');
    await load({ silent: true });
  }, [load, requireDb, state.membership, toast]);

  const beginExportLog = useCallback(async (type: string, from?: string, to?: string) => {
    const db = requireDb();
    const { data, error } = await db.from('report_exports').insert({ organization_id: state.membership.organizationId, report_type: type, date_from: from || null, date_to: to || null, status: 'ready', requested_by: state.membership.userId, completed_at: new Date().toISOString() }).select('id').single();
    if (error) return null;
    await load({ silent: true });
    return data?.id as string | null;
  }, [load, requireDb, state.membership]);

  const actions = useMemo(() => ({
    reload: () => load(), login, loginWithGoogle, logout, saveEmployee, setEmployeeActive, saveDetailedAttendance, setQuickAttendance,
    ensurePeriod, calculatePayroll, generatePayrollSlip, markSlipPaid, savePayrollItem, deletePayrollItem,
    saveVehicle, saveTransportJob, changeJobStatus, lockJob, saveFuelExpense, saveVehicleExpense, saveGeneralExpense,
    saveProduct, setProductActive, deleteProduct, resolveRequest, notifyOwner, updateSettings, updateProfileName, updatePassword, createAdmin, setAdminActive, beginExportLog
  }), [beginExportLog, calculatePayroll, changeJobStatus, createAdmin, deletePayrollItem, ensurePeriod, generatePayrollSlip, load, lockJob, login, loginWithGoogle, logout, markSlipPaid, notifyOwner, resolveRequest, saveDetailedAttendance, saveEmployee, saveFuelExpense, saveGeneralExpense, savePayrollItem, saveProduct, setProductActive, deleteProduct, saveTransportJob, saveVehicle, saveVehicleExpense, setAdminActive, setEmployeeActive, setQuickAttendance, updatePassword, updateProfileName, updateSettings]);

  return { state, actions };
}

export function formNumber(data: FormData, key: string) {
  return cleanNumber(data.get(key));
}
