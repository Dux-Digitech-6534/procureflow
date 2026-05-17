(function () {
  const BRAND = 'Sanskruti Group';
  const SUBTITLE = 'Smart ERP Solutions';
  const LOGO = '/assets/procureflow/img/sanskruti-group-asia-logo.png';
  const PUBLIC_LOGO = '/assets/procureflow/img/sanskruti-group-asia-logo.png';

  function setTitle() {
    if (!document.title || /Frappe|ERPNext|Login|Build/i.test(document.title)) {
      document.title = BRAND;
    } else if (!document.title.includes(BRAND)) {
      document.title = document.title.replace(/\s*[-|]\s*(Frappe|ERPNext).*$/i, '') + ' - ' + BRAND;
    }
  }

  function setFavicons() {
    document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').forEach((node) => node.remove());
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/png';
    icon.href = PUBLIC_LOGO;
    document.head.appendChild(icon);
  }

  function addSplash() {
    if (sessionStorage.getItem('sga_splash_seen') === '1' || document.querySelector('.sga-splash')) return;
    sessionStorage.setItem('sga_splash_seen', '1');
    const splash = document.createElement('div');
    splash.className = 'sga-splash';
    splash.innerHTML = `
      <div class="sga-splash-card">
        <img src="${LOGO}" alt="${BRAND}">
        <h2>Welcome to ${BRAND}</h2>
        <div class="sga-spinner" aria-label="Loading"></div>
      </div>`;
    document.body.appendChild(splash);
    window.setTimeout(() => splash.classList.add('is-hidden'), 850);
    window.setTimeout(() => splash.remove(), 1200);
  }

  function brandLogin() {
    const loginCard = document.querySelector('.for-login .page-card, .login-content .page-card, .page-card.login-card');
    if (!loginCard || loginCard.querySelector('.sga-login-brand')) return;
    const existingLogo = loginCard.querySelector('.page-card-head img, .login-logo, .app-logo');
    if (existingLogo) existingLogo.style.display = 'none';
    const brand = document.createElement('div');
    brand.className = 'sga-login-brand';
    brand.innerHTML = `<img src="${LOGO}" alt="${BRAND}"><h1>${BRAND}</h1><p>${SUBTITLE}</p>`;
    loginCard.insertBefore(brand, loginCard.firstChild);
  }

  function brandNavbar() {
    const target = document.querySelector('.navbar .navbar-brand, .navbar-brand, .app-logo');
    if (!target || target.querySelector('.sga-navbar-brand')) return;
    target.innerHTML = `<span class="sga-navbar-brand"><img src="${LOGO}" alt="${BRAND}"><span>${BRAND}</span></span>`;
    target.setAttribute('title', BRAND);
  }

  function run() {
    setTitle();
    setFavicons();
    addSplash();
    brandLogin();
    brandNavbar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  const observer = new MutationObserver(() => {
    setTitle();
    brandLogin();
    brandNavbar();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
