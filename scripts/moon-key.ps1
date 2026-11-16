# Moon: issue a verified business API key in one step. No hashing, no Vercel, no redeploy.
#
# One-time setup (once ever):
#   powershell -ExecutionPolicy Bypass -File .\moon-key.ps1 -Setup
#   It makes your admin token, saves it on this computer and copies it. Paste it into Vercel
#   (project moon-api, Settings, Environment Variables) as MOON_ADMIN_TOKEN, Sensitive, then redeploy once.
#
# Every key after that:
#   powershell -ExecutionPolicy Bypass -File .\moon-key.ps1 -Owner "Acme Studio" -Email "ops@acme.co"
#   Optional: -Plan business (default)  -PerMin 300 (default)  -Note "who asked, invoice number"
#
# Switch a key off or back on, by the name it was issued to (reads the key from its saved file) or by the key itself:
#   powershell -ExecutionPolicy Bypass -File .\moon-key.ps1 -Off "Acme Studio"
#   powershell -ExecutionPolicy Bypass -File .\moon-key.ps1 -On  "Acme Studio"
#   powershell -ExecutionPolicy Bypass -File .\moon-key.ps1 -Off moon_xxxxx

param(
  [switch]$Setup,
  [string]$Owner,
  [string]$Plan = 'business',
  [int]$PerMin = 300,
  [string]$Email,
  [string]$Note,
  [string]$Off,
  [string]$On,
  [string]$Api = 'https://api.moon369.org'
)

$ErrorActionPreference = 'Stop'
$TokenFile = Join-Path $HOME '.moon-admin-token'

function Fail($msg) { Write-Host ''; Write-Host $msg -ForegroundColor Red; exit 1 }

if ($Setup) {
  if (Test-Path $TokenFile) {
    $answer = Read-Host "An admin token is already saved at $TokenFile. Make a new one? (y/N)"
    if ($answer -ne 'y') { exit 0 }
  }
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = 'moonadmin_' + (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  Set-Content -Path $TokenFile -Value $token -NoNewline
  Set-Clipboard -Value $token
  Write-Host ''
  Write-Host 'Admin token made, saved on this computer and copied.' -ForegroundColor Green
  Write-Host ''
  Write-Host '1. Vercel > moon-api > Settings > Environment Variables > Add'
  Write-Host '   Key:   MOON_ADMIN_TOKEN'
  Write-Host '   Value: paste (Ctrl+V). Mark it Sensitive. Save.'
  Write-Host '2. Deployments > the latest one > ... > Redeploy.'
  Write-Host ''
  Write-Host 'That is the last redeploy. After it, every key is one command.'
  Write-Host 'Keep the token secret: anyone with it can issue verified keys.' -ForegroundColor Yellow
  exit 0
}

if (-not (Test-Path $TokenFile)) { Fail "No admin token on this computer yet. Run this first:  powershell -ExecutionPolicy Bypass -File .\moon-key.ps1 -Setup" }
$token = (Get-Content -Path $TokenFile -Raw).Trim()
$headers = @{ 'X-Moon-Admin' = $token }

function Call($path, $body) {
  $json = $body | ConvertTo-Json -Compress
  try {
    return Invoke-RestMethod -Method Post -Uri ($Api + $path) -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) {
      # Windows PowerShell 5.1 keeps Moon's answer in the response stream.
      try { $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch {}
    }
    if (-not $detail) { $detail = $_.Exception.Message }
    if ($detail -match 'unknown_key') { Fail 'Moon has no key like that. Check the key, or use the name it was issued to:  -Off "Acme Studio"' }
    if ($detail -match 'not_found') { Fail 'Moon does not know the admin token yet. Add MOON_ADMIN_TOKEN in Vercel (moon-api) and redeploy once.' }
    if ($detail -match 'forbidden') { Fail 'The token on this computer does not match MOON_ADMIN_TOKEN in Vercel. Paste the value of ~\.moon-admin-token into Vercel again and redeploy.' }
    Fail "Moon said: $detail"
  }
}

function SlugOf($name) { ($name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-') }
function KeyFileOf($name) { Join-Path (Join-Path $HOME 'Downloads') ("moon-key-" + (SlugOf $name) + ".txt") }

if ($Off -or $On) {
  $key = (@($Off, $On) | Where-Object { $_ } | Select-Object -First 1).Trim()
  if (-not $key.StartsWith('moon_')) {
    # A name: find the key in the file this script saved when it was issued.
    $f = KeyFileOf $key
    if (-not (Test-Path $f)) { Fail "No saved key file for `"$key`" at $f. Use the key itself:  -Off moon_xxxxx" }
    $key = ((Get-Content -Path $f) | Where-Object { $_ -match '^moon_' } | Select-Object -First 1)
    if (-not $key) { Fail "Could not find a moon_ key inside $f" }
    $key = $key.Trim()
  }
  $path = if ($Off) { '/v1/admin/keys/off' } else { '/v1/admin/keys/on' }
  $r = Call $path @{ key = $key }
  $state = if ($r.active) { 'ON' } else { 'OFF' }
  Write-Host ''
  Write-Host "Key for $($r.owner) is now $state." -ForegroundColor Green
  exit 0
}

if (-not $Owner) { Fail 'Say who the key is for:  -Owner "Acme Studio"   (add -Email "ops@acme.co" to keep a contact)' }

$body = @{ owner = $Owner; plan = $Plan; per_min = $PerMin }
if ($Email) { $body.email = $Email }
if ($Note) { $body.note = $Note }
$r = Call '/v1/admin/keys' $body

$file = KeyFileOf $Owner
@(
  "Moon API key for $($r.owner)"
  ''
  $r.key
  ''
  "Plan: $($r.plan), $($r.per_min) requests a minute, verified name: $($r.owner)"
  'Send it as the header:  Authorization: Bearer <key>'
  'Keep it secret. Moon only stores its fingerprint, so it cannot be shown again.'
  "Key hash (to switch it off later): $($r.key_hash)"
) | Set-Content -Path $file
Set-Clipboard -Value $r.key

Write-Host ''
Write-Host "Verified $($r.plan) key for $($r.owner). Works now." -ForegroundColor Green
Write-Host ''
Write-Host "  $($r.key)"
Write-Host ''
Write-Host "Copied, and saved to $file"
Write-Host 'Send it to them privately. It cannot be shown again.'
