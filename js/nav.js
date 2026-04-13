/**
 * nav.js — D-pad / remote-control navigation for NG Kerk Vishoek TV App
 *
 * Key support:
 *   Standard arrow keys (37-40), Enter (13), Escape (27)
 *   Samsung Tizen:  Back = 10009
 *   LG webOS:       Back = 461
 *   Samsung colour: Red=403 Green=404 Yellow=405 Blue=406
 */
(function () {
    'use strict';

    /* ── Key codes ───────────────────────────────────────────── */
    var KEY = {
        LEFT:         37,
        UP:           38,
        RIGHT:        39,
        DOWN:         40,
        ENTER:        13,
        BACK_STD:     27,   // Escape
        BACK_SAMSUNG: 10009,
        BACK_LG:      461,
        RED:          403,
        GREEN:        404,
        YELLOW:       405,
        BLUE:         406,
        MEDIA_PREV:   412,
        MEDIA_STOP:   413,
        MEDIA_PLAY:   415,
        MEDIA_NEXT:   417,
        MEDIA_PAUSE:  19,
        MEDIA_PLAYPAUSE: 10252,
        NUM_1:        49,   // shortcut keys
        NUM_2:        50,
        NUM_3:        51,
        NUM_4:        52,
        NUM_5:        53,
    };

    /* ── State ───────────────────────────────────────────────── */
    var navItems        = [];   // NodeList of .nav-item elements
    var currentIndex    = 0;   // which nav item is focused
    var inContentZone   = false; // true when focus has moved into the video/content area

    /* ── Init ────────────────────────────────────────────────── */
    function init() {
        navItems = Array.from(document.querySelectorAll('.nav-item'));

        // Register Samsung Tizen-specific remote keys so they don't get swallowed
        try {
            var tizenKeys = [
                'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
                'MediaRewind', 'MediaFastForward',
            ];
            tizenKeys.forEach(function (k) {
                tizen.tvinputdevice.registerKey(k);
            });
        } catch (e) {
            // Not running on Tizen — ignore
        }

        document.addEventListener('keydown', onKeyDown);

        // Click support (browser testing + touch remotes)
        navItems.forEach(function (item, idx) {
            item.addEventListener('click', function () {
                exitContentZone();
                setNavFocus(idx);
                activateNavItem(idx);
            });
        });

        // Set initial focus on first nav item
        setNavFocus(0);
    }

    /* ── Key handler ─────────────────────────────────────────── */
    function onKeyDown(e) {
        var code = e.keyCode || e.which;
        var key = e.key || '';

        if (handleMediaKey(code, key, e)) {
            return;
        }

        // Back / Escape — always return to sidebar from content zone
        if (code === KEY.BACK_STD || code === KEY.BACK_SAMSUNG || code === KEY.BACK_LG) {
            if (inContentZone) {
                e.preventDefault();
                exitContentZone();
            } else {
                // Already on sidebar — exit the app
                exitApp();
            }
            return;
        }

        // Number shortcuts: 1-5 jump to nav item directly
        if (code >= KEY.NUM_1 && code <= KEY.NUM_5) {
            var idx = code - KEY.NUM_1;
            if (idx < navItems.length) {
                e.preventDefault();
                exitContentZone();
                setNavFocus(idx);
                activateNavItem(idx);
            }
            return;
        }

        if (inContentZone) {
            // Playlist sections use the D-pad to move the selected tile.
            if (handlePlaylistContentKey(code, e)) {
                return;
            }

            // Only LEFT and BACK are intercepted in generic content zone;
            // all other keys are passed through to the iframe / YouTube player.
            if (code === KEY.LEFT) {
                e.preventDefault();
                exitContentZone();
            }
        } else {
            // We are in the sidebar zone
            handleSidebarKey(code, e);
        }
    }

    /* ── Sidebar key routing ─────────────────────────────────── */
    function handleSidebarKey(code, e) {
        switch (code) {
            case KEY.UP:
                e.preventDefault();
                setNavFocus(Math.max(0, currentIndex - 1));
                break;

            case KEY.DOWN:
                e.preventDefault();
                setNavFocus(Math.min(navItems.length - 1, currentIndex + 1));
                break;

            case KEY.ENTER:
            case KEY.RIGHT:
                e.preventDefault();
                activateNavItem(currentIndex);
                break;
        }
    }

    /* ── Focus helpers ───────────────────────────────────────── */
    function setNavFocus(idx) {
        currentIndex  = idx;
        inContentZone = false;

        navItems.forEach(function (item, i) {
            item.classList.toggle('focused', i === idx);
            item.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        });

        // Move DOM focus so screen readers and Tizen's focus engine agree
        navItems[idx].focus({ preventScroll: true });
    }

    function activateNavItem(idx) {
        var item    = navItems[idx];
        var section = item.dataset.section;

        // Mark active in sidebar
        navItems.forEach(function (n) { n.classList.remove('active'); });
        item.classList.add('active');

        // Tell the app to switch section
        if (window.ngvApp && typeof window.ngvApp.showSection === 'function') {
            window.ngvApp.showSection(section);
        }

        // Video sections: move focus into content zone so the
        // YouTube player can receive remote events.
        var videoSections = ['uitsending', 'musiek', 'preke'];
        if (videoSections.indexOf(section) !== -1) {
            enterContentZone(section);
        }
        // Info sections: keep focus in sidebar (nothing interactive in content)
    }

    function enterContentZone(section) {
        inContentZone = true;

        if (section === 'musiek' || section === 'preke') {
            if (window.ngvApp && typeof window.ngvApp.activatePlaylistSelection === 'function') {
                window.ngvApp.activatePlaylistSelection(section);
            }
            return;
        }

        // Try to focus the iframe so the player receives d-pad events
        var iframe = document.getElementById('iframe-' + section);
        if (iframe) {
            // Short delay lets the iframe finish loading
            setTimeout(function () {
                try { iframe.focus({ preventScroll: true }); } catch (e) { /* ok */ }
            }, 300);
        }
    }

    function exitContentZone() {
        inContentZone = false;
        setNavFocus(currentIndex);
    }

    function handlePlaylistContentKey(code, e) {
        var section;

        if (!window.ngvApp || typeof window.ngvApp.getCurrentSection !== 'function') {
            return false;
        }

        section = window.ngvApp.getCurrentSection();
        if (section !== 'musiek' && section !== 'preke') {
            return false;
        }

        if (code === KEY.UP) {
            e.preventDefault();
            return window.ngvApp.movePlaylistSelection(section, -1);
        }

        if (code === KEY.DOWN) {
            e.preventDefault();
            return window.ngvApp.movePlaylistSelection(section, 1);
        }

        if (code === KEY.ENTER || code === KEY.RIGHT) {
            e.preventDefault();
            return window.ngvApp.activatePlaylistSelection(section);
        }

        return false;
    }

    /* ── App exit ────────────────────────────────────────────── */
    function handleMediaKey(code, key, e) {
        var action = '';

        if (code === KEY.MEDIA_PLAY || key === 'MediaPlay') {
            action = 'play';
        } else if (code === KEY.MEDIA_PAUSE || key === 'MediaPause') {
            action = 'pause';
        } else if (code === KEY.MEDIA_PLAYPAUSE || key === 'MediaPlayPause') {
            action = 'playpause';
        } else if (code === KEY.MEDIA_NEXT || key === 'MediaTrackNext' || key === 'MediaFastForward') {
            action = 'next';
        } else if (code === KEY.MEDIA_PREV || key === 'MediaTrackPrevious' || key === 'MediaRewind') {
            action = 'previous';
        } else if (code === KEY.MEDIA_STOP || key === 'MediaStop') {
            action = 'stop';
        }

        if (!action || !window.ngvApp || typeof window.ngvApp.handleMediaControl !== 'function') {
            return false;
        }

        if (window.ngvApp.handleMediaControl(action)) {
            e.preventDefault();
            return true;
        }

        return false;
    }

    function exitApp() {
        // Samsung Tizen
        try {
            tizen.application.getCurrentApplication().exit();
            return;
        } catch (e) { /* not Tizen */ }

        // LG webOS
        try {
            if (window.webOS && webOS.platformBack) {
                webOS.platformBack();
                return;
            }
        } catch (e) { /* not webOS */ }

        // Browser fallback
        try { window.close(); } catch (e) { /* ok */ }
    }

    /* ── Public API ──────────────────────────────────────────── */
    window.ngvNav = {
        setNavFocus:    setNavFocus,
        exitContentZone: exitContentZone,
    };

    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
