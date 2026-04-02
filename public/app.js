const messageEl = document.getElementById("message");

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d4380d" : "#237804";
}

async function postJson(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (error) {
    return { ok: false, data: { message: "网络异常，请稍后重试" } };
  }
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  const result = await postJson("/api/login", { username, password });
  if (result.ok) {
    localStorage.setItem("token", result.data.token);
    localStorage.setItem("username", result.data.user.username);
    setMessage(`登录成功，欢迎你：${result.data.user.username}`);
    window.location.href = "/products.html";
    return;
  }
  setMessage(result.data.message, true);
});

document.getElementById("goRegisterBtn").addEventListener("click", () => {
  window.location.href = "/register.html";
});
