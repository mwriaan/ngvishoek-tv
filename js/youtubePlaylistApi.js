var fs = require('fs');
var path = require('path');

var CACHE_FILE = path.join(process.cwd(), '.playlist-cache.json');
var CACHE_TTL_MS = 12 * 60 * 60 * 1000;
var CONTINUATION_LIMIT = 50;
var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
};

function readCacheFile() {
    try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (error) {
        return {};
    }
}

function writeCacheFile(cache) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        console.warn('[playlist-api] cache write failed', error);
    }
}

function getCachedPlaylist(playlistId) {
    var cache = readCacheFile();
    return cache[playlistId] || null;
}

function setCachedPlaylist(playlistId, items) {
    var cache = readCacheFile();
    cache[playlistId] = {
        items: items,
        fetchedAt: Date.now()
    };
    writeCacheFile(cache);
}

function normalizePlaylistItem(videoId, title) {
    if (!videoId || !title) {
        return null;
    }

    return {
        id: videoId,
        title: title,
        thumb: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'
    };
}

function getText(value) {
    if (!value) {
        return '';
    }

    if (typeof value.simpleText === 'string') {
        return value.simpleText;
    }

    if (Array.isArray(value.runs)) {
        return value.runs.map(function (run) {
            return run && run.text ? run.text : '';
        }).join('').trim();
    }

    return '';
}

function walkTree(node, visitor) {
    if (!node || typeof node !== 'object') {
        return;
    }

    visitor(node);

    if (Array.isArray(node)) {
        node.forEach(function (item) {
            walkTree(item, visitor);
        });
        return;
    }

    Object.keys(node).forEach(function (key) {
        walkTree(node[key], visitor);
    });
}

function parseJsonAfterMarker(html, marker) {
    var markerIndex = html.indexOf(marker);
    if (markerIndex === -1) {
        return null;
    }

    var startIndex = html.indexOf('{', markerIndex);
    if (startIndex === -1) {
        return null;
    }

    var depth = 0;
    var inString = false;
    var escaped = false;
    var endIndex = -1;
    var i;

    for (i = startIndex; i < html.length; i++) {
        var char = html.charAt(i);

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                endIndex = i;
                break;
            }
        }
    }

    if (endIndex === -1) {
        return null;
    }

    try {
        return JSON.parse(html.slice(startIndex, endIndex + 1));
    } catch (error) {
        return null;
    }
}

function extractInnertubeApiKey(html) {
    var match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    return match ? match[1] : null;
}

function extractClientVersion(html) {
    var match = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    if (match) {
        return match[1];
    }

    match = html.match(/"clientVersion":"([^"]+)"/);
    return match ? match[1] : null;
}

function extractInitialData(html) {
    return parseJsonAfterMarker(html, 'var ytInitialData =') ||
        parseJsonAfterMarker(html, 'window["ytInitialData"] =') ||
        parseJsonAfterMarker(html, 'ytInitialData =');
}

function extractRuntimeConfig(html) {
    var config = parseJsonAfterMarker(html, 'ytcfg.set(') || {};
    var context = config.INNERTUBE_CONTEXT || {
        client: {
            clientName: 'WEB',
            clientVersion: extractClientVersion(html) || '',
            hl: 'en',
            gl: 'ZA'
        }
    };

    return {
        apiKey: config.INNERTUBE_API_KEY || extractInnertubeApiKey(html),
        clientVersion: config.INNERTUBE_CLIENT_VERSION || extractClientVersion(html),
        context: context,
        clientName: mapClientName(
            config.INNERTUBE_CONTEXT_CLIENT_NAME ||
            (context.client && context.client.clientName) ||
            1
        ),
        visitorData: config.VISITOR_DATA || (context.client && context.client.visitorData) || null
    };
}

function mapClientName(value) {
    if (value === 1 || value === '1') {
        return '1';
    }

    if (value === 'WEB') {
        return '1';
    }

    return String(value || '1');
}

