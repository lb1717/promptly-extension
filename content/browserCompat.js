(function () {
  if (typeof globalThis.browser !== "undefined" && typeof globalThis.chrome === "undefined") {
    globalThis.chrome = globalThis.browser;
  }
})();
