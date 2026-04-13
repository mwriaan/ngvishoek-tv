(function () {
    'use strict';

    var SERVICE_START_MIN = 8 * 60 + 45;
    var SERVICE_END_MIN = 11 * 60;
    var DAYS_AF = ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Saterdag'];
    var MONTHS_AF = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

    var currentSection = '';
    var loadedIframes = {};
    var musiekItems = [];
    var prekeItems = [];
    var musiekDisplayItems = [];
    var musiekIndex = 0;
    var prekeIndex = 0;

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

    function init() {
        cacheElements();
        startClock();
        checkLiveStatus();
        setInterval(checkLiveStatus, 30 * 1000);
        loadPlaylists();
        showSection('uitsending');
    }

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
    }

    function loadPlaylists() {
        loadPlaylist({
            getter: window.ngvPlaylistService.getMusiekPlaylist,
            onItems: function (result) {
                musiekItems = result.items.slice();
                musiekDisplayItems = musiekItems.slice();
                musiekIndex = 0;
                renderMusiekGrid();
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
                renderPrekeGrid();
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

        iframe.src = dataSrc;
        loadedIframes[sectionId] = true;
    }

    function renderMusiekGrid() {
        renderPlaylistGrid({
            gridEl: musiekGridEl,
            items: musiekDisplayItems,
            selectedIndex: musiekIndex,
            onSelect: playMusiek
        });
        updateMusiekPlayer();
    }

    function renderPrekeGrid() {
        renderPlaylistGrid({
            gridEl: prekeGridEl,
            items: prekeItems,
            selectedIndex: prekeIndex,
            onSelect: playPreek
        });
        updatePrekePlayer();
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
        });
    }

    function playMusiek(index) {
        musiekIndex = index;
        renderMusiekGrid();
    }

    function playPreek(index) {
        prekeIndex = index;
        renderPrekeGrid();
    }

    function updateMusiekPlayer() {
        updatePlaylistPlayer({
            items: musiekDisplayItems,
            selectedIndex: musiekIndex,
            iframeId: 'iframe-musiek',
            titleId: 'musiek-now-title',
            placeholderEl: musiekPlaceholderEl
        });
    }

    function updatePrekePlayer() {
        updatePlaylistPlayer({
            items: prekeItems,
            selectedIndex: prekeIndex,
            iframeId: 'iframe-preke',
            titleId: 'preke-now-title',
            placeholderEl: prekePlaceholderEl
        });
    }

    function updatePlaylistPlayer(config) {
        var item = config.items[config.selectedIndex];
        var iframeEl = document.getElementById(config.iframeId);
        var titleEl = document.getElementById(config.titleId);

        if (!item || !iframeEl || !titleEl) {
            return;
        }

        iframeEl.src = buildVideoEmbedUrl(item.id);
        titleEl.textContent = item.title;

        if (config.placeholderEl) {
            config.placeholderEl.hidden = true;
        }
    }

    function buildVideoEmbedUrl(videoId) {
        return 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&rel=0&modestbranding=1&controls=1';
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.ngvApp = {
        showSection: showSection
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
