/* Tide Talk — The Terrace theme */
(function () {
    'use strict';

    // Close the mobile menu after tapping a nav link
    document.addEventListener('click', function (e) {
        var link = e.target.closest('nav.main a');
        if (link) {
            var toggle = document.getElementById('navtoggle');
            if (toggle) { toggle.checked = false; }
        }
    });

    // Close the mobile menu with Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var toggle = document.getElementById('navtoggle');
            if (toggle) { toggle.checked = false; }
        }
    });
})();
