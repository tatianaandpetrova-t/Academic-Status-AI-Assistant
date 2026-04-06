import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders } from "@/lib/utils";
import type { ChatMessage } from "@workspace/api-client-react/src/generated/api.schemas";

export function useChatHistory() {
  return useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/messages'],
    queryFn: async () => {
      const res = await fetch('/api/chat/messages?limit=50', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch chat history');
      return res.json();
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { message: string; contextAppId?: number | null; debug?: boolean }) => {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json() as Promise<ChatMessage>;
    },
    onSuccess: (newMessage) => {
      queryClient.setQueryData<ChatMessage[] | any[]>(['/api/chat/messages'], (old = []) => {
        return [...old, newMessage];
      });
    },
  });
}

export function useRateMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rating }: { id: number; rating: number }) => {
      const res = await fetch(`/api/chat/messages/${id}/rate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) throw new Error('Failed to rate message');
      return res.json() as Promise<ChatMessage>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/messages'] });
    },
  });
}
