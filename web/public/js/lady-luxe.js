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
    var armed = document.documentElement.hasAttribute('data-ll-armed');
    root.querySelectorAll('.ll-video-card').forEach(function (card) {
      /* framework sentinel regions (data-ll-sentinel) bind from their own
         hydrated boundary — never from a bind that could still race React's
         hydration (stamping a streamed card pre-hydration trips warnings) */
      if (!armed && card.closest('[data-ll-sentinel]')) return;
      armCard(card);
    });
  }

  /* ---- collection marquee ---------------------------------------------- */
  /* duplicates the card group once for a seamless translateX(-50%) loop;
     only runs when JS is available — reduced-motion users get a static row */
  function bindMarquees(root) {
    if (REDUCED) return;
    root.querySelectorAll('.ll-marquee__track').forEach(function (track) {
      /* a framework (React/Next) may render the loop twin itself — skip
         cloning when a second group already exists. The bound-marker is
         stamped ONLY when we actually clone: on a React-rendered track a
         bind must leave zero DOM writes, so it can never mutate streamed
         HTML before React hydrates it (that trips hydration warnings). */
      if (!document.documentElement.hasAttribute('data-ll-armed') &&
          track.closest('[data-ll-sentinel]')) return; /* its sentinel clones it */
      if (track.querySelectorAll('.ll-marquee__group').length > 1) return;
      var group = track.querySelector('.ll-marquee__group');
      if (!group) return;
      track.dataset.llMarquee = '1';
      var clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('video').forEach(function (v) {
        v.setAttribute('tabindex', '-1');
      });
      track.appendChild(clone);
    });
  }

  /* ---- scroll fade-in reveal -------------------------------------------- */
  /* sections with .ll-reveal fade up as they enter the viewport; below-fold
     content stays hidden until scrolled to. IntersectionObserver, unobserve
     after reveal. Reduced-motion users see everything (CSS handles it).
     A persistent observer + MutationObserver: streamed islands (carousel,
     marquees, journal) can insert .ll-reveal sections AFTER the first bind
     on slow cold connections — late arrivals get observed too, so nothing
     is ever left at opacity 0. Insert-time work is registration only; no
     DOM writes that could trip hydration. */
  var revealIo = null;
  var revealMo = null;

  function observeRevealTargets(root) {
    if (REDUCED) return;
    if (!('IntersectionObserver' in window)) {
      root.querySelectorAll('.ll-reveal:not(.is-visible)').forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }
    if (!revealIo) {
      revealIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealIo.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    root.querySelectorAll('.ll-reveal:not(.is-visible)').forEach(function (el) {
      revealIo.observe(el);
    });
  }

  function bindReveals(root) {
    observeRevealTargets(root);
    if (revealMo || !('MutationObserver' in window) || !document.body) return;
    revealMo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          var targets = [];
          if (n.matches && n.matches('.ll-reveal:not(.is-visible)')) targets.push(n);
          if (n.querySelectorAll) {
            targets = targets.concat(Array.prototype.slice.call(
              n.querySelectorAll('.ll-reveal:not(.is-visible)')
            ));
          }
          targets.forEach(function (el) {
            if (revealIo) revealIo.observe(el);
            else el.classList.add('is-visible');   // no IO support: show it
          });
        });
      });
    });
    revealMo.observe(document.body, { childList: true, subtree: true });
  }

  window.LadyLuxe = {
    bindHoverVideos: bind,
    bindMarquees: bindMarquees,
    bindReveals: bindReveals
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
