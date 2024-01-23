base = 43
chars = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$*+-./:"
inv_chars = {v: k for k, v in enumerate(chars)}

def encode(data: bytes) -> bytes:
    length = len(data)
    data = data.lstrip(b"\x00")
    offset = length - len(data)
    num = int.from_bytes(data, byteorder="big")
    string = b""
    while num:
        num, idx = divmod(num, base)
        string += chars[idx:idx + 1]
    result = chars[0:1] * offset + string[::-1]
    return result

def decode(data: bytes) -> bytes:
    length = len(data)
    data = data.lstrip(chars[0:1])
    offset = length - len(data)
    num = 0
    for char in data:
        num *= base
        num += inv_chars[char]
    return num.to_bytes(offset + (num.bit_length() + 7) // 8, "big")
