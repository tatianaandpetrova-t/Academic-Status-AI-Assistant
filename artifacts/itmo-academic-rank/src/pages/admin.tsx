import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import {
  useAdminStats, useAdminUsers, useAdminApplications,
  useReviewApplication, useUpdateUserRole,
  useCriteria, useUpdateCriteria,
  useRagDocuments, useUploadRagDocument, useUpdateRagDocument, useDeleteRagDocument,
} from "@/hooks/use-admin";
import { Card, Badge, Button, Label, Input, Select } from "@/components/ui";
import {
  Users, FileText, Activity, BarChart2, BookOpen,
  CheckCircle2, XCircle, Clock, Upload, Trash2, Eye, EyeOff,
  Search, RefreshCw, Database, Edit3, Save, X, AlertCircle,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatDate } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Tab = 'stats' | 'applications' | 'criteria' | 'documents' | 'users';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'stats', label: 'Статистика', icon: BarChart2 },
  { key: 'applications', label: 'Заявки', icon: FileText },
  { key: 'criteria', label: 'Критерии', icon: BookOpen },
  { key: 'documents', label: 'Документы (RAG)', icon: Database },
  { key: 'users', label: 'Пользователи', icon: Users },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning', approved: 'success', rejected: 'danger', partial: 'warning',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает', approved: 'Одобрено', rejected: 'Отклонено', partial: 'Уточнить',
};
const PIE_COLORS = ['#2D5A9E', '#22c55e', '#ef4444', '#f59e0b'];

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('stats');

  return (
    <Layout>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Администрирование</h1>
          <p className="text-slate-500 mt-1">Управление системой учёных званий ИТМО</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${tab === key ? 'bg-white shadow-sm text-primary' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setTab(key)}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'stats' && <StatsTab />}
          {tab === 'applications' && <ApplicationsTab />}
          {tab === 'criteria' && <CriteriaTab />}
          {tab === 'documents' && <DocumentsTab />}
          {tab === 'users' && <UsersTab />}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

