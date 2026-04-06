import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useCreateApplication } from "@/hooks/use-applications";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { ChevronRight, ChevronLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";

const STEPS = [
  { id: 1, title: 'Учёное звание' },
  { id: 2, title: 'Опыт работы' },
  { id: 3, title: 'Публикации' },
  { id: 4, title: 'Дополнительно' }
];

export default function Apply() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const createMutation = useCreateApplication();

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      rankType: 'docent',
      academicExperienceYears: '',
      pedagogicalExperienceYears: '',
      publicationsCount: '',
      textbooksCount: '',
      scopusWosCount: '',
      degree: 'candidate',
      graduatesCount: '',
    }
  });

  const rankType = watch('rankType');

  const onSubmit = async (data: any) => {
    try {
      const payload = {
        data: {
          rankType: data.rankType,
          academicExperienceYears: Number(data.academicExperienceYears),
          pedagogicalExperienceYears: Number(data.pedagogicalExperienceYears),
          publicationsCount: Number(data.publicationsCount),
          textbooksCount: Number(data.textbooksCount),
          scopusWosCount: Number(data.scopusWosCount),
          degree: data.degree,
          graduatesCount: data.graduatesCount ? Number(data.graduatesCount) : undefined,
        }
      };
      const result = await createMutation.mutateAsync(payload);
      setLocation(`/applications/${result.id}`);
    } catch (error) {
      console.error("Failed to create", error);
    }
  };

  const nextStep = () => setStep(s => Math.min(4, s + 1));
  const prevStep = () => setStep(s => Math.max(1, s - 1));

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-4">Мастер проверки критериев</h1>
          
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mt-8">
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex items-center">
                <div className={`flex flex-col items-center gap-2 ${step >= s.id ? 'text-primary' : 'text-slate-400'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
                    step > s.id ? 'bg-primary border-primary text-white' : 
                    step === s.id ? 'border-primary text-primary bg-white ring-4 ring-primary/10' : 
                    'border-slate-200 bg-slate-50'
                  }`}>
                    {step > s.id ? <CheckCircle2 className="w-6 h-6" /> : s.id}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block">{s.title}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-16 h-1 mx-2 sm:mx-4 rounded-full -mt-6 sm:-mt-6 ${step > s.id ? 'bg-primary' : 'bg-slate-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card className="p-6 md:p-10 shadow-xl shadow-slate-200/50 border-slate-200">
          <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && step < 4) e.preventDefault(); }}>
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} className="space-y-6">
                  <h2 className="text-2xl font-bold">На какое звание претендуете?</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className={`cursor-pointer rounded-xl border-2 p-6 transition-all ${rankType === 'docent' ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="radio" value="docent" className="sr-only" {...register('rankType')} />
                      <div className="font-bold text-lg mb-1">Доцент</div>
                      <p className="text-sm text-slate-500">Для преподавателей, ведущих активную учебно-методическую работу.</p>
                    </label>
                    <label className={`cursor-pointer rounded-xl border-2 p-6 transition-all ${rankType === 'professor' ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="radio" value="professor" className="sr-only" {...register('rankType')} />
                      <div className="font-bold text-lg mb-1">Профессор</div>
                      <p className="text-sm text-slate-500">Высшее звание, требующее подготовки аспирантов и докторской степени.</p>
                    </label>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} className="space-y-6">
                  <h2 className="text-2xl font-bold">Ваш опыт работы</h2>
                  <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-sm flex gap-3 items-start border border-blue-100">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
                    <p>Указывайте стаж в полных годах. Научно-педагогический стаж включает время работы в вузах и научных организациях.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Общий научно-педагогический стаж (лет)</Label>
                      <Input type="number" min="0" placeholder="Например: 10" required {...register('academicExperienceYears')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Педагогический стаж по специальности (лет)</Label>
                      <Input type="number" min="0" placeholder="Например: 5" required {...register('pedagogicalExperienceYears')} />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} className="space-y-6">
                  <h2 className="text-2xl font-bold">Публикационная активность</h2>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Количество опубликованных учебных изданий и научных трудов</Label>
                      <Input type="number" min="0" placeholder="Всего трудов" required {...register('publicationsCount')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Из них учебных изданий (пособий)</Label>
                      <Input type="number" min="0" required {...register('textbooksCount')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Публикации в Scopus / Web of Science (или белый список ВАК)</Label>
                      <Input type="number" min="0" required {...register('scopusWosCount')} />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step4" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} className="space-y-6">
                  <h2 className="text-2xl font-bold">Дополнительные требования</h2>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Учёная степень</Label>
                      <Select required {...register('degree')}>
                        <option value="none">Без степени</option>
                        <option value="candidate">Кандидат наук</option>
                        <option value="doctor">Доктор наук</option>
                      </Select>
                    </div>
                    {rankType === 'professor' && (
                      <div className="space-y-2">
                        <Label>Подготовлено лиц с учёными степенями (защитившихся аспирантов)</Label>
                        <Input type="number" min="0" required {...register('graduatesCount')} />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between mt-10 pt-6 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1}>
                <ChevronLeft className="w-5 h-5 mr-2" /> Назад
              </Button>
              {step < 4 ? (
                <Button type="button" onClick={nextStep}>
                  Далее <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              ) : (
                <Button type="submit" isLoading={createMutation.isPending} className="bg-success hover:bg-success/90 shadow-success/20">
                  <CheckCircle2 className="w-5 h-5 mr-2" /> Завершить и Проверить
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
