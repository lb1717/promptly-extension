function initPresentation() {
  const slides = Array.from(document.querySelectorAll(".slide"));
  let index = 0;

  const show = (next) => {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((slide, i) => slide.classList.toggle("active", i === index));
  };

  const enterPresent = () => {
    document.body.classList.add("presenting");
    show(index);
  };

  const exitPresent = () => {
    document.body.classList.remove("presenting");
    slides.forEach((slide) => slide.classList.remove("active"));
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
      event.preventDefault();
      if (!document.body.classList.contains("presenting")) {
        enterPresent();
      } else {
        show(index + 1);
      }
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      if (document.body.classList.contains("presenting")) {
        show(index - 1);
      }
    } else if (event.key === "Escape") {
      exitPresent();
    } else if (event.key === "f" || event.key === "F") {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
        enterPresent();
      } else {
        document.exitFullscreen?.();
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initPresentation);
