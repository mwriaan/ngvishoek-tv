/**
 * app.js — Core application logic for NG Kerk Vishoek TV App
 *
 * Responsibilities:
 *   - Section switching (show / hide panels)
 *   - Lazy-loading YouTube iframes (only load when section is visited)
 *   - Live clock display
 *   - Sunday-service live-status heuristic (no API key required)
 */
(function () {
    'use strict';

    /* ── Config ──────────────────────────────────────────────── */
    var CHANNEL_ID = 'UCrRXpQUVbhX3N4393oSylFA';

    // Sunday service times in SAST (UTC+2)
    // Show "REGSTREEKS" heuristic from 08:45 to 11:00
    var SERVICE_START_MIN = 8 * 60 + 45;  // 08:45
    var SERVICE_END_MIN   = 11 * 60;       // 11:00

    var DAYS_AF = [
        'Sondag', 'Maandag', 'Dinsdag', 'Woensdag',
        'Donderdag', 'Vrydag', 'Saterdag'
    ];
    var MONTHS_AF = [
        'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
        'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'
    ];

    /* ── State ───────────────────────────────────────────────── */
    var currentSection = '';
    var loadedIframes  = {};   // section → true once iframe src is set
    var clockInterval  = null;

    /* ── Boot ────────────────────────────────────────────────── */
    function init() {
        startClock();
        checkLiveStatus();
        setInterval(checkLiveStatus, 30 * 1000); // re-check every 30 s

        // Show the live stream screen first
        showSection('uitsending');
    }

    /* ══════════════════════════════════════════════════════════
       SECTION SWITCHING
    ══════════════════════════════════════════════════════════ */
    function showSection(sectionId) {
        if (sectionId === currentSection) return;
        currentSection = sectionId;

        // Hide all, show target
        var sections = document.querySelectorAll('.section');
        sections.forEach(function (el) {
            var isTarget = el.id === 'section-' + sectionId;
            el.hidden = !isTarget;
        });

        // Lazy-load the iframe for this section
        lazyLoadIframe(sectionId);
    }

    /* ══════════════════════════════════════════════════════════
       LAZY IFRAME LOADING
    ══════════════════════════════════════════════════════════ */
    function lazyLoadIframe(sectionId) {
        if (loadedIframes[sectionId]) return;

        var iframe = document.getElementById('iframe-' + sectionId);
        if (!iframe) return;

        var dataSrc = iframe.getAttribute('data-src');
        if (!dataSrc) return;

        iframe.src = dataSrc;
        loadedIframes[sectionId] = true;
    }

    /* ══════════════════════════════════════════════════════════
       CLOCK
    ══════════════════════════════════════════════════════════ */
    function startClock() {
        updateClock();
        clockInterval = setInterval(updateClock, 1000);
    }

    function updateClock() {
        var now  = new Date();
        var sast = getSASTDate(now);

        var h = pad(sast.getHours());
        var m = pad(sast.getMinutes());
        var s = pad(sast.getSeconds());

        var clockEl = document.getElementById('clock');
        if (clockEl) clockEl.textContent = h + ':' + m + ':' + s;

        var dateEl = document.getElementById('clock-date');
        if (dateEl) {
            var day   = DAYS_AF[sast.getDay()];
            var date  = sast.getDate();
            var month = MONTHS_AF[sast.getMonth()];
            dateEl.textContent = day + ' ' + date + ' ' + month;
        }
    }

    /* ══════════════════════════════════════════════════════════
       LIVE STATUS HEURISTIC
       No YouTube API key required — uses local time:
       If it is Sunday AND between 08:45–11:00 SAST → show LIVE.
    ══════════════════════════════════════════════════════════ */
    function checkLiveStatus() {
        var now      = new Date();
        var sast     = getSASTDate(now);
        var isSun    = sast.getDay() === 0;
        var timeMin  = sast.getHours() * 60 + sast.getMinutes();
        var isOnAir  = isSun && timeMin >= SERVICE_START_MIN && timeMin <= SERVICE_END_MIN;

        // Sidebar live pill
        var livePill = document.getElementById('live-pill');
        if (livePill) livePill.hidden = !isOnAir;

        // Stream section status badge
        var statusEl   = document.getElementById('stream-status');
        var statusText = document.getElementById('stream-status-text');
        if (statusEl) {
            if (isOnAir) {
                statusEl.className = 'stream-status live';
                if (statusText) statusText.textContent = 'Tans Regstreeks';
            } else {
                statusEl.className = 'stream-status offline';
                if (statusText) {
                    statusText.textContent = isSun
                        ? 'Diens later vandag — ' + formatNextService(sast)
                        : 'Volgende Sondag om 09:00';
                }
            }
        }
    }

    /* ── Helpers ─────────────────────────────────────────────── */

    /**
     * Returns a Date object representing the current moment
     * in South Africa Standard Time (UTC+2, no DST).
     */
    function getSASTDate(utcDate) {
        // Reliable cross-platform approach
        try {
            var sastStr = utcDate.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
            return new Date(sastStr);
        } catch (e) {
            // Fallback: manually offset UTC+2
            return new Date(utcDate.getTime() + 2 * 60 * 60 * 1000);
        }
    }

    function formatNextService(sast) {
        // If we're on Sunday but before 08:45, show countdown
        var minsLeft = SERVICE_START_MIN - (sast.getHours() * 60 + sast.getMinutes());
        if (minsLeft > 0 && minsLeft < 120) {
            return 'begin oor ' + minsLeft + ' min';
        }
        return '09:00';
    }

    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    /* ── Public API (used by nav.js) ─────────────────────────── */
    window.ngvApp = {
        showSection: showSection,
    };

    /* ── Boot ────────────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

}());
