import requests
import json
import datetime
import pandas_market_calendars as mcal
import os

# --- Configuration ---
# Your Cloud Run backend URL (same one your website uses)
DATA_URL = "https://ceorater-backend-697273542938.us-south1.run.app/api/data"

# Directory where the downloaded files will be saved
OUTPUT_DIR = "ceorater_data_archive"

# --- Main Script Logic ---
def download_data():
    """
    Checks if today is a valid NYSE trading day and, if so,
    downloads the CEORater data from the Cloud Run backend.
    """
    print("Script started...")
    
    # 1. Check if today is a market holiday
    today_utc = datetime.datetime.utcnow().date()
    nyse = mcal.get_calendar('NYSE')
    # Get the schedule for today
    schedule = nyse.valid_days(start_date=today_utc, end_date=today_utc)
    
    if schedule.empty:
        print(f"{today_utc} is a weekend or market holiday. No download needed.")
        return

    print(f"{today_utc} is a trading day. Proceeding with download.")

    # 2. Fetch the data from Cloud Run backend
    try:
        response = requests.get(DATA_URL, timeout=30)
        response.raise_for_status()  # Raises an error for bad responses (4xx or 5xx)
        print("Successfully fetched data from Cloud Run backend.")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return

    # 3. Parse the JSON response directly (no more Google Sheets wrapper)
    try:
        data = response.json()
        print(f"Successfully parsed JSON data. Found {len(data)} CEO records.")
    except json.JSONDecodeError:
        print("Failed to decode JSON data.")
        return

    # 4. Save the raw data to a timestamped file
    # Create the output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Format the filename with today's date
    file_name = f"ceorater_data_{today_utc.strftime('%Y-%m-%d')}.json"
    file_path = os.path.join(OUTPUT_DIR, file_name)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"Data successfully saved to {file_path}")
    
    # 5. Optional: Create a "latest" file for easy reference
    latest_path = os.path.join(OUTPUT_DIR, "ceorater_data_latest.json")
    with open(latest_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Latest data also saved to {latest_path}")
    
    # 6. Optional: Print summary statistics
    if data and len(data) > 0:
        print("\n--- Data Summary ---")
        print(f"Total CEOs: {len(data)}")
        if isinstance(data[0], dict):
            # Count founders if that field exists
            founders = [d for d in data if d.get('founder') == 'Y']
            print(f"Founder CEOs: {len(founders)}")
            print(f"Non-Founder CEOs: {len(data) - len(founders)}")

if __name__ == "__main__":
    download_data()
