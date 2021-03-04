let GUID_SERVICE = "3345c2f0-6f36-45c5-8541-92f56728d5f3";
let GUID_CHAR_OTA_VER = "3345c2f1-6f36-45c5-8541-92f56728d5f3";
let GUID_CHAR_OTA_CTRL = "3345c2f2-6f36-45c5-8541-92f56728d5f3";
let GUID_CHAR_OTA_DATA = "3345c2f3-6f36-45c5-8541-92f56728d5f3";

const OTA_CTRL_STATUS_DISABLED = 0;
const OTA_CTRL_STATUS_OK = 1;
const OTA_CTRL_STATUS_ERROR = 2;
const OTA_CTRL_STATUS_WAIT_DATA = 3;

const OTA_CTRL_START = 0xAA; // param: no
const OTA_CTRL_PAGE_BEGIN = 0xB0; // param: page address, following DATA contains the data
const OTA_CTRL_PAGE_END = 0xB1; // param: no
const OTA_CTRL_READ_PAGE = 0xC0; // param: page address
const OTA_CTRL_SWITCH_APP = 0xD0; // param: no
const OTA_CTRL_METADATA = 0xE0; // param: ota_meta_t
const OTA_CTRL_REBOOT = 0xFF; // param: no

const BLE_MIN_MTU_SIZE = 20;

var handlers = [];
var the_device = null;

var manifest = null;
var ble_obj = null;
var ble_mtu = 100;

function flashInfo() {
    const FLASH_INFOS = [
        {
            base: 0x4000,
            total_size: 512 * 1024,
            page_size: 8 * 1024
        },
        {
            base: 0x4000,
            total_size: 256 * 1024,
            page_size: 8 * 1024
        }
    ];
    return FLASH_INFOS[$('#series_id option:selected').index()];
}

function crc16(l, start, len) {
    const auchCRCHi = [
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
        0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40
    ];
    
    const auchCRCLo = [
        0x00, 0xC0, 0xC1, 0x01, 0xC3, 0x03, 0x02, 0xC2, 0xC6, 0x06, 0x07, 0xC7, 0x05, 0xC5, 0xC4, 0x04,
        0xCC, 0x0C, 0x0D, 0xCD, 0x0F, 0xCF, 0xCE, 0x0E, 0x0A, 0xCA, 0xCB, 0x0B, 0xC9, 0x09, 0x08, 0xC8,
        0xD8, 0x18, 0x19, 0xD9, 0x1B, 0xDB, 0xDA, 0x1A, 0x1E, 0xDE, 0xDF, 0x1F, 0xDD, 0x1D, 0x1C, 0xDC,
        0x14, 0xD4, 0xD5, 0x15, 0xD7, 0x17, 0x16, 0xD6, 0xD2, 0x12, 0x13, 0xD3, 0x11, 0xD1, 0xD0, 0x10,
        0xF0, 0x30, 0x31, 0xF1, 0x33, 0xF3, 0xF2, 0x32, 0x36, 0xF6, 0xF7, 0x37, 0xF5, 0x35, 0x34, 0xF4,
        0x3C, 0xFC, 0xFD, 0x3D, 0xFF, 0x3F, 0x3E, 0xFE, 0xFA, 0x3A, 0x3B, 0xFB, 0x39, 0xF9, 0xF8, 0x38,
        0x28, 0xE8, 0xE9, 0x29, 0xEB, 0x2B, 0x2A, 0xEA, 0xEE, 0x2E, 0x2F, 0xEF, 0x2D, 0xED, 0xEC, 0x2C,
        0xE4, 0x24, 0x25, 0xE5, 0x27, 0xE7, 0xE6, 0x26, 0x22, 0xE2, 0xE3, 0x23, 0xE1, 0x21, 0x20, 0xE0,
        0xA0, 0x60, 0x61, 0xA1, 0x63, 0xA3, 0xA2, 0x62, 0x66, 0xA6, 0xA7, 0x67, 0xA5, 0x65, 0x64, 0xA4,
        0x6C, 0xAC, 0xAD, 0x6D, 0xAF, 0x6F, 0x6E, 0xAE, 0xAA, 0x6A, 0x6B, 0xAB, 0x69, 0xA9, 0xA8, 0x68,
        0x78, 0xB8, 0xB9, 0x79, 0xBB, 0x7B, 0x7A, 0xBA, 0xBE, 0x7E, 0x7F, 0xBF, 0x7D, 0xBD, 0xBC, 0x7C,
        0xB4, 0x74, 0x75, 0xB5, 0x77, 0xB7, 0xB6, 0x76, 0x72, 0xB2, 0xB3, 0x73, 0xB1, 0x71, 0x70, 0xB0,
        0x50, 0x90, 0x91, 0x51, 0x93, 0x53, 0x52, 0x92, 0x96, 0x56, 0x57, 0x97, 0x55, 0x95, 0x94, 0x54,
        0x9C, 0x5C, 0x5D, 0x9D, 0x5F, 0x9F, 0x9E, 0x5E, 0x5A, 0x9A, 0x9B, 0x5B, 0x99, 0x59, 0x58, 0x98,
        0x88, 0x48, 0x49, 0x89, 0x4B, 0x8B, 0x8A, 0x4A, 0x4E, 0x8E, 0x8F, 0x4F, 0x8D, 0x4D, 0x4C, 0x8C,
        0x44, 0x84, 0x85, 0x45, 0x87, 0x47, 0x46, 0x86, 0x82, 0x42, 0x43, 0x83, 0x41, 0x81, 0x80, 0x40
    ];

    var hi = 0xFF; /* high byte of CRC initialized */
    var lo = 0xFF; /* low byte of CRC initialized */

    for(var i = 0; i < len; i++)
    {
        const x = l[start + i];
        const uIndex = (hi ^ x) & 0xff;
        hi = lo ^ auchCRCHi[uIndex];
        lo = auchCRCLo[uIndex];
    }

    return (hi << 8) | lo;
}

