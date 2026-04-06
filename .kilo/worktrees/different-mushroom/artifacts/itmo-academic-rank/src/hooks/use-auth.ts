import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authHeaders, setToken, removeToken } from "@/lib/utils";
import type { LoginRequest, RegisterRequest, AuthResponse, User } from "@workspace/api-client-react/src/generated/api.schemas";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) {
          removeToken();
          return null; // Return null instead of throwing for clean unauthenticated state
        }
        throw new Error('Failed to fetch user');
      }
      return res.json();
    },
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Ошибка входа');
      }
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      setToken(data.token);
      queryClient.setQueryData(['/api/auth/me'], data.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Ошибка регистрации');
      }
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      setToken(data.token);
      queryClient.setQueryData(['/api/auth/me'], data.user);
    },
  });

  const logout = () => {
    removeToken();
    queryClient.setQueryData(['/api/auth/me'], null);
    window.location.href = '/login';
  };

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout,
    isAuthenticated: !!user,
    isExpert: user?.role === 'expert' || user?.role === 'admin',
    isAdmin: user?.role === 'admin',
  };
}
