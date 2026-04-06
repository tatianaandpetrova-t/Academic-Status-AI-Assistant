import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAdminApplications, useReviewApplication } from "@/hooks/use-admin";
import { Card, Badge, Button, Select, Label } from "@/components/ui";
import { FileText, CheckCircle2, XCircle, Search, MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function ExpertPanel() {
  const { data, isLoading } = useAdminApplications('pending');
  const reviewMutation = useReviewApplication();
  const [selectedApp, setSelectedApp] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<'approved' | 'partial' | 'rejected'>('approved');

  const apps = data?.applications || [];
  const appToReview = apps.find(a => a.id === selectedApp);

  const handleReview = async () => {
    if (!selectedApp) return;
    await reviewMutation.mutateAsync({ 
      id: selectedApp, 
      data: { status, expertComment: comment } 
    });
    setSelectedApp(null);
    setComment("");
  };

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-slate-900">Панель эксперта</h1>
        <p className="text-slate-500 mt-1">Очередь заявок, требующих ручной проверки</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="font-semibold text-slate-700">Ожидают проверки: {apps.length}</span>
            <Button variant="outline" size="sm" onClick={() => {}}><Search className="w-4 h-4 mr-2" />Обновить</Button>
          </div>

          {isLoading ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}
            </div>
          ) : apps.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
              <h3 className="font-bold text-lg">Очередь пуста</h3>
              <p className="text-slate-500">Все заявки проверены. Отличная работа!</p>
            </Card>
          ) : (
            apps.map(app => (
              <Card 
                key={app.id} 
                className={`p-5 cursor-pointer transition-all ${selectedApp === app.id ? 'ring-2 ring-primary border-primary bg-blue-50/30' : 'hover:border-primary/50'}`}
                onClick={() => setSelectedApp(app.id)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">ID: {app.id}</Badge>
                      <span className="text-sm font-semibold">{app.user?.fullName}</span>
                    </div>
                    <h4 className="font-bold text-lg mb-1">
                      Звание {app.rankType === 'docent' ? 'Доцента' : 'Профессора'}
                    </h4>
                    <p className="text-sm text-slate-500">Подана: {formatDate(app.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold mb-1">Оценка ИИ</div>
                    <div className="text-2xl font-bold text-primary">{app.result?.score}%</div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div>
          {appToReview ? (
            <Card className="p-6 sticky top-24 shadow-xl border-primary/20">
              <h3 className="font-bold text-xl mb-4 border-b pb-4">Рецензирование ID: {appToReview.id}</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <span className="text-xs text-slate-500 uppercase">Стаж работы</span>
                  <div className="font-medium text-sm">{appToReview.structuredData.academicExperienceYears} / {appToReview.structuredData.pedagogicalExperienceYears} лет</div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase">Публикации</span>
                  <div className="font-medium text-sm">{appToReview.structuredData.publicationsCount} (Scopus: {appToReview.structuredData.scopusWosCount})</div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase">Оценка системы</span>
                  <div className="font-medium text-sm">
                    {appToReview.result?.status === 'approved' ? '✅ Пройдено' : '⚠️ Есть нехватки'}
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="space-y-2">
                  <Label>Вердикт эксперта</Label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                    <option value="approved">Подтвердить (Одобрено)</option>
                    <option value="partial">Частично (Требуются уточнения)</option>
                    <option value="rejected">Отклонить (Отказ)</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Комментарий для соискателя</Label>
                  <textarea 
                    className="w-full min-h-[100px] p-3 rounded-xl border-2 border-border text-sm focus:outline-none focus:border-primary"
                    placeholder="Укажите замечания или рекомендации..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleReview}
                  isLoading={reviewMutation.isPending}
                >
                  <FileText className="w-4 h-4 mr-2" /> Сохранить решение
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center bg-slate-50 border-dashed sticky top-24">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Выберите заявку из списка слева для начала рецензирования</p>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
