const express = require('express');
const path = require('path');
const cors = require('cors');
const timeout = require('connect-timeout');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
require('dotenv').config();
const { Resend } = require('resend');

// Initialize Resend if API key exists
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

console.log('PORT from .env:', process.env.PORT);
console.log('OLLAMA_MODEL from .env:', process.env.OLLAMA_MODEL);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.DATABASE_URL !== undefined;

// ========== SESSION MIDDLEWARE ==========
// Must come BEFORE routes
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
    secret: process.env.SESSION_SECRET || 'change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(timeout('240s'));

// ========== DATABASE SETUP ==========
let db;
let pool;

// Declare functions globally
let checkFreeTierLimit;
let incrementFreeTierUsage;

if (isProduction) {
    // PostgreSQL on Render
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
                    email TEXT UNIQUE,
                    password TEXT,
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
                    user_id INTEGER REFERENCES users(id),
                    service TEXT,
                    date TEXT,
                    time TEXT,
                    customer_name TEXT,
                    customer_phone TEXT,
                    customer_email TEXT,
                    notes TEXT,
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
                    user_id INTEGER REFERENCES users(id),
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

            await client.query(`
                CREATE TABLE IF NOT EXISTS business_profiles (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER UNIQUE REFERENCES users(id),
                    business_name TEXT,
                    whatsapp TEXT,
                    phone TEXT,
                    services TEXT,
                    available_days TEXT DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]',
                    start_time TEXT DEFAULT '08:00',
                    end_time TEXT DEFAULT '17:00',
                    slot_duration INTEGER DEFAULT 60,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS waitlist (
                    id SERIAL PRIMARY KEY,
                    name TEXT,
                    email TEXT,
                    business TEXT,
                    plan TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    token TEXT UNIQUE,
                    expires_at TIMESTAMP,
                    used INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    // PostgreSQL helper functions
    checkFreeTierLimit = async (ip) => {
        const today = new Date().toDateString();
        const result = await pool.query(
            'SELECT count FROM free_tier_usage WHERE ip_address = $1 AND date = $2',
            [ip, today]
        );
        const count = result.rows[0]?.count || 0;
        return count < 3;
    };

    incrementFreeTierUsage = async (ip) => {
        const today = new Date().toDateString();
        await pool.query(
            `INSERT INTO free_tier_usage (ip_address, date, count) 
             VALUES ($1, $2, 1) 
             ON CONFLICT (ip_address, date) 
             DO UPDATE SET count = free_tier_usage.count + 1`,
            [ip, today]
        );
    };

} else {
    // SQLite locally
    db = new sqlite3.Database('./data/may-ai.db');

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
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
            user_id INTEGER,
            service TEXT,
            date TEXT,
            time TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_email TEXT,
            notes TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
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
            user_id INTEGER,
            business_name TEXT,
            business_type TEXT,
            location TEXT,
            services TEXT,
            phone TEXT,
            email TEXT,
            whatsapp TEXT,
            website TEXT,
            user_input TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS free_tier_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT,
            date TEXT,
            count INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ip_address, date)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS business_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            business_name TEXT,
            whatsapp TEXT,
            phone TEXT,
            services TEXT,
            available_days TEXT DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]',
            start_time TEXT DEFAULT '08:00',
            end_time TEXT DEFAULT '17:00',
            slot_duration INTEGER DEFAULT 60,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS waitlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            business TEXT,
            plan TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            token TEXT UNIQUE,
            expires_at DATETIME,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
        console.log('✅ SQLite database ready');
    });

    // SQLite helper functions
    checkFreeTierLimit = async (ip) => {
        return new Promise((resolve) => {
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
    };

    incrementFreeTierUsage = async (ip) => {
        return new Promise((resolve) => {
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
    };
}

// ========== AUTH MIDDLEWARE ==========
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Please log in to access this page' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    if (req.session.username !== process.env.ADMIN_USERNAME) {
        return res.status(403).json({ error: 'Forbidden. Admin access only.' });
    }
    next();
}

// ========== STATIC ROUTES ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/website-gen', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'website-gen.html'));
});

app.get('/business', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'business.html'));
});

app.get('/business-setup', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'business-setup.html'));
});

app.get('/my-websites', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'my-websites.html'));
});

app.get('/face-auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'face-auth.html'));
});

app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

app.get('/troubleshooting', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'troubleshooting.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/booking/:userId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

// ========== WEBSITE GENERATOR ==========
const WebsiteGenerator = require('./modules/website-gen/generator');
const websiteGen = new WebsiteGenerator();

app.post('/api/website/generate', requireAuth, async (req, res) => {
    let isSent = false;
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const canGenerate = await checkFreeTierLimit(userIp);
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

        const enrichedInputs = {
            ...userInputs,
            bookingUserId: req.session.userId || null,
            bookingUrl: req.session.userId
                ? `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['host']}/booking/${req.session.userId}`
                : null
        };

        const result = await Promise.race([
            websiteGen.generate(description, enrichedInputs),
            new Promise((_, reject) => setTimeout(() => {
                if (!isSent) reject(new Error('Timeout'));
            }, 180000))
        ]);

        if (!isSent) {
            isSent = true;
            await incrementFreeTierUsage(userIp);

            // Track generation
            if (isProduction) {
                await pool.query(
                    `INSERT INTO website_generations 
                    (user_id, business_name, business_type, location, services, phone, email, whatsapp, website, user_input) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        req.session.userId || null,
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
            } else {
                const stmt = db.prepare(`INSERT INTO website_generations 
                    (user_id, business_name, business_type, location, services, phone, email, whatsapp, website, user_input) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(
                    req.session.userId || null,
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
            }

            res.json(result);
        }
    } catch (error) {
        if (!isSent) {
            isSent = true;
            console.error('Website generation error:', error);
            res.status(500).json({ error: error.message });
        }
    }
});

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

// ========== BUSINESS DASHBOARD ==========
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

// ========== FACE AUTH ==========
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

// ========== TROUBLESHOOTING ==========
const TroubleshootingAI = require('./modules/troubleshooting/solver');
const troubleshooting = new TroubleshootingAI();

app.post('/api/troubleshoot/solve', async (req, res) => {
    const { problem } = req.body;
    const result = await troubleshooting.solve(problem);
    res.json(result);
});

// ========== AUTH ROUTES ==========
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
        return res.status(400).json({ error: 'All fields required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        if (isProduction) {
            const result = await pool.query(
                'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
                [username, email, hashedPassword]
            );
            req.session.userId = result.rows[0].id;
            req.session.username = username;
            res.json({ success: true, username });
        } else {
            db.run(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE')) {
                            return res.status(400).json({ error: 'Username or email already exists' });
                        }
                        return res.status(500).json({ error: err.message });
                    }
                    req.session.userId = this.lastID;
                    req.session.username = username;
                    res.json({ success: true, username });
                }
            );
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        if (isProduction) {
            const result = await pool.query(
                'SELECT id, username, password FROM users WHERE email = $1',
                [email]
            );
            const user = result.rows[0];
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            req.session.userId = user.id;
            req.session.username = user.username;
            res.json({ success: true, username: user.username });
        } else {
            db.get(
                'SELECT id, username, password FROM users WHERE email = ?',
                [email],
                async (err, user) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
                    const match = await bcrypt.compare(password, user.password);
                    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    res.json({ success: true, username: user.username });
                }
            );
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username, userId: req.session.userId });
    } else {
        res.json({ loggedIn: false });
    }
});

// ========== BOOKING ROUTES ==========
app.post('/api/booking/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Please log in first' });
    const { business_name, whatsapp, phone, services, available_days, start_time, end_time, slot_duration } = req.body;
    try {
        if (isProduction) {
            await pool.query(`
                INSERT INTO business_profiles (user_id, business_name, whatsapp, phone, services, available_days, start_time, end_time, slot_duration)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (user_id) DO UPDATE SET
                business_name=$2, whatsapp=$3, phone=$4, services=$5,
                available_days=$6, start_time=$7, end_time=$8, slot_duration=$9
            `, [req.session.userId, business_name, whatsapp, phone, JSON.stringify(services), JSON.stringify(available_days), start_time, end_time, slot_duration]);
        } else {
            db.run(`INSERT INTO business_profiles (user_id, business_name, whatsapp, phone, services, available_days, start_time, end_time, slot_duration)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                business_name=excluded.business_name, whatsapp=excluded.whatsapp, phone=excluded.phone,
                services=excluded.services, available_days=excluded.available_days,
                start_time=excluded.start_time, end_time=excluded.end_time, slot_duration=excluded.slot_duration`,
                [req.session.userId, business_name, whatsapp, phone, JSON.stringify(services), JSON.stringify(available_days), start_time, end_time, slot_duration]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/booking/profile/:userId', async (req, res) => {
    try {
        if (isProduction) {
            const result = await pool.query('SELECT * FROM business_profiles WHERE user_id=$1', [req.params.userId]);
            if (!result.rows[0]) return res.status(404).json({ error: 'Business not found' });
            res.json(result.rows[0]);
        } else {
            db.get('SELECT * FROM business_profiles WHERE user_id=?', [req.params.userId], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(404).json({ error: 'Business not found' });
                res.json(row);
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/booking/slots/:userId/:date', async (req, res) => {
    try {
        if (isProduction) {
            const result = await pool.query(
                "SELECT time FROM bookings WHERE user_id=$1 AND date=$2 AND status != 'cancelled'",
                [req.params.userId, req.params.date]
            );
            res.json(result.rows.map(r => r.time));
        } else {
            db.all("SELECT time FROM bookings WHERE user_id=? AND date=? AND status != 'cancelled'",
                [req.params.userId, req.params.date],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json(rows.map(r => r.time));
                }
            );
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/booking/submit', async (req, res) => {
    const { user_id, service, date, time, customer_name, customer_phone, customer_email, notes } = req.body;
    if (!customer_name || !date || !time || !service) {
        return res.status(400).json({ error: 'Please fill in all required fields' });
    }
    try {
        if (isProduction) {
            await pool.query(`
                INSERT INTO bookings (user_id, service, date, time, customer_name, customer_phone, customer_email, notes, status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
            `, [user_id, service, date, time, customer_name, customer_phone, customer_email, notes]);
        } else {
            db.run(`INSERT INTO bookings (user_id, service, date, time, customer_name, customer_phone, customer_email, notes, status)
                VALUES (?,?,?,?,?,?,?,?,'pending')`,
                [user_id, service, date, time, customer_name, customer_phone, customer_email, notes]
            );
        }

        // Send email notification if Resend is configured
        if (resend && process.env.ADMIN_EMAIL) {
            try {
                let profile;
                if (isProduction) {
                    const result = await pool.query('SELECT * FROM business_profiles WHERE user_id=$1', [user_id]);
                    profile = result.rows[0];
                } else {
                    profile = await new Promise((resolve) => {
                        db.get('SELECT * FROM business_profiles WHERE user_id=?', [user_id], (err, row) => {
                            resolve(row);
                        });
                    });
                }

                if (profile) {
                    await resend.emails.send({
                        from: 'bookings@resend.dev',
                        to: process.env.ADMIN_EMAIL,
                        subject: `New Booking — ${service} on ${date} at ${time}`,
                        html: `
                            <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:2rem; background:#f7f9f7; border-radius:12px;">
                                <h2 style="color:#1a6b4a;">📅 New Booking Request</h2>
                                <table style="width:100%; border-collapse:collapse; margin-top:1rem;">
                                    <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Service</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${service}</td></tr>
                                    <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Date</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${date}</td></tr>
                                    <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Time</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${time}</td></tr>
                                    <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Customer</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${customer_name}</td></tr>
                                    <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Phone</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${customer_phone}</td></tr>
                                    <tr><td style="padding:0.6rem 0; color:#6b7280;">Notes</td><td style="padding:0.6rem 0; font-weight:700;">${notes || 'None'}</td></tr>
                                </table>
                                <div style="margin-top:1.5rem; padding:1rem; background:#e8f5ee; border-radius:8px; font-size:0.85rem; color:#1a6b4a;">
                                    Log in to your dashboard to accept or decline this booking.
                                </div>
                            </div>
                        `
                    });
                }
            } catch (emailErr) {
                console.error('Email notification error:', emailErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/booking/my-bookings', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Please log in' });
    try {
        if (isProduction) {
            const result = await pool.query(
                "SELECT * FROM bookings WHERE user_id=$1 ORDER BY date ASC, time ASC",
                [req.session.userId]
            );
            res.json(result.rows);
        } else {
            db.all("SELECT * FROM bookings WHERE user_id=? ORDER BY date ASC, time ASC",
                [req.session.userId],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json(rows);
                }
            );
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/booking/status', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Please log in' });
    const { booking_id, status } = req.body;
    try {
        if (isProduction) {
            await pool.query(
                "UPDATE bookings SET status=$1 WHERE id=$2 AND user_id=$3",
                [status, booking_id, req.session.userId]
            );
        } else {
            db.run("UPDATE bookings SET status=? WHERE id=? AND user_id=?",
                [status, booking_id, req.session.userId]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== WAITLIST ==========
app.post('/api/waitlist', async (req, res) => {
    const { name, email, business, plan } = req.body;
    try {
        if (isProduction) {
            await pool.query(
                'INSERT INTO waitlist (name, email, business, plan) VALUES ($1,$2,$3,$4)',
                [name, email, business, plan]
            );
        } else {
            db.run(
                'INSERT INTO waitlist (name, email, business, plan) VALUES (?,?,?,?)',
                [name, email, business, plan]
            );
        }

        // Send emails if Resend is configured
        if (resend) {
            try {
                // 1. Notify you
                await resend.emails.send({
                    from: 'waitlist@resend.dev',
                    to: process.env.ADMIN_EMAIL,
                    subject: `🎉 New Waitlist Signup — ${plan} Plan`,
                    html: `
                        <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:2rem; background:#f7f9f7; border-radius:12px;">
                            <h2 style="color:#1a6b4a;">🎉 New Waitlist Signup</h2>
                            <table style="width:100%; border-collapse:collapse; margin-top:1rem;">
                                <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Name</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${name}</td></tr>
                                <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Email</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${email}</td></tr>
                                <tr><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; color:#6b7280;">Business</td><td style="padding:0.6rem 0; border-bottom:1px solid #e5e7eb; font-weight:700;">${business || 'Not specified'}</td></tr>
                                <tr><td style="padding:0.6rem 0; color:#6b7280;">Plan Interest</td><td style="padding:0.6rem 0; font-weight:700; color:#1a6b4a;">${plan}</td></tr>
                            </table>
                        </div>
                    `
                });

                // 2. Confirm to them
                await resend.emails.send({
                    from: 'waitlist@resend.dev',
                    to: email,
                    subject: `You're on the May AI Lab waitlist! 🚀`,
                    html: `
                        <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:2rem; background:#f7f9f7; border-radius:12px;">
                            <h2 style="color:#1a6b4a;">You're on the list, ${name}! 🎉</h2>
                            <p style="color:#6b7280; line-height:1.7; margin:1rem 0;">Thanks for your interest in the <strong style="color:#1a6b4a;">${plan}</strong> plan. We're working hard to launch paid plans soon.</p>
                            <p style="color:#6b7280; line-height:1.7; margin:1rem 0;">As an early member you'll get a <strong>special discount</strong> when we launch — we'll email you the moment it's ready.</p>
                            <div style="background:#e8f5ee; border-radius:8px; padding:1.25rem; margin-top:1.5rem;">
                                <p style="color:#1a6b4a; font-weight:700; margin:0;">In the meantime</p>
                                <p style="color:#1a6b4a; margin:0.5rem 0 0; font-size:0.9rem;">You can start using May AI Lab for free right now — build your business website and set up your booking page at no cost.</p>
                            </div>
                            <div style="margin-top:1.5rem; text-align:center;">
                                <a href="${process.env.APP_URL || 'http://localhost:3000'}/login" 
                                   style="background:#1a6b4a; color:white; padding:0.85rem 2rem; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">
                                    Start Free →
                                </a>
                            </div>
                            <p style="color:#9ca3af; font-size:0.78rem; margin-top:2rem; text-align:center;">May AI Lab — Built for African businesses</p>
                        </div>
                    `
                });
            } catch (emailErr) {
                console.error('Waitlist email error:', emailErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== ADMIN ROUTES ==========
app.get('/api/website/history', requireAdmin, async (req, res) => {
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

app.get('/api/debug/users', requireAdmin, async (req, res) => {
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

// ========== MY WEBSITES API ==========
app.get('/api/websites/my', requireAuth, async (req, res) => {
    try {
        if (isProduction) {
            const result = await pool.query(
                'SELECT * FROM website_generations WHERE user_id=$1 ORDER BY created_at DESC',
                [req.session.userId]
            );
            res.json(result.rows);
        } else {
            db.all(
                'SELECT * FROM website_generations WHERE user_id=? ORDER BY created_at DESC',
                [req.session.userId],
                (err, rows) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json(rows);
                }
            );
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== TEST ROUTE ==========
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

// ========== PASSWORD RESET ==========
const crypto = require('crypto');

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        let user;
        if (isProduction) {
            const result = await pool.query('SELECT id, username FROM users WHERE email=$1', [email]);
            user = result.rows[0];
        } else {
            user = await new Promise((resolve) => {
                db.get('SELECT id, username FROM users WHERE email=?', [email], (err, row) => resolve(row));
            });
        }

        // Always return success even if email not found (security best practice)
        if (!user) return res.json({ success: true });

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        if (isProduction) {
            await pool.query(
                'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
                [user.id, token, expires]
            );
        } else {
            db.run(
                'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?,?,?)',
                [user.id, token, expires.toISOString()]
            );
        }

        // Send reset email
        if (resend) {
            const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login?token=${token}`;
            await resend.emails.send({
                from: 'noreply@resend.dev',
                to: email,
                subject: 'Reset your May AI Lab password',
                html: `
                    <div style="font-family:sans-serif; max-width:500px; margin:0 auto; padding:2rem; background:#f7f9f7; border-radius:12px;">
                        <h2 style="color:#1a6b4a;">Reset your password</h2>
                        <p style="color:#6b7280; margin:1rem 0;">Hi ${user.username}, click the button below to reset your password. This link expires in 1 hour.</p>
                        <a href="${resetUrl}" style="display:inline-block; background:#1a6b4a; color:white; padding:0.85rem 2rem; border-radius:10px; text-decoration:none; font-weight:700; margin:1rem 0;">Reset Password →</a>
                        <p style="color:#9ca3af; font-size:0.78rem; margin-top:1.5rem;">If you didn't request this, ignore this email.</p>
                    </div>
                `
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });

    try {
        let resetToken;
        if (isProduction) {
            const result = await pool.query(
                'SELECT * FROM password_reset_tokens WHERE token=$1 AND used=0 AND expires_at > NOW()',
                [token]
            );
            resetToken = result.rows[0];
        } else {
            resetToken = await new Promise((resolve) => {
                db.get(
                    "SELECT * FROM password_reset_tokens WHERE token=? AND used=0 AND expires_at > datetime('now')",
                    [token],
                    (err, row) => resolve(row)
                );
            });
        }

        if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

        const hashedPassword = await bcrypt.hash(password, 10);

        if (isProduction) {
            await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashedPassword, resetToken.user_id]);
            await pool.query('UPDATE password_reset_tokens SET used=1 WHERE id=$1', [resetToken.id]);
        } else {
            db.run('UPDATE users SET password=? WHERE id=?', [hashedPassword, resetToken.user_id]);
            db.run('UPDATE password_reset_tokens SET used=1 WHERE id=?', [resetToken.id]);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`May AI Lab running at http://localhost:${PORT}`);
    console.log(`Free tier: 3 websites per IP per day`);
    console.log(`Database mode: ${isProduction ? 'PostgreSQL (production)' : 'SQLite (local)'}`);
});