<#
  Duo: deploy ขึ้น Cloudflare + เก็บขึ้น GitHub ในคำสั่งเดียว

  วิธีใช้ (ในโฟลเดอร์โปรเจกต์):
    npm run ship
    npm run ship -- -Message "แก้ปฏิทิน"
  หรือ:
    powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 [-Message "..."] [-SkipGit] [-RotateKeys]

  ขั้นตอน:
    1) ตรวจว่าอยู่ในโฟลเดอร์ Duo
    2) ถ้ายังไม่มีคีย์แจ้งเตือน (VAPID) ใน Cloudflare → สร้างแล้วตั้งเป็น secret ให้เอง (ไม่แสดงคีย์ส่วนตัวบนจอ)
    3) npm run deploy
    4) git add / commit / push (ถ้ามีไฟล์เปลี่ยน)
#>
param(
  [string]$Message = "",
  [switch]$SkipGit,
  [switch]$RotateKeys
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Worker = "couple-app"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Magenta }
function Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Fail($text) { Write-Host "`n[x] $text" -ForegroundColor Red; exit 1 }
function Run($exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) {
    $shown = if ($argv -contains "--text") { "$exe $($argv[0..4] -join ' ') ..." } else { "$exe $($argv -join ' ')" }
    $hint = if ($argv -contains "cf") { " (ถ้ายังไม่ได้ล็อกอิน ให้รัน: npx cf auth login)" } else { "" }
    Fail "$shown ล้มเหลว (exit $LASTEXITCODE)$hint"
  }
}

# 1) ตรวจโฟลเดอร์
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "package.json") -or -not (Select-String -Path "package.json" -Pattern '"duo-couple-app"' -Quiet)) {
  Fail "ไม่พบโปรเจกต์ Duo (package.json) ในโฟลเดอร์ $(Get-Location)"
}
Step "โปรเจกต์: $(Get-Location)"
if (-not (Test-Path "node_modules")) { Step "ติดตั้งแพ็กเกจ (ครั้งแรก)"; Run "npm" @("install") }

# 2) คีย์แจ้งเตือน (VAPID)
Step "ตรวจคีย์แจ้งเตือนใน Cloudflare"
# Windows PowerShell 5.1 มองข้อความ stderr เป็น error เมื่อ redirect → ปิด Stop ชั่วคราว
$ErrorActionPreference = "Continue"
$secretList = (& npx cf workers secrets list --worker $Worker 2>&1 | Out-String)
$ErrorActionPreference = "Stop"
$hasKeys = ($secretList -match "VAPID_PRIVATE_KEY") -and ($secretList -match "VAPID_PUBLIC_KEY")
if ($hasKeys -and -not $RotateKeys) {
  Ok "มีคีย์แล้ว ข้ามขั้นนี้"
} else {
  if ($RotateKeys) {
    Write-Host "    สร้างคีย์ใหม่ (-RotateKeys): ทุกเครื่องต้องกด 'เปิดการแจ้งเตือน' ใหม่หลัง deploy" -ForegroundColor Yellow
  }
  $json = (& node scripts/generate-vapid.mjs --json)
  if ($LASTEXITCODE -ne 0 -or -not $json) { Fail "สร้างคีย์ไม่สำเร็จ" }
  $keys = $json | ConvertFrom-Json
  Run "npx" @("cf", "workers", "secrets", "update", "VAPID_PUBLIC_KEY", "--worker", $Worker, "--text", $keys.publicKey)
  Run "npx" @("cf", "workers", "secrets", "update", "VAPID_PRIVATE_KEY", "--worker", $Worker, "--text", $keys.privateKey)
  $keys = $null; $json = $null
  Ok "ตั้งคีย์เรียบร้อย"
}

# 3) Deploy
Step "Deploy ขึ้น Cloudflare"
Run "npm" @("run", "deploy")
Ok "Deploy สำเร็จ → https://$Worker.peem.workers.dev"

# 4) GitHub
if ($SkipGit) { Step "ข้าม git (-SkipGit)"; exit 0 }
Step "เก็บขึ้น GitHub"
$changes = (& git status --porcelain)
if (-not $changes) {
  Ok "ไม่มีไฟล์เปลี่ยน ไม่ต้อง commit"
} else {
  if (-not $Message) { $Message = "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
  Run "git" @("add", "-A")
  Run "git" @("commit", "-m", $Message)
}
Run "git" @("push")
Ok "Push เรียบร้อย"

Write-Host "`nเสร็จแล้ว 🎉 เปิดแอปบนมือถือแล้วรีเฟรช 1-2 ครั้งเพื่อโหลดเวอร์ชันใหม่" -ForegroundColor Cyan
