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

*Add your screenshots here*

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