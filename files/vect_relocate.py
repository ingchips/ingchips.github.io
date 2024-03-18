import sys
import json
import os
import struct

BIN_INFO_OFFSET = 0x000000fc
EFLASH_ERASABLE_SIZE = 4096
PLATFORM_BASE = 0x02002000

def convert(p: str) -> None:
    if not os.path.exists(os.path.join(p, 'meta.json')):
        raise Exception(f'meta.json can be found in path: {p}')

    with open(os.path.join(p, 'meta.json'), 'r') as f:
        meta = json.load(f)

    if meta['rom']['base'] != PLATFORM_BASE:
        raise Exception('already converted?')

    platform = open(os.path.join(p, 'platform.bin'), 'rb').read()
    ver = list(struct.unpack('<HBB', platform[BIN_INFO_OFFSET : BIN_INFO_OFFSET + 4]))
    if ver != meta['version']:
        raise Exception(f"version mismatch: expected {meta['version']}, found {ver}")

    vector = platform[0:BIN_INFO_OFFSET + 8]
    platform = platform[EFLASH_ERASABLE_SIZE:]
    aligned = ((len(platform) + 127) // 128) * 128

    meta['rom']['base'] = PLATFORM_BASE + EFLASH_ERASABLE_SIZE
    meta['rom']['size'] = aligned + len(vector)
    meta['app']['base'] = (meta['rom']['base'] + meta['rom']['size'] + EFLASH_ERASABLE_SIZE - 1) // EFLASH_ERASABLE_SIZE * EFLASH_ERASABLE_SIZE
    vector = vector[:-4] + struct.pack('<I', meta['app']['base'])

    platform = platform + b'\x00' * (aligned - len(platform)) + vector
    platform = struct.pack('<I', PLATFORM_BASE + EFLASH_ERASABLE_SIZE + aligned) + platform[4:]

    with open(os.path.join(p, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=4, sort_keys=True)

    with open(os.path.join(p, 'platform.bin'), 'wb') as f:
        f.write(platform)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Platform tool for ING916: relocate vector to the end of binary')
        print(f'usage: python {sys.argv[0]} /path/to/ING916xxx')
        exit(-1)

    convert(sys.argv[1])