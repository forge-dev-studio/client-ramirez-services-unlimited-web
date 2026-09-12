/* ============================================================================
   Ramirez Services Unlimited LLC. Measurement only.

   Three jobs, all on every page:

     1. ATTRIBUTION. Where a visitor came from is recorded on their FIRST page,
        kept for 90 days in localStorage, and sent with the estimate form days
        later if that is when they send it. A fresh campaign arrival (any
        utm_*, gclid, fbclid, msclkid) replaces the whole set at once, never key
        by key, so a stale medium is never paired with a new source. The
        standard is ~/ghl-wiring/GHL-LEAD-ATTRIBUTION-WIRING.md. The lead worker
        reads `source` (a readable label), `channel` (one of six buckets it
        turns into a src- tag) and `attribution` (the raw keys, written verbatim
        into the CRM note). Ported from the Hometown Social build.

     2. THE LEAD EVENT. ui.js calls RSUTrack.lead() only after the worker
        answers 2xx. That sends GA4 `generate_lead` and the Google Ads
        "Estimate form sent" conversion. A button press that fails to send
        counts as nothing.

     3. THE PHONE TAP. Any tap on a tel: link sends GA4 `phone_tap` and the
        Google Ads "Phone tap on website" conversion. It never blocks the
        dialer: the link does exactly what it did before.

   Every call is guarded. If the Google tag is missing, blocked or slow, the
   page, the form and the phone links behave exactly as they would without
   this file. Nothing here may ever stop a lead.
   ============================================================================ */

(function () {
  "use strict";

  var KEY = "rsu_attr";
  var TTL = 90 * 24 * 60 * 60 * 1000;
  var CAMPAIGN = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"];

  function param(n) {
    var m = location.search.match(new RegExp("[?&]" + n + "=([^&]*)"));
    if (!m) return "";
    try { return decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { return m[1]; }
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return o.ts && Date.now() - o.ts > TTL ? {} : o;
    } catch (e) { return {}; }
  }
  function save(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); }
    catch (e) { try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e2) { /* private mode */ } }
  }
  function host(u) {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }
  function ownHost() { return location.hostname.replace(/^www\./, ""); }
  function cap(w) { return w.charAt(0).toUpperCase() + w.slice(1); }

  /* ------------------------------------------------ 1. first-touch record */
  // Runs once per page load, before anything else, so a visitor who lands on
  // a service page Monday and sends the form Thursday still carries Monday.
  var s = load();
  var fresh = CAMPAIGN.some(function (k) { return param(k); });
  if (fresh || !s.landing) {
    if (fresh) CAMPAIGN.forEach(function (k) { s[k] = param(k); });
    else CAMPAIGN.forEach(function (k) { s[k] = s[k] || ""; });
    if (!s.landing) s.landing = location.pathname + location.search;
    if (!s.referrer) s.referrer = document.referrer || "";
    s.ts = Date.now();
    save(s);
  }

  var SOCIAL = /facebook\.|instagram\.|fb\.com|tiktok\.|linkedin\.|nextdoor\.|threads\./;
  var SEARCH = /google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\./;
  var AI = /chatgpt\.|openai\.|perplexity\.|claude\./;
  function isSocialSource(src) {
    return /^(facebook|instagram|meta|fb|ig|tiktok|linkedin|nextdoor|threads)$/.test(src);
  }

  // The bucket the worker tags the contact with (src-paid-search and so on).
  // gclid and msclkid only exist on a paid click, so they are a safe paid
  // signal. fbclid is stamped on ANY link tapped inside Facebook or Instagram,
  // organic posts included, so it is a social signal and never a paid one. A
  // same-site referrer means someone browsing this site, which is Direct, but
  // fbclid is checked first so an in-app browser that hands us our own host as
  // the referrer cannot erase a real social arrival.
  function channel() {
    var med = (s.utm_medium || "").toLowerCase();
    var src = (s.utm_source || "").toLowerCase();
    var paid = !!s.gclid || !!s.msclkid || /^(cpc|ppc|paid|paidsearch|paid-search|paidsocial|paid-social)$/.test(med);
    if (paid) return isSocialSource(src) || /social/.test(med) ? "paid-social" : "paid-search";
    if (src) return isSocialSource(src) ? "organic-social" : "referral";
    if (s.fbclid) return "organic-social";
    var h = host(s.referrer || "");
    if (!h || h === ownHost()) return "direct";
    if (SEARCH.test(h)) return "organic-search";
    if (SOCIAL.test(h)) return "organic-social";
    return "referral";
  }

  // The label a person reads on the contact record.
  function source() {
    var med = (s.utm_medium || "").toLowerCase();
    var src = (s.utm_source || "").toLowerCase();
    var c = channel();
    if (c === "paid-search") {
      if (!src || src === "google") return "Google Ads";
      if (src === "bing" || s.msclkid) return "Microsoft Ads";
      return cap(src) + " Paid";
    }
    if (c === "paid-social") return cap(src || "meta") + " Paid";
    if (src) return cap(src) + (med ? " / " + med : "");
    if (s.fbclid) return "Social: facebook.com";
    var h = host(s.referrer || "");
    if (!h || h === ownHost()) return "Direct";
    if (/google\./.test(h)) return "Google Organic";
    if (/bing\./.test(h)) return "Bing Organic";
    if (/duckduckgo\./.test(h)) return "DuckDuckGo Organic";
    if (/yahoo\./.test(h)) return "Yahoo Organic";
    if (SOCIAL.test(h)) return "Social: " + h;
    if (AI.test(h)) return "AI Assistant: " + h;
    return "Referral: " + h;
  }

  function gaClientId() {
    var m = document.cookie.match(/_ga=GA\d\.\d\.(\d+\.\d+)/);
    return m ? m[1] : "";
  }

  /* --------------------------------------------------- 2 and 3. the events */
  function gtagReady() { return typeof window.gtag === "function"; }
  function targets() { return window.RSU_TRACK || {}; }

  function send(name, params) {
    if (!gtagReady()) return;
    try { window.gtag("event", name, params); } catch (e) { /* never let measurement break the page */ }
  }

  window.RSUTrack = {
    // Spread into the form payload last, after the visitor's own fields.
    payload: function () {
      var raw = {};
      CAMPAIGN.forEach(function (k) { if (s[k]) raw[k] = s[k]; });
      raw.landing = s.landing || "";
      raw.referrer = s.referrer || "";
      var ga = gaClientId();
      if (ga) raw.gaClientId = ga;
      return { source: source(), channel: channel(), page: location.pathname, attribution: raw };
    },

    lead: function () {
      send("generate_lead", { form_name: "estimate", lead_source: source(), lead_channel: channel() });
      if (targets().lead) send("conversion", { send_to: targets().lead });
    },

    tap: function () {
      send("phone_tap", { link_page: location.pathname, lead_source: source() });
      if (targets().tap) send("conversion", { send_to: targets().tap });
    }
  };

  // One delegated listener covers every tel: link on the page, including the
  // sticky bar and anything added later. It never calls preventDefault.
  document.addEventListener("click", function (event) {
    var el = event.target;
    while (el && el !== document) {
      if (el.tagName === "A" && /^tel:/i.test(el.getAttribute("href") || "")) {
        window.RSUTrack.tap();
        return;
      }
      el = el.parentNode;
    }
  }, true);
})();
