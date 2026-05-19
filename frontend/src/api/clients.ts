import { api } from '@/api/client';
import type {
  ClientDetail,
  ClientPayload,
  ClientSummary,
  LastBalances,
} from '@/types';

export async function listClients(): Promise<ClientSummary[]> {
  const { data } = await api.get<ClientSummary[]>('/clients');
  return data;
}

export async function getClient(clientId: number): Promise<ClientDetail> {
  const { data } = await api.get<ClientDetail>(`/clients/${clientId}`);
  return data;
}

export async function createClient(payload: ClientPayload): Promise<ClientDetail> {
  const { data } = await api.post<ClientDetail>('/clients', payload);
  return data;
}

export async function updateClient(
  clientId: number,
  payload: ClientPayload,
): Promise<ClientDetail> {
  const { data } = await api.put<ClientDetail>(`/clients/${clientId}`, payload);
  return data;
}

export async function deleteClient(clientId: number): Promise<void> {
  await api.delete(`/clients/${clientId}`);
}

export async function getLastBalances(clientId: number): Promise<LastBalances> {
  const { data } = await api.get<LastBalances>(`/clients/${clientId}/last-balances`);
  return data;
}
