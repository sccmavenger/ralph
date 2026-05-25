# Post Tower Planner launch announcement to MSFT Toolkit Discord #general
# Reads DISCORD_BOT_TOKEN from ../.env
$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env'
$envLines = Get-Content $envPath
$token = ($envLines | Where-Object { $_ -match '^DISCORD_BOT_TOKEN=' }) -replace '^DISCORD_BOT_TOKEN=', '' -replace '^"', '' -replace '"$', ''
if (-not $token) { throw 'DISCORD_BOT_TOKEN not found in .env' }

$channelId = '1424206599525892301'  # MSFT Toolkit #general
# Discord REQUIRES a User-Agent header on bot requests — omitting it returns 403/40333.
$headers = @{
  Authorization = "Bot $token"
  'User-Agent'  = 'MSFCompanion (https://themsftoolkit.com, 1.0)'
}

# Verify channel access
Write-Host "Verifying channel access..." -ForegroundColor Cyan
try {
  $channel = Invoke-RestMethod -Uri "https://discord.com/api/v10/channels/$channelId" -Headers $headers
  Write-Host "  OK -> #$($channel.name) in guild $($channel.guild_id) (type=$($channel.type))" -ForegroundColor Green
} catch {
  throw "Channel access failed: $($_.Exception.Message)"
}

$content = @'
🗼 **NEW: MIGHTY Tower Planner — now live for Premium!**

Commanders, the MIGHTY Tower is here and so is your unfair advantage. The **Tower Planner** is live right now at <https://themsftoolkit.com/analyze/tower-planner> — for Premium subscribers.

**What it does:**
• **Auto-detects** your active Tower event and pulls every room's requirements
• **Pick My Teams** runs a constraint solver across your roster to find the optimal team allocation across all rooms — no more wasted heroes
• **Readiness badges** per room (✅ ready / ⚠️ marginal / ❌ short) before you commit
• **Upgrade recommendations** — "Things That Would Help You" tells you exactly which characters/gear would unlock more rooms
• **Progress tracking** — Mark as Cleared, auto-detects when the event ends, full history with comparison arrows
• **Push notifications** when a new Tower drops

Free commanders see the entry card and a teaser of room readiness — upgrade to unlock the full solver and recommendations.

━━━━━━━━━━━━━━━━━━━━━

🔮 **What's cooking next?**

We've been sketching ideas based on what y'all keep asking for — here's what's on the whiteboard:

• 📈 **Weekly Progress dashboard** — TCP / roster size / gear tier growth charts + week-over-week diff (what you unlocked, where your gold went)
• 🥚 **Orb Explorer** — search "where do I farm Zombie Iron Man shards?" and get drop rates across every orb
• ⚔️ **War Counter Intelligence** — fast, current, actionable counters when you need them most
• 💰 **Resource Bottleneck Calculator** — when will you actually hit G19 on your wishlist character, given current farming rates?

**Vote with your reactions 👇 — what do you want next?**
📈 = Weekly Progress  |  🥚 = Orb Explorer  |  ⚔️ = War Counters  |  💰 = Resource Calc
'@

Write-Host ""
Write-Host "Message length: $($content.Length) chars (limit: 2000)" -ForegroundColor Cyan
if ($content.Length -gt 2000) { throw "Message too long: $($content.Length) chars" }

Write-Host ""
Write-Host "Posting to #general..." -ForegroundColor Cyan
$body = @{ content = $content } | ConvertTo-Json -Compress
$headers['Content-Type'] = 'application/json'
$msg = Invoke-RestMethod -Uri "https://discord.com/api/v10/channels/$channelId/messages" `
  -Method Post -Headers $headers -Body $body
Write-Host "  Posted! Message ID: $($msg.id)" -ForegroundColor Green

# Add reactions for voting
$reactions = @('📈', '🥚', '⚔️', '💰')
Write-Host ""
Write-Host "Adding vote reactions..." -ForegroundColor Cyan
foreach ($emoji in $reactions) {
  $encoded = [System.Web.HttpUtility]::UrlEncode($emoji)
  try {
    Invoke-RestMethod -Uri "https://discord.com/api/v10/channels/$channelId/messages/$($msg.id)/reactions/$encoded/@me" `
      -Method Put -Headers $headers | Out-Null
    Write-Host "  + $emoji" -ForegroundColor Green
    Start-Sleep -Milliseconds 350
  } catch {
    Write-Host "  ! $emoji failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Done. Message: https://discord.com/channels/$($channel.guild_id)/$channelId/$($msg.id)" -ForegroundColor Green
