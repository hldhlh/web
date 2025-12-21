import pandas as pd
import sys

file_path = r'c:\Users\74074\Desktop\今岭流水数据\2025-12-20一个月的顾客流水单.xls'

try:
    # Load without header to see raw data
    raw_df = pd.read_excel(file_path, sheet_name='已结账单', header=None)
    
    # Find the row that contains '营业流水号'
    header_row_idx = -1
    for i, row in raw_df.iterrows():
        if '营业流水号' in row.values:
            header_row_idx = i
            break
    
    if header_row_idx == -1:
        print("Error: Could not find header row.")
        sys.exit(1)
        
    print(f"Found header at row {header_row_idx}")
    
    # Reload with correct header
    df = pd.read_excel(file_path, sheet_name='已结账单', header=header_row_idx)
    
    # Clean column names
    df.columns = [str(c).strip() for c in df.columns]
    
    # Basic info
    total_orders = len(df)
    
    # Mapping
    cols = {
        'receivable': '应收金额',
        'discount': '优惠金额',
        'actual': '实收金额',
        'people': '就餐人数',
        'time': '结算时间',
        'table': '客位名称'
    }
    
    for k, v in cols.items():
        if v not in df.columns:
            # Fallback: try index-based if names are broken
            if v == '应收金额': cols[k] = df.columns[7]
            if v == '优惠金额': cols[k] = df.columns[8]
            if v == '实收金额': cols[k] = df.columns[9]
            if v == '就餐人数': cols[k] = df.columns[6]
            if v == '结算时间': cols[k] = df.columns[12]
            if v == '客位名称': cols[k] = df.columns[2]

    df[cols['receivable']] = pd.to_numeric(df[cols['receivable']], errors='coerce')
    df[cols['discount']] = pd.to_numeric(df[cols['discount']], errors='coerce')
    df[cols['actual']] = pd.to_numeric(df[cols['actual']], errors='coerce')
    df[cols['people']] = pd.to_numeric(df[cols['people']], errors='coerce')
    
    # Filter out empty rows (sometimes Excel has footer rows)
    df = df.dropna(subset=[cols['receivable'], cols['actual']], how='all')
    
    total_receivable = df[cols['receivable']].sum()
    total_actual = df[cols['actual']].sum()
    total_discount = df[cols['discount']].sum()
    total_customers = df[cols['people']].sum()
    
    # Time analysis
    df[cols['time']] = pd.to_datetime(df[cols['time']], errors='coerce')
    df = df.dropna(subset=[cols['time']])
    
    # Group by date
    daily_stats = df.groupby(df[cols['time']].dt.date)[cols['actual']].sum()
    busiest_day = daily_stats.idxmax()
    max_daily_revenue = daily_stats.max()
    
    # Calculate Per Customer Spending
    avg_per_customer = total_actual / total_customers if total_customers > 0 else 0
    avg_per_order = total_actual / len(df) if len(df) > 0 else 0
    
    print(f"--- 总体分析报告 ---")
    print(f"统计日期范围: {df[cols['time']].min()} 至 {df[cols['time']].max()}")
    print(f"有效订单数: {len(df)}")
    print(f"总就餐人数: {total_customers:.0f}")
    print(f"总应收金额: {total_receivable:.2f} 元")
    print(f"总优惠金额: {total_discount:.2f} 元")
    print(f"总实收金额: {total_actual:.2f} 元")
    print(f"平均每单消费: {avg_per_order:.2f} 元")
    print(f"店均客单价 (Per Head): {avg_per_customer:.2f} 元")
    print(f"单日最高营收: {max_daily_revenue:.2f} 元 (日期: {busiest_day})")
    
    # Top 5 busiest tables
    top_tables = df[cols['table']].value_counts().head(5)
    print(f"\n--- 最受欢迎位置 TOP 5 ---")
    print(top_tables.to_string())
    
    # Hourly distribution
    df['hour'] = df[cols['time']].dt.hour
    hourly_stats = df.groupby('hour').size()
    print(f"\n--- 每小时订单分布 ---")
    print(hourly_stats.to_string())

    # Save summary to a CSV for user if they want
    df.to_csv('cleaned_data.csv', index=False, encoding='utf-8-sig')
    print("\n已保存清理后的数据到 cleaned_data.csv")

except Exception as e:
    import traceback
    traceback.print_exc()
