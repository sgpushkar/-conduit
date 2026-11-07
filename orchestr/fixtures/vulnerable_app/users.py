import sqlite3


def get_user(db, name):
    # intentionally vulnerable: SQL injection (demo fixture)
    return db.execute("SELECT * FROM users WHERE name = '%s'" % name).fetchall()
