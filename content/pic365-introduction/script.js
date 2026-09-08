const slides = [...document.querySelectorAll(".slide")];
const counter = document.querySelector("#counter");
let current = 0;

function go(index) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides[current].scrollIntoView({ behavior: "smooth", block: "start" });
  counter.textContent = `${current + 1} / ${slides.length}`;
}

document
  .querySelector("#prev")
  .addEventListener("click", () => go(current - 1));
document
  .querySelector("#next")
  .addEventListener("click", () => go(current + 1));
document.addEventListener("keydown", (event) => {
  if (["ArrowRight", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    go(current + 1);
  }
  if (["ArrowLeft", "PageUp"].includes(event.key)) {
    event.preventDefault();
    go(current - 1);
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    current = slides.indexOf(visible.target);
    counter.textContent = `${current + 1} / ${slides.length}`;
  },
  { threshold: [0.55] },
);
slides.forEach((slide) => observer.observe(slide));
