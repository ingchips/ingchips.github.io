// Load SDK bins configuration
let sdkBins = {};

function compare_list(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (i >= b.length) {
            return 1;
        }
        if (a[i] < b[i]) {
            return -1;
        } else if (a[i] > b[i]) {
            return 1;
        }
    }

    if (a.length < b.length) {
        return -1;
    }

    return 0;
}

function extract_numbers(s) {
    let numbers = [];
    let re = /\d+/g;
    let match;
    while ((match = re.exec(s)) !== null) {
        numbers.push(parseInt(match[0]));
    }
    return numbers;
}

function show_summary() {
    $('#running_status').hide();
    $('#main_window').attr('hidden', false);

    let all_releases = new Set();
    for (let hash in sdkBins) {
        let bin = sdkBins[hash];
        for (let release of bin['rel']) {
            all_releases.add(release);
        }
    }

    let releases = Array.from(all_releases);
    releases.sort((a, b) => compare_list(extract_numbers(a), extract_numbers(b)));

    $('#sdk-version-msg').text('Support SDK versions from ' + releases[0] + ' to ' + releases[releases.length - 1]
        + ' (' + Object.keys(sdkBins).length + ' binaries).');
}

function setup_drop_zone(id, drop_handler)
{
    var dropZone = document.getElementById(id);
    dropZone.addEventListener('dragover', function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy';
        }, false);
    dropZone.addEventListener('drop', drop_handler, false);
}

async function findThenProcess(files, file_ext, handler) {
    for (var i = 0, f; f = files[i]; i++) {
        if (f.name.endsWith(file_ext)) {
            await handler(f);
            return;
        }
    }
}

async function processPlatformBin(f) {
    let data = new Uint8Array(await f.arrayBuffer())

    let sha1 = await crypto.subtle.digest('sha-1', data);
    sha1 = Array.from(new Uint8Array(sha1));
    sha1 = sha1.map(x => x.toString(16).padStart(2, '0')).join('');

    $('#main_window').attr('hidden', true);

    if (sha1 in sdkBins) {

        $('#info_found_window').attr('hidden', false);

        let bin = sdkBins[sha1];

        let bundle = bin['bundle'].split('\\');
        $('#bundle_varient').text(bundle[0]);
        $('#bundle_chip').text(bundle[1]);

        $('#first_released_in_sdk_version').text(bin['rel'][0]);
        if (bin['rel'].length > 1) {
            $('#platform_included_in').attr('hidden', false);
        }

        for (let release of bin['rel'].slice(1)) {
            let span = document.createElement('span');
            span.appendChild(document.createTextNode(release));
            span.classList.add('uk-label', 'uk-margin-small-right', 'uk-text-lowercase');
            document.getElementById('platform_included_in').appendChild(span);
        }
    } else {
        $('#info_unknown_window').attr('hidden', false);
    }
}

async function handleBinFileDrop(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    await findThenProcess(evt.dataTransfer.files, '.bin', processPlatformBin);
}

async function appStart() {

    if (window.File && window.FileReader && window.FileList && window.Blob) {
    } else {
        return;
    }

    $.getJSON('sdk_bins.json?random=' + Math.random(), function(data) {
        sdkBins = data;
        console.log('SDK Bins loaded:', Object.keys(sdkBins).length + ' entries');
        show_summary();
    }).fail(function(jqXHR, textStatus, errorThrown) {
        alert('Failed to load SDK Bins: ' + textStatus + ' ' + errorThrown);
        navigator.reload();
    });

    setup_drop_zone('platform_bin_file_drop_zone', handleBinFileDrop);
    document.getElementById('platform_bin_file_select').addEventListener('change',
        async function (evt) {
            await findThenProcess(evt.target.files, '.bin', processPlatformBin);
        },
        false);
}

window.onload = appStart;