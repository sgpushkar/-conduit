import sqlite3
from users import get_user


def test_get_user():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE users (name TEXT)")
    db.execute("INSERT INTO users VALUES ('ann')")
    assert get_user(db, "ann") == [("ann",)]
