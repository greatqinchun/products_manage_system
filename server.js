const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const sharp = require("sharp");

const app = express();
const PORT = 3000;
const JWT_SECRET = "products_manage_system_secret_key";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const dbConfig = {
  host: "127.0.0.1",
  user: "fqc",
  password: "Admin@123",
  database: "dbms",
};

async function initDb() {
  const connection = await mysql.createConnection(dbConfig);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS t_user (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS t_product (
      id INT PRIMARY KEY AUTO_INCREMENT,
      product_name VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      stock INT NOT NULL DEFAULT 0,
      owner_user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_product_user FOREIGN KEY (owner_user_id) REFERENCES t_user(id),
      CONSTRAINT uk_product_name_owner UNIQUE (product_name, owner_user_id)
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS t_customer (
      id INT PRIMARY KEY AUTO_INCREMENT,
      customer_name VARCHAR(100) NOT NULL,
      customer_phone VARCHAR(30) NOT NULL,
      invoice_title VARCHAR(200) NOT NULL,
      tax_no VARCHAR(100) NOT NULL,
      address VARCHAR(255) NOT NULL,
      owner_user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_customer_user FOREIGN KEY (owner_user_id) REFERENCES t_user(id),
      CONSTRAINT uk_customer_name_owner UNIQUE (customer_name, owner_user_id),
      CONSTRAINT uk_customer_phone_owner UNIQUE (customer_phone, owner_user_id)
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS t_salesperson (
      id INT PRIMARY KEY AUTO_INCREMENT,
      staff_no VARCHAR(50) NOT NULL,
      staff_name VARCHAR(100) NOT NULL,
      gender VARCHAR(10) NOT NULL,
      birthday DATE NOT NULL,
      phone VARCHAR(30) NOT NULL,
      home_address VARCHAR(255) NOT NULL,
      owner_user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_salesperson_user FOREIGN KEY (owner_user_id) REFERENCES t_user(id),
      CONSTRAINT uk_staff_no_owner UNIQUE (staff_no, owner_user_id),
      CONSTRAINT uk_salesperson_phone_owner UNIQUE (phone, owner_user_id)
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS t_inventory_log (
      id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT NOT NULL,
      product_name VARCHAR(100) NOT NULL,
      change_type VARCHAR(50) NOT NULL,
      change_qty INT NOT NULL,
      before_stock INT NOT NULL,
      after_stock INT NOT NULL,
      ref_type VARCHAR(50) NOT NULL,
      ref_id INT DEFAULT NULL,
      remark VARCHAR(255) DEFAULT '',
      owner_user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_inventory_log_user FOREIGN KEY (owner_user_id) REFERENCES t_user(id)
    )
  `);
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS t_sales_record (
      id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT NOT NULL,
      product_name VARCHAR(100) NOT NULL,
      sales_date DATE NOT NULL,
      sales_quantity INT NOT NULL,
      invoice_no VARCHAR(100) NOT NULL,
      customer_name VARCHAR(100) NOT NULL,
      salesperson_name VARCHAR(100) NOT NULL,
      owner_user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_sales_record_user FOREIGN KEY (owner_user_id) REFERENCES t_user(id)
    )
  `);
  const [invoiceNoColumn] = await connection.execute(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 't_sales_record'
       AND COLUMN_NAME = 'invoice_no'`,
    [dbConfig.database]
  );
  if (Number(invoiceNoColumn[0]?.total || 0) === 0) {
    await connection.execute(
      "ALTER TABLE t_sales_record ADD COLUMN invoice_no VARCHAR(100) NOT NULL DEFAULT ''"
    );
  }
  await connection.end();
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "未登录或登录已过期" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "登录态无效，请重新登录" });
  }
}

async function withDb(res, handler) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    return await handler(connection);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "服务器错误，请稍后重试" });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

function formatDatePart(dateStr) {
  return String(dateStr || "").replaceAll("-", "");
}

async function generateInvoiceNo(connection, userId, salesDate) {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS total FROM t_sales_record WHERE owner_user_id = ? AND sales_date = ?",
    [userId, salesDate]
  );
  const seq = Number(rows[0]?.total || 0) + 1;
  return `FP${formatDatePart(salesDate)}-${String(seq).padStart(4, "0")}`;
}

const IMAGE_RECO_DIR = path.join(__dirname, "uploads", "image-recognition");
const IMAGE_RECO_REGISTRY = path.join(IMAGE_RECO_DIR, "registry.json");
const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
/** 汉明距离阈值：越小越严格；略大可容忍压缩、轻微裁剪（非语义级「主体相同」） */
const DHASH_MATCH_THRESHOLD = 14;

function ensureImageRecoDir() {
  fs.mkdirSync(IMAGE_RECO_DIR, { recursive: true });
}

function loadImageRegistry() {
  try {
    const raw = fs.readFileSync(IMAGE_RECO_REGISTRY, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.entries)) {
      return data;
    }
  } catch (_) {
    /* empty or invalid */
  }
  return { entries: [] };
}

function saveImageRegistry(data) {
  ensureImageRecoDir();
  fs.writeFileSync(IMAGE_RECO_REGISTRY, JSON.stringify(data, null, 2), "utf8");
}

async function computeDHashFromPath(filePath) {
  const { data } = await sharp(filePath)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = 0n;
  let bitPos = 0;
  for (let y = 0; y < 8; y++) {
    const row = y * 9;
    for (let x = 0; x < 8; x++) {
      if (data[row + x] < data[row + x + 1]) {
        bits |= 1n << BigInt(bitPos);
      }
      bitPos++;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

async function computeDHashFromBuffer(buffer) {
  const { data } = await sharp(buffer)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = 0n;
  let bitPos = 0;
  for (let y = 0; y < 8; y++) {
    const row = y * 9;
    for (let x = 0; x < 8; x++) {
      if (data[row + x] < data[row + x + 1]) {
        bits |= 1n << BigInt(bitPos);
      }
      bitPos++;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

function hammingHex(h1, h2) {
  let x = BigInt(`0x${h1}`) ^ BigInt(`0x${h2}`);
  let n = 0;
  while (x > 0n) {
    n++;
    x &= x - 1n;
  }
  return n;
}

function imageRecoFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ALLOWED_IMAGE_EXT.has(ext) || String(file.mimetype || "").startsWith("image/")) {
    return cb(null, true);
  }
  return cb(new Error("仅支持图片文件"));
}

const imageRecoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureImageRecoDir();
    cb(null, IMAGE_RECO_DIR);
  },
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      ext = ".jpg";
    }
    cb(
      null,
      `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`
    );
  },
});

const uploadImageRecoRef = multer({
  storage: imageRecoStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 40 },
  fileFilter: imageRecoFileFilter,
});

const uploadImageRecoCompare = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: imageRecoFileFilter,
});

async function addInventoryLog(connection, payload) {
  const {
    product_id,
    product_name,
    change_type,
    change_qty,
    before_stock,
    after_stock,
    ref_type,
    ref_id,
    remark,
    owner_user_id,
  } = payload;
  await connection.execute(
    `INSERT INTO t_inventory_log
    (product_id, product_name, change_type, change_qty, before_stock, after_stock, ref_type, ref_id, remark, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      product_id,
      product_name,
      change_type,
      change_qty,
      before_stock,
      after_stock,
      ref_type,
      ref_id || null,
      remark || "",
      owner_user_id,
    ]
  );
}

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "用户名和密码不能为空" });
  }
  return withDb(res, async (connection) => {
    const [exists] = await connection.execute(
      "SELECT id FROM t_user WHERE username = ?",
      [username]
    );
    if (exists.length > 0) {
      return res.status(409).json({ message: "用户名已存在" });
    }
    const hash = await bcrypt.hash(password, 10);
    await connection.execute(
      "INSERT INTO t_user (username, password) VALUES (?, ?)",
      [username, hash]
    );
    return res.json({ message: "注册成功" });
  });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "用户名和密码不能为空" });
  }
  return withDb(res, async (connection) => {
    const [rows] = await connection.execute(
      "SELECT id, username, password FROM t_user WHERE username = ?",
      [username]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "用户名不存在,请点击注册" });
    }
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "密码错误，请重试" });
    }
    return res.json({
      message: "登录成功",
      user: { id: user.id, username: user.username },
      token: jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "2h" }
      ),
    });
  });
});

