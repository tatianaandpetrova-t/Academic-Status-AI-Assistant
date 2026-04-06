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
  const apiUrl = process.env.HF_API_URL;
  const model = process.env.HF_MODEL; // только для логики/параметров

  if (!token || !apiUrl || !model) {
    throw new Error("HF_TOKEN, HF_API_URL, HF_MODEL must be set for HF completion");
  }

  const prompt = messagesToPrompt(messages);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    // HF Inference for text-generation-instruct: обычно ожидает { inputs: prompt, parameters: ... }
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 512,
          temperature: 0.2,
          return_full_text: false,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // HF legacy endpoint (api-inference) часто возвращает 410 и требует router.huggingface.co
      if (res.status === 410) {
        const routerBase = "https://router.huggingface.co/hf-inference";
        const routerApiUrl = `${routerBase}/models/${model}`;
        const routerRes = await fetch(routerApiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
          max_new_tokens: 512,
              temperature: 0.2,
              return_full_text: false,
            },
          }),
          signal: controller.signal,
        });
        if (!routerRes.ok) {
          const routerText = await routerRes.text().catch(() => "");
          throw new Error(`HF router completion failed: ${routerRes.status} ${routerText}`);
        }
        const routerData = await routerRes.json();
        if (Array.isArray(routerData)) {
          const first = routerData[0] as any;
          return first?.generated_text ?? first?.summary_text ?? "";
        }
        return routerData?.generated_text ?? routerData?.summary_text ?? "";
      }

      throw new Error(`HF completion failed: ${res.status} ${text}`);
    }

    const data = await res.json();

    // Типичные форматы ответа:
    // - [{ generated_text: "..." }]
    // - { generated_text: "..." }
    if (Array.isArray(data)) {
      const first = data[0] as any;
      return first?.generated_text ?? first?.summary_text ?? "";
    }

    return data?.generated_text ?? data?.summary_text ?? "";
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

