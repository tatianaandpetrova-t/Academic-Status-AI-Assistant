import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { FileCheck, Sparkles, Brain, ArrowRight, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="ITMO Logo" className="h-10 w-10" />
            <span className="font-display font-bold text-xl tracking-tight text-primary">Ассистент Званий</span>
          </div>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="ghost">Войти</Button>
            </Link>
            <Link href="/login?tab=register">
              <Button>Зарегистрироваться</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="University Campus" 
            className="w-full h-full object-cover opacity-[0.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/90 to-white" />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10 grid lg:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-6 border border-primary/20">
              <Sparkles className="w-4 h-4" />
              <span>Постановление №1139</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-display font-extrabold text-slate-900 leading-[1.1] mb-6 tracking-tight">
              Интеллектуальная <br/><span className="text-primary">проверка критериев</span> учёного звания
            </h1>
            <p className="text-lg text-slate-600 mb-10 max-w-xl leading-relaxed">
              Официальный инструмент для преподавателей ИТМО. Узнайте, соответствуете ли вы требованиям к учёному званию доцента или профессора за 2 минуты, и получите пошаговые рекомендации от ИИ-ассистента.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/login?tab=register">
                <Button size="lg" className="w-full sm:w-auto gap-2 text-lg">
                  Начать проверку <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" className="w-full sm:w-auto text-lg">
                  Личный кабинет
                </Button>
              </Link>
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent rounded-3xl blur-3xl" />
            <div className="relative glass-panel rounded-3xl p-8 border border-white/40 shadow-2xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">ИИ-Ассистент ИТМО</h3>
                  <p className="text-sm text-slate-500">Готов ответить на ваши вопросы</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-slate-100 rounded-2xl rounded-tl-none p-4 text-slate-700 text-sm max-w-[85%]">
                  Здравствуйте! Я помогу вам разобраться в сложных формулировках Постановления №1139. Какой у вас вопрос?
                </div>
                <div className="bg-primary text-white rounded-2xl rounded-tr-none p-4 text-sm max-w-[85%] ml-auto shadow-md shadow-primary/20">
                  Учитываются ли статьи в журналах Q4 для звания доцента?
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-tl-none p-4 text-slate-700 text-sm max-w-[85%] relative">
                  Да, публикации в изданиях, индексируемых в международных базах данных (вкл. Q4), учитываются. Для доцента необходимо минимум 20 учебных изданий и научных трудов. Хотите проверить ваши данные?
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-display font-bold mb-4">Как это работает?</h2>
            <p className="text-slate-600">Система автоматизирует рутинную проверку и дает точную оценку ваших шансов на получение звания.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
                <FileCheck className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Умная анкета</h3>
              <p className="text-slate-600">Заполните простую пошаговую форму. Система сама сопоставит ваши данные с актуальными требованиями ВАК.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6">
                <Brain className="w-7 h-7 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">Ответы нейросети</h3>
              <p className="text-slate-600">Обученный на нормативной базе ИИ мгновенно ответит на любые вопросы о педагогическом стаже и публикациях.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-6">
                <BookOpen className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">Рекомендации</h3>
              <p className="text-slate-600">Получите детализированный отчет о недостающих критериях и точный план действий для достижения цели.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