app.get("/api/products", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const keyword = String(req.query.keyword || "").trim();
    const likeKeyword = `%${keyword}%`;
    const [rows] = await connection.execute(
      `SELECT id, product_name, price, stock, created_at, updated_at
       FROM t_product
       WHERE owner_user_id = ?
         AND (? = '' OR product_name LIKE ?)
       ORDER BY id DESC`,
      [req.user.userId, keyword, likeKeyword]
    );
    return res.json({ message: "查询成功", list: rows });
  })
);

app.post("/api/products", authMiddleware, async (req, res) => {
  const { product_name, price, stock } = req.body;
  if (!product_name || price === undefined || stock === undefined) {
    return res.status(400).json({ message: "产品名称、价格、库存不能为空" });
  }
  return withDb(res, async (connection) => {
    const [exists] = await connection.execute(
      "SELECT id FROM t_product WHERE product_name = ? AND owner_user_id = ?",
      [product_name, req.user.userId]
    );
    if (exists.length > 0) {
      return res.status(409).json({ message: "产品名称已存在" });
    }
    await connection.execute(
      `INSERT INTO t_product (product_name, price, stock, owner_user_id)
       VALUES (?, ?, ?, ?)`,
      [product_name, Number(price), Number(stock), req.user.userId]
    );
    return res.json({ message: "新增产品成功" });
  });
});

