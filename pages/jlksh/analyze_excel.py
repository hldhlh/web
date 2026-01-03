import pandas as pd
import sys

file_path = r'c:\Users\74074\Desktop\今岭流水数据\2025-12-20一个月的顾客流水单.xls'

try:
    # Try reading with default engine
    # xls files usually need xlrd
    xl = pd.ExcelFile(file_path)
    print(f"Sheet names: {xl.sheet_names}")
    
    for sheet in xl.sheet_names:
        print(f"\n--- Sheet: {sheet} ---")
        df = pd.read_excel(file_path, sheet_name=sheet)
        print(f"Shape: {df.shape}")
        print("Columns:", df.columns.tolist())
        print("First 5 rows:")
        print(df.head().to_string())
        
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
