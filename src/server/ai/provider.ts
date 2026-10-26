import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "../env";
import { AiAnalysisSchema, type AiAnalysis } from "./schema";

export interface ProviderResult {
  analysis: AiAnalysis;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AiUnavailableError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export interface AiProvider {
  name: string;
  model: string;
  analyze(system: string, user: string): Promise<ProviderResult>;
}

/** USD per 1M tokens (input, output). Used for cost estimates only; verify against current vendor pricing. */
const PRICING: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "gpt-5-mini": [0.25, 2],
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [i, o] = PRICING[model] ?? [4, 20];
  return Math.round(((inputTokens * i + outputTokens * o) / 1_000_000) * 1e6) / 1e6;
}

class AnthropicProvider implements AiProvider {
  name = "anthropic";
  model: string;
  private client: Anthropic;
  constructor(apiKey: string, model: string, timeoutMs: number) {
    this.model = model;
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }
  async analyze(system: string, user: string): Promise<ProviderResult> {
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
        // Low effort: this is a bounded summarization task; keeps cost and latency down.
        output_config: { effort: "low", format: betaZodOutputFormat(AiAnalysisSchema) },
        // Server-side refusal fallback (routes by refusal category).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      } as Parameters<typeof this.client.beta.messages.parse>[0]);
      if (response.stop_reason === "refusal") throw new AiUnavailableError("Model declined the request", false);
      if (response.stop_reason === "max_tokens") throw new AiUnavailableError("Model output was truncated", true);
      const parsed = AiAnalysisSchema.safeParse(response.parsed_output);
      if (!parsed.success) throw new AiUnavailableError("Model output failed schema validation", true);
      return {
        analysis: parsed.data,
        provider: this.name,
        model: response.model ?? this.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new AiUnavailableError("AI provider rate limit", true);
      if (e instanceof Anthropic.AuthenticationError) throw new AiUnavailableError("AI provider authentication failed", false);
      if (e instanceof Anthropic.BadRequestError) throw new AiUnavailableError(`AI request rejected: ${e.message}`, false);
      if (e instanceof Anthropic.APIConnectionError) throw new AiUnavailableError("AI provider unreachable", true);
      if (e instanceof Anthropic.APIError) throw new AiUnavailableError(`AI provider error ${e.status ?? ""}`.trim(), true);
      throw new AiUnavailableError((e as Error).message, true);
    }
  }
}

/** Minimal OpenAI Chat Completions provider with JSON-schema structured output. */
class OpenAiProvider implements AiProvider {
  name = "openai";
  constructor(private apiKey: string, public model: string, private timeoutMs: number) {}
  async analyze(system: string, user: string): Promise<ProviderResult> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: z.toJSONSchema(AiAnalysisSchema) } },
      }),
    }).catch((e: Error) => {
      throw new AiUnavailableError(`AI provider unreachable: ${e.message}`, true);
    });
    if (!res.ok) throw new AiUnavailableError(`AI provider error ${res.status}`, res.status === 429 || res.status >= 500);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    let data: unknown;
    try {
      data = JSON.parse(json.choices?.[0]?.message?.content ?? "");
    } catch {
      throw new AiUnavailableError("Model output was not valid JSON", true);
    }
    const parsed = AiAnalysisSchema.safeParse(data);
    if (!parsed.success) throw new AiUnavailableError("Model output failed schema validation", true);
    return { analysis: parsed.data, provider: this.name, model: this.model, inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 };
  }
}

export function getProvider(): AiProvider | null {
  const e = env();
  if (e.AI_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY) return new AnthropicProvider(e.ANTHROPIC_API_KEY, e.AI_MODEL ?? "claude-opus-5-5", e.AI_TIMEOUT_MS);
  if (e.AI_PROVIDER === "openai" && e.OPENAI_API_KEY) return new OpenAiProvider(e.OPENAI_API_KEY, e.AI_MODEL ?? "gpt-5-mini", e.AI_TIMEOUT_MS);
  return null;
}
