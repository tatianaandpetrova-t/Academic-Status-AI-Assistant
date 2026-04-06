import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useApplications } from "@/hooks/use-applications";
import { Card, Button, Badge } from "@/components/ui";
import { FileText, Plus, ArrowRight, Activity, Clock } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: applicationsData, isLoading } = useApplications();
  const apps = applicationsData?.applications || [];

  return (
    <Layout>
      <div className="mb-10">
        <h1 className="text-3xl font-display font-bold text-slate-900">Добро пожаловать, {user?.fullName.split(' ')[1] || user?.fullName}!</h1>
        <p className="text-slate-500 mt-2 text-lg">Личный кабинет соискателя учёного звания</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-10">
        <Card className="p-6 bg-gradient-to-br from-primary to-blue-600 text-white border-none shadow-lg shadow-primary/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-blue-100 font-medium mb-1">Всего заявок</p>
              <h2 className="text-4xl font-bold">{apps.length}</h2>
            </div>
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Activity className="w-6 h-6 text-white" />
            </div>
          </div>
        </Card>
        
        <Card className="p-6 md:col-span-2 bg-white flex flex-col sm:flex-row items-center justify-between gap-6 border-slate-200">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Готовы проверить свои показатели?</h3>
            <p className="text-slate-600 mt-1">Запустите умную проверку по критериям ВАК.</p>
          </div>
          <Link href="/apply">
            <Button size="lg" className="shrink-0 gap-2 shadow-primary/25">
              <Plus className="w-5 h-5" /> Создать заявку
            </Button>
          </Link>
        </Card>
      </div>

      <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Clock className="w-5 h-5 text-primary" /> Последние проверки
      </h2>

      {isLoading ? (
        <div className="grid gap-4">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : apps.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-300 bg-slate-50/50">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-bold text-lg mb-2">Нет активных заявок</h3>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto">Вы еще не запускали проверку критериев. Нажмите кнопку выше, чтобы начать.</p>
          <Link href="/apply">
            <Button variant="outline">Начать первую проверку</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4">
          {apps.slice(0, 5).map(app => (
            <Card key={app.id} className="p-5 hover:shadow-md transition-shadow group">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2 flex-wrap">
                      Заявка на звание {app.rankType === 'docent' ? 'Доцента' : 'Профессора'}
                      {app.status === 'pending' && app.result?.status === 'approved' && <Badge variant="success">AI: Соответствует</Badge>}
                      {app.status === 'pending' && app.result?.status === 'partial' && <Badge variant="warning">AI: Частично</Badge>}
                      {app.status === 'pending' && app.result?.status === 'rejected' && <Badge variant="danger">AI: Не соответствует</Badge>}
                      {app.status === 'pending' && !app.result?.status && <Badge variant="outline">На проверке</Badge>}
                      {app.status === 'approved' && <Badge variant="success">Одобрено</Badge>}
                      {app.status === 'partial' && <Badge variant="warning">Требует уточнения</Badge>}
                      {app.status === 'rejected' && <Badge variant="danger">Отклонено</Badge>}
                    </h4>
                    <p className="text-sm text-slate-500 mt-1">Отправлено {formatDate(app.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900">Соответствие</p>
                    <p className="text-sm text-slate-500">{app.result?.score ?? 0}%</p>
                  </div>
                  <Link href={`/applications/${app.id}`}>
                    <Button variant="ghost" className="shrink-0 bg-slate-50 group-hover:bg-primary group-hover:text-white">
                      Подробнее <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
