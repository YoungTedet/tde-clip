# TDE Clip - instalacja na Windows (wywoływana przez Zainstaluj.bat).
# Bezpieczna do ponownego uruchomienia.
# Windows PowerShell 5.1 traktuje stderr programów jako błąd przy 'Stop' – sprawdzamy wyniki sami
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Root  = Split-Path -Parent $PSScriptRoot
$ExtId = 'klekmlpfnfmmafokghpohlkgfaeoklif'
$Modules = Join-Path $env:PROGRAMDATA 'Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules'
function Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }

Write-Host "TDE Clip - instalacja" -ForegroundColor White
Write-Host "Folder: $Root`n"

# 1. Python (64-bit), który widzi API DaVinci
$candidates = @()
try { $candidates += (& py -3 -c "import sys; print(sys.executable)" 2>$null) } catch {}
foreach ($n in 'python.exe', 'python3.exe') { $c = Get-Command $n -ErrorAction SilentlyContinue; if ($c) { $candidates += $c.Source } }
$candidates += Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
$Py = $null
foreach ($c in ($candidates | Where-Object { $_ -and (Test-Path $_) -and ($_ -notmatch 'WindowsApps') } | Select-Object -Unique)) {
  & $c -c "import sys; sys.path.append(r'$Modules'); import DaVinciResolveScript" 2>$null
  if ($LASTEXITCODE -eq 0) { $Py = $c; break }
  if (-not $Py) { $Fallback = $c }
}
if (-not $Py -and $Fallback) { $Py = $Fallback; Warn "Python nie widzi API DaVinci ($Py) - import do Media Poola może nie działać" }
if (-not $Py) {
  Warn "Nie znaleziono Pythona. Zainstaluj go (winget install Python.Python.3.12) i uruchom instalator ponownie."
  exit 1
}
Ok "Python: $Py"
$PyW = Join-Path (Split-Path $Py) 'pythonw.exe'
if (-not (Test-Path $PyW)) { $PyW = $Py }

# 2. yt-dlp i ffmpeg
$missing = @()
foreach ($t in @(@('yt-dlp', 'yt-dlp.yt-dlp'), @('ffmpeg', 'Gyan.FFmpeg'))) {
  $found = (Get-Command "$($t[0]).exe" -ErrorAction SilentlyContinue) -or (Test-Path "$env:LOCALAPPDATA\Microsoft\WinGet\Links\$($t[0]).exe") -or (Test-Path (Join-Path $Root "bin\$($t[0]).exe"))
  if ($found) { Ok "$($t[0]) jest" } else { $missing += $t[1] }
}
if ($missing.Count -gt 0) {
  $ans = Read-Host "Brakuje: $($missing -join ', '). Zainstalować przez winget? [t/N]"
  if ($ans -match '^[tTyY]') { foreach ($m in $missing) { winget install --id $m -e --accept-source-agreements --accept-package-agreements } }
  else { Warn "Bez yt-dlp i ffmpeg pobieranie nie zadziała." }
}

# 3. Konfiguracja
$cfg = @{ root = $Root; python = $Py } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $Root 'config.json'), $cfg, (New-Object Text.UTF8Encoding $false))
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null
Ok "config.json"

# 4. Pomocnik dla Chrome / Edge / Brave (przeglądarka sama uruchamia silnik)
$hostDir = Join-Path $Root 'native-host'
$bat = Join-Path $hostDir 'tde_clip_host.bat'
[IO.File]::WriteAllText($bat, "@echo off`r`n`"$Py`" -u `"%~dp0tde_clip_host.py`" %*`r`n", ([Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)))
$manifest = @{ name = 'com.tde.clip'; description = 'TDE Clip - uruchamia lokalny silnik'; path = $bat; type = 'stdio'; allowed_origins = @("chrome-extension://$ExtId/") } | ConvertTo-Json
$manPath = Join-Path $hostDir 'com.tde.clip.json'
[IO.File]::WriteAllText($manPath, $manifest, (New-Object Text.UTF8Encoding $false))
foreach ($k in 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.tde.clip',
               'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tde.clip',
               'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.tde.clip') {
  New-Item -Path $k -Force | Out-Null
  Set-ItemProperty -Path $k -Name '(default)' -Value $manPath
}
Ok "pomocnik dla Chrome, Edge i Brave"

# 5. Skrót w DaVinci: Workspace > Scripts > TDE Clip
$util = Join-Path $env:APPDATA 'Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility'
New-Item -ItemType Directory -Force -Path $util | Out-Null
$launcher = (Get-Content (Join-Path $Root 'resolve\TDE_Clip_launcher.py') -Raw -Encoding UTF8).Replace('__ROOT__', ($Root -replace '\\', '/'))
[IO.File]::WriteAllText((Join-Path $util 'TDE Clip.py'), $launcher, (New-Object Text.UTF8Encoding $false))
Ok "DaVinci: Workspace > Scripts > TDE Clip"

# 6. (opcjonalnie) Workspace > Workflow Integrations
$wi = Join-Path $env:PROGRAMDATA 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins'
$ans = Read-Host "`nDodać TDE Clip także do menu Workspace > Workflow Integrations? [t/N]"
if ($ans -match '^[tTyY]') {
  try {
    New-Item -ItemType Directory -Force -Path $wi | Out-Null
    $dst = Join-Path $wi 'com.tde.clip'
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    Copy-Item -Recurse (Join-Path $Root 'resolve\com.tde.clip') $dst
    [IO.File]::WriteAllText((Join-Path $dst 'tdeclip.json'), $cfg, (New-Object Text.UTF8Encoding $false))
    Ok "Workflow Integrations (po restarcie DaVinci)"
  } catch { Warn "Brak uprawnień - uruchom Zainstaluj.bat jako administrator, jeśli chcesz ten wpis." }
}

# 7. Start silnika
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://127.0.0.1:8770/api/status | Out-Null; $up = $true } catch { $up = $false }
if (-not $up) {
  Start-Process -FilePath $PyW -ArgumentList "`"$(Join-Path $Root 'server\clip_server.py')`"" -WorkingDirectory (Join-Path $Root 'server') -WindowStyle Hidden
  Start-Sleep -Seconds 2
}
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8770/api/status | Out-Null; Ok "silnik działa (127.0.0.1:8770)" } catch { Warn "silnik nie wystartował - zobacz data\server.log" }

Write-Host "`nOstatni krok - rozszerzenie w Chrome (albo Edge):" -ForegroundColor White
Write-Host "  1. Otwórz adres  chrome://extensions  (w Edge: edge://extensions)"
Write-Host "  2. Włącz 'Tryb dewelopera'"
Write-Host "  3. Kliknij 'Wczytaj rozpakowane' i wskaż folder:"
Write-Host "     $Root\extension"
Start-Process explorer.exe (Join-Path $Root 'extension')
Write-Host "`nGotowe. Pod filmem na YouTube pojawi się przycisk DaVinci." -ForegroundColor Green
