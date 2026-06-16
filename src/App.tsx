import { Suspense, lazy, useMemo, useState } from 'react';
import './styles/global.css';
import { useAppData } from './hooks/useAppData';
import { Shell, type PageKey } from './components/Shell';
import { ToastHost } from './components/Toast';
import { LoginPage } from './pages/Login';
import { AppBootLoader, PageSkeleton } from './components/ui';

const OwnerDashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.OwnerDashboard })));
const AdminDashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.AdminDashboard })));
const EmployeesPage = lazy(() => import('./pages/Employees').then((m) => ({ default: m.EmployeesPage })));
const AttendancePage = lazy(() => import('./pages/Attendance').then((m) => ({ default: m.AttendancePage })));
const HistoryPage = lazy(() => import('./pages/Attendance').then((m) => ({ default: m.HistoryPage })));
const PayrollPage = lazy(() => import('./pages/Payroll').then((m) => ({ default: m.PayrollPage })));
const TransportPage = lazy(() => import('./pages/Transport').then((m) => ({ default: m.TransportPage })));
const CatalogPage = lazy(() => import('./pages/Catalog').then((m) => ({ default: m.CatalogPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));

export default function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const { state, actions } = useAppData();
  const pendingCount = useMemo(() => state.requests.filter((r) => r.status === 'pending').length, [state.requests]);

  // // FIX: Jangan tampilkan login page sekejap saat refresh. Tampilkan loader sampai sesi Supabase selesai dicek.
  if (state.loading && !state.authenticated) {
    return <><AppBootLoader /><ToastHost /></>;
  }

  if (!state.authenticated) {
    return <><LoginPage configured={state.configured} onLogin={actions.login} onGoogle={actions.loginWithGoogle} /><ToastHost /></>;
  }

  const route = () => {
    if (page === 'dashboard') return state.membership.role === 'owner' ? <OwnerDashboard data={state} setPage={setPage} /> : <AdminDashboard data={state} setPage={setPage} />;
    if (page === 'employees') return <EmployeesPage data={state} onSave={actions.saveEmployee} onSetActive={actions.setEmployeeActive} />;
    if (page === 'attendance') return <AttendancePage data={state} onDetailed={actions.saveDetailedAttendance} onQuick={actions.setQuickAttendance} />;
    if (page === 'history') return <HistoryPage data={state} />;
    if (page === 'payroll') return <PayrollPage data={state} onCalculate={actions.calculatePayroll} onGenerate={actions.generatePayrollSlip} onPaid={actions.markSlipPaid} onItem={actions.savePayrollItem} onDeleteItem={actions.deletePayrollItem} />;
    if (page === 'transport') return <TransportPage data={state} onVehicle={actions.saveVehicle} onJob={actions.saveTransportJob} onStatus={actions.changeJobStatus} onLock={actions.lockJob} onFuel={actions.saveFuelExpense} onVehicleExpense={actions.saveVehicleExpense} onGeneral={actions.saveGeneralExpense} />;
    if (page === 'catalog') return <CatalogPage data={state} onSave={actions.saveProduct} onToggle={actions.setProductActive} onDelete={actions.deleteProduct} />;
    if (page === 'reports') return <ReportsPage data={state} onExportLog={actions.beginExportLog} />;
    return <SettingsPage data={state} onResolve={actions.resolveRequest} onUpdateMode={actions.updateSettings} onProfile={actions.updateProfileName} onPassword={actions.updatePassword} onCreateAdmin={actions.createAdmin} onSetAdmin={actions.setAdminActive} />;
  };

  return <>
    <Shell membership={state.membership} page={page} setPage={setPage} pendingCount={pendingCount} requests={state.requests} onResolve={actions.resolveRequest} onLogout={actions.logout}>
      {state.error ? <div className="content"><div className="card warning-box">{state.error}</div></div> : <Suspense fallback={<PageSkeleton />}>{route()}</Suspense>}
    </Shell>
    <ToastHost />
  </>;
}
