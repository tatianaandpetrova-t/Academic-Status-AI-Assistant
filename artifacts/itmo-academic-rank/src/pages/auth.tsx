import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button, Input, Label, Card } from "@/components/ui";
import { motion, AnimatePresence } from "framer-motion";

export default function Auth() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const initialTab = params.get('tab') === 'register' ? 'register' : 'login';
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  
  const { login, register, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as any;

    try {
      if (tab === 'login') {
        await login({ email: data.email, password: data.password });
      } else {
        await register({
          email: data.email,
          password: data.password,
          fullName: data.fullName,
          department: data.department,
          position: data.position,
        });
      }
      setLocation('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
             <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="ITMO" className="h-12 w-12" />
             <span className="font-display font-bold text-2xl text-primary">Ассистент Званий</span>
          </div>
        </div>

        <Card className="p-8 shadow-xl shadow-primary/5 border-slate-200">
          <div className="flex p-1 bg-slate-100 rounded-xl mb-8">
            <button
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === 'login' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              onClick={() => setTab('login')}
              type="button"
            >
              Вход
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              onClick={() => setTab('register')}
              type="button"
            >
              Регистрация
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {tab === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-5 overflow-hidden"
                >
                  <div className="space-y-2">
                    <Label htmlFor="fullName">ФИО полностью</Label>
                    <Input id="fullName" name="fullName" required placeholder="Иванов Иван Иванович" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="department">Подразделение</Label>
                      <Input id="department" name="department" placeholder="Факультет..." />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="position">Должность</Label>
                      <Input id="position" name="position" placeholder="Доцент..." />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="name@itmo.ru" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" required placeholder="••••••••" minLength={6} />
            </div>

            <Button type="submit" className="w-full mt-8" size="lg" isLoading={isLoading}>
              {tab === 'login' ? 'Войти в систему' : 'Зарегистрироваться'}
            </Button>
          </form>
        </Card>
        <p className="text-center text-sm text-slate-500 mt-8">
          Доступ только для сотрудников Университета ИТМО.
        </p>
      </div>
    </div>
  );
}
