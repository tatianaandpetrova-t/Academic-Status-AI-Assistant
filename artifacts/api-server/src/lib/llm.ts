type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmProvider = "yandex" | "all-failed";
export type LlmCompletionDiagnostics = {
  provider: LlmProvider;
  model: string;
  latencyMs: number;
};

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

// HF и локальная Ollama временно отключены
// async function generateWithHF(messages: ChatMessage[]): Promise<string> { ... }
// async function generateWithLocalOllama(messages: ChatMessage[]): Promise<string> { ... }

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
    // HF временно отключен
    // {
    //   name: "hf",
    //   enabled: !!process.env.HF_TOKEN,
    //   run: () => generateWithHF(messages),
    // },
    // Локальная Ollama временно отключена
    // {
    //   name: "local",
    //   enabled: !!process.env.LOCAL_BASE_URL,
    //   run: () => generateWithLocalOllama(messages),
    // },
  ];

  const enabledProviders = providers.filter((p) => p.enabled);
  if (enabledProviders.length === 0) {
    throw new Error("No LLM providers are configured (YANDEX_API_KEY and YANDEX_FOLDER_ID required)");
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
        : "unknown";

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