async function writeCtrl(cmd) {
    await ble_obj.char_ctrl.writeValueWithoutResponse(cmd);
}

async function readStatus() {
    var r = await ble_obj.char_ctrl.readValue();

    return r.getUint8(0);
}

async function switchApp() {
    var buf = new ArrayBuffer(1);
    var v = new DataView(buf);
    v.setUint8(0, OTA_CTRL_SWITCH_APP);
    await writeCtrl(buf);
}

async function checkDevStatus() {
    return OTA_CTRL_STATUS_OK == await readStatus();
}

async function rebootDev() {
    var buf = new ArrayBuffer(1);
    var v = new DataView(buf);
    v.setUint8(0, OTA_CTRL_REBOOT);
    await writeCtrl(buf);
}

async function writeData(data) {
    var buf = new ArrayBuffer(data.length);
    var v = new DataView(buf);
    for (var i in data) {
        v.setUint8(i, data[i]);
    }
    await ble_obj.char_data.writeValueWithoutResponse(buf);
}

function buildMetaData(plan) {
    var buffer = new ArrayBuffer(2 + 4 + plan.length * 3 * 4);
    var view = new DataView(buffer);
    var c = 2;
    view.setUint32(c, manifest.entry, true); c+= 4;
    for (var item of plan) {
        view.setUint32(c, item.write_addr, true); c+= 4;
        view.setUint32(c, item.addr, true); c+= 4;
        view.setUint32(c, item.data.length, true); c+= 4;
    }
    var u8data = new Uint8Array(buffer);
    view.setUint16(0, crc16(u8data, 2, u8data.length - 2), true);

    return {
        name: 'meta',
        data: u8data
    };
}

function buildUpdatePlan(fullUpdate) {
    var plan = [];
    if (manifest.platform.update || fullUpdate) {
        plan.push({
            name: manifest.platform.name,
            addr: manifest.platform.address,
            data: manifest.platform.data
        });
    }
    if (manifest.app.update || fullUpdate) {
        plan.push({
            name: manifest.app.name,
            addr: manifest.app.address,
            data: manifest.app.data
        });
    }
    for (let b of manifest.bins) {
        plan.push({
            name: b.name,
            addr: b.address,
            data: b.data
        });
    }

    if (plan.length < 1) return plan;

    const flash = flashInfo();
    var top = flash.base + flash.total_size;
    for (var i in plan) {
        const padding = 4 - (plan[i].data.length & 0x3);
        if (padding != 4) {
            var newData = new Uint8Array(plan[i].data.length + padding);
            newData.set(plan[i].data, 0);
            plan[i].data = newData;
        }
        let page_num = Math.floor((plan[i].data.length + flash.page_size - 1) / flash.page_size);
        top -= page_num * flash.page_size;
        plan[i].write_addr = top;
    }

    return plan;
}

