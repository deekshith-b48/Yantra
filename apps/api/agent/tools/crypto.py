import os
import base64
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    key_hex = os.environ["ENCRYPTION_KEY"]
    # Fernet needs a 32-byte URL-safe base64 key
    raw = bytes.fromhex(key_hex)[:32]
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt_token(plaintext: str) -> str:
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
