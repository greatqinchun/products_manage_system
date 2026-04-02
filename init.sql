CREATE TABLE IF NOT EXISTS t_user (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

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
);

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
);

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
);
