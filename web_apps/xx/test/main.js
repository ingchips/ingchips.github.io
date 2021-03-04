let GUID_SERVICE = "1f9359f6-74c1-463e-a01a-52627fd809f9";
let GUID_CHAR_I2C = "d4abe06d-f71a-4d59-8f89-e850c969a460";

const BLE_MIN_MTU_SIZE = 20;

var handlers = [];
var the_device = null;

var manifest = null;
var ble_obj = null;
var ota_file = null;
const SW_OK = '0090';

async function processBin(f) {
    log(await f.arrayBuffer());
}

async function handleFileDrop(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    ota_file = null;
    var files = evt.dataTransfer.files; // FileList object.

    for (var i = 0, f; f = files[i]; i++) {
        if (f.name.endsWith('.bin')) {
            ota_file = f;
            return;
        }
    }
}

async function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object
    ota_file = null;
    for (var i = 0, f; f = files[i]; i++) {
        if (f.name.endsWith('.bin')) {
            ota_file = f;
            return;
        }
    }
}

const log = console.log;
const delay = ms => new Promise(res => setTimeout(res, ms));

function u8arr_to_dataview(u8arr) {
    var a = new ArrayBuffer(u8arr.length);
    var v = new DataView(a);
    for (var i in u8arr) {
        v.setUint8(i, u8arr[i]);
    }
    return v;
}

function dataview_to_u8arr(v) {
    var r = [];
    for (var i = 0; i < v.byteLength; i++)
        r[i] = v.getUint8(i);
    return r;
}

function on_got_new_data(event) {
    const characteristic = event.target;
    if (ble_obj.cb === undefined)
    {
        console.log(characteristic.value);
        return;
    }
    ble_obj.data_acc.push(...dataview_to_u8arr(characteristic.value));
    if (ble_obj.data_acc.length >= ble_obj.response_len) {
        var cb = ble_obj.cb;
        ble_obj.cb = undefined;
        cb(ble_obj.data_acc);
    }
}

async function write_i2c(cmd_bytes) {
    let ble_mtu = parseInt($('#mtu_size').val());
    for (var i = 0; i < cmd_bytes.length; i += ble_mtu) {
        let s = cmd_bytes.slice(i, i + ble_mtu);
        let v = u8arr_to_dataview(s);
        await ble_obj.char_i2c.writeValueWithoutResponse(v);
    }
}

function write_cmd(cmd_bytes, response_len, cb) {
    ble_obj.data_acc = [];
    ble_obj.response_len = response_len;
    ble_obj.cb = cb;
    write_i2c(cmd_bytes);
}

function exec_cmd(cmd_bytes, response_len) {
    ble_obj.data_acc = [];
    ble_obj.response_len = response_len;
    return new Promise((resolve, _reject) => {
        ble_obj.cb = (x) => resolve(x);
        write_i2c(cmd_bytes);
      });
}

async function connect() {
    ble_obj = {};

    try {
        startRunning();

        showProgress(msg.scaning);
        ble_obj.dev = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [GUID_SERVICE]
        });
        showProgress(msg.connecting);
        ble_obj.server = await ble_obj.dev.gatt.connect();
        if (!ble_obj.server.connected) {
            showProgress(msg.cannot_conn);
            window.location.reload();
        }

        ble_obj.dev.addEventListener('gattserverdisconnected', event => {
            alert(msg.dev_disc);
            window.location.reload();
        });

        showProgress(msg.discover_fota);
        ble_obj.service = await ble_obj.server.getPrimaryService(GUID_SERVICE);
        ble_obj.char_i2c = await ble_obj.service.getCharacteristic(GUID_CHAR_I2C);

        ble_obj.char_i2c.startNotifications().then(char => {
            ble_obj.char_i2c.addEventListener('characteristicvaluechanged',
                                          on_got_new_data);
          });

        stopRunning();
    } catch (e) {
        alert(e.message);
        window.location.reload();
    }
}

function setProgress(progress) {
    let bar = $('#js-progressbar');
    let spin = $('#js-spinner');
    if (progress === undefined) {
    } else {
        if (progress < 0) {
            bar.hide();
            spin.show();
        } else {
            bar.show();
            spin.hide();
            bar.val(progress);
        }
    }
}

function showProgress(msg, progress) {
    $('#js-message').text(msg);
    setProgress(progress);
}

function startRunning() {
    $('#main_window').hide();
    $('#running_status').show();
    showProgress('', -1);
}

function stopRunning() {
    $('#main_window').show();
    $('#running_status').hide();
}

async function switchToSecFOTA() {
    if (confirm(msg.sec_fota_confirm)) {
        await switchApp();
    }
}

