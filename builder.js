const fs = require('fs');
const path = require('path');

const EXT_DIR = path.join(__dirname, 'extensions');

function detectBrowser(ua) {
    if (!ua) return 'unknown';
    if (ua.includes('Edg/') || ua.includes('Edge/') || ua.includes('EdgA/')) return 'edge';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'opera';
    if (ua.includes('Firefox/')) return 'firefox';
    if (ua.includes('Chrome/') && !ua.includes('Edg/') && !ua.includes('EdgA/')) return 'chrome';
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'safari';
    return 'unknown';
}

function getBrowserFlag(browser) {
    const map = { edge: '--inprivate', chrome: '--incognito', opera: '--incognito', firefox: '-private-window' };
    return map[browser] || '--incognito';
}

function getBrowserExePaths(browser) {
    const la = process.env.LOCALAPPDATA || '';
    const pf86 = process.env['ProgramFiles(x86)'] || '';
    const pf = process.env.ProgramFiles || '';
    const pfW = process.env.ProgramW6432 || '';
    switch (browser) {
        case 'chrome':
            return ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                path.join(la, 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe')];
        case 'edge':
            return ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                path.join(la, 'Microsoft\\Edge\\Application\\msedge.exe')];
        case 'opera':
            return [
                path.join(la, 'Programs\\Opera GX\\opera.exe'),
                path.join(la, 'Programs\\Opera\\opera.exe'),
                'C:\\Program Files\\Opera GX\\opera.exe',
                'C:\\Program Files\\Opera\\opera.exe',
                'C:\\Program Files (x86)\\Opera GX\\opera.exe',
                'C:\\Program Files (x86)\\Opera\\opera.exe',
                path.join(la, 'Programs\\Opera GX\\launcher.exe'),
                path.join(la, 'Programs\\Opera\\launcher.exe'),
                'C:\\Program Files\\Opera GX\\launcher.exe',
                'C:\\Program Files\\Opera\\launcher.exe',
                'C:\\Program Files (x86)\\Opera GX\\launcher.exe',
                'C:\\Program Files (x86)\\Opera\\launcher.exe'
            ];
        case 'firefox':
            return ['C:\\Program Files\\Mozilla Firefox\\firefox.exe',
                'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
                path.join(pfW, 'Mozilla Firefox\\firefox.exe')];
        default:
            return ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                path.join(la, 'Google\\Chrome\\Application\\chrome.exe')];
    }
}

function getBrowserDisplayName(browser) {
    const names = { chrome: 'Google Chrome', edge: 'Microsoft Edge', firefox: 'Mozilla Firefox',
        opera: 'Opera', safari: 'Safari', unknown: 'Chromium-based Browser' };
    return names[browser] || 'Chromium-based Browser';
}

function generateLauncher(browser) {
    const flag = getBrowserFlag(browser);
    const exePaths = getBrowserExePaths(browser);
    const browserName = getBrowserDisplayName(browser);

    // Read extension files and base64-encode them
    const extDir = EXT_DIR;
    const extNames = fs.readdirSync(extDir).filter(n =>
        fs.statSync(path.join(extDir, n)).isDirectory());

    // Build a compact JSON of all extension files as base64
    const extData = {};
    for (const name of extNames) {
        extData[name] = {};
        const d = path.join(extDir, name);
        for (const f of fs.readdirSync(d)) {
            const fp = path.join(d, f);
            if (fs.statSync(fp).isFile()) {
                extData[name][f] = fs.readFileSync(fp).toString('base64');
            }
        }
    }
    const extJsonB64 = Buffer.from(JSON.stringify(extData)).toString('base64');

    if (browser === 'firefox') {
        return generateFirefoxLauncher(exePaths, flag, browserName, extJsonB64, extNames, browser);
    }
    if (browser === 'opera') {
        return generateOperaLauncher(exePaths, flag, browserName, extJsonB64, extNames, browser);
    }
    return generateChromiumLauncher(exePaths, flag, browserName, extJsonB64, extNames, browser);
}

