import { BadGatewayException, Injectable } from "@nestjs/common";
import type { ClientAiGuidance, VetAiCaseSupport } from "./ai.schemas";

export const CLIENT_EMERGENCY_PATTERNS: RegExp[] = [
  /no\s+(puede\s+)?respirar/i,
  /dificultad\s+(para\s+)?respirar/i,
  /respira(?:ci[oó]n)?\s+(muy\s+)?(?:dif[ií]cil|agitada)/i,
  /se\s+ahoga/i,
  /convulsi[oó]n/i,
  /inconsciente/i,
  /no\s+responde/i,
  /colaps[oó]/i,
  /sangrado\s+(muy\s+)?abundante/i,
  /hemorragia/i,
  /envenen/i,
  /intoxic/i,
  /veneno/i,
  /abdomen\s+(muy\s+)?hinchado/i,
  /arcadas\s+sin\s+vomitar/i,
  /no\s+puede\s+orinar/i,
  /atropell/i,
  /ca[ií]da\s+de\s+(gran\s+)?altura/i,
  /difficulty\s+breathing/i,
  /seizure/i,
  /unconscious/i,
  /unresponsive/i,
  /poison/i,
];

const DOSE_PATTERNS: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|mL)(?:\s*\/\s*kg)?\b/i,
  /\b\d+(?:[.,]\d+)?\s*(?:tabletas?|comprimidos?|c[aá]psulas?|gotas?)\b/i,
  /\bcada\s+\d+\s*(?:h|hrs?|horas?)\b/i,
  /\b(?:administrar|dar|aplicar|inyectar|dosificar)\b.{0,50}\b\d+(?:[.,]\d+)?\b/i,
];

@Injectable()
export class AiSafetyPolicyService {
  hasEmergencySignal(text: string): boolean {
    return CLIENT_EMERGENCY_PATTERNS.some((pattern) => pattern.test(text));
  }

  assertSafeClientOutput(result: ClientAiGuidance): void {
    this.assertNoAutonomousDose(result, "client");

    if (
      (result.urgency === "urgent" || result.urgency === "emergency") &&
      result.appointmentRecommended !== true
    ) {
      this.failClosed(
        "client",
        "high-acuity guidance must recommend veterinary evaluation",
      );
    }
  }

  assertSafeVetOutput(result: VetAiCaseSupport): void {
    this.assertNoAutonomousDose(result, "vet");
  }

  private assertNoAutonomousDose(value: unknown, surface: "client" | "vet") {
    for (const text of this.collectStrings(value)) {
      if (DOSE_PATTERNS.some((pattern) => pattern.test(text))) {
        this.failClosed(surface, "autonomous medication dose/frequency detected");
      }
    }
  }

  private collectStrings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.collectStrings(item));
    }
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      this.collectStrings(item),
    );
  }

  private failClosed(surface: "client" | "vet", reason: string): never {
    throw new BadGatewayException({
      code: "AI_SAFETY_POLICY_VIOLATION",
      message:
        "La respuesta de asistencia IA fue bloqueada por una regla de seguridad clínica.",
      surface,
      reason,
    });
  }
}
