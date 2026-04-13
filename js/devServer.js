var http = require('http');
var fs = require('fs');
var path = require('path');
var youtubePlaylistApi = require('./youtubePlaylistApi');

var root = process.cwd();
var mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

function send(res, statusCode, body, contentType) {
    res.statusCode = statusCode;
    if (contentType) {
        res.setHeader('Content-Type', contentType);
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(body);
}

function sendJson(res, statusCode, payload) {
    send(res, statusCode, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function parseQuery(req) {
    return new URL(req.url, 'http://127.0.0.1:3000');
}

function handleStaticRequest(req, res) {
    var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    var relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    var filePath = path.resolve(root, relativePath);

    if (filePath.indexOf(root) !== 0) {
        send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
        return;
    }

    fs.readFile(filePath, function (error, data) {
        if (error) {
            send(res, 404, 'Not found', 'text/plain; charset=utf-8');
            return;
        }

        send(
            res,
            200,
            data,
            mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        );
    });
}

http.createServer(async function (req, res) {
    var requestUrl = parseQuery(req);

    if (requestUrl.pathname === '/api/youtube-playlist') {
        if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'Method not allowed' });
            return;
        }

        if (!requestUrl.searchParams.get('playlistId')) {
            sendJson(res, 400, { error: 'playlistId is required' });
            return;
        }

        console.log('[dev-server] api hit', requestUrl.pathname, requestUrl.searchParams.get('playlistId'));

        try {
            var payload = await youtubePlaylistApi.loadPlaylist(requestUrl.searchParams.get('playlistId'));
            sendJson(res, payload.ok ? 200 : 502, payload);
        } catch (error) {
            sendJson(res, 500, {
                ok: false,
                items: [],
                error: 'Unexpected server error',
                failStage: 'server',
                detail: String(error && error.message ? error.message : error)
            });
        }
        return;
    }

    handleStaticRequest(req, res);
}).listen(3000, '127.0.0.1', function () {
    console.log('NG Vishoek TV dev server listening on http://127.0.0.1:3000');
});
