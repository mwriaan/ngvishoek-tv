(function () {
    'use strict';

    var SERVICE_START_MIN = 8 * 60 + 45;
    var SERVICE_END_MIN = 11 * 60;
    var PLAYLIST_IDS = {
        musiek: 'PLwcD6UKAo4VLCeJ8JBRHZbJbOadgAatiA',
        preke: 'PL3ZCv-_chxKcez82Pxe3YEgqM2vlalQYK'
    };
    var DAYS_AF = ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Saterdag'];
    var MONTHS_AF = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

    var currentSection = '';
    var loadedIframes = {};
    var musiekItems = [];
    var prekeItems = [];
    var musiekDisplayItems = [];
    var musiekIndex = 0;
    var prekeIndex = 0;
    var musiekPlayingIndex = 0;
    var prekePlayingIndex = 0;
    var musiekShouldAutoplay = false;
    var prekeShouldAutoplay = false;
    var musiekLoadNonce = 0;
    var prekeLoadNonce = 0;

    var musiekGridEl;
    var prekeGridEl;
    var musiekStatusWrapEl;
    var prekeStatusWrapEl;
    var musiekStatusTextEl;
    var prekeStatusTextEl;
    var musiekCountEl;
    var prekeCountEl;
    var musiekPlaceholderEl;
    var prekePlaceholderEl;
    var musiekControlsEl;
    var prekeControlsEl;
    var youtubeApiReady = false;
    var youtubePlayers = {};
    var youtubePlayerReady = {};
    var pendingPlayerLoads = {};

    function init() {
        cacheElements();
        startClock();
        checkLiveStatus();
        setInterval(checkLiveStatus, 30 * 1000);
        loadPlaylists();
        showSection('uitsending');
    }

    window.onYouTubeIframeAPIReady = function () {
        youtubeApiReady = true;
        ensureYoutubePlayer('musiek');
        ensureYoutubePlayer('preke');
    };

    function cacheElements() {
        musiekGridEl = document.getElementById('musiek-grid');
        prekeGridEl = document.getElementById('preke-grid');
        musiekStatusWrapEl = document.getElementById('musiek-status');
        prekeStatusWrapEl = document.getElementById('preke-status');
        musiekStatusTextEl = document.getElementById('musiek-status-text');
        prekeStatusTextEl = document.getElementById('preke-status-text');
        musiekCountEl = document.getElementById('musiek-count');
        prekeCountEl = document.getElementById('preke-count');
        musiekPlaceholderEl = document.getElementById('musiek-placeholder');
        prekePlaceholderEl = document.getElementById('preke-placeholder');
        musiekControlsEl = document.querySelector('#musiek-grid-col .grid-nav-hint');
        prekeControlsEl = document.querySelector('#preke-grid-col .grid-nav-hint');
        bindGridControls(musiekControlsEl, 'musiek');
        bindGridControls(prekeControlsEl, 'preke');
    }

    function loadPlaylists() {
        loadPlaylist({
            getter: window.ngvPlaylistService.getMusiekPlaylist,
            onItems: function (result) {
                musiekItems = result.items.slice();
                musiekDisplayItems = musiekItems.slice();
                musiekIndex = 0;
                musiekPlayingIndex = 0;
                renderMusiekGrid();
                updateMusiekPlayer();
            },
            setStatus: function (message, show) {
                setPlaylistStatus(musiekStatusWrapEl, musiekStatusTextEl, message, show);
            },
            getItemCountLabel: function (result) {
                var suffix = result.stale ? ' (kas)' : '';
                return result.items.length + ' liedjies' + suffix;
            },
            countEl: musiekCountEl,
            emptyMessage: 'Geen musiek beskikbaar nie.'
        });

        loadPlaylist({
            getter: window.ngvPlaylistService.getPrekePlaylist,
            onItems: function (result) {
                prekeItems = result.items.slice();
                prekeIndex = 0;
                prekePlayingIndex = 0;
                renderPrekeGrid();
                updatePrekePlayer();
            },
            setStatus: function (message, show) {
                setPlaylistStatus(prekeStatusWrapEl, prekeStatusTextEl, message, show);
            },
            getItemCountLabel: function (result) {
                var suffix = result.stale ? ' (kas)' : '';
                return result.items.length + ' preke' + suffix;
            },
            countEl: prekeCountEl,
            emptyMessage: 'Geen preke beskikbaar nie.'
        });
    }

    function loadPlaylist(config) {
        config.setStatus('Laai snitlys...', true);

        config.getter().then(function (result) {
            if (!result.items.length) {
                config.countEl.textContent = '';
                config.setStatus(buildFailureMessage(result, config.emptyMessage), true);
                return;
            }

            config.onItems(result);
            config.countEl.textContent = config.getItemCountLabel(result);

            if (result.error && result.stale) {
                config.setStatus('Wys laaste gestoorde lys. Hernuwing het misluk (' + result.failStage + ').', true);
                return;
            }

            if (result.error) {
                config.setStatus('Net gedeeltelike snitlys gelaai (' + result.failStage + ').', true);
                return;
            }

            config.setStatus('', false);
        }).catch(function (error) {
            console.error('[app] playlist load failed', error);
            config.countEl.textContent = '';
            config.setStatus(config.emptyMessage, true);
        });
    }

    function buildFailureMessage(result, fallback) {
        if (result && result.error && result.failStage) {
            return 'Kon nie laai nie (' + result.failStage + ').';
        }

        return fallback;
    }

    function setPlaylistStatus(wrapperEl, textEl, message, show) {
        if (textEl) {
            textEl.textContent = message || '';
        }

        if (wrapperEl) {
            wrapperEl.hidden = !show;
        }
    }

    function showSection(sectionId) {
        if (sectionId === currentSection) {
            return;
        }

        if (currentSection) {
            stopSectionMedia(currentSection);
        }

        currentSection = sectionId;

        Array.prototype.forEach.call(document.querySelectorAll('.section'), function (sectionEl) {
            sectionEl.hidden = sectionEl.id !== 'section-' + sectionId;
        });

        if (sectionId === 'musiek' && musiekDisplayItems.length) {
            renderMusiekGrid();
        }

        if (sectionId === 'preke' && prekeItems.length) {
            renderPrekeGrid();
        }

        lazyLoadIframe(sectionId);
    }

    function stopSectionMedia(sectionId) {
        var player;
        var iframeEl;

        if (sectionId === 'musiek' || sectionId === 'preke') {
            player = getYoutubePlayerForSection(sectionId);
            if (player && typeof player.stopVideo === 'function') {
                player.stopVideo();
                return;
            }
        }

        iframeEl = document.getElementById('iframe-' + sectionId);
        if (!iframeEl) {
            return;
        }

        iframeEl.src = 'about:blank';
        loadedIframes[sectionId] = false;
    }

    function lazyLoadIframe(sectionId) {
        if (loadedIframes[sectionId]) {
            return;
        }

        var iframe = document.getElementById('iframe-' + sectionId);
        if (!iframe) {
            return;
        }

        var dataSrc = iframe.getAttribute('data-src');
        if (!dataSrc) {
            return;
        }

        if ((sectionId === 'musiek' || sectionId === 'preke') && iframe.src) {
            loadedIframes[sectionId] = true;
            return;
        }

        iframe.src = dataSrc;
        loadedIframes[sectionId] = true;
    }

    function renderMusiekGrid() {
        renderPlaylistGrid({
            gridEl: musiekGridEl,
            items: musiekDisplayItems,
            selectedIndex: musiekIndex,
            onSelect: playMusiek,
            shouldFocus: currentSection === 'musiek'
        });
    }

    function renderPrekeGrid() {
        renderPlaylistGrid({
            gridEl: prekeGridEl,
            items: prekeItems,
            selectedIndex: prekeIndex,
            onSelect: playPreek,
            shouldFocus: currentSection === 'preke'
        });
    }

    function renderPlaylistGrid(config) {
        config.gridEl.innerHTML = '';

        config.items.forEach(function (item, index) {
            var buttonEl = document.createElement('button');
            var isSelected = index === config.selectedIndex;

            buttonEl.className = 'playlist-grid-item' + (isSelected ? ' selected' : '');
            buttonEl.type = 'button';
            buttonEl.setAttribute('role', 'option');
            buttonEl.setAttribute('tabindex', isSelected ? '0' : '-1');
            buttonEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            buttonEl.innerHTML = '<img src="' + item.thumb + '" alt=""><span>' + escapeHtml(item.title) + '</span>';
            buttonEl.addEventListener('click', function () {
                config.onSelect(index);
            });

            config.gridEl.appendChild(buttonEl);

            if (isSelected && config.shouldFocus) {
                setTimeout(function () {
                    try {
                        buttonEl.focus({ preventScroll: true });
                        scrollGridItemIntoView(config.gridEl, buttonEl);
                    } catch (error) { /* ok */ }
                }, 0);
            }
        });
    }

    function playMusiek(index) {
        musiekIndex = index;
        musiekPlayingIndex = index;
        musiekShouldAutoplay = true;
        musiekLoadNonce += 1;
        renderMusiekGrid();
        updateMusiekPlayer();
    }

    function playPreek(index) {
        prekeIndex = index;
        prekePlayingIndex = index;
        prekeShouldAutoplay = true;
        prekeLoadNonce += 1;
        renderPrekeGrid();
        updatePrekePlayer();
    }

    function movePlaylistSelection(sectionId, delta) {
        if (sectionId === 'musiek' && musiekDisplayItems.length) {
            musiekIndex = clampIndex(musiekIndex + delta, musiekDisplayItems.length);
            musiekShouldAutoplay = false;
            renderMusiekGrid();
            return true;
        }

        if (sectionId === 'preke' && prekeItems.length) {
            prekeIndex = clampIndex(prekeIndex + delta, prekeItems.length);
            prekeShouldAutoplay = false;
            renderPrekeGrid();
            return true;
        }

        return false;
    }

    function activatePlaylistSelection(sectionId) {
        if (sectionId === 'musiek' && musiekDisplayItems.length) {
            playMusiek(musiekIndex);
            return true;
        }

        if (sectionId === 'preke' && prekeItems.length) {
            playPreek(prekeIndex);
            return true;
        }

        return false;
    }

    function bindGridControls(containerEl, sectionId) {
        var keyEls;

        if (!containerEl) {
            return;
        }

        keyEls = containerEl.querySelectorAll('kbd');
        if (keyEls[0]) { keyEls[0].setAttribute('data-action', 'up'); }
        if (keyEls[1]) { keyEls[1].setAttribute('data-action', 'down'); }
        if (keyEls[2]) { keyEls[2].setAttribute('data-action', 'play'); }
        if (keyEls[3]) { keyEls[3].setAttribute('data-action', 'back'); }

        containerEl.addEventListener('click', function (event) {
            var target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
            var action = target && target.getAttribute('data-action');
            if (!action) {
                return;
            }

            if (action === 'up') {
                movePlaylistSelection(sectionId, -1);
                return;
            }

            if (action === 'down') {
                movePlaylistSelection(sectionId, 1);
                return;
            }

            if (action === 'play') {
                activatePlaylistSelection(sectionId);
                return;
            }

            if (action === 'back' && window.ngvNav && typeof window.ngvNav.exitContentZone === 'function') {
                window.ngvNav.exitContentZone();
            }
        });
    }

    function updateMusiekPlayer() {
        updatePlaylistPlayer({
            sectionId: 'musiek',
            items: musiekDisplayItems,
            selectedIndex: musiekPlayingIndex,
            iframeId: 'iframe-musiek',
            titleId: 'musiek-now-title',
            placeholderEl: musiekPlaceholderEl,
            playlistId: PLAYLIST_IDS.musiek,
            autoplay: musiekShouldAutoplay,
            nonce: musiekLoadNonce
        });
        musiekShouldAutoplay = false;
    }

    function updatePrekePlayer() {
        updatePlaylistPlayer({
            sectionId: 'preke',
            items: prekeItems,
            selectedIndex: prekePlayingIndex,
            iframeId: 'iframe-preke',
            titleId: 'preke-now-title',
            placeholderEl: prekePlaceholderEl,
            playlistId: PLAYLIST_IDS.preke,
            autoplay: prekeShouldAutoplay,
            nonce: prekeLoadNonce
        });
        prekeShouldAutoplay = false;
    }

    function updatePlaylistPlayer(config) {
        var item = config.items[config.selectedIndex];
        var iframeEl = document.getElementById(config.iframeId);
        var titleEl = document.getElementById(config.titleId);

        if (!item || !iframeEl || !titleEl) {
            return;
        }

        if (config.sectionId === 'musiek' || config.sectionId === 'preke') {
            titleEl.textContent = item.title;
            if (config.placeholderEl) {
                config.placeholderEl.hidden = true;
            }
            loadYoutubePlaylistSelection(config.sectionId, config.items, config.selectedIndex, config.autoplay);
            return;
        }

        iframeEl.src = config.playlistId
            ? buildPlaylistEmbedUrl(item.id, config.playlistId, config.selectedIndex, config.autoplay, config.nonce)
            : buildVideoEmbedUrl(item.id, config.autoplay, config.nonce);
        titleEl.textContent = item.title;

        if (config.placeholderEl) {
            config.placeholderEl.hidden = true;
        }
    }

    function buildVideoEmbedUrl(videoId, autoplay, nonce) {
        return 'https://www.youtube.com/embed/' +
            encodeURIComponent(videoId) +
            '?autoplay=' + (autoplay ? '1' : '0') +
            '&rel=0&modestbranding=1&controls=1&playsinline=1' +
            '&ngv=' + encodeURIComponent(nonce || 0);
    }

    function buildPlaylistEmbedUrl(videoId, playlistId, itemIndex, autoplay, nonce) {
        return 'https://www.youtube.com/embed/' +
            encodeURIComponent(videoId) +
            '?list=' +
            encodeURIComponent(playlistId) +
            '&index=' + encodeURIComponent(itemIndex) +
            '&autoplay=' + (autoplay ? '1' : '0') +
            '&rel=0&modestbranding=1&controls=1&playsinline=1&enablejsapi=1' +
            '&ngv=' + encodeURIComponent(nonce || 0);
    }

    function loadYoutubePlaylistSelection(sectionId, items, selectedIndex, autoplay) {
        var player;

        pendingPlayerLoads[sectionId] = {
            items: items.slice(),
            selectedIndex: selectedIndex,
            autoplay: autoplay
        };

        if (!youtubeApiReady || !window.YT || !window.YT.Player) {
            fallbackLoadYoutubeIframe(sectionId, items[selectedIndex], selectedIndex, autoplay);
            return;
        }

        player = ensureYoutubePlayer(sectionId);
        if (!player || !youtubePlayerReady[sectionId]) {
            fallbackLoadYoutubeIframe(sectionId, items[selectedIndex], selectedIndex, autoplay);
            return;
        }

        applyPendingPlayerLoad(sectionId);
    }

    function ensureYoutubePlayer(sectionId) {
        var iframeId = 'iframe-' + sectionId;

        if (youtubePlayers[sectionId] || !window.YT || !window.YT.Player) {
            return youtubePlayers[sectionId] || null;
        }

        youtubePlayers[sectionId] = new window.YT.Player(iframeId, {
            events: {
                onReady: function () {
                    youtubePlayerReady[sectionId] = true;
                    applyPendingPlayerLoad(sectionId);
                },
                onStateChange: function (event) {
                    handleYoutubePlayerStateChange(sectionId, event);
                }
            }
        });

        return youtubePlayers[sectionId];
    }

    function applyPendingPlayerLoad(sectionId) {
        var player = youtubePlayers[sectionId];
        var pending = pendingPlayerLoads[sectionId];
        var playlistId = sectionId === 'musiek' ? PLAYLIST_IDS.musiek : PLAYLIST_IDS.preke;

        if (!player || !youtubePlayerReady[sectionId] || !pending || !pending.items[pending.selectedIndex]) {
            return;
        }

        if (pending.autoplay) {
            player.loadPlaylist({
                listType: 'playlist',
                list: playlistId,
                index: pending.selectedIndex
            });
        } else {
            player.cuePlaylist({
                listType: 'playlist',
                list: playlistId,
                index: pending.selectedIndex
            });
        }
    }

    function fallbackLoadYoutubeIframe(sectionId, item, selectedIndex, autoplay) {
        var iframeEl = document.getElementById('iframe-' + sectionId);
        var playlistId = sectionId === 'musiek' ? PLAYLIST_IDS.musiek : PLAYLIST_IDS.preke;
        var nonce = sectionId === 'musiek' ? musiekLoadNonce : prekeLoadNonce;

        if (!iframeEl || !item) {
            return;
        }

        iframeEl.src = buildPlaylistEmbedUrl(item.id, playlistId, selectedIndex, autoplay, nonce);
    }

    function handleYoutubePlayerStateChange(sectionId, event) {
        var player = event.target;
        var currentIndex;

        if (!window.YT || !window.YT.PlayerState) {
            return;
        }

        if (event.data === window.YT.PlayerState.PLAYING) {
            currentIndex = typeof player.getPlaylistIndex === 'function' ? player.getPlaylistIndex() : -1;
            syncPlayingIndex(sectionId, currentIndex);
        }
    }

    function getYoutubePlayerForSection(sectionId) {
        if (sectionId !== 'musiek' && sectionId !== 'preke') {
            return null;
        }

        if (!youtubeApiReady || !youtubePlayerReady[sectionId] || !youtubePlayers[sectionId]) {
            return null;
        }

        return youtubePlayers[sectionId];
    }

    function handleMediaControl(action) {
        var sectionId = currentSection;
        var player = getYoutubePlayerForSection(sectionId);
        var state;

        if (!player || !window.YT || !window.YT.PlayerState) {
            return false;
        }

        if (action === 'play') {
            player.playVideo();
            return true;
        }

        if (action === 'pause' || action === 'stop') {
            player.pauseVideo();
            return true;
        }

        if (action === 'playpause') {
            state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : null;
            if (state === window.YT.PlayerState.PLAYING) {
                player.pauseVideo();
            } else {
                player.playVideo();
            }
            return true;
        }

        if (action === 'next') {
            player.nextVideo();
            return true;
        }

        if (action === 'previous') {
            player.previousVideo();
            return true;
        }

        return false;
    }

    function syncPlayingIndex(sectionId, maybeIndex) {
        var items = sectionId === 'musiek' ? musiekDisplayItems : prekeItems;
        var titleEl = document.getElementById(sectionId === 'musiek' ? 'musiek-now-title' : 'preke-now-title');
        var index = clampIndex(maybeIndex, items.length);

        if (!items.length || maybeIndex < 0 || index >= items.length) {
            return;
        }

        if (sectionId === 'musiek') {
            musiekPlayingIndex = index;
            musiekIndex = index;
            renderMusiekGrid();
        } else {
            prekePlayingIndex = index;
            prekeIndex = index;
            renderPrekeGrid();
        }

        if (titleEl && items[index]) {
            titleEl.textContent = items[index].title;
        }
    }

    function startClock() {
        updateClock();
        setInterval(updateClock, 1000);
    }

    function updateClock() {
        var now = new Date();
        var sast = getSASTDate(now);
        var clockEl = document.getElementById('clock');
        var dateEl = document.getElementById('clock-date');

        if (clockEl) {
            clockEl.textContent = pad(sast.getHours()) + ':' + pad(sast.getMinutes()) + ':' + pad(sast.getSeconds());
        }

        if (dateEl) {
            dateEl.textContent = DAYS_AF[sast.getDay()] + ' ' + sast.getDate() + ' ' + MONTHS_AF[sast.getMonth()];
        }
    }

    function checkLiveStatus() {
        var now = new Date();
        var sast = getSASTDate(now);
        var isSunday = sast.getDay() === 0;
        var timeMinutes = sast.getHours() * 60 + sast.getMinutes();
        var isOnAir = isSunday && timeMinutes >= SERVICE_START_MIN && timeMinutes <= SERVICE_END_MIN;
        var livePillEl = document.getElementById('live-pill');
        var statusEl = document.getElementById('stream-status');
        var statusTextEl = document.getElementById('stream-status-text');

        if (livePillEl) {
            livePillEl.hidden = !isOnAir;
        }

        if (!statusEl || !statusTextEl) {
            return;
        }

        if (isOnAir) {
            statusEl.className = 'stream-status live';
            statusTextEl.textContent = 'Tans Regstreeks';
            return;
        }

        statusEl.className = 'stream-status offline';
        statusTextEl.textContent = isSunday
            ? 'Diens later vandag - ' + formatNextService(sast)
            : 'Volgende Sondag om 09:00';
    }

    function getSASTDate(utcDate) {
        try {
            return new Date(utcDate.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }));
        } catch (error) {
            return new Date(utcDate.getTime() + 2 * 60 * 60 * 1000);
        }
    }

    function formatNextService(sast) {
        var minutesLeft = SERVICE_START_MIN - (sast.getHours() * 60 + sast.getMinutes());
        if (minutesLeft > 0 && minutesLeft < 120) {
            return 'begin oor ' + minutesLeft + ' min';
        }

        return '09:00';
    }

    function pad(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function clampIndex(value, length) {
        if (length <= 0) {
            return 0;
        }

        if (value < 0) {
            return 0;
        }

        if (value >= length) {
            return length - 1;
        }

        return value;
    }

    function scrollGridItemIntoView(gridEl, itemEl) {
        var gridRect;
        var itemRect;
        var overscan = 12;

        if (!gridEl || !itemEl) {
            return;
        }

        gridRect = gridEl.getBoundingClientRect();
        itemRect = itemEl.getBoundingClientRect();

        if (itemRect.bottom > gridRect.bottom - overscan) {
            gridEl.scrollTop += itemRect.bottom - gridRect.bottom + overscan;
            return;
        }

        if (itemRect.top < gridRect.top + overscan) {
            gridEl.scrollTop -= gridRect.top - itemRect.top + overscan;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.ngvApp = {
        showSection: showSection,
        movePlaylistSelection: movePlaylistSelection,
        activatePlaylistSelection: activatePlaylistSelection,
        handleMediaControl: handleMediaControl,
        getCurrentSection: function () {
            return currentSection;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
