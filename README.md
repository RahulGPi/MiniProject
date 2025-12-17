Agentic DBMS: Voice-Activated and Visual Database Management System
A modern, hybrid database management tool designed for developers. It bridges the gap between visual schema design and AI-powered natural language interaction, allowing you to build and query databases without writing raw SQL.
Live Demo: https://agentic-frontend.onrender.com (Note: Backend may sleep on free tier, allow ~1 min for cold start)
🌟 Key Features
No-Code Visual Schema Designer: * Create tables and columns via a drag-and-drop infinite canvas.
Visualize relationships with dynamic Bezier curves.
Automatic collision detection for clean layouts.
AI-Powered SQL Agent:
Chat with your database using natural language (e.g., "Show me the top 5 users").
Powered by Google Gemini 2.0 Flash.
Uses RAG (Retrieval-Augmented Generation) to inject live schema context, preventing hallucinations.
Voice Interaction:
Hands-free query execution using Web Speech API.
Autonomic Repair Loop:
Automatically detects SQL errors and re-prompts the AI to fix them without user intervention.
Ephemeral "Playground" Mode:
Database automatically resets on session start for a fresh testing environment.
🛠️ Architecture
The system follows a decoupled client-server architecture:
Frontend: React.js, Tailwind CSS, Lucide Icons, Vite.
Backend: Python FastAPI, Uvicorn, Psycopg2.
Database: PostgreSQL (hosted on Render).
AI Engine: Google Gemini API (replacing local LLMs for cloud scalability).
🚀 Getting Started
Prerequisites
Node.js & npm
Python 3.11+
PostgreSQL (Local or Cloud)
Google Gemini API Key
Installation
Clone the repository
git clone [https://github.com/your-username/agentic-dbms.git](https://github.com/your-username/agentic-dbms.git)
cd agentic-dbms


Backend Setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

Create a .env file in /backend:
DATABASE_URL=postgresql://user:pass@host:5432/dbname
GEMINI_API_KEY=your_gemini_api_key


Frontend Setup
cd ../frontend
npm install

Create a .env file in /frontend:
VITE_API_BASE=http://localhost:8000


Running Locally
Start Backend
# Terminal 1
cd backend
uvicorn main:app --reload


Start Frontend
# Terminal 2
cd frontend
npm run dev


Open http://localhost:5173 in your browser.
📦 Deployment (Render.com)
This project is configured for deployment on Render.
Backend Service: * Build Command: pip install -r requirements.txt
Start Command: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
Env Vars: PYTHON_VERSION=3.11.9, DATABASE_URL, GEMINI_API_KEY.
Frontend Service (Static Site):
Build Command: npm install && npm run build
Publish Directory: dist
Rewrite Rule: Source /api/* -> Destination https://your-backend.onrender.com/*.
👥 Contributors
Rahul Girish Pai (4SF23CI116)
Vineeth KHM (4SF23CI067)
Goutham Nayak (4SF24CI403)
Chirag Shetty (4SF23CI045)
Under guidance of Mrs. Chaithrika Aditya, Dept. of CSE(AI&ML), Sahyadri College of Engineering & Management.
📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
