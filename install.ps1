$ErrorActionPreference = 'Stop'

$installDirectory = Join-Path $HOME 'rorisu-baileys-bot'

function Stop-Installation([string]$Message) {
  Write-Error "Erreur : $Message"
  exit 1
}

if (Test-Path -LiteralPath $installDirectory) {
  Stop-Installation "le dossier existe déjà : $installDirectory. Renommez-le ou supprimez-le avant de relancer l'installation."
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $wingetCommand) {
    Stop-Installation 'Node.js 20 ou supérieur est nécessaire. Installez-le depuis https://nodejs.org/ puis relancez ce script.'
  }

  Write-Host 'Installation de Node.js LTS...'
  & $wingetCommand.Source install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Stop-Installation "l'installation de Node.js a échoué (code $LASTEXITCODE)."
  }

  $nodeDirectories = @(
    (Join-Path $env:ProgramFiles 'nodejs'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs')
  )
  foreach ($nodeDirectory in $nodeDirectories) {
    if ((Test-Path -LiteralPath $nodeDirectory) -and $env:Path -notlike "*$nodeDirectory*") {
      $env:Path = "$nodeDirectory;$env:Path"
    }
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    Stop-Installation 'Node.js a été installé. Fermez puis rouvrez PowerShell et relancez cette commande.'
  }
}

$nodeVersion = & $nodeCommand.Source --version
if ($nodeVersion -notmatch '^v(?<major>\d+)\.' -or [int]$Matches.major -lt 20) {
  Stop-Installation "Node.js 20 ou supérieur est requis ; version détectée : $nodeVersion."
}

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCommand) {
  $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $wingetCommand) {
    Stop-Installation 'Git est nécessaire pour les mises à jour. Installez-le depuis https://git-scm.com/download/win puis relancez ce script.'
  }

  Write-Host 'Installation de Git...'
  & $wingetCommand.Source install --id Git.Git --exact --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Stop-Installation "l'installation de Git a échoué (code $LASTEXITCODE)."
  }

  foreach ($gitDirectory in @(
      (Join-Path $env:ProgramFiles 'Git\cmd'),
      (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd')
    )) {
    if ((Test-Path -LiteralPath (Join-Path $gitDirectory 'git.exe')) -and $env:Path -notlike "*$gitDirectory*") {
      $env:Path = "$gitDirectory;$env:Path"
    }
  }
  $gitCommand = Get-Command git -ErrorAction SilentlyContinue
  if (-not $gitCommand) {
    Stop-Installation 'Git a été installé. Fermez puis rouvrez PowerShell et relancez cette commande.'
  }
}

$ytDlpCommand = Get-Command yt-dlp -ErrorAction SilentlyContinue
if (-not $ytDlpCommand) {
  $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $wingetCommand) {
    Stop-Installation 'yt-dlp est nécessaire pour les commandes de téléchargement. Installez-le depuis https://github.com/yt-dlp/yt-dlp puis relancez ce script.'
  }

  Write-Host 'Installation de yt-dlp...'
  & $wingetCommand.Source install --id yt-dlp.yt-dlp --exact --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Stop-Installation "l'installation de yt-dlp a échoué (code $LASTEXITCODE)."
  }

  $ytDlpDirectories = @(
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links')
  )
  $wingetPackages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path -LiteralPath $wingetPackages) {
    $ytDlpDirectories += Get-ChildItem -Path (Join-Path $wingetPackages 'yt-dlp.yt-dlp_*') -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { $_.FullName }
  }
  foreach ($directory in $ytDlpDirectories) {
    if ((Test-Path -LiteralPath (Join-Path $directory 'yt-dlp.exe')) -and $env:Path -notlike "*$directory*") {
      $env:Path = "$directory;$env:Path"
    }
    if (Test-Path -LiteralPath (Join-Path $directory 'yt-dlp.exe')) {
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      if ($userPath -split ';' -notcontains $directory) {
        [Environment]::SetEnvironmentVariable(
          'Path',
          (@($directory, $userPath) -join ';').TrimEnd(';'),
          'User'
        )
      }
    }
  }
  $ytDlpCommand = Get-Command yt-dlp -ErrorAction SilentlyContinue
  if (-not $ytDlpCommand) {
    Stop-Installation 'yt-dlp a été installé. Fermez puis rouvrez PowerShell et relancez cette commande.'
  }
}

$sudoNumber = Read-Host 'Numéro WhatsApp du propriétaire (indicatif international, sans +)'
if ($sudoNumber -notmatch '^[0-9]{6,15}$') {
  Stop-Installation 'le numéro doit contenir entre 6 et 15 chiffres.'
}

Write-Host 'Clonage du dépôt Git...'
& $gitCommand.Source clone --depth 1 --branch master 'https://github.com/KyotakaMD45/rorisu-baileys-bot.git' $installDirectory
if ($LASTEXITCODE -ne 0) {
  Stop-Installation "le clonage du dépôt Git a échoué (code $LASTEXITCODE)."
}

$environmentFile = Join-Path $installDirectory 'config.env'
$environment = [System.IO.File]::ReadAllText((Join-Path $installDirectory 'config.env.example'))
$environment = [regex]::Replace($environment, '(?m)^SUDO=.*$', "SUDO=$sudoNumber")
[System.IO.File]::WriteAllText($environmentFile, $environment, [System.Text.UTF8Encoding]::new($false))

Write-Host 'Installation des dépendances...'
Push-Location $installDirectory
try {
  & npm ci
  if ($LASTEXITCODE -ne 0) {
    Stop-Installation "l'installation des dépendances a échoué (code $LASTEXITCODE)."
  }

  Write-Host 'Installation terminée. Le bot démarre ; scannez le QR code avec WhatsApp.'
  & npm start
  if ($LASTEXITCODE -ne 0) {
    Stop-Installation "le bot s'est arrêté avec le code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}
