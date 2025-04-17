import argparse
import os
import glob
import json

def patch_issue_298(bin_file: str, new_file: str) -> None:
    base_dir = os.path.dirname(bin_file)
    with open(os.path.join(base_dir, 'apis.json'), 'r', encoding='utf-8') as f:
        apis = json.load(f)
    with open(os.path.join(base_dir, 'meta.json'), 'r', encoding='utf-8') as f:
        meta = json.load(f)
    if 'vPortSuppressTicksAndSleep' not in apis:
        return

    addr = int(apis['vPortSuppressTicksAndSleep'], 0)
    addr -= addr % 2

    target = b'-\xe9\xf0GGJ\x05F\x11x\xc8\x06\x06\xd4\xbf\xf3O\x8f0\xbf\xbf\xf3o\x8f\xbd\xe8\xf0\x87'
    patch_offset = 14
    patch  = b'\x00\xbf' * 5

    print(f"PATCHING: {bin_file} ...")

    if addr >= 0x20000000:
        print(f"WARNING: targeted function is in RAM, it can be patched in `app_main` by adding this code:\n")
        txt = ', '.join([f"0x{i:02x}" for i in patch])
        print(f"    static const uint8_t patch[] = {{{txt}}};")
        print(f"    memcpy((void *)({addr + patch_offset}), patch, sizeof(patch));")
        print("")
        return

    with open(bin_file, 'rb') as f:
        data = f.read()

    file_pos = addr - meta['rom']['base']
    if data[file_pos:file_pos + len(target)] != target:
        print(f"Error: data stream not match.")
        return

    data = bytearray(data)
    data[file_pos + patch_offset : file_pos + patch_offset + len(patch)] = patch
    data = bytes(data)

    print(f"SAVING: {new_file}")
    with open(new_file, 'wb') as f:
        f.write(data)

def patch_bin_file(issue_id: str, bin_file: str) -> None:
    all_issue_ids = {
        '298': patch_issue_298,
    }
    if not issue_id in all_issue_ids:
        print(f"Error: issue id {issue_id} not supported.")
        return

    new_file = os.path.splitext(bin_file)[0] + f'_patch_{issue_id}.bin'
    if os.path.exists(new_file):
        print(f"Error: {new_file} already exists.")
        return

    all_issue_ids[issue_id](bin_file, new_file)

def auto_correct_sdk_dir(sdk_dir: str) -> str:
    x = "sdk\\bundles".split("\\")
    print(x)
    for i in range(len(x)):
        t = os.path.join(sdk_dir, *x[i:])
        if os.path.exists(os.path.join(t, 'typical', 'ING9187xx')):
            return t
    return None

def main():
    parser = argparse.ArgumentParser(description='Find .bin files in SDK directory')
    parser.add_argument('issue_id', help='Issue ID')
    parser.add_argument('sdk_dir', help='SDK directory path')

    args = parser.parse_args()

    bundles_dir = auto_correct_sdk_dir(args.sdk_dir)
    if bundles_dir is None:
        print(f"Error: {args.sdk_dir} is not a valid SDK path.")
        return

    pattern = os.path.join(bundles_dir, '**', 'platform.bin')
    for file in glob.glob(pattern, recursive=True):
        patch_bin_file(args.issue_id, file)

if __name__ == '__main__':
    main()
