import { VetTier } from "@prisma/client";

/**
 * Política comercial canónica de Nvet Care.
 *
 * Reglas:
 * - El veterinario SIEMPRE define el precio final de sus servicios.
 * - Los valores del catálogo son únicamente referencias sugeridas.
 * - La comisión depende del tier activo del veterinario, no del tipo de servicio.
 * - Los planes no limitan la cantidad de servicios ni de citas publicadas.
 */

export const CTG_TO_COP_RATE = 1_000;

export type SuggestedPriceType = "FIXED" | "FROM";

export interface SuggestedVeterinaryService {
  code: string;
  name: string;
  suggestedPriceCop: number;
  suggestedMinCop: number;
  suggestedMaxCop: number;
  priceType: SuggestedPriceType;
  description: string;
}

export const SUGGESTED_SERVICE_CATALOG: SuggestedVeterinaryService[] = [
  {
    code: "GENERAL_CONSULTATION",
    name: "Consulta general",
    suggestedPriceCop: 90_000,
    suggestedMinCop: 75_000,
    suggestedMaxCop: 120_000,
    priceType: "FIXED",
    description: "Valoración clínica general a domicilio.",
  },
  {
    code: "VACCINATION",
    name: "Vacunación",
    suggestedPriceCop: 95_000,
    suggestedMinCop: 85_000,
    suggestedMaxCop: 115_000,
    priceType: "FROM",
    description: "Precio de referencia; el valor final depende del biológico aplicado.",
  },
  {
    code: "DEWORMING",
    name: "Desparasitación",
    suggestedPriceCop: 75_000,
    suggestedMinCop: 70_000,
    suggestedMaxCop: 90_000,
    priceType: "FROM",
    description: "Precio de referencia; puede variar según peso y producto utilizado.",
  },
  {
    code: "PREVENTIVE_CHECKUP",
    name: "Revisión preventiva",
    suggestedPriceCop: 80_000,
    suggestedMinCop: 70_000,
    suggestedMaxCop: 100_000,
    priceType: "FIXED",
    description: "Control preventivo programado y recomendaciones de cuidado.",
  },
  {
    code: "HOME_URGENT_CARE",
    name: "Urgencia domiciliaria",
    suggestedPriceCop: 160_000,
    suggestedMinCop: 140_000,
    suggestedMaxCop: 200_000,
    priceType: "FROM",
    description: "Atención prioritaria domiciliaria en horario regular.",
  },
  {
    code: "HOME_URGENT_CARE_NIGHT",
    name: "Urgencia nocturna o festivo",
    suggestedPriceCop: 210_000,
    suggestedMinCop: 180_000,
    suggestedMaxCop: 260_000,
    priceType: "FROM",
    description: "Atención prioritaria nocturna, dominical o festiva.",
  },
];

export interface VetMembershipPlan {
  tier: VetTier;
  name: string;
  monthlyPriceCop: number;
  commissionPct: number;
  description: string;
  perks: string[];
}

export const VET_MEMBERSHIP_PLANS: Record<VetTier, VetMembershipPlan> = {
  [VetTier.FREE]: {
    tier: VetTier.FREE,
    name: "Free Vet",
    monthlyPriceCop: 0,
    commissionPct: 10,
    description: "Sin mensualidad. El veterinario conserva libertad total de precios.",
    perks: [
      "Servicios y citas ilimitados",
      "Perfil profesional verificado",
      "Pagos CTG, PSE y transferencia",
      "10% de comisión por transacción",
    ],
  },
  [VetTier.PRO]: {
    tier: VetTier.PRO,
    name: "VetPro",
    monthlyPriceCop: 39_900,
    commissionPct: 8,
    description: "Menor comisión y herramientas de crecimiento para la práctica.",
    perks: [
      "Servicios y citas ilimitados",
      "8% de comisión por transacción",
      "Perfil destacado",
      "Chat prioritario",
      "Reportes mensuales",
    ],
  },
  [VetTier.ELITE]: {
    tier: VetTier.ELITE,
    name: "VetElite",
    monthlyPriceCop: 79_900,
    commissionPct: 3,
    description: "Máxima visibilidad y la comisión más baja de la plataforma.",
    perks: [
      "Servicios y citas ilimitados",
      "3% de comisión por transacción",
      "Prioridad de posicionamiento",
      "Insignia Elite verificada",
      "Analytics avanzado",
      "Soporte dedicado",
      "Acceso anticipado a nuevas funciones",
    ],
  },
};

export function getMembershipPlan(tier: VetTier): VetMembershipPlan {
  return VET_MEMBERSHIP_PLANS[tier];
}

export function getCommissionRate(tier: VetTier): number {
  return getMembershipPlan(tier).commissionPct / 100;
}

export function findSuggestedService(code?: string | null) {
  if (!code) return undefined;
  return SUGGESTED_SERVICE_CATALOG.find((service) => service.code === code);
}
