import sys
import json
import os
import struct
import math

BIN_INFO_OFFSET = 0
EFLASH_ERASABLE_SIZE = 0
PLATFORM_BASE = 0

def load_json_from_file(fn: str):
    with open(os.path.join(fn), 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json_to_file(obj, fn: str):
    with open(os.path.join(fn), 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=4, sort_keys=True)

def gen_keil_asm(api_list: list[str], tab_loc, fn):
    global PLATFORM_BASE
    with open(fn, 'w', encoding='utf-8') as f:
        f.write(''';
; Generate by script. NEVER MODIFY
;

''')

        f.write(f'''
    AREA    |.text|, CODE, READONLY

___call_api PROC
    LDR     R4,    =0x{tab_loc:08x}
    LDR     R4, [R4]
    LDR     R4, [R4, R5]
    STR     R4, [SP, #8]
    POP     {{R4, R5, PC}}
    ENDP
''')

        for i, fx in enumerate(api_list):
            f.write(f'''

    AREA    |.text|, CODE, READONLY

{fx}   PROC
    EXPORT  {fx}
    SUB     SP, #12
    STR     R4, [SP, #0]
    STR     R5, [SP, #4]
    LDR     R5, =0x{PLATFORM_BASE + i * 4:08x}
    LDR     R4, =___call_api
    BX      R4
    NOP
    ENDP
''')

        f.write('''
    END
''')

def gen_gcc_asm(api_list: list[str], tab_loc, fn):
    global PLATFORM_BASE
    with open(fn, 'w', encoding='utf-8') as f:
        f.write('''/*
* Generate by script. NEVER MODIFY
*/

''')

        f.write(f'''
    .section .___call_api
    .text
    .thumb
    .thumb_func
    .align    2
    .globl    ___call_api
    .type     ___call_api, %function
___call_api:
    LDR     R4,    =0x{tab_loc:08x}
    LDR     R4, [R4]
    LDR     R4, [R4, R5]
    STR     R4, [SP, #8]
    POP        {{R4, R5, PC}}
''')

        for i, fx in enumerate(api_list):
            f.write(f'''

    .section .{fx}
    .text
    .thumb
    .thumb_func
    .align    2
    .globl    {fx}
    .type     {fx}, %function
{fx}:
    SUB     SP, #12
    STR     R4, [SP, #0]
    STR     R5, [SP, #4]
    LDR     R5, =0x{PLATFORM_BASE + i * 4:08x}
    LDR     R4, =___call_api
    BX      R4
    NOP
    .ltorg
''')

def initial_run(p: str) -> bool:
    if not os.path.exists(os.path.join(p, 'meta.json')):
        raise Exception(f'meta.json can be found in path: {p}')

    bin_size = os.path.getsize(os.path.join(p, 'platform.bin'))
    meta = load_json_from_file(os.path.join(p, 'meta.json'))
    apis = load_json_from_file(os.path.join(p, 'apis.json'))
    api_list = sorted(apis.keys())

    new_size = bin_size + 4 * len(api_list)
    app_load_addr = ((new_size + EFLASH_ERASABLE_SIZE - 1) // EFLASH_ERASABLE_SIZE) + EFLASH_ERASABLE_SIZE
    app_load_addr = max(app_load_addr, meta['app']['base'])
    print(f"Original app load addr = 0x{meta['app']['base']:08x}")
    print(f"Updated  app load addr = 0x{app_load_addr:08x}")
    while True:
        extra_space = input(f"Would you like to add extra spaces between platform and app? Enter for no, otherwise, input a number: ")
        extra_space = int(extra_space) * EFLASH_ERASABLE_SIZE if extra_space != '' else 0
        if extra_space == 0: break
        confirm = input(f"Updated app load addr = 0x{app_load_addr + extra_space:08x}. Are you sure? input yes or no: ")
        if confirm == 'yes': break
    app_load_addr += extra_space

    while True:
        extra_space = input(f"Would you like to reserve some RAM for future updates of platform ? Enter for no, otherwise, input an integer (Bytes): ")
        extra_space = int(extra_space) * EFLASH_ERASABLE_SIZE if extra_space != '' else 0
        if extra_space == 0: break
        confirm = input(f"reserve {extra_space} bytes. Are you sure? input yes or no: ")
        if confirm == 'yes': break
    platform_ram_max = meta['ram']['size'] + extra_space

    cfg = {
        'api_list': api_list,
        'load_addr': app_load_addr,
        'platform_ram_max': platform_ram_max
    }

    save_json_to_file(cfg, os.path.join(p, 'api_table.mod.json'))

    gen_keil_asm(api_list, meta['rom']['base'] + BIN_INFO_OFFSET + 4 * 3, os.path.join(p, '_api_table.keil.asm'))
    gen_gcc_asm (api_list, meta['rom']['base'] + BIN_INFO_OFFSET + 4 * 3, os.path.join(p, '_api_table.gcc.s'))

def throw_error(reason: str):
    print(f"ERROR: {reason}.")
    print('It is not compatible with old version of APP any more.')
    print('')
    print("Solution: delete `api_table.mod.json` in bundle dir, restore SDK files, and try again. APP MUST BE REBUILT!!!")
    exit(-1)

def convert(p: str) -> None:
    if not os.path.exists(os.path.join(p, 'api_table.mod.json')):
        initial_run(p)

    mod  = load_json_from_file(os.path.join(p, 'api_table.mod.json'))
    meta = load_json_from_file(os.path.join(p, 'meta.json'))
    apis = load_json_from_file(os.path.join(p, 'apis.json'))

    if 'api_table.mod' in meta:
        print("you don't need to re-run this script on the same bundle.")
        return

    meta['api_table.mod'] = dict.copy(meta)

    if meta['ram']['size'] > mod['platform_ram_max']:
        throw_error("platform uses TOO MUCH RAM")

    platform = open(os.path.join(p, 'platform.bin'), 'rb').read()
    ver = list(struct.unpack('<HBB', platform[BIN_INFO_OFFSET : BIN_INFO_OFFSET + 4]))
    if ver != meta['version']:
        raise Exception(f"version mismatch: expected {meta['version']}, found {ver}")

    [bin_app_load, bin_ram_size, bin_size] = struct.unpack('<III', platform[BIN_INFO_OFFSET + 4: BIN_INFO_OFFSET + 16])
    if (bin_size == 0xffffffff) or (bin_size > len(platform)):
        raise Exception(f"Unexpected value. Is SDK too old? (at least v8.5.4 is required)")

    platform = platform[0:bin_size]
    new_size = bin_size + 4 * len(mod['api_list'])
    app_load_addr = ((new_size + EFLASH_ERASABLE_SIZE - 1) // EFLASH_ERASABLE_SIZE) + EFLASH_ERASABLE_SIZE
    app_load_addr = max(app_load_addr, meta['app']['base'])
    if app_load_addr > mod['load_addr']:
        throw_error("platform becomes TOO LARGE")

    api_tab = b''
    for f in mod['api_list']:
        if f not in apis:
            throw_error(f"API {f} has been deleted")
        addr = apis[f]
        api_tab = api_tab + struct.pack('<I', int(addr, 0))

    platform = platform + api_tab

    meta['rom']['size'] = new_size
    meta['ram']['size'] = mod['platform_ram_max']
    meta['app']['base'] = mod['load_addr']

    platform = bytearray(platform)
    platform[BIN_INFO_OFFSET + 4 : BIN_INFO_OFFSET + 8] = struct.pack('<I', mod['load_addr'])
    platform = bytes(platform)

    with open(os.path.join(p, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=4, sort_keys=True)

    with open(os.path.join(p, 'platform.bin'), 'wb') as f:
        f.write(platform)

    print("done.")

def main(p: str):
    global BIN_INFO_OFFSET, EFLASH_ERASABLE_SIZE, PLATFORM_BASE
    p = p.rstrip('/\\')
    f = os.path.basename(p).lower()
    if f.startswith('ing918'):
        BIN_INFO_OFFSET = 0x000000b0
        EFLASH_ERASABLE_SIZE = 8192
        PLATFORM_BASE = 0x4000
    elif f.startswith('ing916'):
        BIN_INFO_OFFSET = 0x000000fc
        EFLASH_ERASABLE_SIZE = 4096
        PLATFORM_BASE = 0x02002000
    else:
        raise Exception(f"unsupported chip: {f}")

    convert(p)

if __name__ == '__main__':
    if len(sys.argv) < 1:
        print('Platform tool: add an API table to platform.bin')
        print(f'usage: python {sys.argv[0]} /path/to/bundle_dir')
        print(f'')
        print(f"exampple for '/path/to/bundle_dir': /path/to/sdk/bundles/typical/ING9188xx")
        exit(-1)

    main(r'C:\tmp\independ_app\sdk\bundles\typical\ING9187xx')
    #main(sys.argv[1])
