import { BadGatewayException } from "@nestjs/common";
import { AiSafetyPolicyService } from "./ai-safety-policy.service";
import type { ClientAiGuidance, VetAiCaseSupport } from "./ai.schemas";

describe("AiSafetyPolicyService", () => {
  const service = new AiSafetyPolicyService();

  it.each([
    "Mi perro no puede respirar",
    "Tiene dificultad para respirar desde hace minutos",
    "Está inconsciente y no responde",
    "Acaba de tener una convulsión",
    "Hay un sangrado muy abundante",
    "Creo que comió veneno",
    "Tiene el abdomen muy hinchado y arcadas sin vomitar",
    "Mi gato no puede orinar",
    "Lo atropelló un carro",
    "My dog is having a seizure",
    "The cat is unresponsive",
  ])("detects emergency signal: %s", (question) => {
    expect(service.hasEmergencySignal(question)).toBe(true);
  });

  it.each([
    "Está comiendo un poco menos",
    "Quiero preparar preguntas para la consulta",
    "Tiene una cita de control la próxima semana",
  ])("does not over-trigger routine text: %s", (question) => {
    expect(service.hasEmergencySignal(question)).toBe(false);
  });

  const safeClient = (): ClientAiGuidance => ({
    summary: "Requiere valoración veterinaria.",
    urgency: "soon",
    redFlags: [],
    recommendedActions: ["Agenda una consulta"],
    questionsForVet: ["¿Qué cambios debo vigilar?"],
    appointmentRecommended: true,
    selfCareBoundary: "No automediques.",
    disclaimer: "Orientación informativa, no diagnóstico.",
  });

  it("fails closed when client output contains a medication dose", () => {
    const result = safeClient();
    result.recommendedActions = ["Administrar 5 mg cada 8 horas"];

    expect(() => service.assertSafeClientOutput(result)).toThrow(
      BadGatewayException,
    );
  });

  it("fails closed when urgent guidance discourages veterinary evaluation", () => {
    const result = safeClient();
    result.urgency = "urgent";
    result.appointmentRecommended = false;

    expect(() => service.assertSafeClientOutput(result)).toThrow(
      BadGatewayException,
    );
  });

  it("accepts safe high-acuity guidance that recommends evaluation", () => {
    const result = safeClient();
    result.urgency = "emergency";
    result.appointmentRecommended = true;

    expect(() => service.assertSafeClientOutput(result)).not.toThrow();
  });

  it("fails closed when vet copilot output contains an autonomous dose", () => {
    const result: VetAiCaseSupport = {
      caseSummary: "Paciente con signos gastrointestinales.",
      problemList: ["Vómito"],
      differentialConsiderations: ["Gastroenteritis"],
      missingInformation: ["Signos vitales"],
      redFlags: [],
      suggestedNextSteps: ["Dar 1 tableta cada 12 horas"],
      documentationDraft: {
        subjective: "Vómito referido por tutor.",
        objective: "No documentado",
        assessmentSupport: "Requiere valoración clínica.",
        planSupport: "Completar examen físico.",
      },
      confidence: "low",
      disclaimer: "Apoyo de decisión; no sustituye el criterio profesional.",
    };

    expect(() => service.assertSafeVetOutput(result)).toThrow(
      BadGatewayException,
    );
  });
});
