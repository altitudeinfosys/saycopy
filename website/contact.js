(() => {
  const form = document.querySelector("#contact-form");
  if (!form) return;

  const status = document.querySelector("#form-status");
  const submitButton = document.querySelector("#submit-button");
  const startedAt = document.querySelector("#started-at");
  startedAt.value = String(Date.now());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    status.className = "form-status";
    status.textContent = "Sending your message…";

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "We could not send your message.");
      }

      form.reset();
      startedAt.value = String(Date.now());
      status.className = "form-status form-status-success";
      status.textContent = "Message sent. Thank you—we’ll get back to you soon.";
    } catch (error) {
      status.className = "form-status form-status-error";
      status.textContent = error.message || "We could not send your message. Please try again.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send message";
    }
  });
})();
