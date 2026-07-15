(() => {
  const form = document.querySelector("#contact-form");
  if (!form) return;

  const submitButton = document.querySelector("#submit-button");
  const startedAt = document.querySelector("#started-at");
  const feedback = document.querySelector("#form-feedback");
  const feedbackIcon = document.querySelector("#form-feedback-icon");
  const feedbackTitle = document.querySelector("#form-feedback-title");
  const feedbackMessage = document.querySelector("#form-feedback-message");
  const fields = {
    name: document.querySelector("#name"),
    email: document.querySelector("#email"),
    topic: document.querySelector("#topic"),
    message: document.querySelector("#message"),
  };
  const errors = Object.fromEntries(
    Object.keys(fields).map((name) => [name, document.querySelector(`#${name}-error`)]),
  );
  startedAt.value = String(Date.now());

  function showFeedback(type, title, message) {
    feedback.hidden = false;
    feedback.className = `form-feedback form-feedback-${type}`;
    feedbackIcon.textContent = type === "success" ? "✓" : "!";
    feedbackTitle.textContent = title;
    feedbackMessage.textContent = message;
    if (type === "success") {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      requestAnimationFrame(() => feedback.scrollIntoView({ behavior, block: "center" }));
    }
  }

  function hideFeedback() {
    feedback.hidden = true;
    feedback.className = "form-feedback";
    feedbackTitle.textContent = "";
    feedbackMessage.textContent = "";
  }

  function setFieldError(name, message) {
    const field = fields[name];
    const error = errors[name];
    if (!field || !error) return;

    if (message) {
      field.setAttribute("aria-invalid", "true");
      error.textContent = message;
      error.hidden = false;
    } else {
      field.removeAttribute("aria-invalid");
      error.textContent = "";
      error.hidden = true;
    }
  }

  function validateForm() {
    const values = {
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      topic: fields.topic.value,
      message: fields.message.value.trim(),
    };
    const messages = {
      name: values.name.length < 2 ? "Enter a name with at least 2 characters." : "",
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
        ? ""
        : "Enter a valid email address so we can reply.",
      topic: values.topic ? "" : "Select what we can help you with.",
      message:
        values.message.length < 10
          ? "Enter a message with at least 10 non-space characters."
          : "",
    };

    let firstInvalidField = null;
    for (const [name, message] of Object.entries(messages)) {
      setFieldError(name, message);
      if (message && !firstInvalidField) firstInvalidField = fields[name];
    }

    return { values, firstInvalidField };
  }

  for (const [name, field] of Object.entries(fields)) {
    const eventName = field.tagName === "SELECT" ? "change" : "input";
    field.addEventListener(eventName, () => {
      setFieldError(name, "");
      if (feedback.classList.contains("form-feedback-error")) hideFeedback();
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideFeedback();
    const { values, firstInvalidField } = validateForm();
    if (firstInvalidField) {
      showFeedback("error", "Please check the form", "Correct the highlighted field and try again.");
      firstInvalidField.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending…";

    const data = { ...Object.fromEntries(new FormData(form).entries()), ...values };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const requestError = new Error(result.error || "We could not send your message.");
        requestError.field = result.field;
        throw requestError;
      }

      form.reset();
      startedAt.value = String(Date.now());
      for (const name of Object.keys(fields)) setFieldError(name, "");
      showFeedback(
        "success",
        "Message sent successfully",
        "Thank you for contacting SayCopy. We received your message and will reply to the email address you provided.",
      );
    } catch (error) {
      if (error.field && fields[error.field]) {
        setFieldError(error.field, error.message);
        fields[error.field].focus();
      }
      showFeedback(
        "error",
        "Message not sent",
        error.message || "We could not send your message. Please try again.",
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send message";
    }
  });
})();
