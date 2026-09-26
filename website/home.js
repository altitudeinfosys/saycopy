(() => {
  const demo = document.querySelector("#demo");
  if (!demo) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const title = document.querySelector("#demo-title");
  const input = document.querySelector("#demo-input");
  const statusText = document.querySelector("#demo-status-text");
  const label = document.querySelector("#demo-label");
  const text = document.querySelector("#demo-text");
  const copy = document.querySelector("#demo-copy");

  const scenarios = [
    {
      mode: "record",
      title: "Transcribe",
      working: "Cleaning up…",
      label: "Result",
      text: "Running ten minutes late. Start without me and I'll catch up on the notes.",
    },
    {
      mode: "translate",
      title: "Translate",
      listening: "Listening…",
      working: "Translating…",
      input: "I'm running ten minutes late. Start without me and I'll catch up on the notes.",
      label: "Spanish",
      text: "Llego diez minutos tarde. Empiecen sin mí y me pongo al día con las notas.",
    },
  ];

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = () =>
    new Promise((resolve) => {
      if (!document.hidden) return resolve();
      document.addEventListener("visibilitychange", function onChange() {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", onChange);
        resolve();
      });
    });

  async function play(scenario) {
    demo.dataset.mode = scenario.mode;
    title.textContent = scenario.title;
    input.textContent = "";
    label.textContent = scenario.label;
    copy.textContent = "Copy";
    text.textContent = "";

    demo.dataset.state = "idle";
    statusText.textContent = "Ready to record";
    await wait(1100);

    demo.dataset.state = "recording";
    for (let second = 0; second <= 4; second += 1) {
      statusText.textContent =
        scenario.mode === "record" ? `Recording 0:0${second}` : scenario.listening;
      await wait(620);
    }

    if (scenario.input) input.textContent = scenario.input;
    demo.dataset.state = "processing";
    statusText.textContent = scenario.working;
    await wait(1300);

    demo.dataset.state = "result";
    statusText.textContent = "Done";
    const words = scenario.text.split(" ");
    for (let index = 1; index <= words.length; index += 1) {
      text.textContent = words.slice(0, index).join(" ");
      await wait(70);
    }
    await wait(900);

    demo.dataset.state = "copied";
    copy.textContent = "Copied ✓";
    await wait(2200);
  }

  (async () => {
    for (let index = 0; ; index = (index + 1) % scenarios.length) {
      await visible();
      await play(scenarios[index]);
    }
  })();
})();
