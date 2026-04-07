type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmProvider = "yandex" | "hf" | "local" | "all-failed";
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
          const data: any = await res.json();
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

async function generateWithYandex(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  const model = process.env.YANDEX_MODEL ?? "yandexgpt/latest";

  if (!apiKey || !folderId) {
    throw new Error("YANDEX_API_KEY and YANDEX_FOLDER_ID must be set for Yandex completion");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const apiUrl = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

  try {
    console.log(`[llm] YandexGPT request started model=${model} messages=${messages.length}`);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "Content-Type": "application/json",
        "x-folder-id": folderId,
      },
      body: JSON.stringify({
        modelUri: `gpt://${folderId}/${model}`,
        completionOptions: {
          stream: false,
          temperature: 0.2,
          maxTokens: "512",
        },
        messages: messages.map((m) => ({ role: m.role, text: m.content })),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[llm] YandexGPT request failed: ${res.status} ${text}`);
      throw new Error(`YandexGPT completion failed: ${res.status} ${text}`);
    }

    const data: any = await res.json();
    const text =
      data?.result?.alternatives?.[0]?.message?.text ??
      data?.alternatives?.[0]?.message?.text ??
      "";

    console.log("[llm] YandexGPT request finished successfully");
    return text;
  } catch (e) {
    console.warn("[llm] YandexGPT request ended with error:", (e as Error).message);
    throw e;
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

    const data: any = await res.json();
    return data?.response ?? data?.generated_text ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateChatCompletionWithOrchestrator(
  messages: ChatMessage[],
): Promise<{ response: string; provider: Exclude<LlmProvider, "all-failed"> }> {
  const providers: Array<{
    name: Exclude<LlmProvider, "all-failed">;
    enabled: boolean;
    run: () => Promise<string>;
  }> = [
    {
      name: "yandex",
      enabled: !!process.env.YANDEX_API_KEY && !!process.env.YANDEX_FOLDER_ID,
      run: () => generateWithYandex(messages),
    },
    {
      name: "hf",
      enabled: !!process.env.HF_TOKEN,
      run: () => generateWithHF(messages),
    },
    {
      name: "local",
      enabled: !!process.env.LOCAL_BASE_URL,
      run: () => generateWithLocalOllama(messages),
    },
  ];

  const enabledProviders = providers.filter((p) => p.enabled);
  if (enabledProviders.length === 0) {
    throw new Error("No LLM providers are configured");
  }

  let lastError: Error | null = null;
  for (const provider of enabledProviders) {
    try {
      console.log(`[llm] Using provider: ${provider.name}`);
      const response = await provider.run();
      if (response?.trim()) {
        return { response: response.trim(), provider: provider.name };
      }
      throw new Error(`Provider ${provider.name} returned empty response`);
    } catch (e) {
      lastError = e as Error;
      console.warn(`[llm] Provider failed (${provider.name}), fallback to next: ${lastError.message}`);
    }
  }

  throw new Error(`All providers failed: ${lastError?.message ?? "unknown error"}`);
}

export async function generateChatCompletion(messages: ChatMessage[]): Promise<string> {
  const detailed = await generateChatCompletionDetailed(messages);
  return detailed.text;
}

export async function generateChatCompletionDetailed(
  messages: ChatMessage[],
): Promise<{ text: string; diagnostics: LlmCompletionDiagnostics }> {
  try {
    const started = Date.now();
    const completion = await generateChatCompletionWithOrchestrator(messages);
    const model =
      completion.provider === "yandex"
        ? process.env.YANDEX_MODEL ?? "yandexgpt/latest"
        : completion.provider === "hf"
          ? process.env.HF_MODEL ?? "unknown"
          : process.env.LOCAL_MODEL ?? "unknown";

    return {
      text: completion.response,
      diagnostics: {
        provider: completion.provider,
        model,
        latencyMs: Date.now() - started,
      },
    };
  } catch (e) {
    console.warn("[llm] all providers failed:", (e as Error).message);
    return {
      text: "Извините, не удалось сгенерировать ответ. Попробуйте ещё раз позже.",
      diagnostics: {
        provider: "all-failed",
        model: "unknown",
        latencyMs: 0,
      },
    };
  }
}

