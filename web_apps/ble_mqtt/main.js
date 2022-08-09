var settings = {};
var report_cnt = 0;

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
client = null;

async function connect() {
    ble_obj = {};

    const on_got_new_data = function (event) {
        const characteristic = event.target;
        const view = characteristic.value;
        var s = '';
        for (let i = 0; i < view.byteLength; i++)
        {
            let c = view.getUint8(i);
            s = s + (c != 0 ? String.fromCharCode(c) : '\n');
        }
        client.publish(settings.topic, settings.prefix + s + '\n');
        report_cnt++;
        $('#report_cnt').text(report_cnt);
    }

    try {
        showProgress(msg.scaning);
        ble_obj.dev = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [$('#uuid_service').val()]
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
        ble_obj.service = await ble_obj.server.getPrimaryService($('#uuid_service').val());

        let chars = await ble_obj.service.getCharacteristics();

        ble_obj.char_output = chars.find((c) => c.uuid === $('#uuid_char').val());

        $("#window_info").show();

        ble_obj.char_output.startNotifications().then(char => {
            ble_obj.char_output.addEventListener('characteristicvaluechanged',
                                          on_got_new_data);
          });


    } catch (e) {
        alert(e.message);
        window.location.reload();
    }
}

function appStart() {

    $("#window_ble").hide();
    $("#window_info").hide();

    if (navigator.bluetooth) {
    } else {
        return;
    }

    $('#btn_conn_mqtt').click(async function() {
        $("#main_window").hide();
        connect_server();
    })

    $("#btn_select_ble").click(async function () {
        $("#window_ble").hide();
        settings.topic = $('#in_topic').val();
        settings.prefix = $('#in_prefix').val();
        try {
            connect();
        } catch (e) { }
    });

    return;
}

window.onload = appStart;

function showProgress(msg, progress) {
    $('#js-message').text(msg);
}

function connect_server(){
    options = {
        // Clean session
        clean: true,
        connectTimeout: 4000,
        // Auth
        clientId: '',
        username: '',
        password: '',
    };
    options.clientId = 'emqx_test' + Math.random().toString(16);
    client = mqtt.connect($('#in_proto option:selected').val() + $('#in_server').val() + ':' + $('#in_port').val(), options);
    client.on('connect', function () {
        $("#window_ble").show();
    });
}
