import pandas as pd
from collections import Counter
import shutil
import os

def count_items(series):
    items = [str(x).strip() for x in series if pd.notna(x) and str(x).strip() != ""]
    if not items:
        return ""
    counts = Counter(items)
    return ", ".join([f"{k}: {v}" for k, v in counts.items()])

def join_unique(series):
    items = []
    for x in series:
        val = str(x).strip()
        if pd.notna(x) and val != "":
            if val not in items:
                items.append(val)
    return ", ".join(items)

file_path = r"C:\Users\Administrator\Desktop\프로젝트\조사위치표시\조사1.xlsx"
backup_path = r"C:\Users\Administrator\Desktop\프로젝트\조사위치표시\조사1_backup.xlsx"

# 백업본 생성
if os.path.exists(file_path):
    shutil.copy(file_path, backup_path)

df = pd.read_excel(file_path)

grouped_data = []

# 지번주소(D열) 기준 그룹화
for addr, group in df.groupby('지번주소', dropna=False):
    if pd.isna(addr) or str(addr).strip() == "":
        for _, row in group.iterrows():
            grouped_data.append(row.to_dict())
        continue
        
    new_row = group.iloc[0].copy()
    
    b_h_list = []
    for _, row in group.iterrows():
        b_val = str(row.get('시설명', '')).strip() if pd.notna(row.get('시설명')) else ""
        h_val = str(row.get('통합본', '')).strip() if pd.notna(row.get('통합본')) else ""
        
        if b_val:
            combined = b_val
            if h_val:
                combined = f"{b_val}\n({h_val})"
            if combined not in b_h_list:
                b_h_list.append(combined)
                
    new_row['시설명'] = "\n\n".join(b_h_list)
    new_row['충전기상태'] = count_items(group['충전기상태'])
    new_row['운영기관'] = count_items(group['운영기관'])
    new_row['충전기타입'] = join_unique(group['충전기타입'])
    new_row['충전용량'] = join_unique(group['충전용량'])
    new_row['상세위치'] = join_unique(group['상세위치'])
    
    grouped_data.append(new_row.to_dict())

new_df = pd.DataFrame(grouped_data)

# 기존 열 순서 맞추기
new_df = new_df[df.columns]

# 조사1.xlsx 로 저장
new_df.to_excel(file_path, index=False)
print("Data processing complete. Saved to 조사1.xlsx")