function appStart() {
    $('#main_window').hide();
    $('#running_status').hide();

    if (window.File && window.FileReader && window.FileList && window.Blob
        && navigator.bluetooth) {
    } else {
        return;
    }

    $('#api_notice').attr('hidden', true);

    var dropZone = document.getElementById('bin_file_drop_zone');
    dropZone.addEventListener('dragover', function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy';
        }, false);
    dropZone.addEventListener('drop', handleFileDrop, false);
    document.getElementById('bin_file_select').addEventListener('change', handleFileSelect, false);

    $("#btn_scan").click(async function () {
        try {
            $('#startup_window').hide();
            connect();
        } catch (e) { }
    });

    //startRunning();
    //showProgress(msg.sel_dev, -1);
    stopRunning();
    return;
}

function show_result(tag, str) {
    $("#output").val(tag + ':\n' + str + '\n\n' + $("#output").val());
}

window.onload = appStart;

function filter_hex_str(hex0) {
    var hex = '';
    for (let c of hex0) {
        if ('0123456789abcdefABCDEF'.indexOf(c) >= 0)
            hex = hex + c;
    }
    return hex;
}

function hex_to_bytes(hex0) {
    const hexLength = 2;
    let binary = [];
    let hex = filter_hex_str(hex0);
    for (let i = 0; i < hex.length / hexLength; i++) {
        binary[i] = parseInt(hex.substr(i * hexLength, hexLength), 16);
    }
    return binary;
}

function sm2_sign_data(sk, data) {
    return sm2_sign_hash(sk, sm3_digest(data));
}

function sm2_sign_hash(sk, sm3_hash) {
    return sm2.doSignature(hex_to_bytes(sm3_hash), filter_hex_str(sk));
}

function sm2_verify(pk, sm3_hash, sig) {
    return sm2.doVerifySignature(hex_to_bytes(sm3_hash), filter_hex_str(sig), filter_hex_str(pk));
}

function hex_to_binstr(hex0) {
    const hexLength = 2;
    let binary = '';
    let hex = filter_hex_str(hex0);
    for (let i = 0; i < hex.length / hexLength; i++) {
        binary = binary + String.fromCharCode(parseInt(hex.substr(i * hexLength, hexLength), 16));
    }
    return binary;
}

function u8arr_to_binstr(u8arr) {
    let binary = '';
    for (let c of u8arr) {
        binary = binary + String.fromCharCode(c);
    }
    return binary;
}

function sm3_digest(hex_str_or_u8arr){
    if (typeof(hex_str_or_u8arr) === "string")
	    return sm3(hex_to_binstr(hex_str_or_u8arr));
    else
        return sm3(u8arr_to_binstr(hex_str_or_u8arr));
}

function btn_gen_sm3(data) {
    show_result('SM3 HASH: ', sm3_digest(data));
}

function btn_sm2_sign(sk, sm3_hash) {
    show_result('SM2 签名', sm2_sign_hash(sk, sm3_hash));
}

function btn_sm2_verify(pk, sm3_hash, sig) {
    show_result('SM2 验签结果', sm2_verify(pk, sm3_hash, sig));
}

