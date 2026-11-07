from cryptography.fernet import Fernet
from app import config


def _f() -> Fernet:
    if not config.TOKEN_ENCRYPTION_KEY:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is required in queue mode")
    return Fernet(config.TOKEN_ENCRYPTION_KEY.encode())


def encrypt(text: str) -> str: return _f().encrypt(text.encode()).decode()
def decrypt(text: str) -> str: return _f().decrypt(text.encode()).decode()
