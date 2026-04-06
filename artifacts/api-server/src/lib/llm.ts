type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmProvider = "hf" | "local" | "local-failed";
export type LlmCompletionDiagnostics = {
  provider: LlmProvider;
  model: string;
  latencyMs: number;
};

function messagesToPrompt(messages: ChatMessage[]): string {
  // Qwen Instruct обычно лучше работает с явными ролями. Делаем простой универсальный шаблон.
  return messages
    .map((m) => {
      if (m.role === "system") return `System:\n${m.content}`;
      if (m.role === "assistant") return `Assistant:\n${m.content}`;
      return `User:\n${m.content}`;
    })
    .join("\n\n");
}

async function generateWithHF(messages: ChatMessage[]): Promise<string> {
  const token = process.env.HF_TOKEN;
  const baseUrl = process.env.HF_BASE_URL ?? "https://router.huggingface.co/v1";
  const model = process.env.HF_MODEL;
  
  // Резервные модели (бесплатные или с большим лимитом)
  const fallbackModels = (process.env.HF_FALLBACK_MODELS || "meta-llama/Meta-Llama-3.1-8B-Instruct,mistralai/Mistral-7B-Instruct-v0.3").split(",");

  if (!token || !model) {
    throw new Error("HF_TOKEN and HF_MODEL must be set for HF completion");
  }

  // Преобразуем сообщения в OpenAI-совместимый формат
  const openaiMessages = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const apiUrl = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    
    // Пробуем основную модель
    const modelsToTry = [model, ...fallbackModels];
    
    for (const currentModel of modelsToTry) {
      try {
        console.log(`[llm] HF Request: POST ${apiUrl} model=${currentModel} messages=${messages.length}`);
        
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: currentModel,
            messages: openaiMessages,
            max_tokens: 512,
            temperature: 0.2,
            stream: false,
          }),
          signal: controller.signal,
        });

        console.log(`[llm] HF Response status: ${res.status} ${res.statusText}`);

        if (res.ok) {
          const data = await res.json();
          console.log(`[llm] HF Response parsed, has choices: ${!!data?.choices}`);

          if (data?.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
          }
        } else {
          const text = await res.text().catch(() => "");
          console.warn(`[llm] HF Error for ${currentModel}: ${res.status} ${text}`);
          
          // Если 402 (Payment Required) или 429 (Rate Limit) — пробуем следующую модель
          if (res.status === 402 || res.status === 429) {
            console.log(`[llm] Moving to fallback model: ${currentModel} -> next`);
            continue;
          }
          
          // Для других ошибок (401, 404 и т.д.) — выбрасываем
          throw new Error(`HF Router chat/completions failed: ${res.status} ${text}`);
        }
      } catch (e) {
        console.warn(`[llm] Exception for ${currentModel}:`, (e as Error).message);
        // Пробуем следующую модель
        continue;
      }
    }
    
    throw new Error("All HF models failed (including fallbacks)");
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithLocalOllama(messages: ChatMessage[]): Promise<string> {
  const baseUrl = process.env.LOCAL_BASE_URL;
  const model = process.env.LOCAL_MODEL;

  if (!baseUrl || !model) {
    throw new Error("LOCAL_BASE_URL and LOCAL_MODEL must be set for local fallback");
  }

  const prompt = messagesToPrompt(messages);

  const controller = new AbortController();
  // Локальная генерация может быть медленной, особенно на длинном промпте.
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 512 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Local Qwen generation failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data?.response ?? data?.generated_text ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateChatCompletion(messages: ChatMessage[]): Promise<string> {
  const detailed = await generateChatCompletionDetailed(messages);
  return detailed.text;
}

export async function generateChatCompletionDetailed(
  messages: ChatMessage[],
): Promise<{ text: string; diagnostics: LlmCompletionDiagnostics }> {
  // Primary: Hugging Face. Secondary: local Ollama/Qwen.
  try {
    const started = Date.now();
    const text = await generateWithHF(messages);
    if (text?.trim()) {
      return {
        text: text.trim(),
        diagnostics: {
          provider: "hf",
          model: process.env.HF_MODEL ?? "unknown",
          latencyMs: Date.now() - started,
        },
      };
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[llm] HF failed, falling back to local Qwen:", (e as Error).message);
  }

  try {
    const started = Date.now();
    const fallback = await generateWithLocalOllama(messages);
    if (!fallback?.trim()) {
      return {
        text: "Извините, не удалось сгенерировать ответ. Попробуйте ещё раз позже.",
        diagnostics: {
          provider: "local-failed",
          model: process.env.LOCAL_MODEL ?? "unknown",
          latencyMs: Date.now() - started,
        },
      };
    }
    return {
      text: fallback.trim(),
      diagnostics: {
        provider: "local",
        model: process.env.LOCAL_MODEL ?? "unknown",
        latencyMs: Date.now() - started,
      },
    };
  } catch (e) {
    console.warn("[llm] local generation failed:", (e as Error).message);
    return {
      text: "Извините, не удалось сгенерировать ответ. Попробуйте ещё раз позже.",
      diagnostics: {
        provider: "local-failed",
        model: process.env.LOCAL_MODEL ?? "unknown",
        latencyMs: 0,
      },
    };
  }
}

