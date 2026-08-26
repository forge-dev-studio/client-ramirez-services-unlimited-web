/* ============================================================================
   Ramirez Services Unlimited LLC. Interaction only.

   Three jobs and nothing else:
     1. The header menu on small screens.
     2. The sticky action bar, which tucks away until the visitor has scrolled
        past the hero and then never leaves.
     3. The three step quote form, which is a plain single page form until
        this file takes it over.

   No submission handling lives here. No tracking lives here. Everything below
   degrades to working HTML if this file fails to load, which is the whole
   reason the form renders all three steps in the markup.
   ============================================================================ */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ nav */

  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // A tap outside the open menu closes it. Tapping inside must not.
    document.addEventListener("click", function (event) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false);
    });

    // The desktop breakpoint shows the nav unconditionally, so leaving the
    // open state set would strand aria-expanded="true" on a hidden button.
    var wide = window.matchMedia("(min-width: 1120px)");
    var onWide = function (event) { if (event.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* ----------------------------------------------------------- sticky bar */

  function initStickyBar() {
    var bar = document.querySelector("[data-sticky-bar]");
    if (!bar) return;

    // Tuck it on load. Without JavaScript it simply stays put, which is a
    // worse layout but a working one.
    bar.classList.add("is-tucked");

    var threshold = function () {
      return Math.min(window.innerHeight * 0.9, 700);
    };

    var ticking = false;
    function update() {
      ticking = false;
      var past = window.pageYOffset > threshold();
      bar.classList.toggle("is-tucked", !past);
    }

    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      if (reduceMotion) update();
      else window.requestAnimationFrame(update);
    }, { passive: true });

    update();
  }

  /* ------------------------------------------------------------ the form */

  function initQuoteForm() {
    var form = document.querySelector("[data-quote-form]");
    if (!form) return;

    var steps = Array.prototype.slice.call(form.querySelectorAll("[data-step]"));
    if (steps.length < 2) return;

    var progress = form.querySelector("[data-progress]");
    var counter = form.querySelector("[data-step-count]");
    var errorBox = form.querySelector("[data-form-error]");
    var pips = progress ? Array.prototype.slice.call(progress.children) : [];
    var current = 0;

    form.classList.add("is-enhanced");

    function show(index, moveFocus) {
      current = Math.max(0, Math.min(index, steps.length - 1));

      steps.forEach(function (step, i) {
        if (i === current) step.removeAttribute("hidden");
        else step.setAttribute("hidden", "");
      });

      pips.forEach(function (pip, i) {
        pip.setAttribute(
          "data-state",
          i < current ? "done" : (i === current ? "current" : "")
        );
      });

      if (counter) {
        counter.textContent = "Step " + (current + 1) + " of " + steps.length;
      }

      hideError();

      if (moveFocus) {
        var legend = steps[current].querySelector("legend");
        var target = steps[current].querySelector(
          "input:not([type=hidden]):not([tabindex='-1']), select, textarea"
        );
        // Announce the step by moving focus to its heading, then let the
        // visitor tab into the controls the way they expect.
        if (legend) {
          legend.setAttribute("tabindex", "-1");
          legend.focus({ preventScroll: true });
        } else if (target) {
          target.focus({ preventScroll: true });
        }
        var top = form.getBoundingClientRect().top + window.pageYOffset - 90;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
      }
    }

    function showError(message, field) {
      if (!errorBox) return;
      errorBox.textContent = message;
      errorBox.removeAttribute("hidden");
      if (field && field.focus) field.focus({ preventScroll: true });
    }

    function hideError() {
      if (!errorBox) return;
      errorBox.textContent = "";
      errorBox.setAttribute("hidden", "");
    }

    // Validation is per step so a visitor is never told about a problem on a
    // screen they have not seen yet. The wording comes from a data-error
    // attribute on the field rather than being assembled from the label,
    // because assembled sentences produce things like "Add your your name."
    function message(control, fallback) {
      var field = control.closest ? control.closest(".field") : null;
      return (field && field.getAttribute("data-error")) || fallback;
    }

    function validate(step) {
      var seenGroups = {};
      var controls = Array.prototype.slice.call(
        step.querySelectorAll("input[required], select[required], textarea[required]")
      );

      for (var i = 0; i < controls.length; i++) {
        var control = controls[i];

        if (control.type === "radio") {
          if (seenGroups[control.name]) continue;
          seenGroups[control.name] = true;
          var chosen = step.querySelector(
            "input[name='" + control.name + "']:checked"
          );
          if (!chosen) {
            showError(message(control, "Pick one of the options above."), control);
            return false;
          }
          continue;
        }

        if (!control.value.trim()) {
          showError(message(control, "Fill this in before you carry on."), control);
          return false;
        }
      }
      return true;
    }

    form.addEventListener("click", function (event) {
      var next = event.target.closest("[data-next]");
      if (next) {
        if (validate(steps[current])) show(current + 1, true);
        return;
      }
      var back = event.target.closest("[data-back]");
      if (back) show(current - 1, true);
    });

    // Picking a project type is the cheapest tap on the form. Clearing a
    // stale error the moment they answer keeps the screen quiet.
    form.addEventListener("change", hideError);

    // Enter inside a step should advance rather than submit early.
    form.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      if (event.target.tagName === "TEXTAREA") return;
      if (current === steps.length - 1) return;
      event.preventDefault();
      if (validate(steps[current])) show(current + 1, true);
    });

    form.addEventListener("submit", function (event) {
      if (!validate(steps[current])) event.preventDefault();
    });

    show(0, false);
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    initNav();
    initStickyBar();
    initQuoteForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