async function burnPage(emitProgress, acc_size, addr, page) {
    var current = 0;
    var buffer = new ArrayBuffer(1 + 4);
    var cmd = new DataView(buffer);
    cmd.setUint8(0, OTA_CTRL_PAGE_BEGIN),
    cmd.setUint32(1, addr, true);
    await writeCtrl(buffer);
    while (current < page.length) {
        let size = Math.min(ble_mtu, page.length - current);
        try {
            await writeData(page.slice(current, current + size));
        } catch (e) {
            if (ble_mtu > BLE_MIN_MTU_SIZE) {
                showProgress(msg.try_smaller_mtu + ble_mtu);
                await delay(50);
                ble_mtu -= 4;
                continue;
            } else
                throw (e);
        }
        emitProgress(acc_size + current);
        current += size;
    }
    cmd.setUint8(0, OTA_CTRL_PAGE_END);
    cmd.setUint16(1, page.length, true);
    cmd.setUint16(3, crc16(page, 0, page.length), true);
    await writeCtrl(buffer);
    switch (await readStatus()) {
        case OTA_CTRL_STATUS_OK:
            return true;
        default:
            return false;
    }
}

async function burnFiles(emitProgress, plan) {
    var written = 0;
    var acc_size = 0;
    const page_size = flashInfo().page_size;

    for (let item of plan) {
        var offset = 0;
        var errors = 0;

        while (offset < item.data.length) {
            let block = Math.min(page_size, item.data.length - offset);
            let page = item.data.slice(offset, offset + block);            
            showProgress(msg.burning + item.name + (errors > 0 ? ' (retry #' + errors + ')' : ''));
            if (await burnPage(emitProgress, acc_size + offset, item.write_addr + offset, page)) {
                offset += block;
                written += block;
                errors = 0;
            } else {
                errors++;
                if (errors > 5) {
                    if ((written == 0) && (ble_mtu > BLE_MIN_MTU_SIZE)) {
                        showProgress(msg.fallback_mtu);
                        ble_mtu = BLE_MIN_MTU_SIZE;
                        errors = 0;
                        await delay(10);
                        continue;
                    }
                    return false;
                }
                else
                    showProgress(msg.error_retry);
            }
        }

        acc_size += item.data.length;
    }
    return true;
}

async function burnMetaData(meta) {
    showProgress(msg.burning + meta.name);
    var buf = new ArrayBuffer(1 + meta.data.length);
    var v = new DataView(buf);
    v.setUint8(0, OTA_CTRL_METADATA);
    for (var i = 0; i < meta.data.length; i++) {
        v.setUint8(i + 1, meta.data[i]);
    }
    await writeCtrl(buf);
    return checkDevStatus();
}

async function enableFOTA() {
    showProgress(msg.enable_fota);
    var buf = new ArrayBuffer(5);
    var v = new DataView(buf);
    v.setUint8(0, OTA_CTRL_START);
    v.setUint32(1, 0, true);
    await writeCtrl(buf);
    if (!await checkDevStatus())
        throw msg.failed_fota;
    return true;
}

async function doUpdate() {
    var plan = [];
    if (ble_obj == null) {
        alert(msg.err_dev_not_ready);
        return;
    }
    try { plan = buildUpdatePlan(); } catch (e) {};
    if (plan.length < 1) {
        alert(msg.err_nothing_to_up);
        return;
    }

    ble_mtu = parseInt($('#mtu_size').val()) & 0xfc;

    const sum =  plan.map((item) => item.data.length).reduce((a, b) => a + b);
    var burned = 0;
    startRunning();

    const emitProgress = function (size) { setProgress(size * 100 / sum); };

    try {
        const result = (await enableFOTA()) && (await burnFiles(emitProgress, plan))
                        && (await burnMetaData(buildMetaData(plan)));
        if (result) {
            showProgress(msg.fota_complete, -1);
            await rebootDev();
        }
    } catch (e) {
        alert(msg.exception + e.message);
    }
}

function updateVerInd() {
    if (manifest === null) return;
    const unitqueVerNum = function (id) {
        const s = $(id).text()
        var v = s.split('.').map((x) => parseInt(x));
        return v.length == 3 ? (v[0] * 256 + v[1]) * 256 + v[2] : 0;
    }
    const p1 = unitqueVerNum('#dev_ver_platform');
    const p2 = unitqueVerNum('#cur_ver_platform');

    const a1 = unitqueVerNum('#dev_ver_app');
    const a2 = unitqueVerNum('#cur_ver_app');

    manifest.app.update = true;
    manifest.platform.update = true;

    if (p1 == p2) {
        manifest.platform.update = false;
    }

    if (a1 >= a2) {
        manifest.app.update = manifest.platform.update;
    }
    
    $('#dev_platform_update_ind').attr('uk-icon', manifest.platform.update ? 'upload' : 'check');
    $('#dev_app_update_ind').attr('uk-icon', manifest.app.update ?'upload' : 'check');

    for (var ele of ['#dev_ver_platform', '#cur_ver_platform', '#dev_ver_app', '#cur_ver_app']) {
        $(ele).removeClass('uk-label-success');
        $(ele).removeClass('uk-label-warning');
    }

    if (manifest.platform.update) {
        $('#dev_ver_platform').addClass('uk-label-warning');
        $('#cur_ver_platform').addClass('uk-label-warning');
    }
    else {
        $('#dev_ver_platform').addClass('uk-label-success');
        $('#cur_ver_platform').addClass('uk-label-success');
    }

    if (manifest.app.update) {
        $('#dev_ver_app').addClass('uk-label-warning');
        $('#cur_ver_app').addClass('uk-label-warning');
    }
    else {
        $('#dev_ver_app').addClass('uk-label-success');
        $('#cur_ver_app').addClass('uk-label-success');
    }
}

