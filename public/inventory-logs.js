const token = localStorage.getItem("token");
const username = localStorage.getItem("username");
if (!token) window.location.href = "/";
document.getElementById("currentUser").textContent = username || "-";

const messageEl = document.getElementById("message");
const tbody = document.getElementById("inventoryLogTbody");
const logSearchInput = document.getElementById("logSearchInput");
const logSearchBtn = document.getElementById("logSearchBtn");
let currentKeyword = "";

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d4380d" : "#237804";
}

async function apiRequest(url, options = {}) {
  let res;
  let data;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    data = await res.json();
  } catch (error) {
    setMessage("网络异常，请稍后重试", true);
    return null;
  }
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.href = "/";
    return null;
  }
  return { ok: res.ok, data };
}

function renderRows(list) {
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8">暂无库存日志</td></tr>`;
    return;
  }
  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${String(item.created_at || "").replace("T", " ").slice(0, 19)}</td>
      <td>${item.product_name} (#${item.product_id})</td>
      <td>${item.change_type}</td>
      <td>${item.change_qty}</td>
      <td>${item.before_stock}</td>
      <td>${item.after_stock}</td>
      <td>${item.ref_type}${item.ref_id ? `#${item.ref_id}` : ""}</td>
      <td>${item.remark || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadLogs() {
  const result = await apiRequest(
    `/api/inventory-logs?keyword=${encodeURIComponent(currentKeyword)}`
  );
  if (!result) return;
  if (!result.ok) return setMessage(result.data.message || "加载库存日志失败", true);
  renderRows(result.data.list || []);
}

logSearchBtn.addEventListener("click", async () => {
  currentKeyword = logSearchInput.value.trim();
  await loadLogs();
});

logSearchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    currentKeyword = logSearchInput.value.trim();
    await loadLogs();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "/";
});

loadLogs();