app.put("/api/products/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { product_name, price, stock } = req.body;
  if (!product_name || price === undefined || stock === undefined) {
    return res.status(400).json({ message: "产品名称、价格、库存不能为空" });
  }
  return withDb(res, async (connection) => {
    const [exists] = await connection.execute(
      "SELECT id FROM t_product WHERE product_name = ? AND owner_user_id = ? AND id <> ?",
      [product_name, req.user.userId, Number(id)]
    );
    if (exists.length > 0) {
      return res.status(409).json({ message: "产品名称已存在" });
    }
    const [result] = await connection.execute(
      `UPDATE t_product
       SET product_name = ?, price = ?, stock = ?
       WHERE id = ? AND owner_user_id = ?`,
      [product_name, Number(price), Number(stock), Number(id), req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "产品不存在或无权限修改" });
    }
    return res.json({ message: "更新产品成功" });
  });
});

app.delete("/api/products/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  return withDb(res, async (connection) => {
    const [result] = await connection.execute(
      "DELETE FROM t_product WHERE id = ? AND owner_user_id = ?",
      [Number(id), req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "产品不存在或无权限删除" });
    }
    return res.json({ message: "删除产品成功" });
  });
});

app.get("/api/customers", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const keyword = String(req.query.keyword || "").trim();
    const likeKeyword = `%${keyword}%`;
    const [rows] = await connection.execute(
      `SELECT id, customer_name, customer_phone, invoice_title, tax_no, address, created_at, updated_at
       FROM t_customer
       WHERE owner_user_id = ?
         AND (? = '' OR customer_name LIKE ?)
       ORDER BY id DESC`,
      [req.user.userId, keyword, likeKeyword]
    );
    return res.json({ message: "查询成功", list: rows });
  })
);

