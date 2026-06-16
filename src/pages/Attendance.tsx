import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Clock3,
  Download,
  FileText,
  Info,
  Search,
  UserCheck,
  UserX,
  Stethoscope,
  AlertTriangle,
} from "lucide-react";
import type {
  AppData,
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  QuickMarker,
} from "../types";
import { PageHeader } from "../components/Shell";
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Modal,
  StatusBadge,
} from "../components/ui";
import { dateShort, monthDays, monthKey, todayISO } from "../lib/date";
import { downloadExcel, downloadPdfTable } from "../lib/export";
import { quickClass, quickGlyph, statusLabel } from "../lib/format";

type DetailedPayload = {
  employee_id: string;
  attendance_date?: string;
  status: AttendanceStatus;
  notes?: string;
  photo?: File | null;
};

export function AttendancePage({
  data,
  onDetailed,
  onQuick,
}: {
  data: AppData;
  onDetailed: (payload: DetailedPayload) => Promise<void>;
  onQuick: (
    employeeId: string,
    date: string,
    marker: QuickMarker,
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState<"status" | "detail" | "quick">(
    data.membership.role === "owner"
      ? "status"
      : data.membership.adminAttendanceMode === "quick"
        ? "quick"
        : "detail",
  );
  const [query, setQuery] = useState("");
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const today = todayISO();
  const activeEmployees = data.employees.filter(
    (e) =>
      e.is_active &&
      [e.full_name, e.employee_code, e.position, e.phone]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const todayRecords = data.attendance.filter(
    (a) => a.attendance_date === today,
  );
  const rows = activeEmployees.map((employee) => ({
    employee,
    record: todayRecords.find((a) => a.employee_id === employee.id),
  }));
  const exportRows = rows.map((r) => ({
    Karyawan: r.employee.full_name,
    Jabatan: r.employee.position || "-",
    Tanggal: today,
    Jam: attendanceClock(r.record) || "-",
    Status: r.record ? statusLabel(r.record.status) : "Belum Absen",
    Metode: r.record?.input_method || "-",
    Keterangan: r.record?.notes || "-",
  }));
  const allowDetail =
    data.membership.role === "owner" ||
    data.membership.adminAttendanceMode !== "quick";
  const allowQuick =
    data.membership.role === "owner" ||
    data.membership.adminAttendanceMode !== "detail";

  return (
    <div className="content">
      <PageHeader
        title={
          data.membership.role === "owner"
            ? "Absensi Karyawan"
            : "Absensi Hari Ini"
        }
        subtitle="Status, Absen, dan Absen Cepat mengikuti alur input aplikasi Android"
        actions={
          <>
            <Button
              onClick={() => downloadExcel("absensi-hari-ini", exportRows)}
            >
              <Download size={18} />
              Excel
            </Button>
            <Button
              onClick={() => downloadPdfTable("Absensi Hari Ini", exportRows)}
            >
              <FileText size={18} />
              PDF
            </Button>
          </>
        }
      />
      <div className="filters page-tabs-row">
        <div className="tabs strong-tabs">
          <button
            type="button"
            className={`tab ${tab === "status" ? "active" : ""}`}
            onClick={() => setTab("status")}
          >
            <UserCheck size={16} />
            Status
          </button>
          {allowDetail && (
            <button
              type="button"
              className={`tab ${tab === "detail" ? "active" : ""}`}
              onClick={() => setTab("detail")}
            >
              <CalendarPlus size={16} />
              Absen
            </button>
          )}
          {allowQuick && (
            <button
              type="button"
              className={`tab ${tab === "quick" ? "active" : ""}`}
              onClick={() => setTab("quick")}
            >
              <Clock3 size={16} />
              Absen Cepat
            </button>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <label className="search-box slim-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari karyawan"
          />
        </label>
      </div>

      {tab === "status" && (
        <Card>
          <CardHeader
            title="Status Absensi Hari Ini"
            subtitle="Klik baris karyawan untuk membuka detail minggu ini dan ringkasan hari ini."
          />
          <div className="status-summary-bar">
            <StatusMini
              icon={<UserCheck />}
              label="Hadir"
              value={todayRecords.filter((a) => a.status === "hadir").length}
              tone="teal"
            />
            <StatusMini
              icon={<AlertTriangle />}
              label="Terlambat"
              value={
                todayRecords.filter((a) => a.status === "terlambat").length
              }
              tone="orange"
            />
            <StatusMini
              icon={<Stethoscope />}
              label="Izin/Sakit"
              value={
                todayRecords.filter(
                  (a) => a.status === "izin" || a.status === "sakit",
                ).length
              }
              tone="blue"
            />
            <StatusMini
              icon={<UserX />}
              label="Belum"
              value={Math.max(0, activeEmployees.length - todayRecords.length)}
              tone="red"
            />
          </div>
          <DataTable
            rows={rows}
            keyOf={(r) => r.employee.id}
            columns={[
              {
                title: "Karyawan",
                render: (r) => (
                  <button
                    type="button"
                    className="table-click-name"
                    onClick={() => setDetailEmployee(r.employee)}
                  >
                    <Avatar name={r.employee.full_name} />{" "}
                    <span>
                      {r.employee.full_name}
                      <small>{r.employee.position || "Karyawan"}</small>
                    </span>
                  </button>
                ),
              },
              { title: "Tanggal", render: () => dateShort(today) },
              {
                title: "Jam",
                render: (r) =>
                  r.record?.input_time
                    ? new Date(r.record.input_time).toLocaleTimeString(
                        "id-ID",
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "-",
              },
              {
                title: "Status",
                render: (r) => <AttendanceStatusWithTime record={r.record} />,
              },
              {
                title: "Metode",
                render: (r) =>
                  r.record?.input_method === "quick"
                    ? "Cepat"
                    : r.record
                      ? "Detail"
                      : "-",
              },
              {
                title: "Gaji Harian",
                render: (r) =>
                  r.record?.paid_at ? <StatusBadge status="dibayar" /> : "-",
              },
            ]}
          />
          {detailEmployee && (
            <AttendanceDetailModal
              employee={detailEmployee}
              data={data}
              onClose={() => setDetailEmployee(null)}
            />
          )}
        </Card>
      )}

      {tab === "detail" && (
        <DetailList
          data={data}
          employees={activeEmployees}
          onSubmit={onDetailed}
        />
      )}
      {tab === "quick" && (
        <QuickAttendance
          data={data}
          employees={activeEmployees}
          onQuick={onQuick}
        />
      )}
    </div>
  );
}

function AttendanceStatusWithTime({ record }: { record?: AttendanceRecord }) {
  const clock = attendanceClock(record);
  return <span className="status-with-time"><StatusBadge status={record?.status || "belum"} />{clock && <small>{record?.status === "terlambat" ? "Masuk " : "Jam "}{clock}</small>}</span>;
}

function attendanceClock(record?: AttendanceRecord) {
  const raw = record?.input_time || record?.updated_at || record?.created_at;
  if (!raw) return "";
  if (/^\d{2}:\d{2}/.test(raw)) return `${raw.slice(0, 5).replace(":", ".")} WIB`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".")} WIB`;
}

function StatusMini({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`status-mini ${tone}`}>
      <span>{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

function DetailList({
  data,
  employees,
  onSubmit,
}: {
  data: AppData;
  employees: Employee[];
  onSubmit: (payload: DetailedPayload) => Promise<void>;
}) {
  const [target, setTarget] = useState<{
    employee: Employee;
    existing?: AttendanceRecord;
  } | null>(null);
  const today = todayISO();
  const rows = employees.map((employee) => ({
    employee,
    record: data.attendance.find(
      (a) => a.employee_id === employee.id && a.attendance_date === today,
    ),
  }));
  return (
    <Card>
      <CardHeader
        title="Absen"
        subtitle="List semua karyawan. Tekan tombol Absen untuk membuka modal input status, foto, dan catatan seperti mobile."
      />
      {employees.length === 0 ? (
        <EmptyState title="Belum ada karyawan aktif" />
      ) : (
        <div className="attendance-mobile-list">
          {rows.map((r) => (
            <div className="attendance-mobile-card" key={r.employee.id}>
              <div className="attendance-mobile-meta">
                <Avatar name={r.employee.full_name} />
                <div>
                  <div className="item-title">{r.employee.full_name}</div>
                  <div className="item-sub">
                    {r.employee.position || "Karyawan"} •{" "}
                    {r.employee.employee_code || "-"}
                  </div>
                </div>
              </div>
              <div className="attendance-mobile-status">
                <AttendanceStatusWithTime record={r.record} />
                <Button
                  className="small primary"
                  onClick={() =>
                    setTarget({ employee: r.employee, existing: r.record })
                  }
                >
                  <CalendarPlus size={15} />
                  {r.record ? "Edit" : "Absen"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {target && (
        <AttendanceModal
          employee={target.employee}
          existing={target.existing}
          role={data.membership.role}
          requiresPhoto={data.membership.adminAttendanceRequiresPhoto}
          onClose={() => setTarget(null)}
          onSubmit={async (payload) => {
            await onSubmit(payload);
            setTarget(null);
          }}
        />
      )}
    </Card>
  );
}

function AttendanceModal({
  employee,
  existing,
  role,
  requiresPhoto,
  onClose,
  onSubmit,
}: {
  employee: Employee;
  existing?: AttendanceRecord;
  role: string;
  requiresPhoto: boolean;
  onClose: () => void;
  onSubmit: (payload: DetailedPayload) => Promise<void>;
}) {
  const [status, setStatus] = useState<AttendanceStatus>(
    existing?.status || "hadir",
  );
  const [date, setDate] = useState(existing?.attendance_date || todayISO());
  const [notes, setNotes] = useState(existing?.notes || "");
  const [photo, setPhoto] = useState<File | null>(null);
  const photoBlocked =
    role !== "owner" && requiresPhoto && !photo && !existing?.photo_path;
  return (
    <Modal
      title={`${existing ? "Edit Absensi" : "Absen"} ${employee.full_name}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button
            className="primary"
            disabled={photoBlocked}
            onClick={() =>
              onSubmit({
                employee_id: employee.id,
                attendance_date: date,
                status,
                notes,
                photo,
              })
            }
          >
            {existing ? "Simpan Perubahan" : "Simpan Absensi"}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Karyawan</label>
          <input
            className="input"
            value={`${employee.full_name} • ${employee.position || "-"}`}
            disabled
          />
        </div>
        <div className="field">
          <label>Tanggal</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={role !== "owner"}
          />
        </div>
        <div className="field">
          <label>Status</label>
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
          >
            <option value="hadir">Hadir</option>
            <option value="terlambat">Terlambat</option>
            <option value="izin">Izin</option>
            <option value="sakit">Sakit</option>
            <option value="tidak_hadir">Tidak Hadir</option>
            <option value="libur">Libur</option>
          </select>
        </div>
        <div className="field">
          <label>
            Foto Bukti{" "}
            {role !== "owner" && requiresPhoto ? "(Wajib)" : "(Opsional)"}
          </label>
          <input
            className="input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          />
        </div>
        <div className="field full">
          <label>Keterangan</label>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: terlambat 10 menit, izin pribadi, sakit"
          />
        </div>
        {existing && (
          <div className="field full">
            <div className="warning-box">
              Data hari ini sudah ada. Jika Admin menyimpan perubahan, sistem
              akan membuat pengajuan koreksi ke Owner. Owner dapat update
              langsung.
            </div>
          </div>
        )}
        {photoBlocked && (
          <div className="field full">
            <div className="warning-box">
              Foto bukti wajib aktif di pengaturan. Upload foto dulu agar tombol
              Simpan bisa dipakai.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function AttendanceDetailModal({
  employee,
  data,
  onClose,
}: {
  employee: Employee;
  data: AppData;
  onClose: () => void;
}) {
  const today = todayISO();
  const week = getWeekDays(today);
  const todayRecord = data.attendance.find(
    (a) => a.employee_id === employee.id && a.attendance_date === today,
  );
  const weekRows = week.map((date) => ({
    date,
    record: data.attendance.find(
      (a) => a.employee_id === employee.id && a.attendance_date === date,
    ),
  }));
  return (
    <Modal
      title={`Detail Absensi ${employee.full_name}`}
      onClose={onClose}
      wide
      actions={
        <Button className="primary" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <div className="employee-detail-hero">
        <Avatar name={employee.full_name} size={62} />
        <div>
          <h3>{employee.full_name}</h3>
          <p>
            {employee.employee_code || "-"} • {employee.position || "Karyawan"}
          </p>
        </div>
        <StatusBadge status={todayRecord?.status || "belum"} />
      </div>
      <div className="status-summary-bar">
        <StatusMini
          icon={<UserCheck />}
          label="Hadir Hari Ini"
          value={todayRecord?.status === "hadir" ? 1 : 0}
          tone="teal"
        />
        <StatusMini
          icon={<AlertTriangle />}
          label="Terlambat"
          value={todayRecord?.status === "terlambat" ? 1 : 0}
          tone="orange"
        />
        <StatusMini
          icon={<Stethoscope />}
          label="Izin/Sakit"
          value={
            todayRecord && ["izin", "sakit"].includes(todayRecord.status)
              ? 1
              : 0
          }
          tone="blue"
        />
        <StatusMini
          icon={<CalendarDays />}
          label="Minggu Ini"
          value={
            weekRows.filter(
              (r) =>
                r.record?.status === "hadir" ||
                r.record?.status === "terlambat",
            ).length
          }
          tone="green"
        />
      </div>
      <div className="week-detail-grid">
        {weekRows.map(({ date, record }) => (
          <div key={date} className="week-day-card">
            <b>
              {new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", {
                weekday: "short",
              })}
            </b>
            <span>{dateShort(date)}</span>
            <StatusBadge status={record?.status || "belum"} />
            <small>{record?.input_method || "-"}</small>
          </div>
        ))}
      </div>
      <Card style={{ boxShadow: "none", marginTop: 16 }}>
        <CardHeader title="Catatan Hari Ini" />
        <p className="muted-caption">
          {todayRecord?.notes || "Belum ada catatan."}
        </p>
      </Card>
    </Modal>
  );
}

function QuickAttendance({
  data,
  employees,
  onQuick,
}: {
  data: AppData;
  employees: Employee[];
  onQuick: (
    employeeId: string,
    date: string,
    marker: QuickMarker,
  ) => Promise<void>;
}) {
  const [key, setKey] = useState(monthKey());
  const [target, setTarget] = useState<{
    employee: Employee;
    date: string;
  } | null>(null);
  const days = monthDays(key);
  const records = useMemo(
    () =>
      new Map(
        data.attendance.map((a) => [
          `${a.employee_id}-${a.attendance_date}`,
          a,
        ]),
      ),
    [data.attendance],
  );
  const canHistorical = data.membership.role === "owner";
  const visibleDays = canHistorical
    ? days
    : days.filter((d) => d === todayISO());
  const quickRows = buildQuickRows(employees, visibleDays, records);
  return (
    <Card>
      <CardHeader
        title="Absen Cepat"
        subtitle="Tanpa scroll samping. Pilih karyawan, lalu klik tanggal yang tampil dalam grid bulanan."
        action={
          <div className="header-inline-actions">
            <input
              className="input"
              type="month"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!canHistorical}
            />
            <Button onClick={() => downloadExcel("absensi-cepat", quickRows)}>
              <Download size={16} />
              Excel
            </Button>
            <Button
              onClick={() => downloadPdfTable("Absensi Cepat", quickRows)}
            >
              <FileText size={16} />
              PDF
            </Button>
          </div>
        }
      />
      <div className="info-line">
        <Info size={17} />
        <span>
          Kode: ✖ masuk, ½ setengah hari, ✖ merah ambil gaji, — tidak masuk.
          Admin hanya bisa tanggal hari ini.
        </span>
      </div>
      {employees.length === 0 ? (
        <EmptyState title="Belum ada karyawan" />
      ) : (
        <div className="quick-calendar-list">
          {employees.map((employee) => (
            <div className="quick-employee-card" key={employee.id}>
              <div className="quick-employee-head">
                <Avatar name={employee.full_name} />
                <div>
                  <b>{employee.full_name}</b>
                  <small>{employee.position || "Karyawan"}</small>
                </div>
              </div>
              <div className="quick-month-grid">
                {visibleDays.map((day) => {
                  const record = records.get(`${employee.id}-${day}`);
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`quick-day ${quickClass(record)}`}
                      onClick={() => setTarget({ employee, date: day })}
                    >
                      <span>{Number(day.slice(-2))}</span>
                      <b>{quickGlyph(record) || "•"}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {target && (
        <Modal
          title={`Absensi Cepat ${target.employee.full_name}`}
          onClose={() => setTarget(null)}
          actions={
            <>
              <Button onClick={() => setTarget(null)}>Batal</Button>
              {quickChoices.map((choice) => (
                <Button
                  key={choice.marker}
                  className={choice.className}
                  onClick={async () => {
                    await onQuick(
                      target.employee.id,
                      target.date,
                      choice.marker,
                    );
                    setTarget(null);
                  }}
                >
                  {choice.label}
                </Button>
              ))}
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Tanggal: <b>{dateShort(target.date)}</b>
          </p>
          <p className="muted-caption">
            Perubahan langsung tersimpan dan dipakai menghitung payroll
            realtime.
          </p>
        </Modal>
      )}
    </Card>
  );
}

export function HistoryPage({
  data,
}: {
  data: AppData;
}) {
  const [query, setQuery] = useState("");
  const rows = data.attendance
    .map((a) => ({
      ...a,
      employee: data.employees.find((e) => e.id === a.employee_id),
    }))
    .filter((r) =>
      [r.employee?.full_name, r.attendance_date, r.status, r.notes]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 500);
  const exportRows = rows.map((r) => ({
    Tanggal: r.attendance_date,
    Karyawan: r.employee?.full_name || "-",
    Jabatan: r.employee?.position || "-",
    Status: statusLabel(r.status),
    Keterangan: r.notes || "-",
    Metode: r.input_method || "-",
  }));
  return (
    <div className="content">
      <PageHeader
        title="Riwayat Absensi"
        subtitle="Histori absensi, foto, koreksi, dan status pengambilan gaji"
        actions={
          <>
            <Button
              onClick={() => downloadExcel("riwayat-absensi", exportRows)}
            >
              <Download size={18} />
              Excel
            </Button>
            <Button
              onClick={() => downloadPdfTable("Riwayat Absensi", exportRows)}
            >
              <FileText size={18} />
              PDF
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader title="Riwayat" />
        <div className="filters">
          <label className="search-box slim-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, tanggal, status"
            />
          </label>
        </div>
        <DataTable
          rows={rows}
          keyOf={(r) => r.id}
          columns={[
            { title: "Tanggal", render: (r) => dateShort(r.attendance_date) },
            {
              title: "Karyawan",
              render: (r) => (
                <span className="name-cell">
                  <Avatar name={r.employee?.full_name} />
                  {r.employee?.full_name}
                </span>
              ),
            },
            {
              title: "Status",
              render: (r) => <StatusBadge status={r.status} />,
            },
            { title: "Metode", render: (r) => r.input_method || "-" },
            {
              title: "Gaji Harian",
              render: (r) =>
                r.paid_at ? <StatusBadge status="dibayar" /> : "-",
            },
            { title: "Keterangan", render: (r) => r.notes || "-" },
          ]}
        />
      </Card>
    </div>
  );
}

const quickChoices: {
  marker: QuickMarker;
  label: string;
  className?: string;
}[] = [
  { marker: "masuk", label: "✖ Masuk", className: "good" },
  { marker: "setengah_hari", label: "½ Setengah Hari" },
  { marker: "masuk_ambil_gaji", label: "✖ Ambil Gaji", className: "red" },
  { marker: "tidak_masuk", label: "— Tidak Masuk" },
  {
    marker: "tidak_masuk_ambil_gaji",
    label: "— Tidak Masuk + Ambil",
    className: "red",
  },
];

function buildQuickRows(
  employees: Employee[],
  days: string[],
  records: Map<string, AttendanceRecord>,
) {
  return employees.map((e) =>
    Object.fromEntries([
      ["Karyawan", e.full_name],
      ...days.map((d) => [
        d.slice(-2),
        quickGlyph(records.get(`${e.id}-${d}`)),
      ]),
    ]),
  ) as Record<string, string>[];
}

function getWeekDays(anchor: string) {
  const base = new Date(`${anchor}T00:00:00Z`);
  const day = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + index);
    return d.toISOString().slice(0, 10);
  });
}
