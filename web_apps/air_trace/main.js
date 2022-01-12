let GUID_SERVICE = "00000006-494e-4743-4849-505355554944";
let GUID_CHAR_DATA = "bf83f3f2-399a-414d-9035-ce64ceb3ff67";

var handlers = [];
var the_device = null;

var manifest = null;
var ble_obj = null;

const log = console.log;
const delay = ms => new Promise(res => setTimeout(res, ms));

var all_data = [];

function downloadLog() {

    if (!!window) {
        var blob = new Blob(all_data, { type: 'application/octet-stream' });
        var a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.target = '_blank';
        a.download = 'trace.log';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href);
    }
    else {
        console.error('downloadLog only works in the browser');
    }
};

async function connect() {
    ble_obj = {};
    all_data = [];
    let total_count = 0;
    let current_count = 0;
    let start_time = Date.now();

    const show_speed = function () {
        const now = Date.now();
        let speed = current_count / (now - start_time) * 1000;
        $('#stat_tpt').text(`${speed.toFixed(2)}`);
        start_time = now;
        current_count = 0;
        $('#stat_total').text(`${total_count}`);
    };

    const on_got_new_data = function (event) {
        const characteristic = event.target;
        const view = characteristic.value;
        all_data.push(view);
        total_count += view.byteLength;
        current_count += view.byteLength;
    }

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
            showProgress(msg.dev_disc);
        });

        showProgress(msg.discover_trace);
        ble_obj.service = await ble_obj.server.getPrimaryService(GUID_SERVICE);
        ble_obj.char_data = await ble_obj.service.getCharacteristic(GUID_CHAR_DATA);

        ble_obj.char_data.startNotifications().then(char => {
            ble_obj.char_data.addEventListener('characteristicvaluechanged',
                                          on_got_new_data);
          });

        showProgress(msg.recording);

        setInterval(show_speed, 1000);

    } catch (e) {
        alert(e.message);
        showProgress(msg.exception + e.message);
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
    $('#running_status').show();
    showProgress('', -1);
}

function stopRunning() {
    $('#running_status').hide();
}

function appStart() {
    $('#running_status').hide();

    if (window.File && window.FileReader && window.FileList && window.Blob
        && navigator.bluetooth) {
    } else {
        return;
    }

    $('#api_notice').attr('hidden', true);

    $("#btn_scan").click(async function () {
        try {
            $('#startup_window').hide();
            connect();
        } catch (e) { }
    });

    $("#btn_download").click(downloadLog);

    startRunning();
    showProgress(msg.sel_dev, -1);
    return;
}

window.onload = appStart;