function generateChromiumLauncher(exePaths, flag, browserName, extJsonB64, extNames, browser) {
    const psCode = [
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host "  codetantra-copypaste - Extension Launcher" -ForegroundColor Cyan',
        'Write-Host "  Target: ' + browserName + '" -ForegroundColor Cyan',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host ""',
        '',
        '$workDir = "$env:TEMP\\codetantra-copypaste-$([System.IO.Path]::GetRandomFileName())"',
        '$null = New-Item -ItemType Directory -Path $workDir -Force',
        '',
        'Write-Host "[*] Extracting extensions..." -ForegroundColor Yellow',
        '',
        '$extJsonB64 = "' + extJsonB64 + '"',
        '$extBytes = [Convert]::FromBase64String($extJsonB64)',
        '$extJson = [Text.Encoding]::UTF8.GetString($extBytes)',
        '$extensions = $extJson | ConvertFrom-Json',
        '',
        'foreach ($extName in $extensions.PSObject.Properties.Name) {',
        '    $extDir = Join-Path $workDir $extName',
        '    $null = New-Item -ItemType Directory -Path $extDir -Force',
        '    $files = $extensions.$extName',
        '    foreach ($fname in $files.PSObject.Properties.Name) {',
        '        $bytes = [Convert]::FromBase64String(($files.$fname).ToString())',
        '        if ($fname -match "\\.(json|js|css|html)$") {',
        '            [IO.File]::WriteAllText((Join-Path $extDir $fname), [Text.Encoding]::UTF8.GetString($bytes))',
        '        } else {',
        '            [IO.File]::WriteAllBytes((Join-Path $extDir $fname), $bytes)',
        '        }',
        '    }',
        '    Write-Host "    [+] Extracted: $extName" -ForegroundColor Green',
        '}',
        '',
        '# Write a cleanup script to Windows Startup folder',
        '# This runs on every boot to delete any leftover temp files',
        '# (handles power outages and crashes)',
        'Write-Host "[*] Installing startup cleanup (handles power failures)..." -ForegroundColor Yellow',
        '$startupDir = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
        '$cleanupB64 = "' + Buffer.from('@echo off\r\ntitle codetantra-copypaste Cleanup\r\nfor /d %%i in ("%TEMP%\\codetantra-copypaste-*") do rd /s /q "%%i" 2>nul\r\ndel "%~f0" 2>nul').toString('base64') + '"',
        '$cleanupBytes = [Convert]::FromBase64String($cleanupB64)',
        '[IO.File]::WriteAllBytes("$startupDir\\codetantra-copypaste_cleanup.bat", $cleanupBytes)',
        'Write-Host "    [+] Startup cleanup installed" -ForegroundColor Green',
        '',
        'Write-Host "[*] Detecting browser..." -ForegroundColor Yellow',
        'function Find-Browser {',
        '    $name = "' + (browser === 'edge' ? 'msedge.exe' : 'chrome.exe') + '"',
        '    $regPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$name"',
        '    try { $reg = Get-ItemProperty -Path $regPath -ErrorAction Stop; if ($reg."(default)") { return $reg."(default)" } } catch {}',
        '    try { $cmd = Get-Command "$name" -ErrorAction Stop; return $cmd.Source } catch {}',
        '    $searchPaths = @(' + exePaths.map(p => '"' + p.replace(/\\/g, '\\\\') + '"').join(', ') + ')',
        '    foreach ($p in $searchPaths) { if (Test-Path $p) { return $p } }',
        '    return $null',
        '}',
        '$bPath = Find-Browser',
        'if (-not $bPath) {',
        '    Write-Host "[!] No supported browser found." -ForegroundColor Red',
        '    Write-Host "[!] Please install ' + browserName + '." -ForegroundColor Red',
        '    Write-Host "[!] If installed in a custom location, add it to your PATH and try again." -ForegroundColor Yellow',
        '    Read-Host "Press Enter to exit"',
        '    exit 1',
        '}',
        'Write-Host "[+] Found: $([IO.Path]::GetFileNameWithoutExtension($bPath))" -ForegroundColor Green',
        '',
        '$profileDir = Join-Path $workDir "profile"',
        '',
        '# Build comma-separated extension paths for --load-extension flag',
        '# This method does NOT require Developer Mode to be enabled (unlike CDP)',
        '# Works on college/managed computers where Developer Mode is locked off',
        '$extPathsList = @()',
        'foreach ($extName in $extensions.PSObject.Properties.Name) {',
        '    $extPathsList += Join-Path $workDir $extName',
        '}',
        '$loadExtFlag = "--load-extension=`"" + ($extPathsList -join ",") + "`""',
        '',
        '$url = "https://auth.codetantra.com/a/d.jsp?c=y"',
        '',
        '# Launch directly with --load-extension in NORMAL mode (not incognito)',
        '# Chromium blocks --load-extension in incognito/private mode for security',
        '# Normal mode ensures extensions load reliably on all computers',
        '$psArgs = "--no-first-run --user-data-dir=`"$profileDir`" $loadExtFlag $url"',
        'Write-Host "[*] Launching ' + browserName + ' with extensions..." -ForegroundColor Yellow',
        'Write-Host "[!] Normal mode (not private) - ' + browserName + ' cannot load extensions in incognito" -ForegroundColor Yellow',
        '$psi = New-Object System.Diagnostics.ProcessStartInfo',
        '$psi.FileName = $bPath',
        '$psi.Arguments = $psArgs',
        '$psi.UseShellExecute = $false',
        '$p = [System.Diagnostics.Process]::Start($psi)',
        '',
        'Write-Host ""',
        'Write-Host "[+] Extensions loaded!" -ForegroundColor Green',
        'Write-Host "[+] COPY (purple) and PASTE (green) buttons will appear." -ForegroundColor Cyan',
        'Write-Host "[!] If extensions do not appear, close Chrome and re-run." -ForegroundColor Yellow',
        'Write-Host ""',
        '',
        '# Wait for browser to close before cleaning up',
        'try { $p.WaitForExit() } catch { Start-Sleep -Seconds 10 }',
        '',
        'Write-Host "[*] Removing all temporary files..." -ForegroundColor Yellow',
        'Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue',
        'Write-Host "[+] All traces removed. You can close this window." -ForegroundColor Green',
        'Start-Sleep -Seconds 2'
    ].join('\r\n');

    const batLines = [
        '@echo off',
        'title codetantra-copypaste - Extension Launcher (' + browserName + ')',
        'powershell -ExecutionPolicy Bypass -NoProfile -Command "' +
            "$f='%~f0';$c=[IO.File]::ReadAllText($f);" +
            "$i=$c.LastIndexOf('___PS___');iex($c.Substring($i+8))" + '"',
        'if errorlevel 1 (pause)',
        'del "%~f0"',
        'exit /b',
        '___PS___',
        psCode
    ];

    return batLines.join('\r\n');
}

