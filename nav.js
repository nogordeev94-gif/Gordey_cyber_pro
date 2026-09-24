(function () {
  var links = document.querySelectorAll("[data-nav-link]");
  var sections = document.querySelectorAll("[data-section]");
  if (!links.length || !sections.length) return;

  function setActive(id) {
    links.forEach(function (link) {
      var on = link.getAttribute("href") === id;
      link.classList.toggle("is-active", on);
    });
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          setActive("#" + entry.target.id);
        }
      });
    },
    { rootMargin: "-40% 0px -45% 0px", threshold: 0 }
  );

  sections.forEach(function (section) {
    observer.observe(section);
  });

  setActive("#product");
})();
