import pandas as pd
import json
import os

try:
    df = pd.read_excel('조사.xlsx')
    df.columns = [str(c).replace('\n', ' ').strip() for c in df.columns]
    
    data = []
    for _, row in df.iterrows():
        item = {}
        for col in df.columns:
            val = row[col]
            if pd.isna(val):
                val = None
            item[col] = val
        data.append(item)
    
    info = {
        "columns": df.columns.tolist(),
        "count": len(df),
        "data": data
    }
    
    with open('survey_data.json', 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    print("Success: survey_data.json created")
except Exception as e:
    print(f"Error: {e}")