function generateFirefoxLauncher(exePaths, flag, browserName, extJsonB64, extNames, browser) {
    const psCode = [
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host "  codetantra-copypaste - Extension Launcher" -ForegroundColor Cyan',
        'Write-Host "  Target: ' + browserName + '" -ForegroundColor Cyan',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host ""',
        '',
        '$workDir = "$env:TEMP\\codetantra-copypaste-$([System.IO.Path]::GetRandomFileName())"',
        '$null = New-Item -ItemType Directory -Path $workDir -Force',
        '',
        'Write-Host "[*] Extracting extensions..." -ForegroundColor Yellow',
        '',
        '$extJsonB64 = "' + extJsonB64 + '"',
        '$extBytes = [Convert]::FromBase64String($extJsonB64)',
        '$extJson = [Text.Encoding]::UTF8.GetString($extBytes)',
        '$extensions = $extJson | ConvertFrom-Json',
        '',
        'foreach ($extName in $extensions.PSObject.Properties.Name) {',
        '    $extDir = Join-Path $workDir $extName',
        '    $null = New-Item -ItemType Directory -Path $extDir -Force',
        '    $files = $extensions.$extName',
        '    foreach ($fname in $files.PSObject.Properties.Name) {',
        '        $bytes = [Convert]::FromBase64String(($files.$fname).ToString())',
        '        if ($fname -match "\\.(json|js|css|html)$") {',
        '            [IO.File]::WriteAllText((Join-Path $extDir $fname), [Text.Encoding]::UTF8.GetString($bytes))',
        '        } else {',
        '            [IO.File]::WriteAllBytes((Join-Path $extDir $fname), $bytes)',
        '        }',
        '    }',
        '    Write-Host "    [+] Extracted: $extName" -ForegroundColor Green',
        '}',
        '',
        'Write-Host "[*] Detecting Firefox..." -ForegroundColor Yellow',
        'function Find-Browser {',
        '    try { $cmd = Get-Command "firefox.exe" -ErrorAction Stop; return $cmd.Source } catch {}',
        '    $paths = @(' + exePaths.map(p => '"' + p.replace(/\\/g, '\\\\') + '"').join(', ') + ')',
        '    foreach ($p in $paths) { if (Test-Path $p) { return $p } }',
        '    return $null',
        '}',
        '$bPath = Find-Browser',
        'if (-not $bPath) {',
        '    Write-Host "[!] Firefox not found." -ForegroundColor Red',
        '    Write-Host "[!] Please install Mozilla Firefox." -ForegroundColor Red',
        '    Write-Host "[!] If installed in a custom location, add it to your PATH and try again." -ForegroundColor Yellow',
        '    Read-Host "Press Enter to exit"',
        '    exit 1',
        '}',
        'Write-Host "[+] Found: Firefox" -ForegroundColor Green',
        '',
        '$url = "https://auth.codetantra.com/a/d.jsp?c=y"',
        '',
        '# Launch Firefox directly to CodeTantra (no CDP, no extension preloading)',
        '# Firefox does not support --load-extension or automatic unsigned extension loading',
        '$psArgs = "' + flag + ' $url"',
        'Write-Host "[*] Launching Firefox..." -ForegroundColor Yellow',
        '$psi = New-Object System.Diagnostics.ProcessStartInfo',
        '$psi.FileName = $bPath',
        '$psi.Arguments = $psArgs',
        '$psi.UseShellExecute = $false',
        '$p = [System.Diagnostics.Process]::Start($psi)',
        '',
        'Write-Host ""',
        'Write-Host "[!] Firefox requires manual extension loading." -ForegroundColor Yellow',
        'Write-Host "[!] Firefox Release does not support automatic unsigned extension installation." -ForegroundColor Yellow',
        'Write-Host ""',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host "  MANUAL STEPS:" -ForegroundColor White',
        'Write-Host "  1. In Firefox, type:  about:debugging  in the address bar" -ForegroundColor White',
        'Write-Host "  2. Click This Firefox" -ForegroundColor White',
        'Write-Host "  3. Click Load Temporary Add-on..." -ForegroundColor White',
        'Write-Host "  4. Navigate to: $workDir" -ForegroundColor White',
        'Write-Host "  5. Select ct-copy/manifest.json and click Open" -ForegroundColor White',
        'Write-Host "  6. Repeat for ct-paste/manifest.json" -ForegroundColor White',
        'Write-Host "  7. The COPY (purple) and PASTE (green) buttons will appear" -ForegroundColor White',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host ""',
        'Write-Host "[*] Temp files kept at: $workDir (needed for manual loading)" -ForegroundColor Yellow',
        'Write-Host "[+] Deleting launcher..." -ForegroundColor Gray'
    ].join('\r\n');

    const batLines = [
        '@echo off',
        'title codetantra-copypaste - Extension Launcher (Firefox)',
        'powershell -ExecutionPolicy Bypass -NoProfile -Command "' +
            "$f='%~f0';$c=[IO.File]::ReadAllText($f);" +
            "$i=$c.LastIndexOf('___PS___');iex($c.Substring($i+8))" + '"',
        'if errorlevel 1 (pause)',
        'del "%~f0"',
        'exit /b',
        '___PS___',
        psCode
    ];

    return batLines.join('\r\n');
}

