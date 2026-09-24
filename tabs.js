(function () {
  var tabButtons = document.querySelectorAll(".tabs__btn[data-tab]");
  var panels = document.querySelectorAll(".tab-panel[data-panel]");
  var triggers = document.querySelectorAll("[data-tab-trigger]");
  var navLinks = document.querySelectorAll(".site-nav a[data-tab-trigger]");

  if (!tabButtons.length || !panels.length) return;

  function activate(name, scrollToTabs) {
    if (!name) return;
    var found = false;

    tabButtons.forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      if (on) found = true;
    });

    if (!found) return;

    panels.forEach(function (panel) {
      var on = panel.getAttribute("data-panel") === name;
      panel.classList.toggle("is-active", on);
      if (on) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });

    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("data-tab-trigger") === name);
    });

    if (location.hash !== "#" + name) {
      history.replaceState(null, "", "#" + name);
    }

    if (scrollToTabs) {
      var shell = document.getElementById("content");
      if (shell) shell.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      activate(btn.getAttribute("data-tab"), false);
    });

    btn.addEventListener("keydown", function (e) {
      var tabs = Array.prototype.slice.call(tabButtons);
      var i = tabs.indexOf(btn);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        tabs[(i + 1) % tabs.length].focus();
        tabs[(i + 1) % tabs.length].click();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        tabs[(i - 1 + tabs.length) % tabs.length].focus();
        tabs[(i - 1 + tabs.length) % tabs.length].click();
      }
    });
  });

  triggers.forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      activate(el.getAttribute("data-tab-trigger"), el.closest(".site-header") !== null);
    });
  });

  var initial = (location.hash || "#overview").replace("#", "");
  if (initial === "product") initial = "overview";
  if (initial === "features" || initial === "examples") initial = "scenarios";
  activate(initial, false);
})();
