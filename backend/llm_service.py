import os
import re
import google.generativeai as genai
from google.api_core import exceptions

# Configuration for Google Gemini
# Get your key from: https://aistudio.google.com/app/apikey
API_KEY = "AIzaSyC2yE77RaXWvnMC7LXsE3oDaFyEMcipJ64"

# 'gemini-1.5-flash' is fast and excellent for logic/code (comparable/better than gpt-3.5)
# 'gemini-1.5-pro' is better for very complex reasoning but slower/more expensive
MODEL_NAME = "gemini-2.5-flash"

# Configure the SDK
genai.configure(api_key=API_KEY)

def _call_gemini(system_prompt, user_prompt):
    """Helper to send structured messages to Gemini."""
    try:
        # We initialize the model inside the call to allow changing the system_instruction dynamically
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            system_instruction=system_prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,  # Low temperature for deterministic SQL
                max_output_tokens=500
            )
        )
        
        # Send the user query
        response = model.generate_content(user_prompt)
        
        # Check if response was blocked (safety filters)
        if not response.parts:
            return "-- Error: Gemini blocked the response due to safety filters."

        return clean_llm_response(response.text)
    
    except exceptions.GoogleAPIError as e:
        print(f"Gemini API Error: {e}")
        return f"-- Error connecting to Gemini: {str(e)}"
    except Exception as e:
        print(f"Unexpected Error: {e}")
        return f"-- Error: {str(e)}"

def clean_llm_response(text):
    """Removes markdown backticks and extra whitespace."""
    # Gemini often uses ```sql ... ``` or just ``` ... ```
    text = re.sub(r'```sql\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'```\s*', '', text)
    return text.strip()

def _build_schema_context(schema_context):
    """Converts JSON schema to DDL for RAG."""
    schema_statements = []
    for table in schema_context:
        col_defs = []
        for c in table['columns']:
            col_def = f"{c['name']} {c['type']}"
            if c.get('isPk'): col_def += " PRIMARY KEY"
            if c.get('fk'): col_def += f" REFERENCES {c['fk']['table']}({c['fk']['col']})"
            col_defs.append(col_def)
        schema_statements.append(f"CREATE TABLE {table['name']} (\n    {', '.join(col_defs)}\n);")
    return "\n\n".join(schema_statements)

def generate_sql_from_query(user_query: str, schema_context: list):
    """Initial generation pass."""
    schema_text = _build_schema_context(schema_context)
    
    system_prompt = f"""
    You are a PostgreSQL expert. Convert the user's natural language question into a valid SQL query.
    
    ### LIVE DATABASE SCHEMA (RAG CONTEXT) ###
    {schema_text}
    
    ### RULES ###
    1. Return ONLY the raw SQL. No markdown.
    2. Always end with a semicolon (;).
    3. If creating tables, use `IF NOT EXISTS`.
    4. If dropping tables, ALWAYS append `CASCADE`.
    5. Use valid PostgreSQL syntax.
    """
    
    return _call_gemini(system_prompt, user_query)

def fix_generated_sql(user_query: str, failed_sql: str, error_msg: str, schema_context: list):
    """
    Self-Correction pass: Takes the failed SQL and the DB Error to generate a fix.
    """
    schema_text = _build_schema_context(schema_context)
    
    system_prompt = f"""
    You are a PostgreSQL expert debugging a broken query.
    
    ### LIVE DATABASE SCHEMA ###
    {schema_text}
    
    ### INSTRUCTIONS ###
    1. Analyze the error message (e.g., syntax error, missing column, constraint violation).
    2. Rewrite the SQL to fix the error.
    3. If the error is about dependencies (DROP), ensure CASCADE is used.
    4. Return ONLY the corrected SQL. No explanations.
    """
    
    user_context = f"""
    ### ORIGINAL REQUEST ###
    User: "{user_query}"
    
    ### FAILED ATTEMPT ###
    SQL: {failed_sql}
    
    ### DATABASE ERROR ###
    Error: {error_msg}
    """
    
    print(f"--- ATTEMPTING AUTO-REPAIR ---")
    print(f"Error: {error_msg}")
    
    return _call_gemini(system_prompt, user_context)