app.post("/api/customers", authMiddleware, async (req, res) => {
  const { customer_name, customer_phone, invoice_title, tax_no, address } =
    req.body;
  if (!customer_name || !customer_phone || !invoice_title || !tax_no || !address) {
    return res.status(400).json({ message: "客户信息不能为空" });
  }
  return withDb(res, async (connection) => {
    const [nameExists] = await connection.execute(
      "SELECT id FROM t_customer WHERE customer_name = ? AND owner_user_id = ?",
      [customer_name, req.user.userId]
    );
    if (nameExists.length > 0) {
      return res.status(409).json({ message: "客户名称已存在" });
    }
    const [phoneExists] = await connection.execute(
      "SELECT id FROM t_customer WHERE customer_phone = ? AND owner_user_id = ?",
      [customer_phone, req.user.userId]
    );
    if (phoneExists.length > 0) {
      return res.status(409).json({ message: "客户电话已存在" });
    }
    await connection.execute(
      `INSERT INTO t_customer (customer_name, customer_phone, invoice_title, tax_no, address, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_name, customer_phone, invoice_title, tax_no, address, req.user.userId]
    );
    return res.json({ message: "新增客户成功" });
  });
});

app.put("/api/customers/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { customer_name, customer_phone, invoice_title, tax_no, address } =
    req.body;
  if (!customer_name || !customer_phone || !invoice_title || !tax_no || !address) {
    return res.status(400).json({ message: "客户信息不能为空" });
  }
  return withDb(res, async (connection) => {
    const [nameExists] = await connection.execute(
      "SELECT id FROM t_customer WHERE customer_name = ? AND owner_user_id = ? AND id <> ?",
      [customer_name, req.user.userId, Number(id)]
    );
    if (nameExists.length > 0) {
      return res.status(409).json({ message: "客户名称已存在" });
    }
    const [phoneExists] = await connection.execute(
      "SELECT id FROM t_customer WHERE customer_phone = ? AND owner_user_id = ? AND id <> ?",
      [customer_phone, req.user.userId, Number(id)]
    );
    if (phoneExists.length > 0) {
      return res.status(409).json({ message: "客户电话已存在" });
    }
    const [result] = await connection.execute(
      `UPDATE t_customer
       SET customer_name = ?, customer_phone = ?, invoice_title = ?, tax_no = ?, address = ?
       WHERE id = ? AND owner_user_id = ?`,
      [customer_name, customer_phone, invoice_title, tax_no, address, Number(id), req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "客户不存在或无权限修改" });
    }
    return res.json({ message: "更新客户成功" });
  });
});

app.delete("/api/customers/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  return withDb(res, async (connection) => {
    const [result] = await connection.execute(
      "DELETE FROM t_customer WHERE id = ? AND owner_user_id = ?",
      [Number(id), req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "客户不存在或无权限删除" });
    }
    return res.json({ message: "删除客户成功" });
  });
});

app.get("/api/salespersons", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const keyword = String(req.query.keyword || "").trim();
    const likeKeyword = `%${keyword}%`;
    const [rows] = await connection.execute(
      `SELECT id, staff_no, staff_name, gender, birthday, phone, home_address, created_at, updated_at
       FROM t_salesperson
       WHERE owner_user_id = ?
         AND (? = '' OR staff_name LIKE ?)
       ORDER BY id DESC`,
      [req.user.userId, keyword, likeKeyword]
    );
    return res.json({ message: "查询成功", list: rows });
  })
);

app.post("/api/salespersons", authMiddleware, async (req, res) => {
  const { staff_no, staff_name, gender, birthday, phone, home_address } = req.body;
  if (!staff_no || !staff_name || !gender || !birthday || !phone || !home_address) {
    return res.status(400).json({ message: "销售人员信息不能为空" });
  }
  return withDb(res, async (connection) => {
    const [staffExists] = await connection.execute(
      "SELECT id FROM t_salesperson WHERE staff_no = ? AND owner_user_id = ?",
      [staff_no, req.user.userId]
    );
    if (staffExists.length > 0) {
      return res.status(409).json({ message: "销售人员工号已存在" });
    }
    const [phoneExists] = await connection.execute(
      "SELECT id FROM t_salesperson WHERE phone = ? AND owner_user_id = ?",
      [phone, req.user.userId]
    );
    if (phoneExists.length > 0) {
      return res.status(409).json({ message: "销售人员电话已存在" });
    }
    await connection.execute(
      `INSERT INTO t_salesperson (staff_no, staff_name, gender, birthday, phone, home_address, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [staff_no, staff_name, gender, birthday, phone, home_address, req.user.userId]
    );
    return res.json({ message: "新增销售人员成功" });
  });
});

app.put("/api/salespersons/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { staff_no, staff_name, gender, birthday, phone, home_address } = req.body;
  if (!staff_no || !staff_name || !gender || !birthday || !phone || !home_address) {
    return res.status(400).json({ message: "销售人员信息不能为空" });
  }
  return withDb(res, async (connection) => {
    const [staffExists] = await connection.execute(
      "SELECT id FROM t_salesperson WHERE staff_no = ? AND owner_user_id = ? AND id <> ?",
      [staff_no, req.user.userId, Number(id)]
    );
    if (staffExists.length > 0) {
      return res.status(409).json({ message: "销售人员工号已存在" });
    }
    const [phoneExists] = await connection.execute(
      "SELECT id FROM t_salesperson WHERE phone = ? AND owner_user_id = ? AND id <> ?",
      [phone, req.user.userId, Number(id)]
    );
    if (phoneExists.length > 0) {
      return res.status(409).json({ message: "销售人员电话已存在" });
    }
    const [result] = await connection.execute(
      `UPDATE t_salesperson
       SET staff_no = ?, staff_name = ?, gender = ?, birthday = ?, phone = ?, home_address = ?
       WHERE id = ? AND owner_user_id = ?`,
      [staff_no, staff_name, gender, birthday, phone, home_address, Number(id), req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "销售人员不存在或无权限修改" });
    }
    return res.json({ message: "更新销售人员成功" });
  });
});

