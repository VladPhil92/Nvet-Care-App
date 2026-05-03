import { Translations } from '../types'

const enUS: Translations = {
  common: {
    loading: 'Loading…',
    error: 'Something went wrong',
    retry: 'Retry',
    cancel: 'Cancel',
    save: 'Save',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    next: 'Next',
    continue: 'Continue',
    close: 'Close',
    yes: 'Yes',
    no: 'No',
    search: 'Search',
    empty: 'No results',
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
  },

  auth: {
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to your Nvet Care account',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      forgotPassword: 'Forgot your password?',
      submit: 'Sign in',
      noAccount: "Don't have an account?",
      registerLink: 'Sign up',
      errorInvalid: 'Invalid email or password',
    },
    register: {
      title: 'Create your account',
      subtitle: 'Join Nvet Care in less than 2 minutes',
      firstNameLabel: 'First name',
      lastNameLabel: 'Last name',
      phoneLabel: 'Phone',
      submit: 'Create account',
      hasAccount: 'Already have an account?',
      loginLink: 'Sign in',
      vetNotice:
        'To enable vet mode, you will need to verify your professional credentials.',
    },
    forgotPassword: {
      title: 'Reset password',
      subtitle:
        "We'll send you an email with instructions to reset your password.",
      submit: 'Send email',
      success: 'Check your email to continue with the password reset.',
    },
    logout: 'Sign out',
    logoutConfirm: 'Are you sure you want to sign out?',
  },

  profile: {
    title: 'My profile',
    sections: {
      mode: 'Usage mode',
      account: 'My account',
      security: 'Security',
      support: 'Support',
    },
    modeClient: 'Client mode',
    modeVet: 'Vet mode',
    clientDescription: 'Find and book veterinary services',
    vetDescription: 'Offer professional services',
    becomeVet: 'Become a vet',
    becomeVetSubtitle:
      'Verify your credentials and start offering services',
    pendingVerification: 'Verification in progress',
    verifiedBadge: 'Verified vet',
    menu: {
      wallet: 'My wallet',
      notifications: 'Notifications',
      services: 'My services',
      editProfile: 'Edit profile',
      changePassword: 'Change password',
      twoFactor: 'Two-factor authentication',
      privacy: 'Privacy',
      help: 'Help & support',
      terms: 'Terms & conditions',
      about: 'About Nvet Care',
    },
  },

  appointments: {
    title: 'My appointments',
    upcoming: 'Upcoming',
    past: 'Past',
    book: 'Book appointment',
    cancel: 'Cancel appointment',
    cancelConfirm: 'Are you sure you want to cancel this appointment?',
    statusPending: 'Pending',
    statusConfirmed: 'Confirmed',
    statusInProgress: 'In progress',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
    statusDisputed: 'Disputed',
    emptyUpcoming: 'No upcoming appointments',
    emptyPast: 'No past appointments',
  },

  wallet: {
    title: 'My wallet',
    balance: 'Available balance',
    pending: 'Pending',
    topUp: 'Top up',
    withdraw: 'Withdraw',
    transactions: 'Transactions',
    filters: {
      all: 'All',
      payments: 'Payments',
      commissions: 'Commissions',
      deposits: 'Deposits',
      withdrawals: 'Withdrawals',
    },
  },

  errors: {
    network: 'No connection. Please check your internet.',
    unauthorized: 'Your session expired. Please sign in again.',
    serverError: 'Something failed on our server. Please try again.',
    validation: 'Please check the fields highlighted in red.',
  },
}

export default enUS
