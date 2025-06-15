import csv
import os
import sqlite3
import json
from datetime import datetime

# Define the path to your database. For Render, this will likely be in the project root.
# Make sure this matches where your server.js connects to the database.
# Adjusted path: Assuming ceorater.db is directly in the current working directory (e.g., ~/project/src/)
DATABASE_PATH = os.path.join(os.getcwd(), 'ceorater.db')

# Path to the uploaded CSV file.
# IMPORTANT: You will need to place your CSV file in the same directory as this script,
# or provide the correct path if it's elsewhere. For Render, typically it's in the project root.
CSV_FILE_PATH = os.path.join(os.getcwd(), 'CEORater CSV for Upload.csv')

# Define the mapping from your CSV column headers to the database column names.
# THESE MUST EXACTLY MATCH THE HEADERS IN YOUR CSV FILE.
CSV_COLUMN_MAPPING = {
    'CEO Name': 'ceo_name',
    'Founder (Y/N)': 'founder',
    'Total Stock Return (TSR) During CEO\'s Tenure': 'total_stock_return',
    'Company Name': 'company_name',
    'Ticker': 'ticker',
    'Industry': 'industry',
    'Sector': 'sector',
    'CEO Compensation ($ millions)': 'ceo_compensation_mm',
    'Equity Transactions': 'equity_ownership_url',
    'CEO Start Date': 'ceo_start_date',
    'Start Date Stock Price': 'stock_price_on_start',
    'Stock Price': 'current_stock_price'
}

# The number of header rows to skip in the CSV before the actual data headers.
# Assuming the new CSV has headers on the first row.
CSV_HEADER_SKIP_ROWS = 0 

def connect_db():
    """Connects to the SQLite database."""
    conn = None
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row # This allows access to columns by name
        print(f"Successfully connected to database at {DATABASE_PATH}")
    except sqlite3.Error as e:
        print(f"Database connection error: {e}")
        # Exit if we can't connect, as we can't proceed
        exit(1)
    return conn

