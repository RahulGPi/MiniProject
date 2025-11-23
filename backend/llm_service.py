import requests
import json
import re

# Configuration for Ollama
# If running inside Docker, use "http://host.docker.internal:11434/api/generate"
# If running Python locally (outside Docker), use "http://localhost:11434/api/generate"
# OLLAMA_URL = "http://host.docker.internal:11434/api/generate" 
OLLAMA_URL = "http://localhost:11434/api/generate"

MODEL_NAME = "qwen2.5-coder:3b"

def generate_sql_from_query(user_query: str, schema_context: list):
    """
    Constructs the prompt and calls the local Qwen model.
    Uses RAG (Retrieval Augmented Generation) by injecting the live DDL schema.
    """
    
    # 1. RAG STEP: Transform JSON Schema into SQL DDL (Data Definition Language)
    # This format gives the LLM the precise structure, types, and relationships (FKs)
    # so it "knows" exactly what tables exist and how they connect.
    schema_statements = []
    for table in schema_context:
        col_defs = []
        for c in table['columns']:
            # Construct column definition: "id INTEGER PRIMARY KEY"
            col_def = f"{c['name']} {c['type']}"
            if c['isPk']:
                col_def += " PRIMARY KEY"
            
            # Include Foreign Key context if available
            if c.get('fk'):
                col_def += f" REFERENCES {c['fk']['table']}({c['fk']['col']})"
            
            col_defs.append(col_def)
        
        schema_statements.append(f"CREATE TABLE {table['name']} (\n    {', '.join(col_defs)}\n);")
    
    schema_text = "\n\n".join(schema_statements)

    # 2. Strict Prompt Engineering
    system_prompt = f"""
    You are a PostgreSQL expert. Convert the user's natural language question into a valid SQL query.
    
    ### LIVE DATABASE SCHEMA (RAG CONTEXT) ###
    The following tables currently exist in the database. You MUST ONLY use these tables:
    
    {schema_text}
    
    ### RULES ###
    1. Return ONLY the raw SQL. No markdown, no explanations.
    2. Always end with a semicolon (;).
    3. CHECK EXISTENCE: 
       - If the user asks to create a table that is listed in the schema above, use `CREATE TABLE IF NOT EXISTS` or handle gracefully.
       - If the user asks to query a table NOT listed above, do not invent it.
    4. DESTRUCTIVE ACTIONS: 
       - If the user asks to DROP tables or DELETE data, ALWAYS append `CASCADE` (e.g., `DROP TABLE name CASCADE;`) to ensure execution despite foreign keys.
    5. Use valid PostgreSQL syntax.
    """

    full_prompt = f"{system_prompt}\n\nUser Question: {user_query}\nSQL:"

    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "temperature": 0.1, # Low temperature for factual accuracy based on retrieved context
            "num_predict": 250 
        }
    }

    try:
        # INCREASED TIMEOUT: RAG context makes generation slower.
        # Increased from 10s to 90s to prevent "Read timed out" errors.
        response = requests.post(OLLAMA_URL, json=payload, timeout=90)
        response.raise_for_status()
        
        result_json = response.json()
        raw_response = result_json.get("response", "").strip()
        
        return clean_llm_response(raw_response)

    except requests.exceptions.RequestException as e:
        print(f"LLM Connection Error: {e}")
        return f"-- Error connecting to Local LLM: {str(e)}"

def clean_llm_response(text):
    """Removes markdown backticks and extra whitespace."""
    text = re.sub(r'```sql\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'```\s*', '', text)
    text = text.strip()
    return text