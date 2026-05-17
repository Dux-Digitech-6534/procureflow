(function () {
  "use strict";

  var BRAND = "Sanskruti Group";
  var SUBTITLE = "Smart ERP Solutions";
  var LOGO = "/assets/procureflow/img/sanskruti-group-asia-logo.png";
  var FAVICON = "/assets/procureflow/img/sanskruti-group-asia-favicon.png";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function setTitle() {
    if (!document.title || /frappe|erpnext|login/i.test(document.title)) {
      document.title = BRAND;
    }
  }

  function setFavicon() {
    var selectors = ["icon", "shortcut icon", "apple-touch-icon"];
    selectors.forEach(function (rel) {
      var link = document.querySelector('link[rel="' + rel + '"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = FAVICON;
    });
  }

  function hideDefaultLoginHeader(card) {
    var targets = document.querySelectorAll(
      ".login-content .page-card-head, .login-content h4, .for-login > .page-card-head, .for-login > h4, .for-login > .app-logo, .for-login > img.app-logo"
    );
    targets.forEach(function (el) {
      el.style.display = "none";
    });

    if (card) {
      card.querySelectorAll(".page-card-head, h4, .app-logo, img.app-logo").forEach(function (el) {
        el.style.display = "none";
      });
    }
  }

  function brandLogin() {
    var card = document.querySelector(".for-login .page-card, .login-content .page-card");
    if (!card) return;

    hideDefaultLoginHeader(card);

    if (!card.querySelector(".sga-login-brand")) {
      var brand = document.createElement("div");
      brand.className = "sga-login-brand";
      brand.innerHTML = [
        '<img src="' + LOGO + '" alt="' + BRAND + ' logo" loading="eager">',
        '<h1 class="sga-login-brand-title">' + BRAND + "</h1>",
        '<div class="sga-login-brand-subtitle">' + SUBTITLE + "</div>"
      ].join("");
      card.insertBefore(brand, card.firstChild);
    }
  }

  function brandNavbar() {
    var nav = document.querySelector(".navbar-brand, .app-logo, .navbar-home");
    if (!nav || nav.classList.contains("sga-navbar-brand")) return;

    nav.classList.add("sga-navbar-brand");
    nav.setAttribute("aria-label", BRAND);
    nav.innerHTML = '<img src="' + LOGO + '" alt="" aria-hidden="true"><span>' + BRAND + "</span>";
  }

  function showSplash() {
    if (sessionStorage.getItem("sgaSplashShown") === "1") return;
    sessionStorage.setItem("sgaSplashShown", "1");

    var splash = document.createElement("div");
    splash.className = "sga-splash";
    splash.innerHTML = [
      '<div class="sga-splash-card">',
      '<img src="' + LOGO + '" alt="' + BRAND + ' logo">',
      '<div class="sga-splash-title">Welcome to ' + BRAND + "</div>",
      '<div class="sga-spinner" aria-hidden="true"></div>',
      "</div>"
    ].join("");
    document.body.appendChild(splash);

    window.setTimeout(function () {
      splash.classList.add("is-hidden");
      window.setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 320);
    }, 900);
  }

  function applyBranding() {
    setTitle();
    setFavicon();
    brandLogin();
    brandNavbar();
  }

  ready(function () {
    applyBranding();
    showSplash();

    var observer = new MutationObserver(function () {
      applyBranding();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
