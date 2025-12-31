import json
import sqlite3 # Not for sqlite, just for formatting? No, I'll use raw strings.
import base64

def generate_inserts(json_file):
    with open(json_file, 'r') as f:
        data = json.load(f)
    
    sql_statements = []
    for item in data:
        title = item['title']
        base64_data = item['base64']
        info = f"1. 鲜牛肉<div><br></div><div><img src=\"{base64_data}\"><div><br></div></div>"
        # Escape single quotes for SQL
        info_escaped = info.replace("'", "''")
        title_escaped = title.replace("'", "''")
        
        sql = f"INSERT INTO sop_items (tag, title, info) VALUES ('鲜牛肉', '{title_escaped}', '{info_escaped}');"
        sql_statements.append(sql)
    
    return sql_statements

if __name__ == "__main__":
    sqls = generate_inserts("processed_photos.json")
    with open("insert_meat.sql", "w", encoding='utf-8') as f:
        f.write("\n".join(sqls))
    print(f"Generated {len(sqls)} SQL statements")
