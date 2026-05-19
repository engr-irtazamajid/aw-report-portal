import { api } from '@/api/client';
import type { BalanceInput, ReportRead, ReportSummary } from '@/types';

export interface CreateReportPayload {
  period_label: string;
  balances: BalanceInput[];
}

export interface FinalizeReportPayload {
  balances: BalanceInput[];
}

export async function createReport(
  clientId: number,
  payload: CreateReportPayload,
): Promise<ReportRead> {
  const { data } = await api.post<ReportRead>(`/clients/${clientId}/reports`, payload);
  return data;
}

export async function listReports(clientId: number): Promise<ReportSummary[]> {
  const { data } = await api.get<ReportSummary[]>(`/clients/${clientId}/reports`);
  return data;
}

export async function getReport(reportId: number): Promise<ReportRead> {
  const { data } = await api.get<ReportRead>(`/reports/${reportId}`);
  return data;
}

export async function finalizeReport(
  reportId: number,
  payload: FinalizeReportPayload,
): Promise<ReportRead> {
  const { data } = await api.post<ReportRead>(`/reports/${reportId}/finalize`, payload);
  return data;
}

export async function downloadReportPdf(
  reportId: number,
  type: 'sacs' | 'tcc',
): Promise<Blob> {
  const response = await api.get(`/reports/${reportId}/pdf`, {
    params: { type },
    responseType: 'blob',
  });
  return response.data as Blob;
}

export interface CanvaStatus {
  enabled: boolean;
  base_url: string | null;
}

export interface CanvaExportResult {
  asset_id: string;
  edit_url: string;
  name: string;
}

export async function getCanvaStatus(): Promise<CanvaStatus> {
  const { data } = await api.get<CanvaStatus>('/integrations/canva/status');
  return data;
}

export async function exportReportToCanva(
  reportId: number,
  type: 'sacs' | 'tcc',
): Promise<CanvaExportResult> {
  const { data } = await api.post<CanvaExportResult>(
    `/reports/${reportId}/export/canva`,
    null,
    { params: { type } },
  );
  return data;
}
