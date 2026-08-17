import sqlite3
import os

db = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'db.sqlite3')
print('Using DB:', db)
if not os.path.exists(db):
    print('DB not found')
    raise SystemExit(1)
con = sqlite3.connect(db)
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'core_%';")
tables = cur.fetchall()
print('Tables matching core_*:', tables)
try:
    cur.execute('SELECT count(*) FROM core_scfaccount;')
    print('core_scfaccount count:', cur.fetchone()[0])
    cur.execute('SELECT count(*) FROM core_scfaccount WHERE entreprise_id IS NULL;')
    print('global accounts (entreprise NULL):', cur.fetchone()[0])
    cur.execute('SELECT numero_compte, libelle, classe, entreprise_id FROM core_scfaccount LIMIT 10;')
    rows = cur.fetchall()
    print('sample rows (up to 10):')
    for r in rows:
        print(' ', r)
except Exception as e:
    print('Error querying core_scfaccount:', e)
finally:
    con.close()