function extractContinuationToken(payload) {
    var directToken = extractPlaylistContinuationToken(payload);
    var token = null;

    if (directToken) {
        return directToken;
    }

    walkTree(payload, function (node) {
        if (token || !node || typeof node !== 'object') {
            return;
        }

        if (node.continuationEndpoint &&
            node.continuationEndpoint.continuationCommand &&
            node.continuationEndpoint.continuationCommand.token) {
            token = node.continuationEndpoint.continuationCommand.token;
            return;
        }

        if (node.nextContinuationData && node.nextContinuationData.continuation) {
            token = node.nextContinuationData.continuation;
            return;
        }

        if (node.continuationCommand && node.continuationCommand.token) {
            token = node.continuationCommand.token;
            return;
        }

        if (node.continuation && typeof node.continuation === 'string') {
            token = node.continuation;
        }
    });

    return token;
}

function extractPlaylistContinuationToken(payload) {
    var token = null;

    walkTree(payload, function (node) {
        var contents;

        if (token || !node || typeof node !== 'object') {
            return;
        }

        if (node.playlistVideoListRenderer && Array.isArray(node.playlistVideoListRenderer.contents)) {
            contents = node.playlistVideoListRenderer.contents;
            token = findContinuationTokenInItems(contents) || token;
            return;
        }

        if (node.appendContinuationItemsAction && Array.isArray(node.appendContinuationItemsAction.continuationItems)) {
            token = findContinuationTokenInItems(node.appendContinuationItemsAction.continuationItems) || token;
            return;
        }

        if (node.reloadContinuationItemsCommand && Array.isArray(node.reloadContinuationItemsCommand.continuationItems)) {
            token = findContinuationTokenInItems(node.reloadContinuationItemsCommand.continuationItems) || token;
        }
    });

    return token;
}

function findContinuationTokenInItems(items) {
    var i;
    var entry;

    if (!Array.isArray(items)) {
        return null;
    }

    for (i = 0; i < items.length; i += 1) {
        entry = items[i];
        if (entry &&
            entry.continuationItemRenderer &&
            entry.continuationItemRenderer.continuationEndpoint &&
            entry.continuationItemRenderer.continuationEndpoint.continuationCommand &&
            entry.continuationItemRenderer.continuationEndpoint.continuationCommand.token) {
            return entry.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        }

        if (entry &&
            entry.continuationItemRenderer &&
            entry.continuationItemRenderer.button &&
            entry.continuationItemRenderer.button.buttonRenderer &&
            entry.continuationItemRenderer.button.buttonRenderer.command &&
            entry.continuationItemRenderer.button.buttonRenderer.command.continuationCommand &&
            entry.continuationItemRenderer.button.buttonRenderer.command.continuationCommand.token) {
            return entry.continuationItemRenderer.button.buttonRenderer.command.continuationCommand.token;
        }
    }

    return null;
}

function extractContinuationTokenFromHtml(html) {
    var patterns = [
        /"continuationCommand":\{"token":"([^"]+)"/,
        /"nextContinuationData":\{"continuation":"([^"]+)"/,
        /"continuation":"([^"]+)","clickTrackingParams"/
    ];
    var i;
    var match;

    for (i = 0; i < patterns.length; i += 1) {
        match = html.match(patterns[i]);
        if (match) {
            return match[1];
        }
    }

    return null;
}

function extractPlaylistItemsFromPayload(payload) {
    var items = [];
    var seenIds = Object.create(null);

    walkTree(payload, function (node) {
        var renderer;
        var normalized;

        if (node.playlistVideoRenderer) {
            renderer = node.playlistVideoRenderer;
            normalized = normalizePlaylistItem(renderer.videoId, getText(renderer.title));
            if (normalized && !seenIds[normalized.id]) {
                seenIds[normalized.id] = true;
                items.push(normalized);
            }
        }
    });

    return items;
}

function mergeAndDedupePlaylistItems(items, newItems) {
    var merged = items.slice();
    var seen = Object.create(null);

    merged.forEach(function (item) {
        seen[item.id] = true;
    });

    newItems.forEach(function (item) {
        if (!item || !item.id || seen[item.id]) {
            return;
        }

        seen[item.id] = true;
        merged.push(item);
    });

    return merged;
}

