import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/utils";
import type { ApplicationListResponse, Application, CreateApplicationRequest } from "@workspace/api-client-react/src/generated/api.schemas";

export function useApplications(status?: string) {
  return useQuery<ApplicationListResponse>({
    queryKey: ['/api/applications', status],
    queryFn: async () => {
      const url = status ? `/api/applications?status=${status}` : '/api/applications';
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch applications');
      return res.json();
    },
  });
}

export function useApplication(id: number | null) {
  return useQuery<Application>({
    queryKey: ['/api/applications', id],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch application details');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateApplicationRequest) => {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create application');
      return res.json() as Promise<Application>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    },
  });
}