app.delete("/api/salespersons/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  return withDb(res, async (connection) => {
    const [result] = await connection.execute(
      "DELETE FROM t_salesperson WHERE id = ? AND owner_user_id = ?",
      [Number(id), req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "销售人员不存在或无权限删除" });
    }
    return res.json({ message: "删除销售人员成功" });
  });
});

app.get("/api/sales-records/options", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const [products] = await connection.execute(
      "SELECT id, product_name FROM t_product WHERE owner_user_id = ? ORDER BY id DESC",
      [req.user.userId]
    );
    const [customers] = await connection.execute(
      "SELECT id, customer_name FROM t_customer WHERE owner_user_id = ? ORDER BY id DESC",
      [req.user.userId]
    );
    const [salespersons] = await connection.execute(
      "SELECT id, staff_name FROM t_salesperson WHERE owner_user_id = ? ORDER BY id DESC",
      [req.user.userId]
    );
    return res.json({ message: "查询成功", options: { products, customers, salespersons } });
  })
);

app.get("/api/sales-records/next-invoice-no", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const salesDate = String(req.query.sales_date || "");
    if (!salesDate) {
      return res.status(400).json({ message: "销售日期不能为空" });
    }
    const invoiceNo = await generateInvoiceNo(connection, req.user.userId, salesDate);
    return res.json({ message: "查询成功", invoice_no: invoiceNo });
  })
);

app.get("/api/sales-records", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const productKeyword = String(req.query.product_keyword || "").trim();
    const customerKeyword = String(req.query.customer_keyword || "").trim();
    const productLike = `%${productKeyword}%`;
    const customerLike = `%${customerKeyword}%`;
    const [rows] = await connection.execute(
      `SELECT id, product_id, product_name, sales_date, sales_quantity, invoice_no, customer_name, salesperson_name, created_at, updated_at
       FROM t_sales_record
       WHERE owner_user_id = ?
         AND (? = '' OR product_name LIKE ?)
         AND (? = '' OR customer_name LIKE ?)
       ORDER BY id DESC`,
      [req.user.userId, productKeyword, productLike, customerKeyword, customerLike]
    );
    return res.json({ message: "查询成功", list: rows });
  })
);

