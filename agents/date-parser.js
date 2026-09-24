(function (global) {
  var MONTHS = {
    январ: 1,
    феврал: 2,
    март: 3,
    апрел: 4,
    май: 5,
    июн: 6,
    июл: 7,
    август: 8,
    сентябр: 9,
    октябр: 10,
    ноябр: 11,
    декабр: 12,
  };

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function lastDay(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function iso(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function findSpans(text, regex, handler) {
    var spans = [];
    var m;
    var flags = regex.flags.indexOf("g") >= 0 ? regex.flags : regex.flags + "g";
    var r = new RegExp(regex.source, flags);
    while ((m = r.exec(text)) !== null) {
      var hit = handler(m);
      if (hit) {
        spans.push({
          start: m.index,
          end: m.index + m[0].length,
          original: m[0],
          normalized: hit.normalized,
          type: hit.type,
          meta: hit.meta || null,
        });
      }
    }
    return spans;
  }

  function parseNumericDate(parts) {
    var d = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return iso(y, m, d);
  }

  function findDates(text) {
    var spans = [];
    spans = spans.concat(
      findSpans(text, /(\d{4})-(\d{2})-(\d{2})/g, function (m) {
        return { normalized: m[0], type: "DATE" };
      })
    );
    spans = spans.concat(
      findSpans(text, /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/g, function (m) {
        var isoDate = parseNumericDate([m[1], m[2], m[3]]);
        return isoDate ? { normalized: isoDate, type: "DATE" } : null;
      })
    );
    spans = spans.concat(
      findSpans(
        text,
        /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/gi,
        function (m) {
          var d = parseInt(m[1], 10);
          var monthKey = m[2].toLowerCase().slice(0, 6);
          var month = MONTHS[monthKey];
          if (!month) return null;
          var y = m[3] ? parseInt(m[3], 10) : 2026;
          return { normalized: iso(y, month, d), type: "DATE" };
        }
      )
    );
    return spans;
  }

  function findPeriods(text) {
    var spans = [];
    var t = text.toLowerCase();
    spans = spans.concat(
      findSpans(text, /за\s+прошлый\s+месяц/gi, function () {
        return {
          normalized: "2026-05-01..2026-05-31",
          type: "PERIOD",
          meta: { label: "прошлый месяц" },
        };
      })
    );
    spans = spans.concat(
      findSpans(text, /за\s+последний\s+месяц/gi, function () {
        return {
          normalized: "2026-05-01..2026-05-31",
          type: "PERIOD",
          meta: { label: "последний месяц" },
        };
      })
    );
    spans = spans.concat(
      findSpans(text, /с\s+начала\s+года/gi, function () {
        return {
          normalized: "2026-01-01..2026-06-30",
          type: "PERIOD",
          meta: { label: "YTD" },
        };
      })
    );
    spans = spans.concat(
      findSpans(text, /YTD/gi, function () {
        return {
          normalized: "2026-01-01..2026-06-30",
          type: "PERIOD",
          meta: { label: "YTD" },
        };
      })
    );
    spans = spans.concat(
      findSpans(text, /Q([1-4])\s*(\d{4})/gi, function (m) {
        var q = parseInt(m[1], 10);
        var y = parseInt(m[2], 10);
        var fromM = (q - 1) * 3 + 1;
        var toM = fromM + 2;
        return {
          normalized: iso(y, fromM, 1) + ".." + iso(y, toM, lastDay(y, toM)),
          type: "PERIOD",
          meta: { label: "Q" + q + " " + y },
        };
      })
    );
    spans = spans.concat(
      findSpans(text, /([1-4])\s*квартал(?:а)?\s+(\d{4})/gi, function (m) {
        var q = parseInt(m[1], 10);
        var y = parseInt(m[2], 10);
        var fromM = (q - 1) * 3 + 1;
        var toM = fromM + 2;
        return {
          normalized: iso(y, fromM, 1) + ".." + iso(y, toM, lastDay(y, toM)),
          type: "PERIOD",
          meta: { label: "Q" + q + " " + y },
        };
      })
    );
    spans = spans.concat(
      findSpans(
        text,
        /(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*\s+(\d{4})/gi,
        function (m) {
          var month = MONTHS[m[1].toLowerCase()];
          var y = parseInt(m[2], 10);
          if (!month) return null;
          return {
            normalized: iso(y, month, 1) + ".." + iso(y, month, lastDay(y, month)),
            type: "PERIOD",
            meta: { label: m[0] },
          };
        }
      )
    );
    spans = spans.concat(
      findSpans(text, /за\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*/gi, function (m) {
        var month = MONTHS[m[1].toLowerCase()];
        if (!month) return null;
        return {
          normalized: iso(2026, month, 1) + ".." + iso(2026, month, lastDay(2026, month)),
          type: "PERIOD",
          meta: { label: m[0] },
        };
      })
    );
    spans = spans.concat(
      findSpans(text, /в\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*/gi, function (m) {
        var month = MONTHS[m[1].toLowerCase()];
        if (!month) return null;
        return {
          normalized: iso(2026, month, 1) + ".." + iso(2026, month, lastDay(2026, month)),
          type: "PERIOD",
          meta: { label: m[0] },
        };
      })
    );
    return spans;
  }

  function findValues(text) {
    return findSpans(text, /\d+([.,]\d+)?\s*%/g, function (m) {
      return { normalized: m[0].replace(/\s+/g, ""), type: "VALUE" };
    });
  }

  function mergeNonOverlapping(spans) {
    spans.sort(function (a, b) {
      return a.start - b.start || b.end - b.start - (a.end - a.start);
    });
    var out = [];
    var lastEnd = -1;
    spans.forEach(function (s) {
      if (s.start >= lastEnd) {
        out.push(s);
        lastEnd = s.end;
      }
    });
    return out;
  }

  function extractTemporal(text) {
    return mergeNonOverlapping(findDates(text).concat(findPeriods(text)).concat(findValues(text)));
  }

  global.SattaDateParser = {
    extractTemporal: extractTemporal,
    findDates: findDates,
    findPeriods: findPeriods,
  };
})(typeof window !== "undefined" ? window : globalThis);
