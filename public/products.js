const token = localStorage.getItem("token");
const username = localStorage.getItem("username");

if (!token) {
  window.location.href = "/";
}

const messageEl = document.getElementById("message");
const tbody = document.getElementById("productTbody");
const form = document.getElementById("productForm");
const formTitle = document.getElementById("formTitle");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const productSearchInput = document.getElementById("productSearchInput");
const productSearchBtn = document.getElementById("productSearchBtn");

let editingId = null;
let currentKeyword = "";

document.getElementById("currentUser").textContent = username || "-";

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
  formTitle.textContent = "新增产品";
  cancelEditBtn.classList.add("hidden");
}

function renderRows(list) {
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5">暂无产品数据</td></tr>`;
    return;
  }

  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.product_name}</td>
      <td>${Number(item.price).toFixed(2)}</td>
      <td>${item.stock}</td>
      <td>
        <button type="button" data-action="edit" data-id="${item.id}">编辑</button>
        <button type="button" data-action="delete" data-id="${item.id}" class="danger">删除</button>
      </td>
    `;
    tr.dataset.item = JSON.stringify(item);
    tbody.appendChild(tr);
  });
}

async function loadProducts() {
  const result = await apiRequest(
    `/api/products?keyword=${encodeURIComponent(currentKeyword)}`
  );
  if (!result) {
    return;
  }
  if (!result.ok) {
    setMessage(result.data.message || "加载产品失败", true);
    return;
  }
  renderRows(result.data.list || []);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    product_name: document.getElementById("productName").value.trim(),
    price: document.getElementById("productPrice").value,
    stock: document.getElementById("productStock").value,
  };

  const isEdit = editingId !== null;
  const url = isEdit ? `/api/products/${editingId}` : "/api/products";
  const method = isEdit ? "PUT" : "POST";

  const result = await apiRequest(url, {
    method,
    body: JSON.stringify(payload),
  });
  if (!result) {
    return;
  }

  setMessage(result.data.message, !result.ok);
  if (result.ok) {
    resetForm();
    await loadProducts();
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetForm();
});

tbody.addEventListener("click", async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const id = target.getAttribute("data-id");
  const action = target.getAttribute("data-action");
  if (!id || !action) {
    return;
  }

  if (action === "edit") {
    const row = target.closest("tr");
    if (!row) {
      return;
    }
    const item = JSON.parse(row.dataset.item || "{}");
    editingId = Number(id);
    formTitle.textContent = `编辑产品 #${id}`;
    cancelEditBtn.classList.remove("hidden");
    document.getElementById("productName").value = item.product_name || "";
    document.getElementById("productPrice").value = item.price || "";
    document.getElementById("productStock").value = item.stock || "";
    return;
  }

  if (action === "delete") {
    if (!confirm("确认删除该产品吗？")) {
      return;
    }
    const result = await apiRequest(`/api/products/${id}`, { method: "DELETE" });
    if (!result) {
      return;
    }
    setMessage(result.data.message, !result.ok);
    if (result.ok) {
      await loadProducts();
    }
  }
});

productSearchBtn.addEventListener("click", async () => {
  currentKeyword = productSearchInput.value.trim();
  await loadProducts();
});

productSearchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    currentKeyword = productSearchInput.value.trim();
    await loadProducts();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "/";
});

async function init() {
  await loadProducts();
}

init();
