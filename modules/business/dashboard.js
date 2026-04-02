class BusinessDashboard {
    constructor(db) {
        this.db = db;
        this.isPostgres = db && db.constructor && db.constructor.name === 'Pool';
    }

    async getCustomers() {
        if (this.isPostgres) {
            const result = await this.db.query('SELECT * FROM customers ORDER BY created_at DESC');
            return result.rows;
        }
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM customers ORDER BY created_at DESC', [], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    }

    async addCustomer(data) {
        const { name, email, phone } = data;
        if (this.isPostgres) {
            const result = await this.db.query(
                'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
                [name, email, phone]
            );
            return result.rows[0];
        }
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
                [name, email, phone],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, name, email, phone });
                }
            );
        });
    }

    async getBookings() {
        if (this.isPostgres) {
            const result = await this.db.query('SELECT * FROM bookings ORDER BY date ASC, time ASC');
            return result.rows;
        }
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM bookings ORDER BY date ASC, time ASC', [], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    }

    async addBooking(data) {
        const { customer_id, service, date, time, status } = data;
        if (this.isPostgres) {
            const result = await this.db.query(
                'INSERT INTO bookings (customer_id, service, date, time, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [customer_id, service, date, time, status || 'pending']
            );
            return result.rows[0];
        }
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO bookings (customer_id, service, date, time, status) VALUES (?, ?, ?, ?, ?)',
                [customer_id, service, date, time, status || 'pending'],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, customer_id, service, date, time });
                }
            );
        });
    }

    async getInvoices() {
        if (this.isPostgres) {
            const result = await this.db.query('SELECT * FROM invoices ORDER BY created_at DESC');
            return result.rows;
        }
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM invoices ORDER BY created_at DESC', [], (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    }

    async addInvoice(data) {
        const { customer_id, amount, status } = data;
        if (this.isPostgres) {
            const result = await this.db.query(
                'INSERT INTO invoices (customer_id, amount, status) VALUES ($1, $2, $3) RETURNING *',
                [customer_id, amount, status || 'unpaid']
            );
            return result.rows[0];
        }
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO invoices (customer_id, amount, status) VALUES (?, ?, ?)',
                [customer_id, amount, status || 'unpaid'],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, customer_id, amount, status });
                }
            );
        });
    }
}

module.exports = BusinessDashboard;