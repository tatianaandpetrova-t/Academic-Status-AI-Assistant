import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { useApplication } from "@/hooks/use-applications";
import { Card, Badge, Progress, Button } from "@/components/ui";
import { CheckCircle2, XCircle, AlertTriangle, FileText, ArrowLeft, Lightbulb, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";

export default function ApplicationDetail() {
  const [, params] = useRoute("/applications/:id");
  const id = params?.id ? parseInt(params.id) : null;
  const { data: app, isLoading, error } = useApplication(id);

  if (isLoading) return <Layout><div className="flex justify-center p-20"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div></Layout>;
  if (error || !app) return <Layout><div className="text-red-500 text-center p-20 font-bold">Ошибка загрузки заявки.</div></Layout>;

  const aiStatus = app.result?.status;

  const getStatusIcon = () => {
    if (aiStatus === 'approved') return <CheckCircle2 className="w-16 h-16 text-success" />;
    if (aiStatus === 'partial') return <AlertTriangle className="w-16 h-16 text-amber-500" />;
    return <XCircle className="w-16 h-16 text-destructive" />;
  };

  const getStatusText = () => {
    if (aiStatus === 'approved') return "Полное соответствие критериям";
    if (aiStatus === 'partial') return "Частичное соответствие критериям";
    return "Не соответствует критериям";
  };

  const getStatusColor = () => {
    if (aiStatus === 'approved') return "text-success bg-success/10 border-success/20";
    if (aiStatus === 'partial') return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-destructive bg-destructive/10 border-destructive/20";
  };

  const getExpertBadge = () => {
    if (app.status === 'approved') return <Badge variant="success">Одобрено экспертом</Badge>;
    if (app.status === 'rejected') return <Badge variant="danger">Отклонено экспертом</Badge>;
    if (app.status === 'partial') return <Badge variant="warning">Требует уточнения</Badge>;
    return <Badge variant="outline">Ожидает проверки эксперта</Badge>;
  };

  return (
    <Layout>
      <div className="mb-6">
        <Link href="/applications">
          <Button variant="ghost" className="px-0 text-slate-500 hover:bg-transparent hover:text-primary mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Вернуться к списку
          </Button>
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-display font-bold text-slate-900">Результат проверки</h1>
              <Badge variant="outline" className="text-sm">ID: {app.id}</Badge>
              {getExpertBadge()}
            </div>
            <p className="text-slate-500">Заявка на звание {app.rankType === 'docent' ? 'Доцента' : 'Профессора'} от {formatDate(app.createdAt)}</p>
          </div>
          <Link href="/chat">
            <Button variant="secondary" className="gap-2 shrink-0">
              <Lightbulb className="w-4 h-4 text-primary" /> Задать вопрос ИИ
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Result Card */}
          <Card className={`p-8 border-2 ${getStatusColor()}`}>
            <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
              <div className="shrink-0 bg-white p-4 rounded-full shadow-sm">
                {getStatusIcon()}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{getStatusText()}</h2>
                <div className="flex items-center gap-4 w-full">
                  <div className="flex-1">
                    <Progress value={app.result?.score || 0} className="h-3 bg-white/50" />
                  </div>
                  <span className="font-bold text-xl">{app.result?.score}%</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Criteria Breakdown */}
          <div>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Детализация по критериям
            </h3>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b">
                    <tr>
                      <th className="px-6 py-4">Критерий</th>
                      <th className="px-6 py-4 text-center">Требуется</th>
                      <th className="px-6 py-4 text-center">Фактически</th>
                      <th className="px-6 py-4 text-center">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {app.result?.criteriaBreakdown.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{c.label}</td>
                        <td className="px-6 py-4 text-center text-slate-600">{c.required}</td>
                        <td className="px-6 py-4 text-center font-bold">{c.actual}</td>
                        <td className="px-6 py-4 text-center">
                          {c.met ? (
                            <Badge variant="success" className="w-full justify-center">Выполнено</Badge>
                          ) : (
                            <Badge variant="danger" className="w-full justify-center">Не хватает {c.shortage}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {app.result?.recommendations && app.result.recommendations.length > 0 && (
            <Card className="p-6 bg-slate-900 text-white border-none shadow-xl">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-blue-400">
                <Lightbulb className="w-5 h-5" /> Рекомендации ИИ
              </h3>
              <ul className="space-y-4">
                {app.result.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3 text-slate-300 text-sm leading-relaxed">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{r}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="font-bold text-lg mb-4">Введенные данные</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Ученая степень</span>
                <span className="font-medium text-slate-900">
                  {app.structuredData.degree === 'candidate' ? 'Кандидат наук' : 
                   app.structuredData.degree === 'doctor' ? 'Доктор наук' : 
                   app.structuredData.degree === 'none' ? 'Без степени' : 
                   app.structuredData.degree}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Научно-педагог. стаж</span>
                <span className="font-medium text-slate-900">{app.structuredData.academicExperienceYears} лет</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Педагогический стаж</span>
                <span className="font-medium text-slate-900">{app.structuredData.pedagogicalExperienceYears} лет</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-slate-500">Всего публикаций</span>
                <span className="font-medium text-slate-900">{app.structuredData.publicationsCount} шт</span>
              </div>
            </div>
          </Card>
          
          {app.expertComment && (
            <Card className="p-6 border-l-4 border-l-warning bg-warning/5">
              <h3 className="font-bold text-lg mb-2">Комментарий эксперта</h3>
              <p className="text-sm text-slate-700">{app.expertComment}</p>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
