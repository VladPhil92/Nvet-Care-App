# =============================================================
# scripts/push-to-github.ps1
# =============================================================
# Conecta el repo local con un remote de GitHub y hace push.
# Requiere: git instalado (verificado por el script).
#
# Uso:
#   .\scripts\push-to-github.ps1 -RepoUrl "https://github.com/USER/Nvet-Care-Platform.git"
#
# La primera vez que hagas push, Git Credential Manager abrirá
# un popup en el navegador para autenticarte con tu cuenta GitHub.
# =============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "URL https o ssh del repo GitHub")]
    [string]$RepoUrl,

    [Parameter(Mandatory = $false)]
    [string]$Branch = "main",

    [Parameter(Mandatory = $false)]
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Refrescar PATH para asegurar que git esté disponible
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

# Validar git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git no está instalado. Ejecuta primero: winget install --id Git.Git -e"
    exit 1
}

# Validar URL
if ($RepoUrl -notmatch '^(https://|git@)') {
    Write-Error "URL inválida. Esperaba formato https://github.com/USER/REPO.git o git@github.com:USER/REPO.git"
    exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    Write-Host "📂 Directorio: $projectRoot" -ForegroundColor Cyan

    # Verificar que es repo git
    if (-not (Test-Path ".git")) {
        Write-Error "No es un repo git. Ejecuta: git init -b main"
        exit 1
    }

    # Asegurar que estamos en la rama destino
    $currentBranch = git rev-parse --abbrev-ref HEAD
    if ($currentBranch -ne $Branch) {
        Write-Warning "Estás en '$currentBranch'. Cambiando a '$Branch'..."
        git checkout -B $Branch
    }

    # Si ya hay un remote 'origin', verificar que coincida
    $existingOrigin = git remote get-url origin 2>$null
    if ($existingOrigin) {
        if ($existingOrigin -ne $RepoUrl) {
            if ($Force) {
                Write-Warning "Reemplazando remote origin: $existingOrigin → $RepoUrl"
                git remote set-url origin $RepoUrl
            } else {
                Write-Error "Remote 'origin' ya existe ($existingOrigin) y no coincide. Usa -Force para reemplazar."
                exit 1
            }
        } else {
            Write-Host "✓ Remote 'origin' ya configurado correctamente" -ForegroundColor Green
        }
    } else {
        Write-Host "➕ Agregando remote origin → $RepoUrl" -ForegroundColor Cyan
        git remote add origin $RepoUrl
    }

    # Verificar que hay commits locales
    $hasCommits = git rev-parse --verify HEAD 2>$null
    if (-not $hasCommits) {
        Write-Error "No hay commits locales. Ejecuta: git add . && git commit -m 'initial'"
        exit 1
    }

    # Push
    Write-Host ""
    Write-Host "⬆️  Push a origin/$Branch ..." -ForegroundColor Cyan
    Write-Host "    (la primera vez se abrirá el navegador para autenticación)" -ForegroundColor Gray

    $pushArgs = @('push', '-u', 'origin', $Branch)
    if ($Force) { $pushArgs += '--force-with-lease' }

    git @pushArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Push exitoso. Repo actualizado en: $RepoUrl" -ForegroundColor Green
        Write-Host ""
        Write-Host "Próximos pasos sugeridos:" -ForegroundColor Cyan
        Write-Host "  1. Configurar GitHub Actions secrets (VERCEL_TOKEN, RAILWAY_TOKEN)"
        Write-Host "  2. Habilitar Branch Protection en main (require PR + reviews)"
        Write-Host "  3. Configurar webhook de Sentry para release tracking"
    } else {
        Write-Error "Push falló. Revisa los mensajes de git arriba."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
