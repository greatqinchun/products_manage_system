const messageEl = document.getElementById("message");

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d4380d" : "#237804";
}

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setMessage(data.message, !res.ok);
    if (res.ok) {
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    }
  } catch (error) {
    setMessage("网络异常，请稍后重试", true);
  }
});

document.getElementById("goLoginBtn").addEventListener("click", () => {
  window.location.href = "/";
});
