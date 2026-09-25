(function () {
  var STORAGE_KEY = "satta:pipeline-logs";
  var VIEW_LOG_TS_KEY = "satta:view-log-ts";
  var root = document.getElementById("pipeline-root");
  var empty = document.getElementById("log-empty");
  var history = document.getElementById("log-history");

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function preJson(obj) {
    return esc(JSON.stringify(obj, null, 2));
  }

  function attrBox(label, obj) {
    if (!obj || (typeof obj === "object" && !Object.keys(obj).length)) return "";
    return (
      "<p class='pipe-meta'><strong>" +
      esc(label) +
      "</strong></p><pre class='pipe-json'>" +
      preJson(obj) +
      "</pre>"
    );
  }

  function step(title, bodyHtml) {
    return (
      '<section class="pipe-step">' +
      '<h2 class="pipe-step__title">' +
      esc(title) +
      "</h2>" +
      bodyHtml +
      "</section>"
    );
  }

  function renderChecklist(sem) {
    var ui = (sem && sem.ui) || {};
    var list = ui.required_checklist || [];
    if (!list.length) return "";
    var items = list
      .map(function (row) {
        var mark = row.filled ? "✓" : "✗";
        var val =
          row.filled && row.value != null
            ? " = " + row.value
            : "";
        return (
          "<li class='checklist-item checklist-item--" +
          (row.filled ? "ok" : "miss") +
          "'>" +
          mark +
          " " +
          esc(row.label || row.id) +
          esc(val) +
          "</li>"
        );
      })
      .join("");
    return (
      "<p class='pipe-meta'><strong>Required attributes</strong></p>" +
      "<ul class='pipe-list checklist'>" +
      items +
      "</ul>"
    );
  }

  function renderSemanticStep(sem, statusLabel) {
    var ui = (sem && sem.ui) || {};
    var dims = ui.dimensions || (sem.semantic_query && sem.semantic_query.dimensions) || [];
    var dimText = dims
      .map(function (d) {
        return typeof d === "string" ? d : d.label || d.value || d.attribute;
      })
      .join(", ");
    var body =
      "<div class='semantic-panel'>" +
      "<p class='semantic-panel__badge'>" +
      esc(statusLabel || ui.status || sem.status) +
      "</p>" +
      "<dl class='semantic-dl'>" +
      "<dt>Entity</dt><dd><code>" +
      esc(sem.entity || ui.entity) +
      "</code></dd>" +
      "<dt>Operation</dt><dd><code>" +
      esc(sem.operation || ui.operation) +
      "</code></dd>" +
      "<dt>Dimensions</dt><dd>" +
      esc(dimText || "—") +
      "</dd>" +
      "</dl>" +
      renderChecklist(sem);
    if (sem.clarification && sem.clarification.question) {
      body +=
        "<p class='pipe-meta'><strong>Question</strong></p>" +
        "<p class='pipe-text'>" +
        esc(sem.clarification.question) +
        "</p>";
    }
    if (sem.status === "READY" && sem.semantic_query) {
      body +=
        "<p class='pipe-meta'><strong>Semantic Query</strong></p>" +
        "<pre class='pipe-json'>" +
        preJson(sem.semantic_query) +
        "</pre>" +
        "<p class='pipe-meta'>→ SQL AGENT</p>";
    }
    body += "</div>";
    return body;
  }

  function renderRecord(record) {
    var html = "";
    html += step(
      "STEP 1 — User Query",
      '<p class="pipe-text">' + esc(record.user_query) + "</p>"
    );

    var syn = record.synonym || {};
    var termsHtml = (syn.terms || [])
      .map(function (t) {
        return (
          "<li><code>" +
          esc(t.original) +
          "</code> → <strong>" +
          esc(t.normalized || t.canonical || "—") +
          "</strong> <span class='pipe-meta'>[" +
          esc(t.type || "—") +
          "] (" +
          esc(t.match_type) +
          ", " +
          (t.confidence != null ? t.confidence.toFixed(2) : "—") +
          ")</span></li>"
        );
      })
      .join("");
    html += step(
      "STEP 2 — Synonym Agent",
      "<p class='pipe-meta'>status: <strong>" +
        esc(syn.status) +
        "</strong></p>" +
        "<p class='pipe-text'>" +
        esc(syn.normalized_query) +
        "</p>" +
        "<ul class='pipe-list'>" +
        termsHtml +
        "</ul>" +
        (syn.clarification
          ? "<p class='pipe-note'>" + esc(syn.clarification.question || "") + "</p>"
          : "") +
        attrBox("Важные атрибуты (Synonym)", syn.extracted_attributes)
    );

    var sem = record.semantic || {};
    if (record.status === "NEEDS_CLARIFICATION" && sem.status) {
      html += step("STEP 3 — Semantic Layer Agent", renderSemanticStep(sem, "NEEDS_CLARIFICATION"));
      return html;
    }

    html += step("STEP 3 — Semantic Layer Agent", renderSemanticStep(sem, "SEMANTIC LAYER"));

    if (sem.status === "READY") {
      html += step(
        "STEP 4 — Evidence",
        "<pre class='pipe-json'>" + preJson(sem.evidence_requirements) + "</pre>"
      );
    }

    var sql = record.sql || {};
    var trace = record.attribute_trace || {};
    html += step(
      "STEP 5 — SQL Agent",
      "<pre class='pipe-sql'>" + esc(sql.sql) + "</pre>" +
        "<p class='pipe-meta'>mapping: " +
        esc(sql.mapping_version) +
        "</p>" +
        attrBox("Фильтры SQL", sql.applied_filters || trace.sql_filters)
    );

    html += step(
      "STEP 6 — Execution",
      attrBox("Применённые фильтры", sql.execution && sql.execution.applied_filters) +
        "<pre class='pipe-json'>" +
        preJson(sql.execution) +
        "</pre>"
    );

    html += step(
      "STEP 7 — Final Answer",
      "<pre class='pipe-answer'>" + esc(record.final_answer) + "</pre>"
    );

    return html;
  }

  var logs = [];
  try {
    logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    logs = [];
  }

  if (!logs.length) return;

  var latest = logs[logs.length - 1];
  try {
    var viewTs = sessionStorage.getItem(VIEW_LOG_TS_KEY);
    if (viewTs) {
      var matched = logs.filter(function (item) {
        return String(item.ts) === viewTs;
      });
      if (matched.length) latest = matched[matched.length - 1];
      sessionStorage.removeItem(VIEW_LOG_TS_KEY);
    }
  } catch (e) {
    /* ignore */
  }
  root.innerHTML = renderRecord(latest);
  root.hidden = false;
  empty.hidden = true;

  if (logs.length > 1 && history) {
    history.hidden = false;
    history.innerHTML = logs
      .slice()
      .reverse()
      .slice(1, 6)
      .map(function (item) {
        return (
          "<li><strong>" +
          new Date(item.ts).toLocaleString("ru-RU") +
          "</strong><br />" +
          esc(item.user_query) +
          "</li>"
        );
      })
      .join("");
  }
})();