async function fetchPlaylistHtml(playlistId) {
    var response = await fetch('https://www.youtube.com/playlist?list=' + encodeURIComponent(playlistId) + '&hl=en', {
        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Accept-Language': DEFAULT_HEADERS['Accept-Language']
        }
    });

    if (!response.ok) {
        throw new Error('HTTP ' + response.status);
    }

    return response.text();
}

async function fetchContinuationPage(playlistId, apiKey, clientVersion, continuationToken, runtimeConfig) {
    var headers = {
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
        'Accept-Language': DEFAULT_HEADERS['Accept-Language'],
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': runtimeConfig.clientName || '1',
        'X-YouTube-Client-Version': clientVersion,
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/playlist?list=' + encodeURIComponent(playlistId) + '&hl=en'
    };

    if (runtimeConfig.visitorData) {
        headers['X-Goog-Visitor-Id'] = runtimeConfig.visitorData;
    }

    var response = await fetch('https://www.youtube.com/youtubei/v1/browse?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            context: runtimeConfig.context,
            continuation: continuationToken
        })
    });

    if (!response.ok) {
        throw new Error('HTTP ' + response.status);
    }

    return response.json();
}

function buildFailure(stage, message, cachedEntry) {
    if (cachedEntry && Array.isArray(cachedEntry.items) && cachedEntry.items.length) {
        return {
            ok: true,
            items: cachedEntry.items,
            cached: true,
            stale: true,
            error: message,
            failStage: stage
        };
    }

    return {
        ok: false,
        items: [],
        cached: false,
        stale: false,
        error: message,
        failStage: stage
    };
}

async function loadPlaylist(playlistId) {
    var cachedEntry = getCachedPlaylist(playlistId);
    if (cachedEntry && (Date.now() - cachedEntry.fetchedAt) < CACHE_TTL_MS) {
        return {
            ok: true,
            items: cachedEntry.items,
            cached: true,
            stale: false,
            error: null,
            failStage: null
        };
    }

    var html;
    var runtimeConfig;
    var initialData;
    var items;
    var continuation;
    var pageIndex = 0;
    var seenContinuationTokens = Object.create(null);

    try {
        html = await fetchPlaylistHtml(playlistId);
    } catch (error) {
        return buildFailure('html-fetch', 'Failed to fetch playlist HTML', cachedEntry);
    }

    runtimeConfig = extractRuntimeConfig(html);
    if (!runtimeConfig.apiKey || !runtimeConfig.clientVersion) {
        return buildFailure('key-extract', 'Failed to extract API key or client version', cachedEntry);
    }

    initialData = extractInitialData(html);
    if (!initialData) {
        return buildFailure('item-parse', 'Failed to parse initial playlist payload', cachedEntry);
    }

    items = extractPlaylistItemsFromPayload(initialData);
    if (!items.length) {
        return buildFailure('item-parse', 'Failed to extract initial playlist items', cachedEntry);
    }

    continuation = extractContinuationToken(initialData) || extractContinuationTokenFromHtml(html);

    while (continuation && pageIndex < CONTINUATION_LIMIT) {
        var payload;

        if (seenContinuationTokens[continuation]) {
            console.warn('[playlist-api] repeated continuation token, stopping', playlistId, pageIndex);
            break;
        }
        seenContinuationTokens[continuation] = true;

        try {
            payload = await fetchContinuationPage(
                playlistId,
                runtimeConfig.apiKey,
                runtimeConfig.clientVersion,
                continuation,
                runtimeConfig
            );
        } catch (error) {
            console.warn('[playlist-api] continuation fetch failed', playlistId, pageIndex, error && error.message ? error.message : error);
            break;
        }

        items = mergeAndDedupePlaylistItems(items, extractPlaylistItemsFromPayload(payload));
        continuation = extractContinuationToken(payload);
        pageIndex += 1;
    }

    console.log('[playlist-api] loaded playlist', playlistId, 'items=', items.length, 'pages=', pageIndex, 'hasMore=', Boolean(continuation));

    setCachedPlaylist(playlistId, items);

    return {
        ok: true,
        items: items,
        cached: false,
        stale: false,
        error: null,
        failStage: null
    };
}

module.exports = {
    loadPlaylist: loadPlaylist
};
