import os
import json
import psycopg2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

# --- CONFIGURATION ---
# Get these from Environment Variables in deployment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/postgres")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Configure Gemini
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')

app = FastAPI()

# Enable CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

@app.post("/reset")
def reset_database():
    """WIPES ALL DATA. Called by Frontend on startup."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Drop public schema and recreate it to wipe everything clean
        cur.execute("DROP SCHEMA public CASCADE;")
        cur.execute("CREATE SCHEMA public;")
        cur.execute("GRANT ALL ON SCHEMA public TO postgres;")
        cur.execute("GRANT ALL ON SCHEMA public TO public;")
        conn.commit()
        return {"status": "Database cleared"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/schema")
def get_schema():
    conn = get_db_connection()
    cur = conn.cursor()
    # Fetch tables
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    """)
    tables = [row[0] for row in cur.fetchall()]
    
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

@app.post("/ddl")
def execute_ddl(req: DDLRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    sql = ""
    
    # Simple rule-based DDL generation (safe & fast)
    try:
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
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        return {"detail": str(e)}, 400
    finally:
        cur.close()
        conn.close()

@app.post("/chat")
def chat_agent(req: ChatRequest):
    # 1. Get Schema Context
    current_schema = get_schema()
    schema_str = json.dumps(current_schema, indent=2)
    
    # 2. Construct Prompt for Gemini
    prompt = f"""
    You are a PostgreSQL expert.
    Current Database Schema JSON: {schema_str}
    
    User Request: "{req.message}"
    
    Goal: Generate a valid PostgreSQL SQL query to answer the request.
    Rules:
    1. Return ONLY the raw SQL. No markdown, no explanations.
    2. If the user asks to modify data (INSERT/UPDATE/DELETE), do it.
    3. If the user asks a question, SELECT the data.
    """
    
    try:
        # 3. Call Gemini API
        response = model.generate_content(prompt)
        sql_query = response.text.replace('```sql', '').replace('```', '').strip()
        
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
        return {
            "response": f"Error executing query: {str(e)}",
            "sql": sql_query if 'sql_query' in locals() else "Generation Failed"
        }