app.get("/api/inventory-logs", authMiddleware, async (req, res) =>
  withDb(res, async (connection) => {
    const keyword = String(req.query.keyword || "").trim();
    const likeKeyword = `%${keyword}%`;
    const [rows] = await connection.execute(
      `SELECT id, product_id, product_name, change_type, change_qty, before_stock, after_stock, ref_type, ref_id, remark, created_at
       FROM t_inventory_log
       WHERE owner_user_id = ?
         AND (? = '' OR product_name LIKE ? OR remark LIKE ?)
       ORDER BY id DESC
       LIMIT 300`,
      [req.user.userId, keyword, likeKeyword, likeKeyword]
    );
    return res.json({ message: "查询成功", list: rows });
  })
);

app.post("/api/sales-records", authMiddleware, async (req, res) => {
  const { product_id, sales_date, sales_quantity, invoice_no, customer_name, salesperson_name } =
    req.body;
  if (!product_id || !sales_date || !sales_quantity || !customer_name || !salesperson_name) {
    return res.status(400).json({ message: "销售流水信息不能为空" });
  }
  return withDb(res, async (connection) => {
    try {
      await connection.beginTransaction();
      const [productRows] = await connection.execute(
        "SELECT id, product_name, stock FROM t_product WHERE id = ? AND owner_user_id = ? FOR UPDATE",
        [Number(product_id), req.user.userId]
      );
      if (productRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "产品不存在" });
      }
      const product = productRows[0];
      const qty = Number(sales_quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        await connection.rollback();
        return res.status(400).json({ message: "销售数量必须大于0" });
      }
      if (Number(product.stock) < qty) {
        await connection.rollback();
        return res.status(400).json({ message: "库存不足，无法登记销售流水" });
      }
      const finalInvoiceNo =
        String(invoice_no || "").trim() ||
        (await generateInvoiceNo(connection, req.user.userId, sales_date));

      const beforeStock = Number(product.stock);
      const afterStock = beforeStock - qty;
      await connection.execute(
        "UPDATE t_product SET stock = ? WHERE id = ? AND owner_user_id = ?",
        [afterStock, Number(product_id), req.user.userId]
      );
      const [insertRes] = await connection.execute(
        `INSERT INTO t_sales_record (product_id, product_name, sales_date, sales_quantity, invoice_no, customer_name, salesperson_name, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(product_id),
          product.product_name,
          sales_date,
          qty,
          finalInvoiceNo,
          customer_name,
          salesperson_name,
          req.user.userId,
        ]
      );
      await addInventoryLog(connection, {
        product_id: Number(product_id),
        product_name: product.product_name,
        change_type: "SALE_CREATE",
        change_qty: -qty,
        before_stock: beforeStock,
        after_stock: afterStock,
        ref_type: "sales_record",
        ref_id: insertRes.insertId,
        remark: `销售出库，发票号:${finalInvoiceNo}`,
        owner_user_id: req.user.userId,
      });
      await connection.commit();
      return res.json({ message: "新增销售流水成功", invoice_no: finalInvoiceNo });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
});

app.put("/api/sales-records/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { product_id, sales_date, sales_quantity, invoice_no, customer_name, salesperson_name } =
    req.body;
  if (!product_id || !sales_date || !sales_quantity || !invoice_no || !customer_name || !salesperson_name) {
    return res.status(400).json({ message: "销售流水信息不能为空" });
  }
  return withDb(res, async (connection) => {
    try {
      await connection.beginTransaction();
      const [oldRows] = await connection.execute(
        `SELECT id, product_id, product_name, sales_quantity, invoice_no
         FROM t_sales_record
         WHERE id = ? AND owner_user_id = ?
         FOR UPDATE`,
        [Number(id), req.user.userId]
      );
      if (oldRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "销售流水不存在或无权限修改" });
      }
      const oldRecord = oldRows[0];
      const newQty = Number(sales_quantity);
      if (!Number.isFinite(newQty) || newQty <= 0) {
        await connection.rollback();
        return res.status(400).json({ message: "销售数量必须大于0" });
      }

      const [newProductRows] = await connection.execute(
        "SELECT id, product_name, stock FROM t_product WHERE id = ? AND owner_user_id = ? FOR UPDATE",
        [Number(product_id), req.user.userId]
      );
      if (newProductRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "产品不存在" });
      }
      const newProduct = newProductRows[0];

      if (Number(oldRecord.product_id) === Number(product_id)) {
        const beforeStock = Number(newProduct.stock) + Number(oldRecord.sales_quantity);
        if (beforeStock < newQty) {
          await connection.rollback();
          return res.status(400).json({ message: "库存不足，无法更新销售流水" });
        }
        const afterStock = beforeStock - newQty;
        await connection.execute(
          "UPDATE t_product SET stock = ? WHERE id = ? AND owner_user_id = ?",
          [afterStock, Number(product_id), req.user.userId]
        );
        await addInventoryLog(connection, {
          product_id: Number(product_id),
          product_name: newProduct.product_name,
          change_type: "SALE_UPDATE",
          change_qty: Number(oldRecord.sales_quantity) - newQty,
          before_stock: beforeStock,
          after_stock: afterStock,
          ref_type: "sales_record",
          ref_id: Number(id),
          remark: `更新销售流水数量，发票号:${invoice_no}`,
          owner_user_id: req.user.userId,
        });
      } else {
        const [oldProductRows] = await connection.execute(
          "SELECT id, product_name, stock FROM t_product WHERE id = ? AND owner_user_id = ? FOR UPDATE",
          [Number(oldRecord.product_id), req.user.userId]
        );
        if (oldProductRows.length > 0) {
          const oldProduct = oldProductRows[0];
          const beforeOld = Number(oldProduct.stock);
          const afterOld = beforeOld + Number(oldRecord.sales_quantity);
          await connection.execute(
            "UPDATE t_product SET stock = ? WHERE id = ? AND owner_user_id = ?",
            [afterOld, Number(oldRecord.product_id), req.user.userId]
          );
          await addInventoryLog(connection, {
            product_id: Number(oldRecord.product_id),
            product_name: oldProduct.product_name,
            change_type: "SALE_UPDATE",
            change_qty: Number(oldRecord.sales_quantity),
            before_stock: beforeOld,
            after_stock: afterOld,
            ref_type: "sales_record",
            ref_id: Number(id),
            remark: `销售流水改产品，回补库存，原发票号:${oldRecord.invoice_no}`,
            owner_user_id: req.user.userId,
          });
        }
        if (Number(newProduct.stock) < newQty) {
          await connection.rollback();
          return res.status(400).json({ message: "库存不足，无法更新销售流水" });
        }
        const beforeNew = Number(newProduct.stock);
        const afterNew = beforeNew - newQty;
        await connection.execute(
          "UPDATE t_product SET stock = ? WHERE id = ? AND owner_user_id = ?",
          [afterNew, Number(product_id), req.user.userId]
        );
        await addInventoryLog(connection, {
          product_id: Number(product_id),
          product_name: newProduct.product_name,
          change_type: "SALE_UPDATE",
          change_qty: -newQty,
          before_stock: beforeNew,
          after_stock: afterNew,
          ref_type: "sales_record",
          ref_id: Number(id),
          remark: `销售流水改产品，扣减库存，发票号:${invoice_no}`,
          owner_user_id: req.user.userId,
        });
      }

      await connection.execute(
        `UPDATE t_sales_record
         SET product_id = ?, product_name = ?, sales_date = ?, sales_quantity = ?, invoice_no = ?, customer_name = ?, salesperson_name = ?
         WHERE id = ? AND owner_user_id = ?`,
        [Number(product_id), newProduct.product_name, sales_date, newQty, invoice_no, customer_name, salesperson_name, Number(id), req.user.userId]
      );
      await connection.commit();
      return res.json({ message: "更新销售流水成功" });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
});

app.delete("/api/sales-records/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  return withDb(res, async (connection) => {
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        "SELECT product_id, product_name, sales_quantity, invoice_no FROM t_sales_record WHERE id = ? AND owner_user_id = ? FOR UPDATE",
        [Number(id), req.user.userId]
      );
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "销售流水不存在或无权限删除" });
      }
      const row = rows[0];
      const [productRows] = await connection.execute(
        "SELECT stock FROM t_product WHERE id = ? AND owner_user_id = ? FOR UPDATE",
        [Number(row.product_id), req.user.userId]
      );
      const beforeStock = Number(productRows[0]?.stock || 0);
      const afterStock = beforeStock + Number(row.sales_quantity);
      await connection.execute(
        "UPDATE t_product SET stock = ? WHERE id = ? AND owner_user_id = ?",
        [afterStock, Number(row.product_id), req.user.userId]
      );
      await addInventoryLog(connection, {
        product_id: Number(row.product_id),
        product_name: row.product_name,
        change_type: "SALE_DELETE",
        change_qty: Number(row.sales_quantity),
        before_stock: beforeStock,
        after_stock: afterStock,
        ref_type: "sales_record",
        ref_id: Number(id),
        remark: `删除销售流水，回补库存，发票号:${row.invoice_no}`,
        owner_user_id: req.user.userId,
      });
      await connection.execute(
        "DELETE FROM t_sales_record WHERE id = ? AND owner_user_id = ?",
        [Number(id), req.user.userId]
      );
      await connection.commit();
      return res.json({ message: "删除销售流水成功" });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
});

app.get("/api/image-recognition/status", (req, res) => {
  const registry = loadImageRegistry();
  return res.json({ count: registry.entries.length });
});

app.post(
  "/api/image-recognition/reference",
  (req, res, next) => {
    uploadImageRecoRef.array("images", 40)(req, res, (err) => {
      if (err) {
        const msg =
          err.code === "LIMIT_FILE_SIZE"
            ? "单张图片不能超过 20MB"
            : err.message || "上传失败";
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "请先选择要保存的图片" });
    }
    try {
      const registry = loadImageRegistry();
      const saved = [];
      for (const file of req.files) {
        const hash = await computeDHashFromPath(file.path);
        registry.entries.push({ filename: file.filename, hash });
        saved.push({ filename: file.filename });
      }
      saveImageRegistry(registry);
      return res.json({
        message: `已保存 ${saved.length} 张图片`,
        saved,
        total: registry.entries.length,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "处理图片失败，请确认文件为有效图像" });
    }
  }
);

app.post(
  "/api/image-recognition/compare",
  (req, res, next) => {
    uploadImageRecoCompare.single("image")(req, res, (err) => {
      if (err) {
        const msg =
          err.code === "LIMIT_FILE_SIZE"
            ? "图片不能超过 20MB"
            : err.message || "上传失败";
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "请选择一张对比图片" });
    }
    try {
      const registry = loadImageRegistry();
      if (registry.entries.length === 0) {
        return res.json({
          match: false,
          message: "服务器暂无已保存的参考图片，请先在配置页保存图片",
        });
      }
      const hash = await computeDHashFromBuffer(req.file.buffer);
      let best = null;
      let bestDist = 999;
      for (const entry of registry.entries) {
        const d = hammingHex(hash, entry.hash);
        if (d < bestDist) {
          bestDist = d;
          best = entry;
        }
      }
      if (best && bestDist <= DHASH_MATCH_THRESHOLD) {
        return res.json({
          match: true,
          message: "服务器有此图案",
          filename: best.filename,
        });
      }
      return res.json({
        match: false,
        message: "未在服务器找到相同或极相似的参考图",
      });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "对比失败，请确认文件为有效图像" });
    }
  }
);

initDb()
  .then(() => {
    ensureImageRecoDir();
    app.listen(PORT, () => {
      console.log(`Server running: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("数据库初始化失败:", error.message);
    process.exit(1);
  });
