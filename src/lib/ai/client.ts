import { z } from "zod";
import { logAIDebug } from "@/lib/ai/debugLog";
import { getActiveApiKey, getActiveProvider } from "@/lib/ai/apiKeyStorage";
import { getModel } from "@/lib/ai/modelStorage";
import { AI_PROVIDER_CONFIG } from "@/lib/ai/providers";
import { showToast } from "@/store/toastStore";

export const CLAUDE_MODEL = getModel("claude");

export const BASE_SYSTEM = `
あなたは動画編集アシスタントです。
指示されたタスクを実行し、結果を JSON のみで返してください。
前置き・説明・コードブロック記号（\`\`\`）は一切含めないこと。
`.trim();

const DEFAULT_MAX_TOKENS = 8192;

/** モデルがコードブロックで包んだ場合や前後に説明文がある場合のフォールバック */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();

  const fullFenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fullFenced?.[1]) {
    return fullFenced[1].trim();
  }

  const openFenced = trimmed.match(/^```(?:json)?\s*([\s\S]*)$/i);
  if (openFenced?.[1] && !openFenced[1].includes("```")) {
    return openFenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let start = -1;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
  }
  if (start >= 0) {
    const open = trimmed[start];
    const close = open === "{" ? "}" : "]";
    const end = trimmed.lastIndexOf(close);
    if (end > start) {
      return trimmed.slice(start, end + 1);
    }
  }

  return trimmed;
}

export interface CallAIOptions {
  system?: string;
  maxTokens?: number;
  /** ログ用ラベル。未指定時は開発モードで "ai" になる */
  logRawResponse?: string;
}

/** @deprecated CallAIOptions を使用 */
export type CallClaudeOptions = CallAIOptions;

function validateJsonResponse<T>(
  rawText: string,
  schema: z.ZodType<T>,
  debugLabel?: string,
): T | null {
  const jsonText = extractJsonText(rawText);

  if (debugLabel) {
    logAIDebug(debugLabel, "raw response", rawText);
    if (jsonText !== rawText.trim()) {
      logAIDebug(debugLabel, "extracted JSON text", jsonText);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "不明なパースエラー";
    if (debugLabel) {
      logAIDebug(debugLabel, `JSON parse failed: ${message}`, jsonText);
    }
    showToast(
      debugLabel
        ? "AI レスポンスの JSON パースに失敗しました（詳細はターミナル / DevTools）"
        : "AI レスポンスの JSON パースに失敗しました",
      "error",
    );
    return null;
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    if (debugLabel) {
      logAIDebug(
        debugLabel,
        `schema validation failed: ${validated.error.message}`,
        JSON.stringify(parsed, null, 2),
      );
    }
    showToast(
      debugLabel
        ? `AI レスポンスの形式が不正です（詳細はターミナル / DevTools）`
        : `AI レスポンスの形式が不正です: ${validated.error.message}`,
      "error",
    );
    return null;
  }

  if (debugLabel) {
    logAIDebug(debugLabel, "parsed OK");
  }

  return validated.data;
}

async function fetchClaude(
  apiKey: string,
  userPrompt: string,
  system: string,
  maxTokens: number,
  model: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "ネットワークエラーが発生しました";
    showToast(`Claude API への接続に失敗しました: ${message}`, "error");
    return null;
  }

  if (!response.ok) {
    showToast(
      `Claude API エラー (${response.status}): ${await readErrorDetail(response)}`,
      "error",
    );
    return null;
  }

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    showToast("Claude API からテキスト応答がありませんでした", "error");
    return null;
  }
  return text;
}

async function fetchOpenAI(
  apiKey: string,
  userPrompt: string,
  system: string,
  maxTokens: number,
  model: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "ネットワークエラーが発生しました";
    showToast(`OpenAI API への接続に失敗しました: ${message}`, "error");
    return null;
  }

  if (!response.ok) {
    showToast(
      `OpenAI API エラー (${response.status}): ${await readErrorDetail(response)}`,
      "error",
    );
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    showToast("OpenAI API からテキスト応答がありませんでした", "error");
    return null;
  }
  return text;
}

async function fetchGemini(
  apiKey: string,
  userPrompt: string,
  system: string,
  maxTokens: number,
  model: string,
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "ネットワークエラーが発生しました";
    showToast(`Gemini API への接続に失敗しました: ${message}`, "error");
    return null;
  }

  if (!response.ok) {
    showToast(
      `Gemini API エラー (${response.status}): ${await readErrorDetail(response)}`,
      "error",
    );
    return null;
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    showToast("Gemini API からテキスト応答がありませんでした", "error");
    return null;
  }
  return text;
}

async function readErrorDetail(response: Response): Promise<string> {
  let detail = response.statusText;
  try {
    const errBody = (await response.json()) as {
      error?: { message?: string };
    };
    if (errBody.error?.message) {
      detail = errBody.error.message;
    }
  } catch {
    // ignore secondary parse failure
  }
  return detail;
}

/**
 * 選択中の AI プロバイダーで API を呼び出し、応答を JSON としてパースして Zod で検証する。
 * 失敗時は toast を表示し null を返す。
 */
export async function callAI<T>(
  userPrompt: string,
  schema: z.ZodType<T>,
  options?: CallAIOptions,
): Promise<T | null> {
  const provider = getActiveProvider();
  const config = AI_PROVIDER_CONFIG[provider];
  const apiKey = getActiveApiKey();

  if (!apiKey) {
    showToast(
      `${config.label} の API キーが未設定です。「AI API 設定」からキーを登録してください。`,
      "error",
    );
    return null;
  }

  const system = options?.system ?? BASE_SYSTEM;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const model = getModel(provider);
  const debugLabel =
    options?.logRawResponse ?? (import.meta.env.DEV ? "ai" : undefined);

  if (debugLabel) {
    const requestDetail = JSON.stringify(
      {
        provider,
        model,
        maxTokens,
        system,
        userPrompt,
      },
      null,
      2,
    );
    logAIDebug(debugLabel, "request", requestDetail);
  }

  let rawText: string | null;
  switch (provider) {
    case "claude":
      rawText = await fetchClaude(apiKey, userPrompt, system, maxTokens, model);
      break;
    case "openai":
      rawText = await fetchOpenAI(apiKey, userPrompt, system, maxTokens, model);
      break;
    case "gemini":
      rawText = await fetchGemini(apiKey, userPrompt, system, maxTokens, model);
      break;
  }

  if (!rawText) {
    if (debugLabel) {
      logAIDebug(debugLabel, "no text response from API");
    }
    return null;
  }

  return validateJsonResponse(rawText, schema, debugLabel);
}

/** @deprecated callAI を使用 */
export const callClaude = callAI;
