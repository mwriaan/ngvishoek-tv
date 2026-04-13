(function () {
    'use strict';

    var PLAYLIST_IDS = {
        preke: 'PL3ZCv-_chxKcez82Pxe3YEgqM2vlalQYK',
        musiek: 'PLwcD6UKAo4VLCeJ8JBRHZbJbOadgAatiA'
    };
    function fetchPlaylistFromApi(playlistId) {
        return fetch('/api/youtube-playlist?playlistId=' + encodeURIComponent(playlistId), {
            headers: {
                'Accept': 'application/json'
            }
        }).then(function (response) {
            return response.json().catch(function () {
                return {
                    ok: false,
                    items: [],
                    error: 'Invalid API response',
                    failStage: 'api-response'
                };
            }).then(function (payload) {
                payload.httpOk = response.ok;
                return payload;
            });
        });
    }

    async function getPlaylistItems(playlistId) {
        var payload;

        try {
            payload = await fetchPlaylistFromApi(playlistId);
        } catch (error) {
            return buildFailure('api-fetch', 'Failed to fetch playlist API');
        }

        if (payload && Array.isArray(payload.items) && payload.items.length) {
            return {
                items: payload.items,
                cached: Boolean(payload.cached),
                stale: Boolean(payload.stale),
                error: payload.error || null,
                failStage: payload.failStage || null
            };
        }

        return buildFailure(
            payload && payload.failStage ? payload.failStage : 'api-empty',
            payload && payload.error ? payload.error : 'Playlist API returned no items'
        );
    }

    function buildFailure(stage, message) {
        return {
            items: [],
            cached: false,
            stale: false,
            error: message,
            failStage: stage
        };
    }

    function getPrekePlaylist() {
        return getPlaylistItems(PLAYLIST_IDS.preke);
    }

    function getMusiekPlaylist() {
        return getPlaylistItems(PLAYLIST_IDS.musiek);
    }

    window.ngvPlaylistService = {
        getPlaylistItems: getPlaylistItems,
        getPrekePlaylist: getPrekePlaylist,
        getMusiekPlaylist: getMusiekPlaylist
    };
}());
