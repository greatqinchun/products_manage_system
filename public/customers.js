const token = localStorage.getItem("token");
const username = localStorage.getItem("username");
if (!token) window.location.href = "/";
document.getElementById("currentUser").textContent = username || "-";

const messageEl = document.getElementById("message");
const tbody = document.getElementById("customerTbody");
const form = document.getElementById("customerForm");
const formTitle = document.getElementById("formTitle");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const customerSearchInput = document.getElementById("customerSearchInput");
const customerSearchBtn = document.getElementById("customerSearchBtn");
let editingId = null;
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

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = "新增客户";
  cancelEditBtn.classList.add("hidden");
}

function renderRows(list) {
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7">暂无客户数据</td></tr>';
    return;
  }
  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.customer_name}</td>
      <td>${item.customer_phone}</td>
      <td>${item.invoice_title}</td>
      <td>${item.tax_no}</td>
      <td>${item.address}</td>
      <td>
        <button type="button" data-action="edit" data-id="${item.id}">编辑</button>
        <button type="button" data-action="delete" data-id="${item.id}" class="danger">删除</button>
      </td>
    `;
    tr.dataset.item = JSON.stringify(item);
    tbody.appendChild(tr);
  });
}

async function loadCustomers() {
  const result = await apiRequest(
    `/api/customers?keyword=${encodeURIComponent(currentKeyword)}`
  );
  if (!result) return;
  if (!result.ok) return setMessage(result.data.message || "加载客户失败", true);
  renderRows(result.data.list || []);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    customer_name: document.getElementById("customerName").value.trim(),
    customer_phone: document.getElementById("customerPhone").value.trim(),
    invoice_title: document.getElementById("invoiceTitle").value.trim(),
    tax_no: document.getElementById("taxNo").value.trim(),
    address: document.getElementById("address").value.trim(),
  };
  const isEdit = editingId !== null;
  const result = await apiRequest(
    isEdit ? `/api/customers/${editingId}` : "/api/customers",
    { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) }
  );
  if (!result) return;
  setMessage(result.data.message, !result.ok);
  if (result.ok) {
    resetForm();
    loadCustomers();
  }
});

cancelEditBtn.addEventListener("click", resetForm);

customerSearchBtn.addEventListener("click", async () => {
  currentKeyword = customerSearchInput.value.trim();
  await loadCustomers();
});

customerSearchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    currentKeyword = customerSearchInput.value.trim();
    await loadCustomers();
  }
});

tbody.addEventListener("click", async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.getAttribute("data-id");
  const action = target.getAttribute("data-action");
  if (!id || !action) return;
  if (action === "edit") {
    const row = target.closest("tr");
    const item = JSON.parse((row && row.dataset.item) || "{}");
    editingId = Number(id);
    formTitle.textContent = `编辑客户 #${id}`;
    cancelEditBtn.classList.remove("hidden");
    document.getElementById("customerName").value = item.customer_name || "";
    document.getElementById("customerPhone").value = item.customer_phone || "";
    document.getElementById("invoiceTitle").value = item.invoice_title || "";
    document.getElementById("taxNo").value = item.tax_no || "";
    document.getElementById("address").value = item.address || "";
    return;
  }
  if (action === "delete") {
    if (!confirm("确认删除该客户吗？")) return;
    const result = await apiRequest(`/api/customers/${id}`, { method: "DELETE" });
    if (!result) return;
    setMessage(result.data.message, !result.ok);
    if (result.ok) loadCustomers();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "/";
});

loadCustomers();