async function processZip(f) {
    const model = (() => {
		return {
			getEntries(file, options) {
                if (file instanceof Blob)
                    return (new zip.ZipReader(new zip.BlobReader(file))).getEntries(options);
                else
                    return (new zip.ZipReader(new zip.HttpReader(file.url))).getEntries(options);
			},
		};
    })();

    $('#current_file').text(f.name);
    
    let entries = await model.getEntries(f, { filenameEncoding: 'utf-8' });

    let extractTextFile = async function (fn) {
        return await entries.find(entry => entry.filename == fn).getData(new zip.TextWriter());
    }
    
    let extractBinFile = async function (fn) {
        return await entries.find(entry => entry.filename == fn).getData(new zip.Uint8ArrayWriter());
    }

    manifest = JSON.parse(await extractTextFile('manifest.json'));
    manifest.platform.data = await extractBinFile(manifest.platform.name);
    manifest.app.data = await extractBinFile(manifest.app.name);
    for (var i in manifest.bins) {
        manifest.bins[i].data = await extractBinFile(manifest.bins[i].name);
    }

    $('#cur_ver_readme').text(await extractTextFile('readme'));

    $('#cur_ver_platform').text(manifest.platform.version.join('.'));
    $('#cur_ver_app').text(manifest.app.version.join('.'));

    updateVerInd();
}

async function handleFileDrop(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    var files = evt.dataTransfer.files; // FileList object.

    for (var i = 0, f; f = files[i]; i++) {
        if (f.name.endsWith('.zip')) {
            await processZip(f);
            return;
        }
    }
}

async function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object

    for (var i = 0, f; f = files[i]; i++) {
        if (f.name.endsWith('.zip')) {
            await processZip(f);
            return;
        }
    }
}

async function closePort() {
    try {
        if (the_device != null) {
            the_device.gatt.disconnect().then(() => { });
        }
    } catch (e) { }
    the_device = null;
}

const log = console.log;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function connect() {
    ble_obj = {};

    const parseVer = function (l, start) {
        return [l.getUint16(start, true), l.getUint8(start + 2), l.getUint8(start + 3)];
    };

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
        ble_obj.char_ver = await ble_obj.service.getCharacteristic(GUID_CHAR_OTA_VER);
        ble_obj.char_ctrl = await ble_obj.service.getCharacteristic(GUID_CHAR_OTA_CTRL);
        ble_obj.char_data = await ble_obj.service.getCharacteristic(GUID_CHAR_OTA_DATA);

        showProgress(msg.query_ver);
        var ver = await ble_obj.char_ver.readValue();
        $('#dev_ver_platform').text(parseVer(ver, 0).join('.'));
        $('#dev_ver_app').text(parseVer(ver, 4).join('.'));
        updateVerInd();

        stopRunning();
    } catch (e) {
        alert(e.message);
        window.location.reload();
    }
}

function recheckOnline() {
    const base = $('#ota_server_url').val() + '/';
    $.ajax({
        url: base + 'latest.json',
        type: 'GET'
      }).then((result) => {
        processZip({name: result.package,
            url: base + result.package});
      });
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

    // Setup the dnd listeners.
    var dropZone = document.getElementById('zip_file_drop_zone');
    dropZone.addEventListener('dragover', function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy';
        }, false);
    dropZone.addEventListener('drop', handleFileDrop, false);
    document.getElementById('zip_file_select').addEventListener('change', handleFileSelect, false);
    
    $("#btn_scan").click(async function () {
        try {
            $('#startup_window').hide();
            connect();
        } catch (e) { }
    });

    $("#btn_update").click(doUpdate);

    $("#btn_recheck").click(recheckOnline);

    $('#btn_sec_fota').click(switchToSecFOTA);

    startRunning();
    showProgress(msg.sel_dev, -1);
    return;
}

window.onload = appStart;
