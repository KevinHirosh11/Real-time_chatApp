$shortcutName = "Bee Chat App.lnk"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath $shortcutName

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $projectDir "Start-ChatApp.bat"
$iconPath = Join-Path $projectDir "chat-app\public\bee.ico"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.Description = "Bee Chat App - Real Time Chat Application"
$shortcut.WorkingDirectory = $projectDir
if (Test-Path $iconPath) {
    $shortcut.IconLocation = $iconPath
}
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath" -ForegroundColor Green
Write-Host "Double-click it to launch Bee Chat App." -ForegroundColor Cyan
