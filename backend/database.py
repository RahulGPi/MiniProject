import psycopg
from psycopg.rows import dict_row
import os
import time

# Configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "agentic_db")
DB_USER = os.getenv("DB_USER", "admin")
DB_PASS = os.getenv("DB_PASS", "password123")
DB_PORT = os.getenv("DB_PORT", "5432")

# Construct the connection string (DSN)
# Psycopg 3 prefers connection strings or keyword args
DSN = f"host={DB_HOST} dbname={DB_NAME} user={DB_USER} password={DB_PASS} port={DB_PORT}"

def get_db_connection():
    """Establishes a connection to the PostgreSQL database with retries."""
    max_retries = 5
    for i in range(max_retries):
        try:
            # Psycopg 3 connection
            conn = psycopg.connect(DSN, autocommit=True)
            return conn
        except psycopg.OperationalError as e:
            if i == max_retries - 1:
                print(f"CRITICAL: Could not connect to DB after {max_retries} attempts.")
                raise e
            print(f"Database connection failed, retrying in 2 seconds... ({e})")
            time.sleep(2)

def execute_query(sql: str):
    """Executes a raw SQL query and returns the results (if any)."""
    conn = None
    try:
        conn = get_db_connection()
        
        # Psycopg 3 uses 'row_factory' to return dictionary-like objects
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(sql)
            
            # If the query returns rows (like SELECT), fetch them
            if cursor.description:
                result = cursor.fetchall()
                return result
            
        return {"status": "success", "message": "Query executed successfully"}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

def get_current_schema():
    """
    Introspects the PostgreSQL database to build a JSON schema 
    compatible with the React frontend.
    """
    conn = get_db_connection()
    try:
        # Standard cursor for schema introspection (tuples are fine here)
        with conn.cursor() as cursor:
            # 1. Get all table names in the public schema
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = cursor.fetchall()
            
            schema_output = []
            
            for (table_name,) in tables:
                # 2. Get columns for each table
                cursor.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns 
                    WHERE table_name = %s
                    ORDER BY ordinal_position
                """, (table_name,))
                columns_data = cursor.fetchall()
                
                # 3. Check for Primary Keys
                cursor.execute("""
                    SELECT c.column_name
                    FROM information_schema.table_constraints tc 
                    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                    JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = ccu.column_name
                    WHERE constraint_type = 'PRIMARY KEY' AND tc.table_name = %s
                """, (table_name,))
                
                # Fetch all PKs and flatten the list
                pks = [r[0] for r in cursor.fetchall()]
                
                formatted_columns = []
                for col_name, dtype in columns_data:
                    formatted_columns.append({
                        "name": col_name,
                        "type": dtype.upper(),
                        "isPk": col_name in pks
                    })
                    
                schema_output.append({
                    "id": f"tbl_{table_name}",
                    "name": table_name,
                    "columns": formatted_columns
                })
                
        return schema_output
    finally:
        conn.close()

def init_db():
    """Creates a sample table if none exist, just for testing."""
    conn = get_db_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
    finally:
        conn.close()