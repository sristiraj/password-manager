import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from crypto import derive_key, new_salt, encrypt, decrypt, b64enc, b64dec


def test_round_trip():
    salt = new_salt()
    key = derive_key("hunter2", salt)
    plaintext = b"super secret data"
    assert decrypt(key, encrypt(key, plaintext)) == plaintext


def test_wrong_key_fails():
    import pytest
    salt = new_salt()
    key1 = derive_key("correct", salt)
    key2 = derive_key("wrong", salt)
    blob = encrypt(key1, b"data")
    with pytest.raises(Exception):
        decrypt(key2, blob)


def test_b64_round_trip():
    data = os.urandom(32)
    assert b64dec(b64enc(data)) == data