def create_table(conn):
    """Creates the 'ceos' table if it doesn't exist, matching our schema."""
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ceos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ceo_name TEXT NOT NULL,
            company_name TEXT NOT NULL,
            ticker TEXT NOT NULL, -- Removed UNIQUE constraint to allow multiple CEOs per ticker
            ceo_start_date TEXT,
            founder TEXT, -- 'Y' or 'N'
            industry TEXT,
            sector TEXT,
            ceo_compensation_mm REAL, -- Stored as a floating point number (in millions)
            equity_ownership_url TEXT,
            stock_price_on_start REAL,
            total_stock_return REAL, -- Now imported from CSV
            current_stock_price REAL, -- Now imported from CSV
            youtube_urls TEXT -- JSON string of array of URLs, to be fetched by backend logic
        )
    ''')
    conn.commit()
    print("Table 'ceos' ensured to exist.")


def import_csv_data(conn, csv_file_path, column_mapping, skip_rows):
    """
    Imports data from a CSV file into the 'ceos' table.
    Handles data type conversions and missing values.
    """
    cursor = conn.cursor()
    
    # Read the CSV file content first to handle skip_rows
    lines = []
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"Error: CSV file not found at {csv_file_path}")
        return
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return

    if len(lines) <= skip_rows:
        print("Error: CSV file has too few rows to skip headers or is empty.")
        return

    # Use io.StringIO to treat the relevant lines as a file for csv.reader
    import io
    csv_data_io = io.StringIO("".join(lines[skip_rows:]))
    
    reader = csv.DictReader(csv_data_io)
    
    # Verify CSV headers against mapping
    csv_headers = reader.fieldnames
    if not csv_headers:
        print("Error: Could not read headers from CSV file.")
        return

    missing_csv_columns = [col for col in column_mapping if col not in csv_headers]
    if missing_csv_columns:
        print(f"Warning: The following expected CSV columns are missing from the file: {missing_csv_columns}. Their database fields will be NULL.")
        # For now, we'll proceed, but missing data will be null.

    inserted_count = 0
    updated_count = 0
    skipped_count = 0

    for row_num, row in enumerate(reader, start=skip_rows + 1): # Start counting from after skipped rows
        try:
            db_data = {}
            for csv_col, db_col in column_mapping.items():
                csv_value = row.get(csv_col, None) # Use .get() for robustness

                if csv_value is None or csv_value.strip() == '':
                    db_data[db_col] = None
                    continue

                # Data type conversions based on expected database type
                if db_col == 'ceo_compensation_mm':
                    try:
                        # Remove '$', '%', spaces, and commas, then convert to float
                        db_data[db_col] = float(csv_value.replace('$', '').replace('%', '').replace(' ', '').replace(',', ''))
                    except ValueError:
                        print(f"Warning: Invalid CEO Compensation '{csv_value}' for row {row_num}. Setting to NULL.")
                        db_data[db_col] = None
                elif db_col in ['stock_price_on_start', 'current_stock_price', 'total_stock_return']:
                     try:
                        # For percentages like '+89,432%' or dollar values
                        cleaned_value = csv_value.replace('$', '').replace('%', '').replace('+', '').replace(',', '').strip()
                        db_data[db_col] = float(cleaned_value)
                     except ValueError:
                        print(f"Warning: Invalid numerical value '{csv_value}' for {db_col} on row {row_num}. Setting to NULL.")
                        db_data[db_col] = None
                elif db_col == 'founder':
                    db_data[db_col] = 'Y' if csv_value.strip().upper() == 'Y' else 'N'
                elif db_col == 'ceo_start_date':
                    # Attempt to parse common date formats (e.g., 'MM/DD/YYYY' or 'YYYY-MM-DD')
                    try:
                        if '/' in csv_value: # Assume MM/DD/YYYY
                            db_data[db_col] = datetime.strptime(csv_value.strip(), '%m/%d/%Y').strftime('%Y-%m-%d')
                        else: # Assume YYYY-MM-DD
                            db_data[db_col] = datetime.strptime(csv_value.strip(), '%Y-%m-%d').strftime('%Y-%m-%d')
                    except ValueError:
                        print(f"Warning: Invalid CEO Start Date format '{csv_value}' for row {row_num}. Expected MM/DD/YYYY or YYYY-MM-DD. Setting to NULL.")
                        db_data[db_col] = None
                else:
                    db_data[db_col] = csv_value.strip()

            # Ensure NOT NULL constraints are met for insertion/update
            required_fields = ['ceo_name', 'company_name', 'ticker']
            if any(db_data.get(field) is None or str(db_data.get(field)).strip() == '' for field in required_fields):
                print(f"Error: Missing required field(s) for row {row_num}. Skipping row: {db_data}")
                skipped_count += 1
                continue

            # Identify an existing record by combining ticker and ceo_name for multi-CEO support
            cursor.execute("SELECT id FROM ceos WHERE ticker = ? AND ceo_name = ?",
                           (db_data['ticker'], db_data['ceo_name']))
            existing_ceo = cursor.fetchone()

            # Prepare fields for insertion/update (ensure order matches values)
            fields = ['ceo_name', 'company_name', 'ticker', 'ceo_start_date',
                      'founder', 'industry', 'sector', 'ceo_compensation_mm',
                      'equity_ownership_url', 'stock_price_on_start',
                      'total_stock_return', 'current_stock_price']
            
            values = [db_data.get(field) for field in fields]

            if existing_ceo:
                # Update existing record based on its unique 'id'
                update_query = f"""
                    UPDATE ceos SET
                        ceo_name = ?, company_name = ?, ceo_start_date = ?,
                        founder = ?, industry = ?, sector = ?,
                        ceo_compensation_mm = ?, equity_ownership_url = ?,
                        stock_price_on_start = ?, total_stock_return = ?,
                        current_stock_price = ?
                    WHERE id = ?
                """
                cursor.execute(update_query, (*values, existing_ceo['id']))
                updated_count += 1
            else:
                # Insert new record
                placeholders = ', '.join(['?' for _ in fields])
                insert_query = f"""
                    INSERT INTO ceos ({', '.join(fields)})
                    VALUES ({placeholders})
                """
                cursor.execute(insert_query, values)
                inserted_count += 1
            
            conn.commit()

        except KeyError as e:
            print(f"Error: Missing expected column in CSV row {row_num}: {e}. Please check CSV headers. Skipping row.")
            skipped_count += 1
        except sqlite3.IntegrityError as e:
            print(f"Integrity Error for row {row_num} (Data: Ticker={db_data.get('ticker')}, CEO={db_data.get('ceo_name')}): {e}. Skipping row.")
            skipped_count += 1
        except Exception as e:
            print(f"An unexpected error occurred for row {row_num}: {e}. Skipping row.")
            skipped_count += 1

    print(f"\nImport Summary:")
    print(f"  Inserted: {inserted_count} new CEO records.")
    print(f"  Updated: {updated_count} existing CEO records.")
    print(f"  Skipped: {skipped_count} rows due to errors or missing data.")

if __name__ == '__main__':
    conn = None
    try:
        conn = connect_db()
        if conn:
            create_table(conn) # Ensure table exists with correct columns
            import_csv_data(conn, CSV_FILE_PATH, CSV_COLUMN_MAPPING, CSV_HEADER_SKIP_ROWS)
    finally:
        if conn:
            conn.close()
            print("Database connection closed.")
