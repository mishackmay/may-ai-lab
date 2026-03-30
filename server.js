const express = require('express');
const path = require('path');
const cors = require('cors');
const timeout = require('connect-timeout');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

console.log('PORT from .env:', process.env.PORT);
console.log('OLLAMA_MODEL from .env:', process.env.OLLAMA_MODEL);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(timeout('240s'));

// Database setup - use SQLite locally, PostgreSQL on Render
const isProduction = process.env.DATABASE_URL !== undefined;

let db;
let pool;

if (isProduction) {
    // Use PostgreSQL on Render
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    async function initDatabase() {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE,
                    face_descriptor TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS customers (
                    id SERIAL PRIMARY KEY,
                    name TEXT,
                    email TEXT,
                    phone TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS bookings (
                    id SERIAL PRIMARY KEY,
                    customer_id INTEGER REFERENCES customers(id),
                    service TEXT,
                    date TEXT,
                    time TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS invoices (
                    id SERIAL PRIMARY KEY,
                    customer_id INTEGER REFERENCES customers(id),
                    amount REAL,
                    status TEXT DEFAULT 'unpaid',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS website_generations (
                    id SERIAL PRIMARY KEY,
                    business_name TEXT,
                    business_type TEXT,
                    location TEXT,
                    services TEXT,
                    phone TEXT,
                    email TEXT,
                    whatsapp TEXT,
                    website TEXT,
                    user_input TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS free_tier_usage (
                    id SERIAL PRIMARY KEY,
                    ip_address TEXT,
                    date TEXT,
                    count INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(ip_address, date)
                )
            `);
            
            console.log('✅ PostgreSQL database ready');
        } catch (err) {
            console.error('❌ PostgreSQL init error:', err);
        } finally {
            client.release();
        }
    }
    
    initDatabase();
    
    // Helper functions for PostgreSQL
    async function checkFreeTierLimit(ip) {
        const today = new Date().toDateString();
        const result = await pool.query(
            'SELECT count FROM free_tier_usage WHERE ip_address = $1 AND date = $2',
            [ip, today]
        );
        const count = result.rows[0]?.count || 0;
        return count < 3;
    }
    
    async function incrementFreeTierUsage(ip) {
        const today = new Date().toDateString();
        await pool.query(
            `INSERT INTO free_tier_usage (ip_address, date, count) 
             VALUES ($1, $2, 1) 
             ON CONFLICT (ip_address, date) 
             DO UPDATE SET count = free_tier_usage.count + 1`,
            [ip, today]
        );
    }
    
} else {
    // Use SQLite locally
    db = new sqlite3.Database('./data/may-ai.db');
    
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            face_descriptor TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            service TEXT,
            date TEXT,
            time TEXT,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            amount REAL,
            status TEXT DEFAULT 'unpaid',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS website_generations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT,
            business_type TEXT,
            location TEXT,
            services TEXT,
            phone TEXT,
            email TEXT,
            whatsapp TEXT,
            website TEXT,
            user_input TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS free_tier_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT,
            date TEXT,
            count INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ip_address, date)
        )`);
        
        console.log('✅ SQLite database ready');
    });
    
    // Helper functions for SQLite
    async function checkFreeTierLimit(ip) {
        return new Promise((resolve, reject) => {
            const today = new Date().toDateString();
            db.get(
                'SELECT count FROM free_tier_usage WHERE ip_address = ? AND date = ?',
                [ip, today],
                (err, row) => {
                    if (err) {
                        console.error('DB error:', err);
                        resolve(true);
                        return;
                    }
                    const count = row ? row.count : 0;
                    resolve(count < 3);
                }
            );
        });
    }
    
    async function incrementFreeTierUsage(ip) {
        return new Promise((resolve, reject) => {
            const today = new Date().toDateString();
            db.run(
                `INSERT INTO free_tier_usage (ip_address, date, count) 
                 VALUES (?, ?, 1) 
                 ON CONFLICT(ip_address, date) 
                 DO UPDATE SET count = count + 1`,
                [ip, today],
                function(err) {
                    if (err) console.error('DB error:', err);
                    resolve();
                }
            );
        });
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

console.log(path.join(__dirname, 'public', 'website-gen.html'));
const WebsiteGenerator = require('./modules/website-gen/generator');
const websiteGen = new WebsiteGenerator();

// Website Generator Route with free tier limits
app.post('/api/website/generate', async (req, res) => {
    let isSent = false;
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
   // const canGenerate = await checkFreeTierLimit(userIp);
    if (!canGenerate) {
        if (!isSent) {
            isSent = true;
            return res.status(429).json({ 
                error: 'Free limit reached. You can generate up to 3 websites per day.',
                upgradeUrl: '/pricing',
                limit: 3
            });
        }
        return;
    }
    
    try {
        const { description, userInputs } = req.body;
        
        const result = await Promise.race([
            websiteGen.generate(description, userInputs),
            new Promise((_, reject) => setTimeout(() => {
                if (!isSent) reject(new Error('Timeout'));
            }, 180000))
        ]);
        
        if (!isSent) {
            isSent = true;
            await incrementFreeTierUsage(userIp);
            
            // Track generation (database specific)
            if (isProduction) {
                try {
                    await pool.query(
                        `INSERT INTO website_generations 
                        (business_name, business_type, location, services, phone, email, whatsapp, website, user_input) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [
                            userInputs?.name || 'Unknown',
                            userInputs?.businessType || 'Unknown',
                            userInputs?.location || 'Unknown',
                            JSON.stringify(userInputs?.services || []),
                            userInputs?.phone || '',
                            userInputs?.email || '',
                            userInputs?.whatsapp || '',
                            userInputs?.website || '',
                            description || ''
                        ]
                    );
                } catch (trackError) {
                    console.error('Tracking error:', trackError);
                }
            } else {
                try {
                    const stmt = db.prepare(`INSERT INTO website_generations 
                        (business_name, business_type, location, services, phone, email, whatsapp, website, user_input) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                    stmt.run(
                        userInputs?.name || 'Unknown',
                        userInputs?.businessType || 'Unknown',
                        userInputs?.location || 'Unknown',
                        JSON.stringify(userInputs?.services || []),
                        userInputs?.phone || '',
                        userInputs?.email || '',
                        userInputs?.whatsapp || '',
                        userInputs?.website || '',
                        description || ''
                    );
                    stmt.finalize();
                } catch (trackError) {
                    console.error('Tracking error:', trackError);
                }
            }
            
            res.json(result);
        }
    } catch (error) {
        if (!isSent) {
            isSent = true;
            console.error('Website generation error:', error);
            res.status(500).json({ error: 'Generation timed out. Please try again with simpler description.' });
        }
    }
});

// Route to check remaining free generations
app.get('/api/remaining-generations', async (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const today = new Date().toDateString();
    
    if (isProduction) {
        const result = await pool.query(
            'SELECT count FROM free_tier_usage WHERE ip_address = $1 AND date = $2',
            [userIp, today]
        );
        const used = result.rows[0]?.count || 0;
        res.json({ remaining: Math.max(0, 3 - used), used });
    } else {
        db.get(
            'SELECT count FROM free_tier_usage WHERE ip_address = ? AND date = ?',
            [userIp, today],
            (err, row) => {
                if (err) {
                    res.json({ remaining: 3, used: 0 });
                    return;
                }
                const used = row ? row.count : 0;
                res.json({ remaining: Math.max(0, 3 - used), used });
            }
        );
    }
});

app.get('/website-gen', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'website-gen.html'));
});

// Business Dashboard routes
const BusinessDashboard = require('./modules/business/dashboard');

let business;
if (isProduction) {
    business = new BusinessDashboard(pool);
} else {
    business = new BusinessDashboard(db);
}

app.get('/api/business/customers', async (req, res) => {
    try {
        const customers = await business.getCustomers();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/business/customers', async (req, res) => {
    try {
        const customer = await business.addCustomer(req.body);
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/business/bookings', async (req, res) => {
    try {
        const bookings = await business.getBookings();
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/business/bookings', async (req, res) => {
    try {
        const booking = await business.addBooking(req.body);
        res.json(booking);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/business/invoices', async (req, res) => {
    try {
        const invoices = await business.getInvoices();
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/business/invoices', async (req, res) => {
    try {
        const invoice = await business.addInvoice(req.body);
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/business', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'business.html'));
});

// Face Auth routes
const FaceAuth = require('./modules/face-auth/auth');

let faceAuth;
if (isProduction) {
    faceAuth = new FaceAuth(pool);
} else {
    faceAuth = new FaceAuth(db);
}

app.post('/api/face/register', async (req, res) => {
    try {
        const { username, faceDescriptor } = req.body;
        const result = await faceAuth.registerUser(username, faceDescriptor);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/face/verify', async (req, res) => {
    try {
        const { faceDescriptor } = req.body;
        const result = await faceAuth.verifyUser(faceDescriptor);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/face-auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'face-auth.html'));
});

// Pricing page route
app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

const TroubleshootingAI = require('./modules/troubleshooting/solver');
const troubleshooting = new TroubleshootingAI();

app.post('/api/troubleshoot/solve', async (req, res) => {
    const { problem } = req.body;
    const result = await troubleshooting.solve(problem);
    res.json(result);
});

app.get('/troubleshooting', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'troubleshooting.html'));
});

// Admin route to view website generation history
app.get('/api/website/history', async (req, res) => {
    if (isProduction) {
        try {
            const result = await pool.query('SELECT * FROM website_generations ORDER BY created_at DESC LIMIT 100');
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        db.all('SELECT * FROM website_generations ORDER BY created_at DESC LIMIT 100', [], (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        });
    }
});

// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Debug route
app.get('/api/debug/users', async (req, res) => {
    if (isProduction) {
        try {
            const result = await pool.query('SELECT username FROM users');
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        db.all('SELECT username FROM users', [], (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        });
    }
});

// Test route to see what queries Ollama generates
app.get('/api/test-queries', async (req, res) => {
    const testDetails = {
        type: 'Coffee Shop',
        name: 'Morning Brew Coffee',
        designStyle: 'cozy'
    };
    try {
        const heroQueries = await websiteGen.generateImageQueries(testDetails, "hero");
        const aboutQueries = await websiteGen.generateImageQueries(testDetails, "about");
        res.json({ 
            hero: heroQueries,
            about: aboutQueries
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`May AI Lab running at http://localhost:${PORT}`);
    console.log(`Free tier: 3 websites per IP per day`);
    console.log(`Database mode: ${isProduction ? 'PostgreSQL (production)' : 'SQLite (local)'}`);
});