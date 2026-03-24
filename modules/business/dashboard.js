const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class BusinessDashboard {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, '../../data/may-ai.db'));
    }

    async getCustomers() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM customers ORDER BY created_at DESC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async addCustomer(customer) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
                [customer.name, customer.email, customer.phone],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, ...customer });
                }
            );
        });
    }

    async getBookings() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT b.*, c.name as customer_name 
                FROM bookings b
                JOIN customers c ON b.customer_id = c.id
                ORDER BY b.date DESC, b.time DESC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async addBooking(booking) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO bookings (customer_id, service, date, time) VALUES (?, ?, ?, ?)',
                [booking.customer_id, booking.service, booking.date, booking.time],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, ...booking });
                }
            );
        });
    }

    async getInvoices() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT i.*, c.name as customer_name 
                FROM invoices i
                JOIN customers c ON i.customer_id = c.id
                ORDER BY i.created_at DESC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async addInvoice(invoice) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO invoices (customer_id, amount) VALUES (?, ?)',
                [invoice.customer_id, invoice.amount],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, ...invoice });
                }
            );
        });
    }
}

module.exports = BusinessDashboard;