import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

interface GenerateStructuredInput {
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
}

interface OpenAiResponseContent {
  type?: string;
  text?: string;
}

interface OpenAiResponseItem {
  content?: OpenAiResponseContent[];
}

interface OpenAiResponseBody {
  output_text?: string;
  output?: OpenAiResponseItem[];
  error?: { message?: string };
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const explicitFlag = this.config.get<string>("AI_ASSIST_ENABLED");
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    return explicitFlag !== "false" && Boolean(apiKey);
  }

  getModel(): string {
    return this.config.get<string>("OPENAI_MODEL") || "gpt-5.6-luna";
  }

  async generateStructured<T>(request: GenerateStructuredInput): Promise<T> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!this.isEnabled() || !apiKey) {
      throw new ServiceUnavailableException({
        code: "AI_ASSIST_NOT_CONFIGURED",
        message:
          "La asistencia IA todavía no está configurada en este entorno. Intenta de nuevo más tarde.",
      });
    }

    const baseUrl = (
      this.config.get<string>("OPENAI_BASE_URL") || "https://api.openai.com/v1"
    ).replace(/\/$/, "");

    const controller = new AbortController();
    const timeoutMs = Number(
      this.config.get<string>("AI_ASSIST_TIMEOUT_MS") || 15000,
    );
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const clientRequestId = `nvet-ai-${randomUUID()}`;

    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Client-Request-Id": clientRequestId,
        },
        body: JSON.stringify({
          model: this.getModel(),
          store: false,
          instructions: request.instructions,
          input: request.input,
          max_output_tokens: request.maxOutputTokens || 1200,
          text: {
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        }),
      });

      const providerRequestId = response.headers.get("x-request-id") || "missing";
      const body = (await response.json()) as OpenAiResponseBody;
      if (!response.ok) {
        this.logger.warn(
          `AI provider request failed status=${response.status} model=${this.getModel()} clientRequestId=${clientRequestId} providerRequestId=${providerRequestId}`,
        );
        throw new BadGatewayException({
          code: "AI_PROVIDER_ERROR",
          message:
            body?.error?.message ||
            "El proveedor de asistencia IA no pudo procesar la solicitud.",
        });
      }

      const outputText =
        body.output_text ||
        body.output
          ?.flatMap((item) => item.content || [])
          .find((content) => content.type === "output_text")?.text;

      if (!outputText) {
        this.logger.warn(
          `AI provider returned no structured output model=${this.getModel()} clientRequestId=${clientRequestId} providerRequestId=${providerRequestId}`,
        );
        throw new BadGatewayException({
          code: "AI_EMPTY_RESPONSE",
          message: "La asistencia IA devolvió una respuesta vacía.",
        });
      }

      try {
        return JSON.parse(outputText) as T;
      } catch {
        this.logger.warn(
          `AI provider returned invalid JSON model=${this.getModel()} clientRequestId=${clientRequestId} providerRequestId=${providerRequestId}`,
        );
        throw new BadGatewayException({
          code: "AI_INVALID_RESPONSE",
          message: "La asistencia IA devolvió una respuesta inválida.",
        });
      }
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        this.logger.warn(
          `AI provider timeout model=${this.getModel()} clientRequestId=${clientRequestId}`,
        );
        throw new ServiceUnavailableException({
          code: "AI_TIMEOUT",
          message: "La asistencia IA tardó demasiado en responder.",
        });
      }
      this.logger.error(
        `Unexpected AI provider failure clientRequestId=${clientRequestId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException({
        code: "AI_PROVIDER_UNAVAILABLE",
        message: "La asistencia IA no está disponible temporalmente.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
