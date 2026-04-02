const token = localStorage.getItem("token");
const username = localStorage.getItem("username");
if (!token) window.location.href = "/";
document.getElementById("currentUser").textContent = username || "-";

const messageEl = document.getElementById("message");
const tbody = document.getElementById("salespersonTbody");
const form = document.getElementById("salespersonForm");
const formTitle = document.getElementById("formTitle");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const salespersonSearchInput = document.getElementById("salespersonSearchInput");
const salespersonSearchBtn = document.getElementById("salespersonSearchBtn");
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
  formTitle.textContent = "新增销售人员";
  cancelEditBtn.classList.add("hidden");
}

function renderRows(list) {
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8">暂无销售人员数据</td></tr>';
    return;
  }
  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.staff_no}</td>
      <td>${item.staff_name}</td>
      <td>${item.gender}</td>
      <td>${String(item.birthday).slice(0, 10)}</td>
      <td>${item.phone}</td>
      <td>${item.home_address}</td>
      <td>
        <button type="button" data-action="edit" data-id="${item.id}">编辑</button>
        <button type="button" data-action="delete" data-id="${item.id}" class="danger">删除</button>
      </td>
    `;
    tr.dataset.item = JSON.stringify(item);
    tbody.appendChild(tr);
  });
}

async function loadSalespersons() {
  const result = await apiRequest(
    `/api/salespersons?keyword=${encodeURIComponent(currentKeyword)}`
  );
  if (!result) return;
  if (!result.ok) return setMessage(result.data.message || "加载销售人员失败", true);
  renderRows(result.data.list || []);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    staff_no: document.getElementById("staffNo").value.trim(),
    staff_name: document.getElementById("staffName").value.trim(),
    gender: document.getElementById("gender").value,
    birthday: document.getElementById("birthday").value,
    phone: document.getElementById("phone").value.trim(),
    home_address: document.getElementById("homeAddress").value.trim(),
  };
  if (
    !payload.staff_no ||
    !payload.staff_name ||
    !payload.gender ||
    !payload.birthday ||
    !payload.phone ||
    !payload.home_address
  ) {
    setMessage("请完整填写销售人员信息", true);
    return;
  }
  const isEdit = editingId !== null;
  const result = await apiRequest(
    isEdit ? `/api/salespersons/${editingId}` : "/api/salespersons",
    { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) }
  );
  if (!result) return;
  setMessage(result.data.message, !result.ok);
  if (result.ok) {
    resetForm();
    loadSalespersons();
  }
});

cancelEditBtn.addEventListener("click", resetForm);

salespersonSearchBtn.addEventListener("click", async () => {
  currentKeyword = salespersonSearchInput.value.trim();
  await loadSalespersons();
});

salespersonSearchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    currentKeyword = salespersonSearchInput.value.trim();
    await loadSalespersons();
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
    formTitle.textContent = `编辑销售人员 #${id}`;
    cancelEditBtn.classList.remove("hidden");
    document.getElementById("staffNo").value = item.staff_no || "";
    document.getElementById("staffName").value = item.staff_name || "";
    document.getElementById("gender").value = item.gender || "";
    document.getElementById("birthday").value = String(item.birthday || "").slice(0, 10);
    document.getElementById("phone").value = item.phone || "";
    document.getElementById("homeAddress").value = item.home_address || "";
    return;
  }
  if (action === "delete") {
    if (!confirm("确认删除该销售人员吗？")) return;
    const result = await apiRequest(`/api/salespersons/${id}`, { method: "DELETE" });
    if (!result) return;
    setMessage(result.data.message, !result.ok);
    if (result.ok) loadSalespersons();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "/";
});

loadSalespersons();
