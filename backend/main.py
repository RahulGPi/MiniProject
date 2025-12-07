import os
import json
import psycopg2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

# --- CONFIGURATION ---
# Use the "Internal Database URL" from Render for best results
DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash')

app = FastAPI()

# Enable CORS for your Frontend URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for now to fix connection issues
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- REQUEST MODELS ---
class ChatRequest(BaseModel):
    message: str

class DDLRequest(BaseModel):
    action: str
    table_name: str = None
    column_name: str = None
    column_type: str = None
    fk_table: str = None
    fk_column: str = None
    constraint_name: str = None
    new_table_name: str = None
    new_column_name: str = None

# --- HELPER ---
def get_db_connection():
    if not DATABASE_URL:
        print("CRITICAL ERROR: DATABASE_URL is missing!")
        raise Exception("DATABASE_URL environment variable is not set")
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to connect to DB: {e}")
        raise e

# --- ROUTES ---
@app.head('/')
@app.get("/")
def read_root():
    """Root endpoint to verify server is running."""
    return {"status": "Agentic DBMS Backend is Running", "docs_url": "/docs"}

@app.post("/reset")
def reset_database():
    """WIPES ALL DATA. Called by Frontend on startup."""
    print("Received RESET request...")
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Drop public schema and recreate it to wipe everything clean
        cur.execute("DROP SCHEMA public CASCADE;")
        cur.execute("CREATE SCHEMA public;")
        cur.execute("GRANT ALL ON SCHEMA public TO postgres;")
        cur.execute("GRANT ALL ON SCHEMA public TO public;")
        conn.commit()
        cur.close()
        conn.close()
        print("Database reset successful.")
        return {"status": "Database cleared"}
    except Exception as e:
        print(f"RESET ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/schema")
def get_schema():
    print("Received SCHEMA request...")
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Fetch tables
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = [row[0] for row in cur.fetchall()]
        print(f"DEBUG: Found tables: {tables}")
        
        schema = []
        for t in tables:
            # Fetch columns
            cur.execute(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{t}'
            """)
            columns = []
            for col in cur.fetchall():
                col_data = {"name": col[0], "type": col[1], "isPk": False, "fk": None}
                
                # Check PK
                cur.execute(f"""
                    SELECT c.column_name
                    FROM information_schema.table_constraints tc 
                    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                    JOIN information_schema.key_column_usage c ON c.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = '{t}' AND c.column_name = '{col[0]}'
                """)
                if cur.fetchone():
                    col_data["isPk"] = True
                    
                # Check FK
                cur.execute(f"""
                    SELECT ccu.table_name, ccu.column_name, tc.constraint_name
                    FROM information_schema.table_constraints AS tc 
                    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = '{t}' AND kcu.column_name = '{col[0]}'
                """)
                fk = cur.fetchone()
                if fk:
                    col_data["fk"] = {"table": fk[0], "col": fk[1], "constraint": fk[2]}
                
                columns.append(col_data)
            schema.append({"id": t, "name": t, "columns": columns})
        
        cur.close()
        conn.close()
        return schema
    except Exception as e:
        print(f"SCHEMA ERROR: {e}")
        # Return empty list instead of crashing, so frontend doesn't break
        return []

@app.post("/ddl")
def execute_ddl(req: DDLRequest):
    print(f"Received DDL request: {req.action} on {req.table_name}")
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        sql = ""
        
        # Map actions to SQL
        if req.action == 'create_table':
            sql = f"CREATE TABLE {req.table_name} (id SERIAL PRIMARY KEY);"
        elif req.action == 'drop_table':
            sql = f"DROP TABLE {req.table_name} CASCADE;"
        elif req.action == 'rename_table':
            sql = f"ALTER TABLE {req.table_name} RENAME TO {req.new_table_name};"
        elif req.action == 'add_column':
            sql = f"ALTER TABLE {req.table_name} ADD COLUMN {req.column_name} {req.column_type};"
        elif req.action == 'drop_column':
            sql = f"ALTER TABLE {req.table_name} DROP COLUMN {req.column_name};"
        elif req.action == 'rename_column':
            sql = f"ALTER TABLE {req.table_name} RENAME COLUMN {req.column_name} TO {req.new_column_name};"
        elif req.action == 'alter_column_type':
            sql = f"ALTER TABLE {req.table_name} ALTER COLUMN {req.column_name} TYPE {req.column_type} USING {req.column_name}::{req.column_type};"
        elif req.action == 'add_foreign_key':
            sql = f"ALTER TABLE {req.table_name} ADD FOREIGN KEY ({req.column_name}) REFERENCES {req.fk_table}({req.fk_column});"
        elif req.action == 'drop_foreign_key':
            sql = f"ALTER TABLE {req.table_name} DROP CONSTRAINT {req.constraint_name};"
            
        cur.execute(sql)
        conn.commit()
        cur.close()
        conn.close()
        print("DDL Executed Successfully")
        return {"status": "success"}
    except Exception as e:
        print(f"DDL ERROR: {e}")
        return {"detail": str(e)}, 400

@app.post("/chat")
def chat_agent(req: ChatRequest):
    print(f"Received Chat: {req.message}")
    try:
        # 1. Get Schema Context
        current_schema = get_schema()
        schema_str = json.dumps(current_schema, indent=2)
        
        # 2. Construct Prompt
        prompt = f"""
        You are a PostgreSQL expert.
        Current Database Schema JSON: {schema_str}
        
        User Request: "{req.message}"
        
        Goal: Generate a valid PostgreSQL SQL query.
        Rules:
        1. Return ONLY the raw SQL. No markdown, no explanations.
        2. If the user asks to modify data (INSERT/UPDATE/DELETE), do it.
        3. If the user asks a question, SELECT the data.
        """
        
        # 3. Call Gemini API
        response = model.generate_content(prompt)
        sql_query = response.text.replace('```sql', '').replace('```', '').strip()
        print(f"Gemini Generated SQL: {sql_query}")
        
        # 4. Execute SQL
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql_query)
        
        result_data = None
        if cur.description:
            columns = [desc[0] for desc in cur.description]
            result_data = [dict(zip(columns, row)) for row in cur.fetchall()]
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {
            "response": "Query executed successfully.",
            "sql": sql_query,
            "data": result_data
        }
        
    except Exception as e:
        print(f"CHAT ERROR: {e}")
        return {
            "response": f"Error executing query: {str(e)}",
            "sql": sql_query if 'sql_query' in locals() else "Generation Failed"
        }