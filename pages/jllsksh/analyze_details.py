import pandas as pd
import sys

file_path = r'c:\Users\74074\Desktop\今岭流水数据\2025-12-20一个月的顾客流水单.xls'

try:
    # Read the sheet, skipping the first 3 rows
    df = pd.read_excel(file_path, sheet_name='已结账单', header=3)
    print("Actual columns in df:", df.columns.tolist())
    
    # Strip whitespace from column names just in case
    df.columns = [str(c).strip() for c in df.columns]
    print("Stripped columns:", df.columns.tolist())

    # Basic info
    total_orders = len(df)
    
    # Map columns accurately
    col_map = {
        '应收金额': '应收金额',
        '优惠金额': '优惠金额',
        '实收金额': '实收金额',
        '就餐人数': '就餐人数',
        '结算时间': '结算时间',
        '客位名称': '客位名称'
    }
    
    # Check if they exist
    for k, v in col_map.items():
        if v not in df.columns:
            print(f"Warning: Column '{v}' not found.")
            # Try to find best match
            for actual in df.columns:
                if v in actual:
                    col_map[k] = actual
                    print(f"Matched '{v}' to '{actual}'")
                    break

    # Re-extract
    receivable_col = col_map['应收金额']
    actual_col = col_map['实收金额']
    discount_col = col_map['优惠金额']
    people_col = col_map['就餐人数']
    time_col = col_map['结算时间']
    table_col = col_map['客位名称']

    df[receivable_col] = pd.to_numeric(df[receivable_col], errors='coerce')
    df[discount_col] = pd.to_numeric(df[discount_col], errors='coerce')
    df[actual_col] = pd.to_numeric(df[actual_col], errors='coerce')
    df[people_col] = pd.to_numeric(df[people_col], errors='coerce')
    
    total_receivable = df[receivable_col].sum()
    total_actual = df[actual_col].sum()
    total_discount = df[discount_col].sum()
    total_customers = df[people_col].sum()
    
    # Time analysis
    df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
    df = df.dropna(subset=[time_col])
    
    # Group by date
    daily_stats = df.groupby(df[time_col].dt.date)[actual_col].sum()
    busiest_day = daily_stats.idxmax()
    max_daily_revenue = daily_stats.max()
    
    # Calculate Per Customer Spending
    avg_per_customer = total_actual / total_customers if total_customers > 0 else 0
    avg_per_order = total_actual / total_orders if total_orders > 0 else 0
    
    print(f"\n--- 总体分析报告 ---")
    print(f"统计日期范围: {df[time_col].min()} 至 {df[time_col].max()}")
    print(f"总订单数: {total_orders}")
    print(f"总就餐人数: {total_customers:.0f}")
    print(f"总应收金额: {total_receivable:.2f} 元")
    print(f"总优惠金额: {total_discount:.2f} 元")
    print(f"总实收金额: {total_actual:.2f} 元")
    print(f"平均每单金额: {avg_per_order:.2f} 元")
    print(f"平均每客消费 (客单价): {avg_per_customer:.2f} 元")
    print(f"单日最高营收: {max_daily_revenue:.2f} 元 (日期: {busiest_day})")
    
    # Top 5 busiest tables
    top_tables = df[table_col].value_counts().head(5)
    print(f"\n--- 最受欢迎位置 TOP 5 ---")
    print(top_tables.to_string())
    
    # Hourly distribution
    df['hour'] = df[time_col].dt.hour
    hourly_stats = df.groupby('hour').size()
    print(f"\n--- 每小时订单分布 ---")
    print(hourly_stats.to_string())

except Exception as e:
    import traceback
    traceback.print_exc()
