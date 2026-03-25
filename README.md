# ☕ May AI Lab

An AI-powered platform that generates professional websites, recognizes faces, manages business operations, and provides troubleshooting assistance — all running locally.

## 🚀 Features

| Module | Description |
|--------|-------------|
| **🌐 AI Website Generator** | Create complete websites from business descriptions. AI generates images, colors, and content. |
| **👤 Face Recognition Login** | Secure authentication using webcam with 90%+ confidence scoring. |
| **📊 Business Dashboard** | Full CRM: customers, bookings, invoices with SQLite database. |
| **🔧 AI Troubleshooting** | Interactive chat assistant that guides users through technical problems. |

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **AI Models**: Ollama (Mistral), face-api.js
- **Database**: SQLite3
- **Frontend**: HTML5, CSS3, JavaScript
- **APIs**: Pexels (stock images), Unsplash (fallback)

## 📸 Screenshots

### AI Website Generator
<img width="1919" height="962" alt="Screenshot 2026-03-25 155014" src="https://github.com/user-attachments/assets/2b011614-c20c-460f-8857-1bc7d2fcba59" />
<img width="1889" height="957" alt="Screenshot 2026-03-25 155037" src="https://github.com/user-attachments/assets/22a71922-5d3b-4c45-a495-db755929fca8" />
<img width="1873" height="901" alt="Screenshot 2026-03-25 155100" src="https://github.com/user-attachments/assets/19fdd38a-715c-4a90-a73e-221221d78a2a" />
<img width="1203" height="880" alt="Screenshot 2026-03-25 155121" src="https://github.com/user-attachments/assets/6430c904-f394-4b4f-81c0-80881a21254f" />

### Business Dashboard
<img width="1906" height="582" alt="Screenshot 2026-03-25 155225" src="https://github.com/user-attachments/assets/920ada88-1999-4213-bc6a-0413b1660f35" />

### AI Troubleshooting
<img width="584" height="383" alt="Screenshot 2026-03-25 155255" src="https://github.com/user-attachments/assets/b44b69fd-6ae1-4370-abf4-dd4e419322ab" />
<img width="1234" height="857" alt="Screenshot 2026-03-25 155311" src="https://github.com/user-attachments/assets/195322fe-a287-450a-9665-97c6aa88f2fd" />
<img width="1714" height="895" alt="Screenshot 2026-03-25 155332" src="https://github.com/user-attachments/assets/200e19c0-2bca-4382-8b7c-403104892d83" />

### Face Recognition Login
<img width="1868" height="950" alt="Screenshot 2026-03-25 155428" src="https://github.com/user-attachments/assets/a5adddb4-9843-409c-ae38-438103dfc16f" />



## ⚡ Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/may-ai-lab.git
cd may-ai-lab

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your API keys to .env

# Start Ollama (required for AI features)
ollama serve

# In another terminal, start the app
node server.js