// ─── 1. СТАТИСТИКА ────────────────────────────────────────────────────────────
function StatsTab() {
  const { data: stats, isLoading } = useAdminStats();

  const pieData = [
    { name: 'Одобрено', value: stats?.approvedCount || 0 },
    { name: 'Отклонено', value: stats?.rejectedCount || 0 },
    { name: 'На рассмотрении', value: (stats?.totalApplications || 0) - (stats?.approvedCount || 0) - (stats?.rejectedCount || 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: FileText, color: 'text-primary', bg: 'bg-blue-50', label: 'Всего заявок', value: stats?.totalApplications || 0 },
          { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Одобрено', value: stats?.approvedCount || 0 },
          { icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Пользователей', value: stats?.totalUsers || 0 },
          { icon: Activity, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Запросов к ИИ', value: stats?.totalChatMessages || 0 },
        ].map(({ icon: Icon, color, bg, label, value }) => (
          <Card key={label} className="p-6">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
            <h3 className="text-3xl font-bold mt-1">{isLoading ? '...' : value}</h3>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2">
          <h3 className="font-bold text-lg mb-6">Динамика подачи заявок (7 дней)</h3>
          <div className="h-[260px]">
            {isLoading ? (
              <div className="w-full h-full bg-slate-50 animate-pulse rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.applicationsByDay || []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="count" stroke="#2D5A9E" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-lg mb-6">Итоги рассмотрения</h3>
          <div className="h-[180px] mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {pieData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-slate-600">{item.name}</span>
                </div>
                <span className="font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── 2. ЗАЯВКИ ────────────────────────────────────────────────────────────────
function ApplicationsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [verdict, setVerdict] = useState<'approved' | 'partial' | 'rejected'>('approved');
  
  // При выборе заявки устанавливаем вердикт в соответствии с текущим статусом
  const handleSelectApp = (appId: number) => {
    const app = apps.find(a => a.id === appId);
    if (app) {
      setSelected(appId);
      // Устанавливаем вердикт в соответствии с текущим статусом
      if (app.status === 'approved') setVerdict('approved');
      else if (app.status === 'partial') setVerdict('partial');
      else if (app.status === 'rejected') setVerdict('rejected');
      else setVerdict('partial'); // По умолчанию "Требуются уточнения" для заявок в статусе "Ожидает"
      setComment(app.expertComment || '');
    }
  };

  const { data, isLoading, refetch } = useAdminApplications(statusFilter || undefined);
  const reviewMutation = useReviewApplication();
  const apps = data?.applications || [];
  const appToReview = apps.find(a => a.id === selected);

  const handleReview = async () => {
    if (!selected) return;
    await reviewMutation.mutateAsync({ id: selected, data: { status: verdict, expertComment: comment } });
    setSelected(null);
    setComment('');
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="max-w-[180px]">
            <option value="">Все статусы</option>
            <option value="pending">Ожидает</option>
            <option value="approved">Одобрено</option>
            <option value="rejected">Отклонено</option>
            <option value="partial">Уточнение</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Обновить
          </Button>
          <span className="ml-auto text-sm text-slate-500">
            {apps.length} заявок
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}
          </div>
        ) : apps.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Заявок не найдено</p>
          </Card>
        ) : apps.map(app => (
          <Card
            key={app.id}
            className={`p-4 cursor-pointer transition-all border-2 ${selected === app.id ? 'border-primary bg-blue-50/40' : 'border-transparent hover:border-slate-200'}`}
            onClick={() => handleSelectApp(app.id)}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">ID {app.id}</Badge>
                  <Badge variant={STATUS_COLORS[app.status] as any} className="text-xs">
                    {STATUS_LABELS[app.status] || app.status}
                  </Badge>
                  <span className="text-sm font-semibold truncate">{app.user?.fullName}</span>
                </div>
                <div className="text-sm text-slate-700">
                  Соискание звания <strong>{app.rankType === 'docent' ? 'Доцента' : 'Профессора'}</strong>
                </div>
                <div className="text-xs text-slate-400 mt-1">{formatDate(app.createdAt)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500 mb-0.5">Оценка ИИ</div>
                <div className={`text-2xl font-bold ${app.result?.score >= 80 ? 'text-green-600' : app.result?.score >= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                  {app.result?.score}%
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="sticky top-6 self-start">
        {appToReview ? (
          <Card className="p-5 border-primary/20 shadow-lg">
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <h3 className="font-bold">Рецензирование #{appToReview.id}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Сводка данных */}
            <div className="space-y-2.5 mb-5 text-sm">
              {[
                ['Заявитель', appToReview.user?.fullName || '-'],
                ['Звание', appToReview.rankType === 'docent' ? 'Доцент' : 'Профессор'],
                ['Стаж н.-п.', `${appToReview.structuredData?.academicExperienceYears || '-'} лет`],
                ['Стаж пед.', `${appToReview.structuredData?.pedagogicalExperienceYears || '-'} лет`],
                ['Публикации', `${appToReview.structuredData?.publicationsCount || 0} (Scopus: ${appToReview.structuredData?.scopusWosCount || 0})`],
                ['Учебники', `${appToReview.structuredData?.textbooksCount || 0}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-medium text-right max-w-[60%]">{v}</span>
                </div>
              ))}
            </div>

            {/* Критерии ИИ */}
            {appToReview.result?.criteriaBreakdown && (
              <div className="mb-5 bg-slate-50 rounded-xl p-3 space-y-1.5">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Проверка критериев</div>
                {appToReview.result.criteriaBreakdown.map((c: any) => (
                  <div key={c.key} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate mr-2">{c.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-slate-500">{c.actual}/{c.required}</span>
                      {c.met
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Вердикт эксперта</Label>
                <Select value={verdict} onChange={e => setVerdict(e.target.value as any)}>
                  <option value="approved">✅ Одобрить</option>
                  <option value="partial">⚠️ Требуются уточнения</option>
                  <option value="rejected">❌ Отклонить</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Комментарий для соискателя</Label>
                <textarea
                  className="w-full min-h-[90px] p-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-primary resize-none"
                  placeholder="Замечания или рекомендации..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleReview} isLoading={reviewMutation.isPending}>
                <Save className="w-4 h-4 mr-2" /> Сохранить решение
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center bg-slate-50 border-dashed">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Выберите заявку для рецензирования</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── 3. КРИТЕРИИ ─────────────────────────────────────────────────────────────
function CriteriaTab() {
  const { data: criteria, isLoading } = useCriteria();
  const updateMutation = useUpdateCriteria();
  const [editing, setEditing] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  const handleEdit = (crit: any) => {
    setEditing(crit.id);
    setEditValues({ ...crit.rules });
  };

  const handleSave = async (crit: any) => {
    await updateMutation.mutateAsync({ id: crit.id, rankType: crit.rankType, rules: editValues });
    setEditing(null);
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-48 bg-slate-100 animate-pulse rounded-2xl" />)}</div>;
  }

  const FIELD_LABELS: Record<string, string> = {
    minAcademicExperienceYears: 'Мин. научно-педагогический стаж (лет)',
    minPedagogicalExperienceYears: 'Мин. педагогический стаж (лет)',
    minPublicationsCount: 'Мин. публикации (рецензируемые)',
    minScopusWosCount: 'Мин. публикации Scopus/WoS',
    minTextbooksCount: 'Мин. учебные издания',
    requiresDegree: 'Требуется учёная степень',
    degreeType: 'Тип степени',
    minGraduatesSupervised: 'Мин. выпускников аспирантуры',
    publicationPeriodYears: 'Период публикаций (лет)',
    textbookPeriodYears: 'Период учебников (лет)',
  };

  return (
    <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Внутренние критерии ИТМО</strong> — параметры, используемые системой для автоматической проверки заявок.
            Они могут быть строже, чем требования Постановления Правительства РФ №1746. Изменения применяются к <strong>новым</strong> заявкам.
          </div>
        </div>

      {criteria?.map((crit: any) => (
        <Card key={crit.id} className="overflow-hidden">
          <div className="p-5 bg-slate-50 border-b flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">
                {crit.rankType === 'docent' ? '🎓 Критерии для Доцента' : '🏛️ Критерии для Профессора'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Последнее обновление: {formatDate(crit.updatedAt || crit.createdAt)}</p>
            </div>
            {editing === crit.id ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  <X className="w-4 h-4 mr-1" /> Отмена
                </Button>
                <Button size="sm" onClick={() => handleSave(crit)} isLoading={updateMutation.isPending}>
                  <Save className="w-4 h-4 mr-1" /> Сохранить
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => handleEdit(crit)}>
                <Edit3 className="w-4 h-4 mr-1.5" /> Редактировать
              </Button>
            )}
          </div>

          <div className="p-5 grid sm:grid-cols-2 gap-4">
            {Object.entries(crit.rules).map(([key, val]) => {
              const label = FIELD_LABELS[key] || key;
              const isEditing = editing === crit.id;
              const isBool = typeof val === 'boolean';
              const isStr = typeof val === 'string';

              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-slate-500">{label}</Label>
                  {isEditing ? (
                    isBool ? (
                      <Select
                        value={editValues[key] ? 'true' : 'false'}
                        onChange={e => setEditValues((prev: any) => ({ ...prev, [key]: e.target.value === 'true' }))}
                      >
                        <option value="true">Да</option>
                        <option value="false">Нет</option>
                      </Select>
                    ) : isStr ? (
                      <Input
                        value={editValues[key] || ''}
                        onChange={e => setEditValues((prev: any) => ({ ...prev, [key]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        value={editValues[key] ?? ''}
                        onChange={e => setEditValues((prev: any) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      />
                    )
                  ) : (
                    <div className="text-sm font-semibold text-slate-800 bg-slate-50 px-3 py-2 rounded-lg">
                      {isBool ? (val ? 'Да' : 'Нет') : String(val)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// Функция для декодирования имени файла (исправляет кракозябры)
function decodeFileName(fileName: string): string {
  try {
    // Пытаемся декодировать как UTF-8 если это кракозябры
    const decoded = decodeURIComponent(escape(fileName));
    return decoded || fileName;
  } catch {
    return fileName;
  }
}

// ─── 4. НОРМАТИВНЫЕ ДОКУМЕНТЫ (RAG) ──────────────────────────────────────────
function DocumentsTab() {
  const { data: docs, isLoading } = useRagDocuments();
  const uploadMutation = useUploadRagDocument();
  const updateMutation = useUpdateRagDocument();
  const deleteMutation = useDeleteRagDocument();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingContent, setEditingContent] = useState<number | null>(null);
  const [contentValue, setContentValue] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // При выборе файла сохраняем его и подставляем имя в название
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Если название пустое, подставляем имя файла
      if (!title.trim()) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setTitle(decodeFileName(nameWithoutExt));
      }
    }
  };

  // Загрузка файла по кнопке
  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) return;
    await uploadMutation.mutateAsync({ file: selectedFile, title, description });
    // Сбрасываем после успешной загрузки
    setSelectedFile(null);
    setTitle('');
    setDescription('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleToggleActive = async (doc: any) => {
    await updateMutation.mutateAsync({ id: doc.id, isActive: !doc.isActive });
  };

  const handleStartEditContent = (doc: any) => {
    setEditingContent(doc.id);
    setContentValue(doc.content || '');
  };

  const handleSaveContent = async (id: number) => {
    await updateMutation.mutateAsync({ id, content: contentValue });
    setEditingContent(null);
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="font-bold text-lg mb-1">Загрузить нормативный документ</h3>
        <p className="text-sm text-slate-500 mb-4">
          Документы с текстовым содержимым (TXT, MD) автоматически индексируются для ИИ-ассистента.
          Для PDF и DOCX введите текст вручную после загрузки.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label>Название документа *</Label>
            <Input
              placeholder="Например: Регламент ИТМО по учёным званиям"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Краткое описание</Label>
            <Input
              placeholder="Необязательно"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={handleFileSelect}
              className="hidden"
              id="rag-file-upload"
            />
            <label
              htmlFor="rag-file-upload"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed cursor-pointer transition-all text-sm font-medium border-slate-200 text-slate-600 hover:border-primary hover:text-primary hover:bg-blue-50"
            >
              <Upload className="w-4 h-4" />
              Выбрать файл
            </label>
            {selectedFile && (
              <span className="text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                📎 {decodeFileName(selectedFile.name)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={handleUpload} 
              isLoading={uploadMutation.isPending}
              disabled={!selectedFile || !title.trim()}
            >
              {/* <Upload className="w-4 h-4 mr-2" /> */}
              Загрузить документ
            </Button>
            {selectedFile && (
              <button
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-sm text-slate-500 hover:text-red-500 transition-colors"
              >
                Отменить выбор
              </button>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Загруженные документы</h3>
          <span className="text-sm text-slate-500">{docs?.length || 0} документов</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}</div>
        ) : docs?.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-600">Нет документов</p>
            <p className="text-sm text-slate-400 mt-1">Загрузите нормативные документы для улучшения ответов ИИ-ассистента</p>
          </Card>
        ) : docs?.slice().sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).map((doc: any) => (
          <Card key={doc.id} className={`overflow-hidden ${!doc.isActive ? 'opacity-60' : ''}`}>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-slate-900">{doc.title}</h4>
                    <Badge variant={doc.isActive ? 'success' : 'outline'} className="text-xs">
                      {doc.isActive ? 'Активен в чате' : 'Отключён'}
                    </Badge>
                    {doc.hasContent ? (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-700">✓ Текст готов</Badge>
                    ) : (
                      <Badge variant="warning" className="text-xs">Нет текста</Badge>
                    )}
                  </div>
                  {doc.description && <p className="text-sm text-slate-500 mt-0.5">{doc.description}</p>}
                   <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                     <span>{decodeFileName(doc.fileName)}</span>
                    {doc.hasContent && <span>{doc.contentLength.toLocaleString()} символов</span>}
                    <span>{formatDate(doc.uploadedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleActive(doc)}
                    className={`p-2 rounded-lg transition-colors ${doc.isActive ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                    title={doc.isActive ? 'Отключить от чата' : 'Включить в чат'}
                  >
                    {doc.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleStartEditContent(doc)}
                    className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors"
                    title="Редактировать текст"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(doc.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Редактор текстового содержимого */}
              {editingContent === doc.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <Label className="text-sm">Текст документа для ИИ-индексации</Label>
                  <textarea
                    className="w-full min-h-[200px] p-3 rounded-xl border-2 border-slate-200 text-sm font-mono focus:outline-none focus:border-primary resize-y"
                    placeholder="Вставьте текст нормативного документа..."
                    value={contentValue}
                    onChange={e => setContentValue(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveContent(doc.id)}
                      isLoading={updateMutation.isPending}
                    >
                      <Save className="w-4 h-4 mr-1.5" /> Сохранить текст
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingContent(null)}>
                      <X className="w-4 h-4 mr-1.5" /> Отмена
                    </Button>
                    <span className="text-xs text-slate-400 self-center ml-2">{contentValue.length.toLocaleString()} символов</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── 5. ПОЛЬЗОВАТЕЛИ ─────────────────────────────────────────────────────────
function UsersTab() {
  const { data: users, isLoading } = useAdminUsers();
  const updateRoleMutation = useUpdateUserRole();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [roleValue, setRoleValue] = useState('');

  const handleSaveRole = async (id: number) => {
    await updateRoleMutation.mutateAsync({ id, role: roleValue });
    setEditingId(null);
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-lg">Список пользователей</h3>
        <Badge variant="outline">{users?.length || 0} зарегистрировано</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b">
            <tr>
              <th className="px-5 py-4">Пользователь</th>
              <th className="px-5 py-4">Должность / Кафедра</th>
              <th className="px-5 py-4">Роль</th>
              <th className="px-5 py-4">Регистрация</th>
              <th className="px-5 py-4 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              </td></tr>
            ) : users?.map(u => (
              <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-900">{u.fullName}</div>
                  <div className="text-slate-400 text-xs">{u.email}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="text-slate-700">{u.position || '—'}</div>
                  <div className="text-slate-400 text-xs">{u.department || '—'}</div>
                </td>
                <td className="px-5 py-4">
                  {editingId === u.id ? (
                    <Select value={roleValue} onChange={e => setRoleValue(e.target.value)} className="text-xs py-1">
                      <option value="applicant">applicant</option>
                      <option value="expert">expert</option>
                      <option value="admin">admin</option>
                    </Select>
                  ) : (
                    <Badge variant={u.role === 'admin' ? 'danger' : u.role === 'expert' ? 'warning' : 'default'}>
                      {u.role}
                    </Badge>
                  )}
                </td>
                <td className="px-5 py-4 text-slate-500 text-xs">{formatDate(u.createdAt).split(',')[0]}</td>
                <td className="px-5 py-4 text-right">
                  {editingId === u.id ? (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="primary" onClick={() => handleSaveRole(u.id)} isLoading={updateRoleMutation.isPending}>
                        <Save className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost" size="sm"
                      className="text-primary hover:bg-blue-50"
                      onClick={() => { setEditingId(u.id); setRoleValue(u.role); }}
                    >
                      Изменить роль
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
