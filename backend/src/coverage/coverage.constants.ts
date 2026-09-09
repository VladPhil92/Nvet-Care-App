export type LaunchMarketStatus = "ACTIVE" | "PRELAUNCH";

export interface LaunchMarketDefinition {
  code: string;
  daneCode: string;
  city: string;
  department: string;
  countryCode: "CO";
  latitude: number;
  longitude: number;
  launchRadiusKm: number;
  metroGroup?: string;
  aliases: readonly string[];
}

/**
 * Phase 14 national service-market catalog.
 *
 * The launchRadiusKm value is an operational geofence used to associate a
 * device coordinate with a launch market. It is deliberately NOT presented as
 * an administrative municipal boundary. The final booking boundary is the
 * veterinarian's own serviceRadius from their verified profile.
 *
 * New cities are added to this catalog once, while commercial activation is
 * controlled independently through NVET_ACTIVE_SERVICE_MARKETS so opening a
 * market does not require a code deployment.
 */
export const COLOMBIA_LAUNCH_MARKETS: readonly LaunchMarketDefinition[] = [
  {
    code: "cartagena",
    daneCode: "13001",
    city: "Cartagena de Indias",
    department: "Bolívar",
    countryCode: "CO",
    latitude: 10.391,
    longitude: -75.4794,
    launchRadiusKm: 35,
    aliases: [
      "cartagena",
      "cartagena de indias",
      "cartagena bolivar",
      "cartagena de indias bolivar",
    ],
  },
  {
    code: "bogota",
    daneCode: "11001",
    city: "Bogotá D.C.",
    department: "Bogotá D.C.",
    countryCode: "CO",
    latitude: 4.711,
    longitude: -74.0721,
    launchRadiusKm: 45,
    aliases: ["bogota", "bogota dc", "bogota d c", "santa fe de bogota"],
  },
  {
    code: "medellin",
    daneCode: "05001",
    city: "Medellín",
    department: "Antioquia",
    countryCode: "CO",
    latitude: 6.2442,
    longitude: -75.5812,
    launchRadiusKm: 30,
    aliases: ["medellin", "medellin antioquia"],
  },
  {
    code: "barranquilla",
    daneCode: "08001",
    city: "Barranquilla",
    department: "Atlántico",
    countryCode: "CO",
    latitude: 10.9685,
    longitude: -74.7813,
    launchRadiusKm: 30,
    aliases: ["barranquilla", "barranquilla atlantico"],
  },
  {
    code: "bucaramanga",
    daneCode: "68001",
    city: "Bucaramanga",
    department: "Santander",
    countryCode: "CO",
    latitude: 7.1193,
    longitude: -73.1227,
    launchRadiusKm: 18,
    metroGroup: "bucaramanga-metropolitana",
    aliases: ["bucaramanga", "bucaramanga santander"],
  },
  {
    code: "floridablanca",
    daneCode: "68276",
    city: "Floridablanca",
    department: "Santander",
    countryCode: "CO",
    latitude: 7.0622,
    longitude: -73.0864,
    launchRadiusKm: 14,
    metroGroup: "bucaramanga-metropolitana",
    aliases: ["floridablanca", "floridablanca santander"],
  },
  {
    code: "cali",
    daneCode: "76001",
    city: "Cali",
    department: "Valle del Cauca",
    countryCode: "CO",
    latitude: 3.4516,
    longitude: -76.532,
    launchRadiusKm: 35,
    aliases: ["cali", "santiago de cali", "cali valle del cauca"],
  },
  {
    code: "sincelejo",
    daneCode: "70001",
    city: "Sincelejo",
    department: "Sucre",
    countryCode: "CO",
    latitude: 9.3047,
    longitude: -75.3978,
    launchRadiusKm: 20,
    aliases: ["sincelejo", "sincelejo sucre"],
  },
  {
    code: "monteria",
    daneCode: "23001",
    city: "Montería",
    department: "Córdoba",
    countryCode: "CO",
    latitude: 8.748,
    longitude: -75.8814,
    launchRadiusKm: 25,
    aliases: ["monteria", "monteria cordoba"],
  },
  {
    code: "santa-marta",
    daneCode: "47001",
    city: "Santa Marta",
    department: "Magdalena",
    countryCode: "CO",
    latitude: 11.2408,
    longitude: -74.199,
    launchRadiusKm: 30,
    aliases: ["santa marta", "santa marta magdalena"],
  },
] as const;

export const DEFAULT_ACTIVE_SERVICE_MARKETS = ["13001"] as const;
export const MIN_VERIFIED_GEO_READY_VETS_PER_MARKET = 3;
