/**
 * Rezo embeddable widget.
 *
 *   <script src="https://cdn.rezo.app/widget.js"
 *           data-rezo-key="pk_live_xxx"
 *           data-rezo-order="ORD-1042"
 *           async></script>
 *
 * Injects a launcher and opens the dispute flow in an isolated iframe. The
 * frame matters: the merchant's CSS cannot reach inside it, and the camera
 * permission belongs to us rather than to their page.
 *
 * Only the publishable key travels in the page. Nothing here can move money;
 * every consequential action is decided server side behind the guarded tool
 * layer.
 */
(function () {
  "use strict";

  var script = document.currentScript ||
    document.querySelector("script[data-rezo-key]");
  if (!script) return;

  var key = script.getAttribute("data-rezo-key") || "";
  var order = script.getAttribute("data-rezo-order") || "";
  var store = script.getAttribute("data-rezo-store") || "";
  var label = script.getAttribute("data-rezo-label") || "Report an issue";
  var origin = new URL(script.src, location.href).origin;

  var opened = false;

  function styles() {
    var css = document.createElement("style");
    css.textContent = [
      ".rezo-launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;",
      "display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;",
      "border-radius:8px;border:1px solid rgba(24,24,27,.12);background:#18181b;color:#fff;",
      "font:510 13.5px/1 Inter,-apple-system,system-ui,sans-serif;cursor:pointer;",
      "box-shadow:0 2px 6px rgba(24,24,27,.14),0 12px 32px rgba(24,24,27,.12)}",
      ".rezo-launch:active{transform:scale(.975)}",
      ".rezo-scrim{position:fixed;inset:0;background:rgba(24,24,27,.32);z-index:2147483001;",
      "display:flex;justify-content:flex-end;opacity:0;transition:opacity .18s cubic-bezier(.16,1,.3,1)}",
      ".rezo-scrim.on{opacity:1}",
      ".rezo-frame{width:min(460px,100vw);height:100%;border:0;background:#fff;",
      "box-shadow:-8px 0 40px rgba(24,24,27,.18);transform:translateX(100%);",
      "transition:transform .28s cubic-bezier(.16,1,.3,1)}",
      ".rezo-scrim.on .rezo-frame{transform:none}",
      ".rezo-close{position:absolute;top:16px;left:16px;height:30px;padding:0 12px;",
      "border-radius:6px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.12);",
      "color:#fff;font:510 12.5px Inter,system-ui,sans-serif;cursor:pointer}",
      "@media (prefers-reduced-motion:reduce){.rezo-scrim,.rezo-frame{transition:none}}",
    ].join("");
    document.head.appendChild(css);
  }

  function open() {
    if (opened) return;
    opened = true;

    var scrim = document.createElement("div");
    scrim.className = "rezo-scrim";

    var frame = document.createElement("iframe");
    frame.className = "rezo-frame";
    frame.allow = "camera; microphone";
    frame.setAttribute("title", "Report an issue");
    frame.src = origin + "/widget.html?" + new URLSearchParams({
      key: key, order: order, store: store, embedded: "1",
    });

    var close = document.createElement("button");
    close.className = "rezo-close";
    close.textContent = "Close";

    function dismiss() {
      scrim.classList.remove("on");
      setTimeout(function () { scrim.remove(); opened = false; }, 260);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") dismiss(); }

    close.onclick = dismiss;
    scrim.addEventListener("click", function (e) { if (e.target === scrim) dismiss(); });
    document.addEventListener("keydown", onKey);

    scrim.appendChild(close);
    scrim.appendChild(frame);
    document.body.appendChild(scrim);
    requestAnimationFrame(function () { scrim.classList.add("on"); });
  }

  // The host page can pass order context in, or drive the widget itself.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === "rezo:close") {
      var scrim = document.querySelector(".rezo-scrim");
      if (scrim) { scrim.remove(); opened = false; }
    }
  });

  window.Rezo = {
    open: function (opts) {
      if (opts && opts.order) order = opts.order;
      if (opts && opts.store) store = opts.store;
      open();
    },
  };

  function mount() {
    styles();
    // A merchant can place their own trigger with data-rezo-trigger and we
    // stay out of their layout entirely.
    var custom = document.querySelectorAll("[data-rezo-trigger]");
    if (custom.length) {
      custom.forEach(function (el) {
        el.addEventListener("click", function (e) {
          e.preventDefault();
          var o = el.getAttribute("data-rezo-order");
          if (o) order = o;
          open();
        });
      });
      return;
    }
    var button = document.createElement("button");
    button.className = "rezo-launch";
    button.type = "button";
    button.textContent = label;
    button.onclick = open;
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
