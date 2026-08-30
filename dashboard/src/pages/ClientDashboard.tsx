import { T, F } from '../theme/tokens'
import { useAuthStore } from '../stores/useAuthStore'

const actions = [
  {
    title: 'Buscar veterinario',
    description: 'Encuentra profesionales disponibles cerca de ti.',
  },
  {
    title: 'Mis mascotas',
    description: 'Consulta y administra los perfiles de tus mascotas.',
  },
  {
    title: 'Mis citas',
    description: 'Revisa solicitudes, citas programadas y servicios anteriores.',
  },
  {
    title: 'Mensajes',
    description: 'Mantén la conversación con tus veterinarios en un solo lugar.',
  },
]

export default function ClientDashboard() {
  const { user, logout, isLoading } = useAuthStore()
  const displayName = user?.firstName?.trim() || 'Hola'

  return (
    <div style={{ minHeight: '100vh', background: T.canvas, color: T.ink }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '18px clamp(20px, 5vw, 72px)',
          background: T.surface,
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div>
          <div style={{ fontFamily: F.serif, fontSize: 25, fontWeight: 500 }}>Nvet Care</div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
            Cuidado veterinario cuando lo necesitas
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={isLoading}
          style={{
            border: `1px solid ${T.line}`,
            background: T.surface,
            color: T.ink,
            borderRadius: 8,
            padding: '9px 14px',
            cursor: isLoading ? 'default' : 'pointer',
            fontFamily: F.sans,
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '52px 20px 72px' }}>
        <section style={{ marginBottom: 34 }}>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: T.inkMuted,
              marginBottom: 8,
            }}
          >
            {displayName === 'Hola' ? 'Bienvenido a Nvet Care' : `Hola, ${displayName}`}
          </div>
          <h1
            style={{
              fontFamily: F.serif,
              fontSize: 'clamp(32px, 5vw, 48px)',
              lineHeight: 1.05,
              fontWeight: 500,
              margin: 0,
              maxWidth: 680,
            }}
          >
            ¿Qué necesita tu mascota hoy?
          </h1>
          <p
            style={{
              fontFamily: F.sans,
              color: T.inkMuted,
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 650,
              marginTop: 14,
            }}
          >
            Tu cuenta ya está identificada como cliente. Desde aquí podrás contratar servicios,
            gestionar tus mascotas y seguir cada atención.
          </p>
        </section>

        <section
          aria-label="Acciones de cliente"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {actions.map((action) => (
            <div
              key={action.title}
              style={{
                minHeight: 150,
                padding: 22,
                borderRadius: 12,
                border: `1px solid ${T.line}`,
                background: T.surface,
                boxShadow: '0 2px 10px rgba(13,27,42,.04)',
              }}
            >
              <div
                style={{
                  fontFamily: F.sans,
                  fontWeight: 700,
                  fontSize: 16,
                  marginBottom: 10,
                }}
              >
                {action.title}
              </div>
              <div
                style={{
                  fontFamily: F.sans,
                  color: T.inkMuted,
                  lineHeight: 1.5,
                  fontSize: 13,
                }}
              >
                {action.description}
              </div>
              <div
                style={{
                  fontFamily: F.sans,
                  color: T.inkMuted,
                  fontSize: 11,
                  marginTop: 18,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
              >
                Próximamente
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
