import requests
import json
import datetime
import pandas_market_calendars as mcal
import re
import os

# --- Configuration ---
# The URL from your index.html file to fetch the backend data
DATA_URL = "https://docs.google.com/spreadsheets/d/17k06sKH7b8LETZIpGP7nyCC7fmO912pzJQEx1P538CA/gviz/tq?tqx=out:json&gid=0&range=C6:Y107"

# Directory where the downloaded files will be saved
OUTPUT_DIR = "ceorater_data_archive"

# --- Main Script Logic ---
def download_data():
    """
    Checks if today is a valid NYSE trading day and, if so,
    downloads the CEORater data.
    """
    print("Script started...")
    
    # 1. Check if today is a market holiday
    today_utc = datetime.datetime.utcnow().date()
    nyse = mcal.get_calendar('NYSE')
    # Get the schedule for today. Note: valid_days expects start and end date.
    schedule = nyse.valid_days(start_date=today_utc, end_date=today_utc)
    
    if schedule.empty:
        print(f"{today_utc} is a weekend or market holiday. No download needed.")
        return

    print(f"{today_utc} is a trading day. Proceeding with download.")

    # 2. Fetch the data from the URL
    try:
        response = requests.get(DATA_URL, timeout=30)
        response.raise_for_status()  # Raises an error for bad responses (4xx or 5xx)
        print("Successfully fetched data from URL.")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return

    # 3. Extract the raw JSON data
    # The response is a string like "google.visualization.Query.setResponse({...});"
    # We need to extract the JSON object from within the parentheses.
    match = re.search(r'google\.visualization\.Query\.setResponse\((.*)\)', response.text, re.S)
    if not match:
        print("Could not parse the response from Google Sheets.")
        return
        
    json_data_str = match.group(1)
    
    try:
        data = json.loads(json_data_str)
    except json.JSONDecodeError:
        print("Failed to decode JSON data.")
        return

    # 4. Save the data to a timestamped file
    # Create the output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Format the filename with today's date
    file_name = f"ceorater_data_{today_utc.strftime('%Y-%m-%d')}.json"
    file_path = os.path.join(OUTPUT_DIR, file_name)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    print(f"Data successfully saved to {file_path}")

if __name__ == "__main__":
    download_data()