function test_get_random(len) {
    const cmd = [0x80, 0x84, 0x00, 0x00, len];
    write_cmd(cmd, len + 2, (value) => {
        let r = parseSchema([{ t: "hex", len: len, n: 'random' }, { t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("随机数", JSON.stringify(r));
    });
}

function test_sm2_gen(kid) {
    const cmd = [0x80, 0x20, kid, 0x00, 0x00, 0x00];
    write_cmd(cmd, 2, (value) => {
        let r = parseSchema([{ t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("SM2 状态", JSON.stringify(r));
    });
}

function test_sm2_readpub(kid) {
    const cmd = [0x80, 0x0B, kid, 0x00, 0x00, 0x41];
    write_cmd(cmd, 65 + 2, (value) => {
        let r = parseSchema([{ t: "hex", len: 65, n: 'pk' }, { t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("SM2 公钥", JSON.stringify(r));
    });
}

function test_sm2_sign(kid, sm3_hash) {
    const cmd = [0x80, 0x0D, kid, 0x00, 0x20].concat(hex_to_bytes(sm3_hash));
    write_cmd(cmd, 64 + 2, (value) => {
        let r = parseSchema([{ t: "hex", len: 64, n: 'sig' }, { t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("SM2 签名", JSON.stringify(r));
    });
}

function test_chip_auth(pkcard, rand) {
    var r = hex_to_bytes(rand);
    if (r.length != 32) {
        alert('random.length must be 32');
        return;
    }
    var cmd = [0x80, 0x0E, 0x00, 0x00, 0x20].concat(r);
    cmd.push(0x00);
    write_cmd(cmd, 10 + 65 + 64 + 64 + 2 + 2, (value) => {
        let r = parseSchema([
                            { t: "hex", len: 10, n: 'id' },
                            { t: "hex", len: 65, n: 'PKcard' },
                            { t: "hex", len: 64, n: 'sig_pk' },
                            { t: "hex", len: 64, n: 'sig_rand' },
                            { t: "u8", n: 'version' },
                            { t: "u8", n: 'bat_level' },
                            { t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("ChipAuth", JSON.stringify(r));
        show_result("PKcard 验签结果", sm2_verify(pkcard, sm3_digest(rand), r.sig_rand));
    });
}

function test_system_info() {
    const cmd = [0x90, 0x03, 0x00, 0x00, 0x10];
    write_cmd(cmd, 1 + 10 + 2 + 2 + 1 + 2, (value) => {
        let r = parseSchema([
                            { t: "u8", n: 'version' },
                            { t: "hex", len: 10, n: 'id' },
                            { t: "u16", n: 'cur_vol' },
                            { t: "u16", n: 'total_vol' },
                            { t: "u8", n: 'bat_level' },
                            { t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("系统信息", JSON.stringify(r));
    });
}

function get_sec_hexstr() {
    var sec = Date.now() - Date.parse('01 Jan 2020 00:00:00 GMT+8');
    var r = [];
    for (var i = 0; i < 4; i++) {
        r.push((sec & 0xff).toString(16).padStart(2, '0'));
        sec >>= 8;
    }
    return r.join();
}

function test_sys_auth2(pkcard, skroot) {
    const cmd1 = [0x90, 0x01, 0x00, 0x00, 0x20];
    write_cmd(cmd1, 32 + 2, (value) => {
        let r = parseSchema([
                            { t: "hex", len: 32, n: 'rand' },
                            { t: 'hex', n: 'sw', len: 2 }],
            value);
        show_result("随机数", JSON.stringify(r));


    });
}

async function test_sys_auth(pkcard, skroot) {
    const cmd1 = [0x90, 0x01, 0x00, 0x00, 0x20];

    let r = parseSchema([
                        { t: "hex", len: 32, n: 'rand' },
                        { t: 'hex', n: 'sw', len: 2 }],
                        await exec_cmd(cmd1, 32 + 2));
    show_result("随机数", JSON.stringify(r));

    var cmd2 = [0x90, 0x02, 0x00, 0x00, 0xc5];
    var data = pkcard + get_sec_hexstr();
    let sig1 = sm2_sign_data(skroot, data);
    let sig2 = sm2_sign_data(skroot, r.rand);
    cmd2.push(...hex_to_bytes(data + sig1 + sig2));

    r = parseSchema([{ t: 'hex', n: 'sw', len: 2 }],  await exec_cmd(cmd2, 2));
    show_result("认证结果", JSON.stringify(r));
}

async function test_ota_update(skroot) {
    const BLOCK_SIZE = 128;
    if (ota_file == null) {
        alert(msg.ota_file_missing);
        return;
    }
    let size = ota_file.size;

    let buf = new Uint8Array(await ota_file.arrayBuffer());
    let padded = new Uint8Array(Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE);
    for (let i in buf)
        padded[i] = buf[i];
    log(padded);
    log(buf);

    let sig = sm2_sign_data(skroot, buf);

    let r = parseSchema([
        { t: "hex", len: 2, n: 'result' },
        { t: 'hex', n: 'sw', len: 2 }],
        await exec_cmd([0x90, 0x13, 0x00, 0x00, 0x00], 2 + 2));
    show_result("启动升级程序", JSON.stringify(r));
    if (r.result != SW_OK) return;

    let cmd = [0x90, 0x11, 0x00, 0x00, 0x44, size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, size >> 24];
    cmd.push(...hex_to_bytes(sig));
    r = parseSchema([
        { t: "hex", len: 2, n: 'result' },
        { t: 'hex', n: 'sw', len: 2 }],
        await exec_cmd(cmd, 2 + 2));
    show_result("升级请求", JSON.stringify(r));
    if (r.result != SW_OK) return;

    let bar = $('#ota-progressbar');
    for (let i = 0; i < padded.length / BLOCK_SIZE; i++) {
        let start = i * BLOCK_SIZE;
        var block = padded.slice(start, start + BLOCK_SIZE);
        cmd = [0x90, 0x12, i & 0xff, i >> 8, 0x80];
        cmd.push(...block);
        r = parseSchema([
            { t: "hex", len: 1, n: 'result' },
            { t: 'hex', n: 'sw', len: 2 }],
            await exec_cmd(cmd, 1 + 2));
        if (r.sw != SW_OK) return;
        bar.val((1 + i) * 100 / (padded.length / BLOCK_SIZE));
    }

    r = parseSchema([
        { t: "hex", len: 2, n: 'result' },
        { t: 'hex', n: 'sw', len: 2 }],
        await exec_cmd([0x90, 0x14, 0x00, 0x00, 0x00], 2 + 2));
    show_result("升级完成", JSON.stringify(r));
    if (r.sw == SW_OK)
        alert(msg.ota_reboot);
}