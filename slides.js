(function () {
  var deck = document.querySelector(".deck");
  var links = document.querySelectorAll("[data-slide-link]");
  var slides = document.querySelectorAll(".slide[data-slide]");
  if (!deck || !slides.length) return;

  function setActive(id) {
    var hash = id || (location.hash || "#slide-1");
    links.forEach(function (link) {
      var on = link.getAttribute("href") === hash;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          var id = "#" + entry.target.id;
          if (location.hash !== id) history.replaceState(null, "", id);
          setActive(id);
        }
      });
    },
    { root: deck, threshold: [0.55, 0.7] }
  );

  slides.forEach(function (slide) {
    observer.observe(slide);
  });

  window.addEventListener("hashchange", function () {
    setActive(location.hash);
  });

  setActive(location.hash || "#slide-1");
})();
