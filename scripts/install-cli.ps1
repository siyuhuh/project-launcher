$ErrorActionPreference = "Stop"

$repository = "siyuhuh/project-launcher"
$asset = "runbox-cli-x64.zip"
$installDirectory = Join-Path $env:LOCALAPPDATA "Runbox\bin"
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("runbox-cli-" + [guid]::NewGuid().ToString())
$archive = Join-Path $temporaryDirectory $asset

New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null
try {
    Invoke-WebRequest `
        -Uri "https://github.com/$repository/releases/latest/download/$asset" `
        -OutFile $archive
    Expand-Archive -Path $archive -DestinationPath $temporaryDirectory -Force

    New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
    Copy-Item (Join-Path $temporaryDirectory "p.exe") (Join-Path $installDirectory "p.exe") -Force

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathEntries = @($userPath -split ";" | Where-Object { $_ -and $_.Trim() })
    if ($pathEntries -notcontains $installDirectory) {
        $updatedPath = (($pathEntries + $installDirectory) -join ";")
        [Environment]::SetEnvironmentVariable("Path", $updatedPath, "User")
    }

    Write-Host "Installed p to $installDirectory\p.exe"
    Write-Host "Open a new PowerShell window, then run: p --help"
}
finally {
    Remove-Item $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
