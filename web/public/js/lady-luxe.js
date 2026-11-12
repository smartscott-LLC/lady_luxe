/* ==========================================================================
   LADY LUXE — hover-video engine
   • mouseenter → play()   • mouseleave → pause()  (NEVER resets currentTime)
   • clips loop while hovered · gold hairline tracks playback position
   • touch devices: first tap plays, second tap pauses
   • prefers-reduced-motion: hover playback disabled
   ========================================================================== */
(function () {
  'use strict';

  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function armCard(card) {
    if (card.dataset.llBound) return;
    var video = card.querySelector('video');
    if (!video) return;
    card.dataset.llBound = '1';

    /* lazy: only fetch data when the card is near the viewport */
    video.preload = 'none';
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');

    var bar = card.querySelector('.ll-video-card__progress i');

    video.addEventListener('timeupdate', function () {
      if (bar && video.duration) {
        bar.style.width = (video.currentTime / video.duration) * 100 + '%';
      }
    });

    /* once metadata+first frames exist, freeze a poster-ish first frame */
    video.addEventListener('loadeddata', function () {
      if (video.paused) { try { video.currentTime = 0.001; } catch (e) {} }
    });

    if (REDUCED) return; /* no hover autoplay for reduced-motion users */

    card.addEventListener('mouseenter', function () {
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay refusal: stay quiet */ });
    });
    card.addEventListener('mouseleave', function () {
      video.pause();               /* holds its position — resumes on return */
    });

    /* touch fallback */
    card.addEventListener('touchstart', function () {
      if (video.paused) {
        var p2 = video.play();
        if (p2 && p2.catch) p2.catch(function () {});
      } else {
        video.pause();
      }
    }, { passive: true });
  }

  function bind(root) {
    root = root || document;
    bindMarquees(root);   /* clone groups first so cloned cards get armed too */
    root.querySelectorAll('.ll-video-card').forEach(armCard);
  }

  /* ---- collection marquee ---------------------------------------------- */
  /* duplicates the card group once for a seamless translateX(-50%) loop;
     only runs when JS is available — reduced-motion users get a static row */
  function bindMarquees(root) {
    if (REDUCED) return;
    root.querySelectorAll('.ll-marquee__track').forEach(function (track) {
      if (track.dataset.llMarquee) return;
      track.dataset.llMarquee = '1';
      /* a framework (React/Next) may render the loop twin itself —
         skip cloning when a second group already exists (keeps hydration clean) */
      if (track.querySelectorAll('.ll-marquee__group').length > 1) return;
      var group = track.querySelector('.ll-marquee__group');
      if (!group) return;
      var clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('video').forEach(function (v) {
        v.setAttribute('tabindex', '-1');
      });
      track.appendChild(clone);
    });
  }

  window.LadyLuxe = {
    bindHoverVideos: bind,
    bindMarquees: bindMarquees
  };

  /* Auto-bind on plain sites only. The <html> element opts in via
     data-ll-autobind — framework apps (Next/React) do NOT set it, because a
     bind that runs before hydration mutates the DOM and breaks it. Framework
     callers invoke window.LadyLuxe.bindHoverVideos() after hydration instead. */
  if (document.documentElement.hasAttribute('data-ll-autobind')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { bind(document); });
    } else {
      bind(document);
    }
  }
})();
