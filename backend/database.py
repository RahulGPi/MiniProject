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

DSN = f"host={DB_HOST} dbname={DB_NAME} user={DB_USER} password={DB_PASS} port={DB_PORT}"

def get_db_connection():
    """Establishes a connection to the PostgreSQL database with retries."""
    max_retries = 5
    for i in range(max_retries):
        try:
            conn = psycopg.connect(DSN, autocommit=True)
            return conn
        except psycopg.OperationalError as e:
            if i == max_retries - 1:
                print("CRITICAL: Database connection failed after retries.")
                raise e
            print(f"Connection failed ({e}), retrying in 2s...")
            time.sleep(2)

def execute_query(sql: str):
    """Executes a raw SQL query and returns the results."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(sql)
            if cursor.description:
                return cursor.fetchall()
        return {"status": "success", "message": "Query executed successfully"}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if conn:
            conn.close()

def get_current_schema():
    """Introspects DB for Tables, Columns, PKs, and Foreign Keys."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # 1. Get Tables
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = cursor.fetchall()
            
            schema_output = []
            
            for (table_name,) in tables:
                # 2. Get Columns
                cursor.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns 
                    WHERE table_name = %s
                    ORDER BY ordinal_position
                """, (table_name,))
                columns_data = cursor.fetchall()
                
                # 3. Get Primary Keys
                cursor.execute("""
                    SELECT c.column_name
                    FROM information_schema.table_constraints tc 
                    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                    JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = ccu.column_name
                    WHERE constraint_type = 'PRIMARY KEY' AND tc.table_name = %s
                """, (table_name,))
                pks = [r[0] for r in cursor.fetchall()]

                # 4. Get Foreign Keys (NEW)
                cursor.execute("""
                    SELECT
                        kcu.column_name, 
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name 
                    FROM information_schema.key_column_usage AS kcu
                    JOIN information_schema.constraint_column_usage AS ccu
                        ON ccu.constraint_name = kcu.constraint_name
                    JOIN information_schema.table_constraints AS tc
                        ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = %s
                """, (table_name,))
                fks = cursor.fetchall()
                # Create a lookup dict for FKs: { 'user_id': 'users.id' }
                fk_map = {row[0]: {'table': row[1], 'col': row[2]} for row in fks}
                
                formatted_columns = []
                for col_name, dtype in columns_data:
                    formatted_columns.append({
                        "name": col_name,
                        "type": dtype.upper(),
                        "isPk": col_name in pks,
                        "fk": fk_map.get(col_name) # Will be None or {table, col}
                    })
                    
                schema_output.append({
                    "id": f"tbl_{table_name}",
                    "name": table_name,
                    "columns": formatted_columns
                })
                
        return schema_output
    except Exception as e:
        print(f"Schema Fetch Error: {e}")
        return []
    finally:
        conn.close()

def init_db():
    """Creates a sample table if none exist."""
    try:
        conn = get_db_connection()
        # Create users
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Create orders with FK
        conn.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                amount DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.close()
    except Exception as e:
        print(f"Init DB Error: {e}")