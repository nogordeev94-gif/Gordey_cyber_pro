(function () {
  var buttons = document.querySelectorAll(".tabs__btn[data-tab]");
  var panels = document.querySelectorAll(".panel[data-panel]");
  var triggers = document.querySelectorAll("[data-tab-trigger]");
  var navLinks = document.querySelectorAll(".site-nav a[data-tab-trigger]");

  if (!buttons.length) return;

  function activate(name) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });

    panels.forEach(function (panel) {
      var on = panel.getAttribute("data-panel") === name;
      panel.classList.toggle("is-active", on);
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("data-tab-trigger") === name);
    });

    if (location.hash !== "#" + name) {
      history.replaceState(null, "", "#" + name);
    }
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activate(btn.getAttribute("data-tab"));
    });
  });

  triggers.forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      activate(el.getAttribute("data-tab-trigger"));
    });
  });

  var hash = (location.hash || "#overview").replace("#", "");
  if (hash === "product") hash = "overview";
  if (hash === "features" || hash === "examples" || hash === "audience") hash = "scenarios";
  activate(hash);
})();
