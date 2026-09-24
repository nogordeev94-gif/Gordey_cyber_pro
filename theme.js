(function () {
  var root = document.documentElement;
  var button = document.querySelector(".theme-toggle");
  var meta = document.querySelector('meta[name="theme-color"]');

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#f5f5f7");
    try {
      localStorage.setItem("satta-theme", theme);
    } catch (e) {}
    if (button) {
      button.setAttribute(
        "aria-label",
        theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
      );
    }
  }

  if (button) {
    button.addEventListener("click", function () {
      apply(current() === "dark" ? "light" : "dark");
    });
  }

  apply(current());
})();
