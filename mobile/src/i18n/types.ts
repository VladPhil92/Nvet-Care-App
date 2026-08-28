/**
 * Tipos del sistema de internacionalización.
 *
 * Diseño:
 *  - Cada locale exporta el mismo shape (`Translations`) → garantía de
 *    completitud verificada por TypeScript.
 *  - Las claves se acceden con notación punto: `t('auth.login.title')`
 *  - Soporta interpolación con `{name}`, `{count}`, etc.
 *  - `tn()` (helper de pluralización): `tn('appointments.count', n)` →
 *    "1 cita" | "5 citas" según `n`.
 */

export type Locale = 'es-CO' | 'en-US'

export interface Translations {
  common: {
    loading: string
    error: string
    retry: string
    cancel: string
    save: string
    confirm: string
    delete: string
    edit: string
    back: string
    next: string
    continue: string
    close: string
    yes: string
    no: string
    search: string
    empty: string
    today: string
    tomorrow: string
    yesterday: string
  }

  auth: {
    login: {
      title: string
      subtitle: string
      emailLabel: string
      passwordLabel: string
      forgotPassword: string
      submit: string
      noAccount: string
      registerLink: string
      errorInvalid: string
    }
    register: {
      title: string
      subtitle: string
      firstNameLabel: string
      lastNameLabel: string
      phoneLabel: string
      submit: string
      hasAccount: string
      loginLink: string
      vetNotice: string
    }
    forgotPassword: {
      title: string
      subtitle: string
      submit: string
      success: string
    }
    logout: string
    logoutConfirm: string
  }

  profile: {
    title: string
    sections: {
      mode: string
      account: string
      security: string
      support: string
    }
    modeClient: string
    modeVet: string
    clientDescription: string
    vetDescription: string
    becomeVet: string
    becomeVetSubtitle: string
    pendingVerification: string
    verifiedBadge: string
    menu: {
      wallet: string
      notifications: string
      services: string
      editProfile: string
      changePassword: string
      twoFactor: string
      privacy: string
      activeSessions: string
      help: string
      terms: string
      about: string
    }
  }

  appointments: {
    title: string
    upcoming: string
    past: string
    book: string
    cancel: string
    cancelConfirm: string
    statusPending: string
    statusConfirmed: string
    statusInProgress: string
    statusCompleted: string
    statusCancelled: string
    statusDisputed: string
    emptyUpcoming: string
    emptyPast: string
  }

  wallet: {
    title: string
    balance: string
    pending: string
    topUp: string
    withdraw: string
    transactions: string
    filters: {
      all: string
      payments: string
      commissions: string
      deposits: string
      withdrawals: string
    }
  }

  errors: {
    network: string
    unauthorized: string
    serverError: string
    validation: string
  }

  home: {
    greeting: string          // "Hola, {name}"
    heading: string
    searchPlaceholder: string
    quickVetHome: string
    quickTelemedicine: string
    quickEmergency: string
    quickStore: string
    heroTitle: string
    heroSubtitle: string
    heroCta: string
    appointmentsTitle: string
    appointmentsSeeAll: string
    appointmentsEmpty: string
    appointmentsSearchCta: string
    productsTitle: string
  }
}
