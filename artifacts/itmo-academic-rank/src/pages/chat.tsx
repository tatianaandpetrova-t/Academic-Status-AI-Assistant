import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { Layout } from "@/components/layout";
import { useChatHistory, useSendMessage, useRateMessage } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Button, Input, Card } from "@/components/ui";
import { Send, Bot, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";

const QUICK_QUESTIONS = [
  "Что входит в педагогический стаж?",
  "Как учитываются конференции?",
  "Какие требования к монографиям?",
  "Можно ли подать без степени?",
];

// Оптимистичное сообщение пользователя (пока ждём ответа сервера)
type OptimisticMessage = {
  id: string;
  message: string;
  isOptimistic: true;
};

export default function Chat() {
  const { isAdmin } = useAuth();
  const { data: history, isLoading } = useChatHistory();
  const sendMutation = useSendMessage();
  const rateMutation = useRateMessage();
  const [input, setInput] = useState("");
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<OptimisticMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, sendMutation.isPending, optimisticMessage]);

  const handleSend = async (e?: React.FormEvent, text?: string) => {
    e?.preventDefault();
    const messageText = text || input;
    if (!messageText.trim() || sendMutation.isPending) return;
    
    console.log('[CHAT] Отправляем сообщение:', messageText);
    
    // Сразу показываем сообщение пользователя (оптимистично) с принудительным рендером
    const tempId = `temp-${Date.now()}`;
    flushSync(() => {
      setOptimisticMessage({ id: tempId, message: messageText, isOptimistic: true });
    });
    setInput("");
    
    console.log('[CHAT] optimisticMessage установлено, ждём ответ...');
    
    try {
      await sendMutation.mutateAsync({ message: messageText, debug: isAdmin && debugEnabled });
      console.log('[CHAT] Ответ получен');
    } catch (err) {
      console.error('[CHAT] Ошибка:', err);
    } finally {
      console.log('[CHAT] Убираем optimisticMessage');
      setOptimisticMessage(null);
    }
  };

  // Отладка рендера
  console.log('[RENDER] history length:', history?.length, 'optimisticMessage:', optimisticMessage ? 'есть' : 'null', 'isLoading:', isLoading);
  
  return (
    <Layout>
      <div className="h-[calc(100vh-120px)] flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Заголовок чата */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">ИИ-Ассистент ИТМО</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 block"></span>
              Консультирует по нормативным документам
            </p>
          </div>
          {isAdmin && (
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={debugEnabled}
                onChange={(e) => setDebugEnabled(e.target.checked)}
              />
              Диагностика RAG/LLM
            </label>
          )}
        </div>

        {/* Область сообщений */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#F8FAFC]">
          {isLoading ? (
            <div className="flex justify-center p-10">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* Пустое состояние - показываем только когда нет сообщений и нет оптимистичного */}
              {history?.length === 0 && !optimisticMessage && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
                  <div className="w-16 h-16 bg-blue-100 text-primary rounded-2xl flex items-center justify-center mb-6">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Задайте вопрос по регламенту</h3>
                  <p className="text-slate-500 mb-8">Я знаю всё о Постановлении №1746, критериях ВАК и внутренних регламентах ИТМО.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {QUICK_QUESTIONS.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(undefined, q)}
                        className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-full text-sm hover:border-primary hover:text-primary transition-all shadow-sm hover:shadow-md"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {history?.map((msg) => (
                <div key={msg.id} className="space-y-4">
                  {/* Сообщение пользователя */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[80%] bg-primary text-white p-4 rounded-2xl rounded-tr-sm shadow-md shadow-primary/10">
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                    </div>
                  </motion.div>

                  {/* Ответ ИИ с Markdown */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] bg-white border border-slate-200 p-5 rounded-2xl rounded-tl-sm shadow-sm">
                      <div className="prose prose-sm prose-slate max-w-none text-slate-800">
                        <ReactMarkdown
                          components={{
                            h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 text-slate-900">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 text-slate-900 border-b border-slate-100 pb-1">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-slate-800">{children}</h3>,
                            p: ({ children }) => <p className="text-sm leading-relaxed mb-2 text-slate-800">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 ml-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 ml-2">{children}</ol>,
                            li: ({ children }) => <li className="text-sm text-slate-800 leading-relaxed">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                            em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
                            code: ({ children }) => <code className="bg-slate-100 text-primary px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-4 border-primary/30 pl-4 italic text-slate-600 my-2">{children}</blockquote>
                            ),
                            hr: () => <hr className="border-slate-200 my-3" />,
                          }}
                        >
                          {msg.response}
                        </ReactMarkdown>
                      </div>
                      {isAdmin && (msg as any).diagnostics && (
                        <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                          <div><b>provider:</b> {(msg as any).diagnostics.provider}</div>
                          <div><b>model:</b> {(msg as any).diagnostics.model}</div>
                          <div><b>latencyMs:</b> {(msg as any).diagnostics.latencyMs}</div>
                          <div><b>ragChunks:</b> {((msg as any).diagnostics.ragChunks ?? []).length}</div>
                        </div>
                      )}

                      {/* Оценка ответа */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-400">Был ли ответ полезен?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => rateMutation.mutate({ id: msg.id, rating: 1 })}
                            className={`p-1.5 rounded-lg transition-colors ${msg.rating === 1 ? 'bg-green-50 text-green-600' : 'text-slate-400 hover:bg-slate-100'}`}
                            title="Полезно"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => rateMutation.mutate({ id: msg.id, rating: -1 })}
                            className={`p-1.5 rounded-lg transition-colors ${msg.rating === -1 ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:bg-slate-100'}`}
                            title="Не полезно"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ))}

              {/* Оптимистичное сообщение пользователя - показываем ПОСЛЕ истории */}
              {optimisticMessage && (() => {
                console.log('[JSX] Рендерим optimisticMessage:', optimisticMessage.message);
                return (
                  <motion.div
                    key="optimistic"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.1 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[80%] bg-primary/60 text-white p-4 rounded-2xl rounded-tr-sm">
                      <p className="text-sm leading-relaxed">{optimisticMessage.message}</p>
                    </div>
                  </motion.div>
                );
              })()}

              {/* Индикатор "печатает" */}
              {sendMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm shadow-sm flex gap-2 items-center">
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Поле ввода */}
        <div className="p-4 bg-white border-t border-slate-100">
          {/* Быстрые вопросы (показываем если есть история) */}
          {(history?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_QUESTIONS.slice(0, 3).map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(undefined, q)}
                  disabled={sendMutation.isPending}
                  className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:border-primary hover:text-primary transition-all disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSend} className="relative flex items-center max-w-4xl mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Спросите о критериях, стаже или публикациях..."
              className="pr-14 rounded-full h-14 bg-slate-50 border-transparent focus-visible:border-primary shadow-inner"
              disabled={sendMutation.isPending}
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              className="absolute right-2 top-2 bottom-2 rounded-full w-10 h-10 p-0"
              isLoading={sendMutation.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-slate-400">ИИ может ошибаться. Сверяйтесь с актуальной нормативной базой.</span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
