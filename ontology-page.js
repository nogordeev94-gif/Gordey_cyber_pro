(function () {
  var graphEl = document.getElementById("ontology-graph");
  var detailEl = document.getElementById("ontology-detail");
  if (!graphEl) return;

  var nodes = [
    { id: "EconomicCapital", x: 280, y: 80 },
    { id: "EconomicCapitalComponent", x: 80, y: 200 },
    { id: "Portfolio", x: 480, y: 200 },
    { id: "RiskFactor", x: 80, y: 320 },
    { id: "EconomicCapitalChange", x: 280, y: 240 },
    { id: "FactorContribution", x: 280, y: 360 },
    { id: "Scenario", x: 480, y: 320 },
    { id: "Methodology", x: 480, y: 80 },
    { id: "Client", x: 600, y: 240 },
    { id: "Product", x: 600, y: 320 },
    { id: "RiskType", x: 80, y: 80 },
  ];

  var edges = [
    { from: "EconomicCapital", to: "EconomicCapitalComponent", label: "consists_of" },
    { from: "EconomicCapital", to: "Portfolio", label: "calculated_for" },
    { from: "EconomicCapital", to: "RiskFactor", label: "affected_by" },
    { from: "EconomicCapital", to: "EconomicCapitalChange", label: "has_change" },
    { from: "EconomicCapitalChange", to: "FactorContribution", label: "decomposed_by" },
    { from: "FactorContribution", to: "RiskFactor", label: "attributed_to" },
    { from: "EconomicCapital", to: "Methodology", label: "uses" },
    { from: "EconomicCapital", to: "Scenario", label: "under" },
    { from: "Portfolio", to: "Client", label: "includes" },
    { from: "Portfolio", to: "Product", label: "includes" },
    { from: "EconomicCapitalComponent", to: "RiskType", label: "by" },
  ];

  var layer = null;

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
  }

  function renderDetail(id) {
    var ent = layer && layer.entities && layer.entities[id];
    if (!ent) {
      detailEl.innerHTML = "<p><strong>" + esc(id) + "</strong></p>";
      return;
    }
    var rel = (layer.relationships || [])
      .filter(function (r) {
        return r.from === id || r.to === id;
      })
      .map(function (r) {
        return r.from + " → " + r.type + " → " + r.to;
      });
    detailEl.innerHTML =
      "<h2 style='margin:0 0 8px;font-size:18px'>" +
      esc(ent.title || id) +
      "</h2>" +
      "<p style='margin:0 0 12px;color:var(--muted)'>" +
      esc(ent.description || "") +
      "</p>" +
      "<p><strong>Атрибуты</strong><br />" +
      esc((ent.attributes || []).join(", ") || "—") +
      "</p>" +
      "<p><strong>Операции</strong><br />" +
      esc((ent.operations || []).join(", ") || "—") +
      "</p>" +
      "<p><strong>Связи</strong><br />" +
      esc(rel.join("; ") || "—") +
      "</p>" +
      "<p><strong>Бизнес-правила</strong><br />" +
      esc((layer.business_rules || []).slice(0, 2).join("; ")) +
      "</p>";
  }

  function draw() {
    var svg =
      '<svg viewBox="0 0 700 420" role="img" aria-label="Ontology graph">';
    edges.forEach(function (e) {
      var a = nodes.find(function (n) {
        return n.id === e.from;
      });
      var b = nodes.find(function (n) {
        return n.id === e.to;
      });
      if (!a || !b) return;
      svg +=
        '<line class="ontology-edge" x1="' +
        a.x +
        '" y1="' +
        a.y +
        '" x2="' +
        b.x +
        '" y2="' +
        b.y +
        '" />';
    });
    nodes.forEach(function (n) {
      var label = n.id.replace(/([A-Z])/g, " $1").trim();
      svg +=
        '<g class="ontology-node" data-id="' +
        n.id +
        '" transform="translate(' +
        n.x +
        "," +
        n.y +
        ')">' +
        '<circle r="28" />' +
        '<text text-anchor="middle" y="4">' +
        esc(n.id.replace("EconomicCapital", "EC").replace("Component", "Comp")) +
        "</text></g>";
    });
    svg += "</svg>";
    graphEl.innerHTML = svg;
    graphEl.querySelectorAll(".ontology-node").forEach(function (g) {
      g.addEventListener("click", function () {
        renderDetail(g.getAttribute("data-id"));
      });
    });
  }

  fetch("data/semantic-layer.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      layer = data;
      draw();
      renderDetail("EconomicCapital");
    })
    .catch(function () {
      draw();
    });
})();
