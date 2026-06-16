export type Role = 'owner' | 'admin_operasional';
export type AttendanceStatus = 'hadir' | 'tidak_hadir' | 'izin' | 'sakit' | 'libur' | 'terlambat';
export type PayrollStatus = 'draft' | 'siap_dibayar' | 'dibayar' | 'dibatalkan';
export type TransportStatus = 'draft' | 'berjalan' | 'selesai' | 'dibatalkan';
export type SalaryType = 'harian' | 'bulanan' | 'borongan';
export type QuickMarker = 'masuk' | 'setengah_hari' | 'masuk_ambil_gaji' | 'tidak_masuk' | 'tidak_masuk_ambil_gaji';
export type AttendanceMode = 'quick' | 'detail' | 'both';

export interface Membership {
  userId: string;
  organizationId: string;
  organizationName: string;
  fullName: string;
  role: Role;
  adminAttendanceMode: AttendanceMode;
  adminAttendanceRequiresPhoto: boolean;
}


export interface AdminMember {
  user_id: string;
  role: Role;
  full_name: string;
  is_active: boolean;
}

export interface Employee {
  id: string;
  organization_id: string;
  employee_code: string;
  full_name: string;
  phone?: string | null;
  position?: string | null;
  joined_date?: string | null;
  is_active: boolean;
  notes?: string | null;
  ktp_photo_path?: string | null;
  salary_type: SalaryType;
  daily_rate: number;
  monthly_rate: number;
  allowed_absence_days: number;
  absence_deduction: number;
}

export interface PayRate {
  id: string;
  organization_id: string;
  employee_id: string;
  salary_type: SalaryType;
  daily_rate: number;
  monthly_rate: number;
  overtime_rate: number;
  allowed_absence_days: number;
  absence_deduction: number;
  valid_from: string;
  valid_to?: string | null;
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  employee_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  input_time?: string;
  input_method?: 'detail' | 'quick' | string;
  quick_marker?: QuickMarker | null;
  attendance_fraction?: number | null;
  photo_path?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  paid_at?: string | null;
  paid_by?: string | null;
  created_by?: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PayrollPeriod {
  id: string;
  organization_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
}

export interface PayrollSlip {
  id: string;
  organization_id: string;
  payroll_period_id: string;
  employee_id: string;
  attended_days: number;
  attended_day_units?: number;
  absent_days?: number;
  salary_type?: SalaryType;
  base_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  automatic_deduction?: number;
  net_amount?: number;
  status: PayrollStatus;
  calculation_notes?: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  slip_file_path?: string | null;
}

export interface PayrollJobItem {
  id: string;
  organization_id: string;
  employee_id: string;
  work_date: string;
  item_kind: string;
  description: string;
  quantity: number;
  unit_label: string;
  unit_rate: number;
  total_amount?: number;
}

export interface Vehicle {
  id: string;
  organization_id: string;
  fleet_code: string;
  plate_number: string;
  vehicle_year: number;
  tax_due_date: string;
  default_driver_id?: string | null;
  default_helper_1_id?: string | null;
  default_helper_2_id?: string | null;
  stnk_photo_path?: string | null;
  is_active: boolean;
  notes?: string | null;
}

export interface TransportDestination {
  id: string;
  organization_id: string;
  name: string;
  normalized_name?: string | null;
  is_active: boolean;
  notes?: string | null;
}

export interface TransportJob {
  id: string;
  organization_id: string;
  vehicle_id?: string | null;
  destination_id?: string | null;
  operation_date: string;
  destination: string;
  driver_id?: string | null;
  helper_1_id?: string | null;
  helper_2_id?: string | null;
  status: TransportStatus;
  odometer_start?: number | null;
  odometer_end?: number | null;
  notes?: string | null;
  is_locked?: boolean;
  created_at?: string;
}

export interface FuelExpense {
  id: string;
  transport_job_id: string;
  fuel_type: string;
  liters?: number | null;
  amount: number;
  receipt_path?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface VehicleExpense {
  id: string;
  transport_job_id: string;
  category: string;
  vendor_name: string;
  amount: number;
  receipt_path?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface GeneralTransportExpense {
  id: string;
  organization_id: string;
  expense_date: string;
  amount: number;
  category: string;
  vehicle_identity?: string | null;
  requester_name: string;
  receipt_path?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface ProductPrice {
  id: string;
  organization_id: string;
  product_name: string;
  product_code: string;
  purchase_price: number;
  special_sale_price: number;
  store_sale_price: number;
  retail_sale_price: number;
  is_active: boolean;
  notes?: string | null;
}

export interface ChangeRequest {
  id: string;
  organization_id: string;
  request_type: 'attendance_edit' | 'transport_job_edit' | string;
  entity_id?: string | null;
  payload?: Record<string, unknown> | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by?: string | null;
  resolved_by?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  created_at?: string;
  updated_at?: string;
  requester_name?: string | null;
}

export interface ReportExportLog {
  id: string;
  organization_id: string;
  report_type: string;
  date_from?: string | null;
  date_to?: string | null;
  status: string;
  requested_at?: string;
  completed_at?: string | null;
}

export interface AppData {
  membership: Membership;
  employees: Employee[];
  attendance: AttendanceRecord[];
  periods: PayrollPeriod[];
  slips: PayrollSlip[];
  payrollItems: PayrollJobItem[];
  vehicles: Vehicle[];
  destinations: TransportDestination[];
  jobs: TransportJob[];
  fuelExpenses: FuelExpense[];
  vehicleExpenses: VehicleExpense[];
  generalExpenses: GeneralTransportExpense[];
  products: ProductPrice[];
  requests: ChangeRequest[];
  admins: AdminMember[];
  reportLogs: ReportExportLog[];
}
