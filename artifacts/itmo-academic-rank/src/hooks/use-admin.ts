import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders, getToken } from "@/lib/utils";
import type { AdminStats, User, ApplicationListResponse, ReviewApplicationRequest } from "@workspace/api-client-react/src/generated/api.schemas";

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });
}

export function useAdminUsers() {
  return useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role, isActive }: { id: number; role: string; isActive?: boolean }) => {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ role, isActive }),
      });
      if (!res.ok) throw new Error('Failed to update user role');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
  });
}

export function useAdminApplications(status?: string) {
  return useQuery<ApplicationListResponse>({
    queryKey: ['/api/admin/applications', status],
    queryFn: async () => {
      const url = status ? `/api/admin/applications?status=${status}` : '/api/admin/applications';
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch all applications');
      return res.json();
    },
  });
}

export function useReviewApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ReviewApplicationRequest }) => {
      const res = await fetch(`/api/admin/applications/${id}/review`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to review application');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    },
  });
}

// Критерии
export function useCriteria() {
  return useQuery<any[]>({
    queryKey: ['/api/criteria'],
    queryFn: async () => {
      const res = await fetch('/api/criteria');
      if (!res.ok) throw new Error('Failed to fetch criteria');
      return res.json();
    },
  });
}

export function useUpdateCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rankType, rules }: { id: number; rankType: string; rules: any }) => {
      const res = await fetch(`/api/criteria/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ rankType, rules }),
      });
      if (!res.ok) throw new Error('Failed to update criteria');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/criteria'] });
    },
  });
}

// RAG документы
export function useRagDocuments() {
  return useQuery<any[]>({
    queryKey: ['/api/admin/rag-documents'],
    queryFn: async () => {
      const res = await fetch('/api/admin/rag-documents', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch RAG documents');
      return res.json();
    },
  });
}

export function useUploadRagDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, title, description }: { file: File; title: string; description?: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      if (description) formData.append('description', description);
      const token = getToken();
      const res = await fetch('/api/admin/rag-documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/rag-documents'] });
    },
  });
}

export function useUpdateRagDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, title, description, isActive }: { id: number; content?: string; title?: string; description?: string; isActive?: boolean }) => {
      const res = await fetch(`/api/admin/rag-documents/${id}/content`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ content, title, description, isActive }),
      });
      if (!res.ok) throw new Error('Failed to update RAG document');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/rag-documents'] });
    },
  });
}

export function useDeleteRagDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/rag-documents/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete RAG document');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/rag-documents'] });
    },
  });
}
