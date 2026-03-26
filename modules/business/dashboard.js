class BusinessDashboard {
    constructor(pool) {
        this.pool = pool;
    }

    async getCustomers() {
        try {
            const result = await this.pool.query('SELECT * FROM customers ORDER BY created_at DESC');
            return result.rows;
        } catch (err) {
            throw err;
        }
    }

    async addCustomer(customer) {
        try {
            const result = await this.pool.query(
                'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING id',
                [customer.name, customer.email, customer.phone]
            );
            return { id: result.rows[0].id, ...customer };
        } catch (err) {
            throw err;
        }
    }

    async getBookings() {
        try {
            const result = await this.pool.query(`
                SELECT b.*, c.name as customer_name 
                FROM bookings b
                JOIN customers c ON b.customer_id = c.id
                ORDER BY b.date DESC, b.time DESC
            `);
            return result.rows;
        } catch (err) {
            throw err;
        }
    }

    async addBooking(booking) {
        try {
            const result = await this.pool.query(
                'INSERT INTO bookings (customer_id, service, date, time) VALUES ($1, $2, $3, $4) RETURNING id',
                [booking.customer_id, booking.service, booking.date, booking.time]
            );
            return { id: result.rows[0].id, ...booking };
        } catch (err) {
            throw err;
        }
    }

    async getInvoices() {
        try {
            const result = await this.pool.query(`
                SELECT i.*, c.name as customer_name 
                FROM invoices i
                JOIN customers c ON i.customer_id = c.id
                ORDER BY i.created_at DESC
            `);
            return result.rows;
        } catch (err) {
            throw err;
        }
    }

    async addInvoice(invoice) {
        try {
            const result = await this.pool.query(
                'INSERT INTO invoices (customer_id, amount) VALUES ($1, $2) RETURNING id',
                [invoice.customer_id, invoice.amount]
            );
            return { id: result.rows[0].id, ...invoice };
        } catch (err) {
            throw err;
        }
    }
}

module.exports = BusinessDashboard;