import { Layout } from "@/components/layout";
import { useApplications } from "@/hooks/use-applications";
import { Card, Badge, Button } from "@/components/ui";
import { FileText, Plus, ArrowRight, Search, Filter } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";
import { useState } from "react";

export default function Applications() {
  const [filter, setFilter] = useState<string>("");
  const { data, isLoading } = useApplications(filter || undefined);
  const apps = data?.applications || [];

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Мои заявки</h1>
          <p className="text-slate-500 mt-1">История проверок и статус рассмотрения</p>
        </div>
        <Link href="/apply">
          <Button className="gap-2 shadow-primary/20">
            <Plus className="w-4 h-4" /> Новая проверка
          </Button>
        </Link>
      </div>

      <Card className="p-4 mb-6 flex flex-wrap gap-2 items-center bg-slate-50/50">
        <Filter className="w-4 h-4 text-slate-400 mr-2" />
        <span className="text-sm font-medium text-slate-600 mr-2">Фильтр:</span>
        {['', 'approved', 'partial', 'rejected', 'pending'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === status 
                ? 'bg-white text-primary shadow-sm border border-slate-200' 
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {status === '' ? 'Все' : 
             status === 'approved' ? 'Выполнены' :
             status === 'partial' ? 'Частично' :
             status === 'rejected' ? 'Отказ' : 'Ожидают'}
          </button>
        ))}
      </Card>

      {isLoading ? (
        <div className="grid gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">Ничего не найдено</h3>
          <p className="text-slate-500">У вас пока нет заявок с выбранным статусом.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {apps.map(app => (
            <Link key={app.id} href={`/applications/${app.id}`}>
              <Card className="p-6 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:text-primary transition-colors border border-slate-100">
                    <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900 group-hover:text-primary transition-colors">
                      Проверка на звание {app.rankType === 'docent' ? 'Доцента' : 'Профессора'}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      Создана: {formatDate(app.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Статус</p>
                      {app.status === 'approved' && <Badge variant="success">Выполнено</Badge>}
                      {app.status === 'partial' && <Badge variant="warning">Частично</Badge>}
                      {app.status === 'rejected' && <Badge variant="danger">Отказ</Badge>}
                      {app.status === 'pending' && <Badge variant="outline">Ожидает</Badge>}
                    </div>
                    <div className="text-right pl-4 border-l border-slate-200">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Оценка</p>
                      <p className="font-bold text-slate-900">{app.result?.score ?? 0}%</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-white" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
