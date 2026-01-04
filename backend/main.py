import os
import json
import psycopg2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import database
import llm_service
from contextlib import asynccontextmanager

app = FastAPI()

# Enable CORS so the React Frontend can talk to this Python Backend
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
    action: str  # 'create_table', 'add_column', 'drop_column', 'drop_table'
    table_name: str
    column_name: Optional[str] = None
    column_type: Optional[str] = None

# --- HELPER ---
def get_db_connection():
    if not DATABASE_URL:
        print("CRITICAL ERROR: DATABASE_URL is missing!")
        raise Exception("DATABASE_URL environment variable is not set")
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"Error connecting to DB: {e}")

@app.get("/schema")
def read_schema():
    """
    Used by the No-Code UI to visualize tables.
    """
    try:
        return database.get_current_schema()
    except Exception as e:
        print(f"RESET ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
def chat_with_data(request: ChatRequest):
    """
    The Core Agent Endpoint.
    1. Gets live schema from DB.
    2. Sends schema + user question to LLM.
    3. Receives SQL.
    4. Executes SQL on DB.
    5. Returns Data + Generated SQL (for UI transparency).
    """
    print(f"User Query: {request.message}")
    
    try:
        # Step 1: Get the current structure of the database
        current_schema = database.get_current_schema()
        
        # Step 2: Ask the LLM to write SQL based on that structure
        generated_sql = llm_service.generate_sql_from_query(request.message, current_schema)
        
        # Guard: Check if LLM returned an error message instead of SQL
        if generated_sql.startswith("-- Error") or "Error connecting" in generated_sql:
            return {
                "response": "I'm having trouble thinking right now (LLM Error).",
                "sql": generated_sql,
                "data": []
            }

        print(f"LLM Generated SQL: {generated_sql}")

        # Step 3: Execute the generated SQL
        # We wrap this execution in a specific try/except to catch Bad SQL (Hallucinations)
        try:
            query_result = database.execute_query(generated_sql)
            
            # Check if our database helper returned a logical error
            if isinstance(query_result, dict) and "error" in query_result:
                return {
                    "response": f"I generated SQL, but the database rejected it: {query_result['error']}",
                    "sql": generated_sql,
                    "data": []
                }
            
            # Success!
            return {
                "response": "Here is the data I found:",
                "sql": generated_sql,
                "data": query_result
            }
            
        except Exception as db_err:
             return {
                "response": f"Database Execution Error: {str(db_err)}",
                "sql": generated_sql,
                "data": []
            }

    except Exception as e:
        # General server error
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ddl")
def execute_no_code_update(request: DDLRequest):
    """
    The No-Code Tool Endpoint.
    Translates JSON actions into DDL (Data Definition Language) SQL.
    """
    sql = ""
    try:
        if request.action == "create_table":
            # Default to a table with just an ID
            sql = f"CREATE TABLE {request.table_name} (id SERIAL PRIMARY KEY);"
            
        elif request.action == "add_column":
            if not request.column_name or not request.column_type:
                raise HTTPException(status_code=400, detail="Column name and type required")
            sql = f"ALTER TABLE {request.table_name} ADD COLUMN {request.column_name} {request.column_type};"
            
        elif request.action == "drop_column":
            if not request.column_name:
                raise HTTPException(status_code=400, detail="Column name required")
            sql = f"ALTER TABLE {request.table_name} DROP COLUMN {request.column_name};"
            
        elif request.action == "drop_table":
             sql = f"DROP TABLE {request.table_name};"

        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {request.action}")

        print(f"Executing DDL: {sql}")
        
        result = database.execute_query(sql)
        
        if isinstance(result, dict) and "error" in result:
             raise HTTPException(status_code=400, detail=result["error"])

        return {"status": "success", "sql_executed": sql}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Host 0.0.0.0 is required if running inside Docker to be accessible
    uvicorn.run(app, host="0.0.0.0", port=8000)