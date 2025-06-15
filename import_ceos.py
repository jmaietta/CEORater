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
# Adjust these based on the EXACT column names in your new, simplified CSV file.
# For example, if your CSV column is named 'CEO Name (Full)', change 'CEO Name' to 'CEO Name (Full)'.
CSV_COLUMN_MAPPING = {
    'CEO Name': 'ceo_name',
    'Company Name': 'company_name',
    'Ticker': 'ticker',
    'CEO Start Date': 'ceo_start_date', # This needs to be in Jacqueline-MM-DD format or MM/DD/YYYY
    'Founder (Y/N)': 'founder', # 'Y' or 'N'
    'Industry': 'industry',
    'Sector': 'sector',
    'CEO Compensation ($MM)': 'ceo_compensation_mm', # Assumes this is the column name in the CSV
    'Equity Trades URL': 'equity_ownership_url', # Assumes this is the column name in the CSV
    'Stock Price on Start': 'stock_price_on_start', # Needs to be float
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
            ticker TEXT UNIQUE NOT NULL, -- Ticker as unique identifier
            ceo_start_date TEXT,
            founder TEXT, -- 'Y' or 'N'
            industry TEXT,
            sector TEXT,
            ceo_compensation_mm REAL, -- Stored as a floating point number (in millions)
            equity_ownership_url TEXT,
            stock_price_on_start REAL,
            total_stock_return REAL, -- To be calculated/updated by backend logic
            current_stock_price REAL, -- To be fetched/updated by backend logic
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
        print(f"Warning: The following expected CSV columns are missing from the file: {missing_csv_columns}")
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
                elif db_col == 'stock_price_on_start':
                     try:
                        db_data[db_col] = float(csv_value.replace('$', '').replace(',', '')) # Remove '$' and commas
                     except ValueError:
                        print(f"Warning: Invalid Stock Price on Start '{csv_value}' for row {row_num}. Setting to NULL.")
                        db_data[db_col] = None
                elif db_col == 'founder':
                    db_data[db_col] = 'Y' if csv_value.strip().upper() == 'Y' else 'N'
                elif db_col == 'ceo_start_date':
                    # Attempt to parse common date formats (e.g., 'MM/DD/YYYY' or 'YYYY-MM-DD')
                    try:
                        if '/' in csv_value: # Assume MM/DD/YYYY
                            db_data[db_col] = datetime.strptime(csv_value.strip(), '%m/%d/%Y').strftime('%Y-%m-%d')
                        else: # Assume Jacqueline-MM-DD
                            db_data[db_col] = datetime.strptime(csv_value.strip(), '%Y-%m-%d').strftime('%Y-%m-%d')
                    except ValueError:
                        print(f"Warning: Invalid CEO Start Date format '{csv_value}' for row {row_num}. Expected MM/DD/YYYY or Jacqueline-MM-DD. Setting to NULL.")
                        db_data[db_col] = None
                else:
                    db_data[db_col] = csv_value.strip()

            # Check if CEO (by ticker) already exists to perform an UPDATE or INSERT
            # Note: For multiple CEOs per company, the 'ticker' alone might not be unique if not combined with CEO name.
            # However, for now, we'll continue using ticker as the unique key as per the table schema definition.
            # If a company has multiple CEOs, each must have a unique 'ticker' entry or a composite key.
            # The current schema assumes ticker is unique. If you have multiple CEOs for same ticker,
            # you will need a more complex primary key or multiple entries for the same ticker.
            cursor.execute("SELECT id FROM ceos WHERE ticker = ?", (db_data.get('ticker'),))
            existing_ceo = cursor.fetchone()

            if existing_ceo:
                # Update existing record
                update_query = f"""
                    UPDATE ceos SET
                        ceo_name = ?, company_name = ?, ceo_start_date = ?,
                        founder = ?, industry = ?, sector = ?,
                        ceo_compensation_mm = ?, equity_ownership_url = ?,
                        stock_price_on_start = ?
                    WHERE ticker = ?
                """
                cursor.execute(update_query, (
                    db_data.get('ceo_name'), db_data.get('company_name'), db_data.get('ceo_start_date'),
                    db_data.get('founder'), db_data.get('industry'), db_data.get('sector'),
                    db_data.get('ceo_compensation_mm'), db_data.get('equity_ownership_url'),
                    db_data.get('stock_price_on_start'),
                    db_data.get('ticker')
                ))
                updated_count += 1
            else:
                # Insert new record
                insert_query = f"""
                    INSERT INTO ceos (
                        ceo_name, company_name, ticker, ceo_start_date,
                        founder, industry, sector, ceo_compensation_mm,
                        equity_ownership_url, stock_price_on_start
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                cursor.execute(insert_query, (
                    db_data.get('ceo_name'), db_data.get('company_name'), db_data.get('ticker'), db_data.get('ceo_start_date'),
                    db_data.get('founder'), db_data.get('industry'), db_data.get('sector'), db_data.get('ceo_compensation_mm'),
                    db_data.get('equity_ownership_url'), db_data.get('stock_price_on_start')
                ))
                inserted_count += 1
            
            conn.commit()

        except KeyError as e:
            print(f"Error: Missing expected column in CSV row {row_num}: {e}. Skipping row.")
            skipped_count += 1
        except sqlite3.IntegrityError as e:
            # This can happen if ticker is unique and we try to insert duplicate due to a logic error
            print(f"Integrity Error for row {row_num} (Ticker: {db_data.get('ticker')}): {e}. Skipping row.")
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
