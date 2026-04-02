const token = localStorage.getItem("token");
const username = localStorage.getItem("username");
if (!token) window.location.href = "/";
document.getElementById("currentUser").textContent = username || "-";

const messageEl = document.getElementById("message");
const tbody = document.getElementById("recordTbody");
const form = document.getElementById("recordForm");
const formTitle = document.getElementById("formTitle");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const productSelect = document.getElementById("productSelect");
const customerSelect = document.getElementById("customerSelect");
const salespersonSelect = document.getElementById("salespersonSelect");
const salesDateInput = document.getElementById("salesDate");
const invoiceNoInput = document.getElementById("invoiceNo");
const recordProductSearchInput = document.getElementById("recordProductSearchInput");
const recordCustomerSearchInput = document.getElementById("recordCustomerSearchInput");
const recordSearchBtn = document.getElementById("recordSearchBtn");
let editingId = null;
let currentProductKeyword = "";
let currentCustomerKeyword = "";

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

function fillSelect(el, list, valueKey, labelKey, placeholder) {
  el.innerHTML = `<option value="">${placeholder}</option>`;
  list.forEach((item) => {
    const op = document.createElement("option");
    op.value = String(item[valueKey]);
    op.textContent = item[labelKey];
    el.appendChild(op);
  });
}

async function loadOptions() {
  const result = await apiRequest("/api/sales-records/options");
  if (!result) return;
  if (!result.ok) return setMessage(result.data.message || "加载下拉数据失败", true);
  const options = result.data.options || {};
  fillSelect(productSelect, options.products || [], "id", "product_name", "请选择产品");
  fillSelect(customerSelect, options.customers || [], "customer_name", "customer_name", "请选择客户");
  fillSelect(salespersonSelect, options.salespersons || [], "staff_name", "staff_name", "请选择销售人员");
}

function resetForm() {
  editingId = null;
  form.reset();
  salesDateInput.valueAsDate = new Date();
  formTitle.textContent = "新增销售流水";
  cancelEditBtn.classList.add("hidden");
  fillInvoiceNo();
}

async function fillInvoiceNo() {
  if (editingId !== null) return;
  const salesDate = salesDateInput.value;
  if (!salesDate) return;
  const result = await apiRequest(
    `/api/sales-records/next-invoice-no?sales_date=${encodeURIComponent(salesDate)}`
  );
  if (!result || !result.ok) return;
  invoiceNoInput.value = result.data.invoice_no || "";
}

function renderRows(list) {
  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9">暂无销售流水数据</td></tr>';
    return;
  }
  list.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.product_id}</td>
      <td>${item.product_name}</td>
      <td>${String(item.sales_date).slice(0, 10)}</td>
      <td>${item.sales_quantity}</td>
      <td>${item.invoice_no || ""}</td>
      <td>${item.customer_name}</td>
      <td>${item.salesperson_name}</td>
      <td>
        <button type="button" data-action="edit" data-id="${item.id}">编辑</button>
        <button type="button" data-action="delete" data-id="${item.id}" class="danger">删除</button>
      </td>
    `;
    tr.dataset.item = JSON.stringify(item);
    tbody.appendChild(tr);
  });
}

async function loadRecords() {
  const result = await apiRequest(
    `/api/sales-records?product_keyword=${encodeURIComponent(
      currentProductKeyword
    )}&customer_keyword=${encodeURIComponent(currentCustomerKeyword)}`
  );
  if (!result) return;
  if (!result.ok) return setMessage(result.data.message || "加载销售流水失败", true);
  renderRows(result.data.list || []);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    product_id: Number(productSelect.value),
    sales_date: salesDateInput.value,
    sales_quantity: Number(document.getElementById("salesQuantity").value),
    invoice_no: invoiceNoInput.value.trim(),
    customer_name: customerSelect.value,
    salesperson_name: salespersonSelect.value,
  };
  const isEdit = editingId !== null;
  const result = await apiRequest(
    isEdit ? `/api/sales-records/${editingId}` : "/api/sales-records",
    { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) }
  );
  if (!result) return;
  setMessage(result.data.message, !result.ok);
  if (result.ok) {
    resetForm();
    loadRecords();
  }
});

cancelEditBtn.addEventListener("click", resetForm);

recordSearchBtn.addEventListener("click", async () => {
  currentProductKeyword = recordProductSearchInput.value.trim();
  currentCustomerKeyword = recordCustomerSearchInput.value.trim();
  await loadRecords();
});

recordProductSearchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    currentProductKeyword = recordProductSearchInput.value.trim();
    currentCustomerKeyword = recordCustomerSearchInput.value.trim();
    await loadRecords();
  }
});

recordCustomerSearchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    currentProductKeyword = recordProductSearchInput.value.trim();
    currentCustomerKeyword = recordCustomerSearchInput.value.trim();
    await loadRecords();
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
    formTitle.textContent = `编辑销售流水 #${id}`;
    cancelEditBtn.classList.remove("hidden");
    productSelect.value = String(item.product_id || "");
    salesDateInput.value = String(item.sales_date || "").slice(0, 10);
    document.getElementById("salesQuantity").value = item.sales_quantity || "";
    invoiceNoInput.value = item.invoice_no || "";
    customerSelect.value = item.customer_name || "";
    salespersonSelect.value = item.salesperson_name || "";
    return;
  }
  if (action === "delete") {
    if (!confirm("确认删除该销售流水吗？")) return;
    const result = await apiRequest(`/api/sales-records/${id}`, { method: "DELETE" });
    if (!result) return;
    setMessage(result.data.message, !result.ok);
    if (result.ok) loadRecords();
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  window.location.href = "/";
});

salesDateInput.addEventListener("change", fillInvoiceNo);

async function init() {
  salesDateInput.valueAsDate = new Date();
  await loadOptions();
  await fillInvoiceNo();
  await loadRecords();
}

init();
