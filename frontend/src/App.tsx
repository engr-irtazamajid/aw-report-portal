import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { ClientListPage } from '@/features/clients/ClientListPage';
import { ClientFormPage } from '@/features/clients/ClientFormPage';
import { ClientDetailPage } from '@/features/clients/ClientDetailPage';
import { ReportEntryPage } from '@/features/reports/ReportEntryPage';
import { ReportDetailPage } from '@/features/reports/ReportDetailPage';
import { ReportsIndexPage } from '@/features/reports/ReportsIndexPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/clients" replace />} />
        <Route path="clients" element={<ClientListPage />} />
        <Route path="clients/new" element={<ClientFormPage mode="create" />} />
        <Route path="clients/:clientId" element={<ClientDetailPage />} />
        <Route path="clients/:clientId/edit" element={<ClientFormPage mode="edit" />} />
        <Route path="clients/:clientId/reports/new" element={<ReportEntryPage />} />
        <Route path="reports" element={<ReportsIndexPage />} />
        <Route path="reports/:reportId" element={<ReportDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/clients" replace />} />
    </Routes>
  );
}