function generateOperaLauncher(exePaths, flag, browserName, extJsonB64, extNames, browser) {
    // Opera GX is Chromium-based and supports --load-extension directly.
    // We do NOT use CDP (Extensions.loadUnpacked may not work on Opera).
    // We also do NOT use --incognito because --load-extension does not
    // auto-enable extensions in private mode (Chromium security restriction).
    // Instead we launch in normal mode with --load-extension + URL.
    // Paths prefer opera.exe over launcher.exe to skip splash screen.
    const psCode = [
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host "  codetantra-copypaste - Extension Launcher" -ForegroundColor Cyan',
        'Write-Host "  Target: ' + browserName + '" -ForegroundColor Cyan',
        'Write-Host "========================================" -ForegroundColor Cyan',
        'Write-Host ""',
        '',
        '$workDir = "$env:TEMP\\codetantra-copypaste-$([System.IO.Path]::GetRandomFileName())"',
        '$null = New-Item -ItemType Directory -Path $workDir -Force',
        '',
        'Write-Host "[*] Extracting extensions..." -ForegroundColor Yellow',
        '',
        '$extJsonB64 = "' + extJsonB64 + '"',
        '$extBytes = [Convert]::FromBase64String($extJsonB64)',
        '$extJson = [Text.Encoding]::UTF8.GetString($extBytes)',
        '$extensions = $extJson | ConvertFrom-Json',
        '',
        'foreach ($extName in $extensions.PSObject.Properties.Name) {',
        '    $extDir = Join-Path $workDir $extName',
        '    $null = New-Item -ItemType Directory -Path $extDir -Force',
        '    $files = $extensions.$extName',
        '    foreach ($fname in $files.PSObject.Properties.Name) {',
        '        $bytes = [Convert]::FromBase64String(($files.$fname).ToString())',
        '        if ($fname -match "\\.(json|js|css|html)$") {',
        '            [IO.File]::WriteAllText((Join-Path $extDir $fname), [Text.Encoding]::UTF8.GetString($bytes))',
        '        } else {',
        '            [IO.File]::WriteAllBytes((Join-Path $extDir $fname), $bytes)',
        '        }',
        '    }',
        '    Write-Host "    [+] Extracted: $extName" -ForegroundColor Green',
        '}',
        '',
        'Write-Host "[*] Detecting Opera..." -ForegroundColor Yellow',
        'function Find-Browser {',
        '    try { $cmd = Get-Command "opera.exe" -ErrorAction Stop; return $cmd.Source } catch {}',
        '    try { $cmd = Get-Command "launcher.exe" -ErrorAction Stop; return $cmd.Source } catch {}',
        '    $paths = @(' + exePaths.map(p => '"' + p.replace(/\\/g, '\\\\') + '"').join(', ') + ')',
        '    foreach ($p in $paths) { if (Test-Path $p) { return $p } }',
        '    return $null',
        '}',
        '$bPath = Find-Browser',
        'if (-not $bPath) {',
        '    Write-Host "[!] Opera not found." -ForegroundColor Red',
        '    Write-Host "[!] Please install Opera or Opera GX." -ForegroundColor Red',
        '    Read-Host "Press Enter to exit"',
        '    exit 1',
        '}',
        'Write-Host "[+] Found: $([IO.Path]::GetFileNameWithoutExtension($bPath))" -ForegroundColor Green',
        '',
        '$profileDir = Join-Path $workDir "profile"',
        '',
        '# Build comma-separated extension paths for --load-extension flag',
        '$extPathsList = @()',
        'foreach ($extName in $extensions.PSObject.Properties.Name) {',
        '    $extPathsList += Join-Path $workDir $extName',
        '}',
        '$loadExtFlag = "--load-extension=`"" + ($extPathsList -join ",") + "`""',
        '',
        '$url = "https://auth.codetantra.com/a/d.jsp?c=y"',
        '',
        '# Launch directly with --load-extension + URL in normal mode (no --incognito)',
        '# Opera does not support --load-extension + incognito (extensions disabled in private by default)',
        '$psArgs = "--no-first-run --user-data-dir=`"$profileDir`" $loadExtFlag $url"',
        'Write-Host "[*] Launching Opera with extensions..." -ForegroundColor Yellow',
        'Write-Host "[!] Normal mode (not private) - Opera cannot auto-load extensions in private mode" -ForegroundColor Yellow',
        '$psi = New-Object System.Diagnostics.ProcessStartInfo',
        '$psi.FileName = $bPath',
        '$psi.Arguments = $psArgs',
        '$psi.UseShellExecute = $false',
        '$p = [System.Diagnostics.Process]::Start($psi)',
        '',
        'Write-Host ""',
        'Write-Host "[+] Extensions loaded!" -ForegroundColor Green',
        'Write-Host "[+] COPY (purple) and PASTE (green) buttons will appear." -ForegroundColor Cyan',
        'Write-Host "[!] To also use in private mode, go to opera://extensions," -ForegroundColor Yellow',
        'Write-Host "[!] enable Developer Mode, and toggle Allow in incognito." -ForegroundColor Yellow',
        'Write-Host ""',
        'Write-Host "[!] Temp files kept at: $workDir (extensions loaded from disk)" -ForegroundColor Yellow',
        'Write-Host "[+] Deleting launcher..." -ForegroundColor Gray'
    ].join('\r\n');

    const batLines = [
        '@echo off',
        'title codetantra-copypaste - Extension Launcher (Opera)',
        'powershell -ExecutionPolicy Bypass -NoProfile -Command "' +
            "$f='%~f0';$c=[IO.File]::ReadAllText($f);" +
            "$i=$c.LastIndexOf('___PS___');iex($c.Substring($i+8))" + '"',
        'if errorlevel 1 (pause)',
        'del "%~f0"',
        'exit /b',
        '___PS___',
        psCode
    ];

    return batLines.join('\r\n');
}

module.exports = { detectBrowser, generateLauncher, getBrowserDisplayName };
