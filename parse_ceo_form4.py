import requests
import xml.etree.ElementTree as ET
import pandas as pd
from datetime import datetime, timedelta

# Define CEO test cases
ceo_list = [
    {"name": "Tim Cook", "ceo_cik": "0001214156"},
    {"name": "Satya Nadella", "ceo_cik": "0001513142"},
    {"name": "Sundar Pichai", "ceo_cik": "0001534753"}
]

six_months_ago = datetime.now() - timedelta(days=180)
results = []

for ceo in ceo_list:
    cik = ceo["ceo_cik"]
    url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=4&owner=only&count=40&output=atom"
    headers = {'User-Agent': 'Mozilla/5.0 (CEORater Contact: your-email@example.com)'}

    try:
        res = requests.get(url, headers=headers)
        res.raise_for_status()
    except Exception as e:
        print(f"Error fetching filings for {ceo['name']}: {e}")
        continue

    root = ET.fromstring(res.content)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}

    for entry in root.findall('atom:entry', ns):
        filing_date = entry.find('atom:updated', ns).text[:10]
        if datetime.strptime(filing_date, "%Y-%m-%d") < six_months_ago:
            continue

        form_url = entry.find('atom:link', ns).attrib['href']
        txt_url = form_url.replace('-index.htm', '.txt')

        try:
            txt_res = requests.get(txt_url, headers=headers)
            txt_res.raise_for_status()
        except Exception as e:
            print(f"Error fetching Form 4: {e}")
            continue

        content = txt_res.text
        if '<ownershipDocument>' not in content:
            continue

        try:
            start = content.find('<ownershipDocument>')
            end = content.find('</ownershipDocument>') + len('</ownershipDocument>')
            filing_xml = ET.fromstring(content[start:end])
            for tx in filing_xml.findall('.//nonDerivativeTransaction'):
                data = {
                    "CEO": ceo["name"],
                    "CIK": cik,
                    "Trade Date": tx.findtext('.//transactionDate/value'),
                    "Type": tx.findtext('.//transactionCoding/transactionCode'),
                    "Shares": tx.findtext('.//transactionAmounts/transactionShares/value'),
                    "Price": tx.findtext('.//transactionAmounts/transactionPricePerShare/value'),
                    "Owned After": tx.findtext('.//postTransactionAmounts/sharesOwnedFollowingTransaction/value')
                }
                results.append(data)
        except:
            continue

# Export results to CSV
df = pd.DataFrame(results)
df.to_csv("ceo_insider_trades.csv", index=False)
print("✅ Done. Results saved to ceo_insider_trades.csv")
