const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const builder = require('./builder');

const DATA_FILE = path.join(__dirname, 'temp', 'data.json');
const PORT = process.env.PORT || 3000;
const ADMIN_USER = 'admin';
const REGISTER_KEY = 'cttools2024';

function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        const defaults = {
            password: 'admin123',
            timerEnd: null,
            logs: [],
            users: {},
            sessions: {},
            timerActive: false,
            friends: [],
            tokens: {},
            nameRestriction: { enabled: false, names: [] }
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2));
        return defaults;
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function serveFile(res, filePath, contentType) {
    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        res.end(content);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
}

function jsonResponse(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch { resolve({}); }
        });
        req.on('error', () => resolve({}));
    });
}

function getIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

const router = async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const method = req.method;
    const pathname = url.pathname;
    const ua = req.headers['user-agent'] || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // --- Serve static files ---
    if (method === 'GET' && pathname === '/') {
        return serveFile(res, path.join(__dirname, 'index.html'), 'text/html');
    }
    if (method === 'GET' && pathname === '/customize.js') {
        return serveFile(res, path.join(__dirname, 'customize.js'), 'application/javascript');
    }

    // --- Detect Browser API ---
    if (method === 'GET' && pathname === '/api/detect-browser') {
        const browser = builder.detectBrowser(ua);
        const name = builder.getBrowserDisplayName(browser);
        return jsonResponse(res, 200, { browser, name, userAgent: ua });
    }

    // --- Build & Download Extension Launcher ---
    if (method === 'GET' && pathname === '/api/build-ext') {
        const browser = builder.detectBrowser(ua);
        const browserName = builder.getBrowserDisplayName(browser);
        try {
            const launcher = builder.generateLauncher(browser);
            const filename = `codetantra-copypaste-${browser}-Launcher.bat`;
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'X-Browser-Detected': browser,
                'X-Browser-Name': browserName
            });
            return res.end(launcher);
        } catch (err) {
            return jsonResponse(res, 500, { error: 'Failed to build extension: ' + err.message });
        }
    }

    // --- SecureShare: Admin Login (password-based) ---
    if (method === 'POST' && pathname === '/api/login') {
        const body = await parseBody(req);
        const data = readData();
        if (body.password === data.password) {
            return jsonResponse(res, 200, { success: true });
        }
        return jsonResponse(res, 401, { success: false });
    }

    // --- SecureShare: Change Password ---
    if (method === 'POST' && pathname === '/api/admin/password') {
        const body = await parseBody(req);
        const data = readData();
        if (body.currentPassword !== data.password) {
            return jsonResponse(res, 403, { success: false, error: 'Current password incorrect' });
        }
        if (!body.newPassword || body.newPassword.length < 1) {
            return jsonResponse(res, 400, { success: false, error: 'Invalid new password' });
        }
        data.password = body.newPassword;
        writeData(data);
        return jsonResponse(res, 200, { success: true });
    }

    // --- Timer: Get ---
    if (method === 'GET' && (pathname === '/api/timer' || pathname === '/api/timer-status')) {
        const data = readData();
        const end = data.timerEnd;
        const remaining = end ? end - Date.now() : null;
        const active = data.timerActive || (end !== null && end > Date.now());
        return jsonResponse(res, 200, {
            end, remaining,
            active: active,
            timerEnd: end ? Math.floor(end / 1000) : 0
        });
    }

    // --- Timer: Set ---
    if (method === 'POST' && pathname === '/api/timer') {
        const body = await parseBody(req);
        const minutes = body.minutes !== undefined ? body.minutes : body.duration;
        if (minutes === undefined || minutes === null || isNaN(minutes) || minutes <= 0) {
            return jsonResponse(res, 400, { success: false, error: 'Invalid duration' });
        }
        const data = readData();
        data.timerEnd = Date.now() + minutes * 60 * 1000;
        data.timerActive = true;
        writeData(data);
        return jsonResponse(res, 200, { success: true, end: data.timerEnd });
    }

    // --- Timer: Clear/Stop ---
    if ((method === 'DELETE' && pathname === '/api/timer') ||
        (method === 'POST' && pathname === '/api/stop-timer')) {
        const data = readData();
        data.timerEnd = null;
        data.timerActive = false;
        writeData(data);
        return jsonResponse(res, 200, { success: true });
    }

    // --- Logs: Get ---
    if (method === 'GET' && pathname === '/api/logs') {
        const data = readData();
        return jsonResponse(res, 200, data.logs);
    }

    // --- Logs: Add ---
    if (method === 'POST' && pathname === '/api/logs') {
        const body = await parseBody(req);
        if (!body.name) {
            return jsonResponse(res, 400, { success: false, error: 'Missing name' });
        }
        const data = readData();
        // Check name restriction
        const r = data.nameRestriction || { enabled: false, names: [] };
        if (r.enabled && r.names.length > 0) {
            const inputName = body.name.trim().toLowerCase();
            if (!r.names.includes(inputName)) {
                return jsonResponse(res, 403, { success: false, error: 'Name not in allowed list', restricted: true });
            }
        }
        const browser = body.browser || builder.detectBrowser(ua);
        const browserName = body.browser || builder.getBrowserDisplayName(browser);
        data.logs.push({
            name: body.name,
            browser: browserName,
            userAgent: body.userAgent || ua,
            timestamp: Date.now()
        });
        writeData(data);

        if (data.friends) {
            data.friends.push({
                name: body.name,
                browser: browserName,
                time: new Date().toLocaleTimeString(),
                ts: Date.now()
            });
            writeData(data);
        }
        return jsonResponse(res, 200, { success: true });
    }

    // --- Logs: Clear ---
    if (method === 'DELETE' && pathname === '/api/logs') {
        const data = readData();
        data.logs = [];
        writeData(data);
        return jsonResponse(res, 200, { success: true });
    }

    // --- Logs: Export CSV ---
    if (method === 'GET' && pathname === '/api/logs/export') {
        const data = readData();
        let csv = 'Name,Browser,User Agent,Timestamp\n';
        data.logs.forEach(log => {
            const ts = new Date(log.timestamp).toISOString();
            csv += `"${log.name}","${log.browser}","${(log.userAgent || '').replace(/"/g, '""')}","${ts}"\n`;
        });
        res.writeHead(200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="codetantra-copypaste-logs.csv"'
        });
        return res.end(csv);
    }

    // --- Name Restriction: Get ---
    if (method === 'GET' && pathname === '/api/name-restriction') {
        const data = readData();
        const r = data.nameRestriction || { enabled: false, names: [] };
        return jsonResponse(res, 200, r);
    }

    // --- Name Restriction: Set ---
    if (method === 'POST' && pathname === '/api/name-restriction') {
        const body = await parseBody(req);
        const data = readData();
        data.nameRestriction = {
            enabled: !!body.enabled,
            names: Array.isArray(body.names) ? body.names.map(n => n.trim().toLowerCase()).filter(Boolean) : []
        };
        writeData(data);
        return jsonResponse(res, 200, { success: true, ...data.nameRestriction });
    }

    // --- CT Portal: Register Admin ---
    if (method === 'POST' && pathname === '/api/register') {
        const body = await parseBody(req);
        const { username, password, key } = body;
        if (!username || !password) {
            return jsonResponse(res, 200, { ok: false, err: 'Missing fields' });
        }
        if (key !== REGISTER_KEY) {
            return jsonResponse(res, 200, { ok: false, err: 'Invalid registration key' });
        }
        const data = readData();
        if (!data.users) data.users = {};
        if (data.users[username]) {
            return jsonResponse(res, 200, { ok: false, err: 'Username taken' });
        }
        data.users[username] = password;
        writeData(data);
        return jsonResponse(res, 200, { ok: true });
    }

    // --- CT Portal: Admin Login (user/pass) ---
    if (method === 'POST' && pathname === '/api/admin-login') {
        const body = await parseBody(req);
        const data = readData();
        if (!data.users) data.users = {};
        if (data.users[body.username] === body.password) {
            if (!data.sessions) data.sessions = {};
            const token = require('crypto').randomBytes(16).toString('hex');
            data.sessions[token] = body.username;
            writeData(data);
            return jsonResponse(res, 200, { ok: true, token });
        }
        return jsonResponse(res, 200, { ok: false, err: 'Invalid credentials' });
    }

    // --- CT Portal: Get Friends ---
    if (method === 'GET' && pathname === '/api/friends') {
        const tok = req.headers['x-admin-token'] || '';
        const data = readData();
        if (!data.sessions) data.sessions = {};
        if (tok && data.sessions[tok]) {
            return jsonResponse(res, 200, data.friends || []);
        }
        return jsonResponse(res, 401, { error: 'Unauthorized' });
    }

    // --- CT Portal: Generate One-Time Token ---
    if (method === 'POST' && pathname === '/api/generate-token') {
        const data = readData();
        if (!data.tokens) data.tokens = {};
        const token = require('crypto').randomBytes(16).toString('hex');
        data.tokens[token] = true;
        writeData(data);
        return jsonResponse(res, 200, { token });
    }

    // --- CT Portal: Download with Token ---
    if (method === 'GET' && pathname === '/api/download') {
        const token = url.searchParams.get('token');
        if (!token) {
            return jsonResponse(res, 400, { error: 'Missing token' });
        }
        const data = readData();
        if (!data.tokens) data.tokens = {};
        if (data.tokens[token]) {
            delete data.tokens[token];
            writeData(data);
            const browser = builder.detectBrowser(ua);
            try {
                const launcher = builder.generateLauncher(browser);
                const browserName = builder.getBrowserDisplayName(browser);
                const filename = `codetantra-copypaste-${browser}-Launcher.bat`;
                res.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'X-Browser-Detected': browser,
                    'X-Browser-Name': browserName
                });
                return res.end(launcher);
            } catch (err) {
                return jsonResponse(res, 500, { error: 'Build failed: ' + err.message });
            }
        }
        return jsonResponse(res, 403, { error: 'Expired or invalid token' });
    }

    // --- CT Portal: Logout ---
    if (method === 'POST' && pathname === '/api/logout') {
        const tok = req.headers['x-admin-token'] || '';
        const data = readData();
        if (data.sessions && data.sessions[tok]) {
            delete data.sessions[tok];
            writeData(data);
        }
        return jsonResponse(res, 200, { ok: true });
    }

    // --- SecureShare legacy: admin-check ---
    if (method === 'POST' && pathname === '/api/admin-check') {
        const body = await parseBody(req);
        const data = readData();
        return jsonResponse(res, 200, { ok: data.password === body.password });
    }

    jsonResponse(res, 404, { error: 'Not found' });
};

const server = http.createServer(router);
server.listen(PORT, () => {
    const ip = getIP();
    console.log('');
    console.log('  codetantra-copypaste - Combined Portal');
    console.log('  ==========================');
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Network: http://${ip}:${PORT}`);
    console.log(`  Aalim Password: admin123`);
    console.log(`  Register Key:   ${REGISTER_KEY}`);
    console.log('');
});
