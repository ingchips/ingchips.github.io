function inspect_cte(pattern, cte_b64, mode) {

    function base64ToUint8Array(b64_data) {
        var str = "";
        try { str = window.atob(b64_data); } catch { }
        var arr = [];
        for (var i = 0; i < str.length; ++i) {
            arr.push(str.charCodeAt(i));
        }
        return arr;
    }

    function splitarray(input, spacing)
    {
        var output = [];

        for (var i = 0; i < input.length; i += spacing)
        {
            output[output.length] = input.slice(i, i + spacing);
        }

        return output;
    }

    function freqOfChannelIndexMHz(channelIndex) {
        if (0 > channelIndex)
            return 0.0;

        if (channelIndex <= 10)
            return 2404.0 + 2 * channelIndex;
        else if (channelIndex <= 36)
            return 2428.0 + 2 * (channelIndex - 11);
        else
            return 0.0;
    }

    const SPEED_OF_LIGHT = 299792458;
    const MIN_WAVE_LEN = SPEED_OF_LIGHT / (2483500000.0);

    function rad_to_deg(rad) {
        return rad / Math.PI * 180;
    }

    function parseConnlessIqReport(b64_data) {
        let schema = [
            {t: 'u16', n: 'sync_handle'},
            {t: 'u8',  n: 'channel_index'},
            {t: 's16', n: 'rssi'},
            {t: 'u8',  n: 'rssi_ant_id'},
            {t: 'u8',  n: 'cte_type'},
            {t: 'u8',  n: 'slot_durations'},
            {t: 'u8',  n: 'packet_status'},
            {t: 'u16', n: 'event_counter'},
            {t: 'u8',  n: 'sample_count'},
            {t: 'struct', n: 'samples', len: 'sample_count', fields: [
                {t: 's8', n: 're'},
                {t: 's8', n: 'im'}
            ]},
        ];
        var report = null;
        try {
            var arr = base64ToUint8Array(b64_data);
            if (arr.length < 1) return null;
            report = parseSchema(schema, arr);
            var samples = [];
            for (var s of report.samples)
                samples.push(math.complex(s));
            report.samples = samples;
        } catch { }
        return report;
    }

    function parseConnIqReport(b64_data) {
        let schema = [
            {t: 'u16', n: 'sync_handle'},
            {t: 'u8', n: 'rx_phy'},
            {t: 'u8',  n: 'channel_index'},
            {t: 's16', n: 'rssi'},
            {t: 'u8',  n: 'rssi_ant_id'},
            {t: 'u8',  n: 'cte_type'},
            {t: 'u8',  n: 'slot_durations'},
            {t: 'u8',  n: 'packet_status'},
            {t: 'u16', n: 'event_counter'},
            {t: 'u8',  n: 'sample_count'},
            {t: 'struct', n: 'samples', len: 'sample_count', fields: [
                {t: 's8', n: 're'},
                {t: 's8', n: 'im'}
            ]},
        ];
        var report = null;
        try {
            var arr = base64ToUint8Array(b64_data);
            if (arr.length < 1) return null;
            report = parseSchema(schema, arr);
            var samples = [];
            for (var s of report.samples)
                samples.push(math.complex(s));
            report.samples = samples;
        } catch { }
        return report;
    }

    function draw_data(id, xys) {
        const xs = Enumerable.from(xys).select(xy => xy[0]).toArray();
        const ys = Enumerable.from(xys).select(xy => xy[1]).toArray();
        var data = [{ x: xs, y: ys }];
        if (xys[0].length > 2)
        {
            data.push({ x: xs, y: Enumerable.from(xys).select(xy => xy[2]).toArray() });
        }

        Plotly.newPlot(id, data, { margin: { t: 0 } } );
    }

    function draw_radar(id, xys) {
        const theta = Enumerable.from(xys).select(xy => xy[0] * 360 / (2 * Math.PI)).toArray();
        const r = Enumerable.from(xys).select(xy => xy[1] ).toArray();

        var data = [{type: 'scatterpolar',
        r: r,
        theta: theta,
        fill: 'toself'}];

        var layout = {
            polar: {
              radialaxis: {
                visible: false,
              }
            },
            showlegend: false
          }

        Plotly.newPlot(id, data, layout );
    }

    function linear_arg(one_ant) {
        const search = Enumerable.from([-2 * Math.PI, 0, 2 * Math.PI]);
        one_ant[0][1] = one_ant[0][1].arg();
        one_ant[0][2] = one_ant[0][1];
        var offset = 0;
        for (var i = 1; i < one_ant.length; i++)
        {
            var a = one_ant[i][1].arg();
            var b  = search.select((t) => a + offset + t).minBy((v) => Math.abs(v - one_ant[i - 1][1]));
            one_ant[i][1] = b;
            one_ant[i][2] = a;
            offset = b - a;
        }
    }

    function make_i_to_ant_id_fun(patterns)
    {
        return function (i) { return i <= 7 ? patterns[0] : patterns[math.mod(i - 7, patterns.length)]; };
    }

    function calc_snr(ant_samples) {
        var snr = {};
        for (var key in ant_samples) {
            var samples = Enumerable.from(ant_samples[key]);
            //console.log(samples.toArray());

            var avr = samples.aggregate(math.complex(0), (a, b) => a.add(b)).div(samples.count());
            //console.log(avr);

            const np = samples.select((iq) => Math.pow(iq.sub(avr).abs(), 2)).average();

            snr[key] = Math.log10(Math.pow(avr.abs(), 2) / np) * 10;
        }

        return snr;
    }

    function calc_power(ant_samples) {
        var p = {};
        for (var key in ant_samples) {
            var avr = Enumerable.from(ant_samples[key])
                                    .select((v) => Math.pow(v.abs(), 2))
                                    .average();
            p[key] = Math.log10(avr) * 10;
        }

        return p;
    }

    function split_samples(samples, patterns) {
        let i_to_an = make_i_to_ant_id_fun(patterns);
        const ant_vect = get_ant_id_vect(patterns);
        var r = {};
        for (var ant of ant_vect)
        {
            r[ant] = Enumerable.from(samples)
                               .where((_iq, index) => i_to_an(index) == ant)
                               .toArray();
        }

        return r;
    }

    function cancel_dc(report, patterns) {
        let i_to_an = make_i_to_ant_id_fun(patterns);

        var dc = [];
        for (var i = 0; i < patterns.length; i++)
        {
            let ant = patterns[i];
            const samples = Enumerable.from(report.samples)
                                 .where((iq, index) => i_to_an(index) == ant);
            var sum = samples.aggregate(math.complex(0), (a, b) => a.add(b));
            dc[ant] = sum.div(samples.count());
        }

        for (var i = 0; i < report.samples.length; i++)
        {
            report.samples[i] = report.samples[i].sub(dc[i_to_an(i)]);
        }
    }

    function linear_regression(xys) {
        const xs = Enumerable.from(xys).select(xy => xy[0]);
        const ys = Enumerable.from(xys).select(xy => xy[1]);

        const avr_x = xs.average();
        const avr_y = ys.average();
        const s_xy = xs.select((x) => x - avr_x)
                        .zip(ys.select((y) => y - avr_y), (x, y) => x * y)
                        .sum();
        const s_x2 = xs.select((x) => (x - avr_x) * (x - avr_x))
                        .sum();

        const beta = s_xy / s_x2;
        const alpha = avr_y - beta * avr_x;

        return (n) => alpha + beta * n;
    }

    function normalize_power(report, patterns) {
        let i_to_an = make_i_to_ant_id_fun(patterns);

        var scaling = [];
        for (var i = 0; i < patterns.length; i++)
        {
            var sum = 0;
            let ant = patterns[i];
            const power = Enumerable.from(report.samples)
                                 .where((iq, index) => i_to_an(index) == ant)
                                 .select((iq) => Math.pow(iq.abs(), 2))
                                 .average();
            scaling[ant] = Math.sqrt(8000 / power);
        }

        for (var i = 0; i < report.samples.length; i++)
        {
            report.samples[i] = report.samples[i].mul(scaling[i_to_an(i)]);
        }
    }

    function demodulate(report, patterns) {
        let i_to_tn =
            report.slot_durations == 1 ? function (i) { return i <= 7 ? i : 7 + (i - 7) * 2}
                                       : function (i) { return i <= 7 ? i : 7 + (i - 7) * 4};

        var one_ant = [];

        // dc-cancellation
        cancel_dc(report, patterns);

        normalize_power(report, patterns);

        //
        // Stage 1: use the first 8 samples
        //

        // prepare samples
        for (var i = 0; i < 8; i++)
        {
            one_ant.push([i, report.samples[i]]);
        }

        linear_arg(one_ant);

        // draw_data('plot_dbg1', one_ant);

        var model = linear_regression(one_ant);

        for (var i = 0; i < report.samples.length; i++)
        {
            report.samples[i] = report.samples[i].mul(math.complex({r: 1, phi: -model(i_to_tn(i))}));
        }

        //
        // Stage 2: use all samples from def antenna
        //

        // prepare samples
        one_ant = [];
        for (var i = 0; i < report.samples.length; i++)
        {
            const ant_id = i >= 8 ? (i - 8 + 1) % patterns.length : 0;
            if (patterns[ant_id] != patterns[0]) continue;

            one_ant.push([i_to_tn(i), report.samples[i]]);
        }

        // get linear Arg
        linear_arg(one_ant);

        // draw_data('plot_dbg2', one_ant);

        model = linear_regression(one_ant);

        for (var i = 0; i < report.samples.length; i++)
        {
            report.samples[i] = report.samples[i].mul(math.complex({r: 1, phi: -model(i_to_tn(i))}));
        }

        // logline(report.samples);
    }

    var switching_pat = [];

    function get_ant_id_vect(patterns) {
        var r = [];
        for (var i of patterns) {
            if (r.indexOf(i) >= 0)
                continue;
            r.push(i);
        }
        return r;
    }

    function drawIQSamples(id, title, samples, patterns) {
        const colors = ['#D50000', '#AA00FF', '#304FFE', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#DD2C00'];
        let i_to_an = make_i_to_ant_id_fun(patterns);

        let set = new Set(patterns);

        var data = [];

        {
            const samples_ant = Enumerable.from(samples).where((iq, index) => index <= 7);
            const xs = samples_ant.select((iq) => iq.re).toArray();
            const ys = samples_ant.select((iq) => iq.im).toArray();
            const ts = samples_ant.select((iq, index) => '#' + index).toArray();
            data.push({ x: xs, y: ys, mode: 'markers', type: 'scatter', name: 'ref', marker: {color: 'gray' }, text: ts});
        }

        for (var ant of set)
        {
            const samples_ant = Enumerable.from(samples)
                                          .where((iq, index) => (index >= 8) && (i_to_an(index) == ant));
            const ts = Enumerable.from(samples)
                                 .select((iq, index) => '#' + index)
                                 .where((iq, index) => (index >= 8) && (i_to_an(index) == ant))
                                 .toArray();
            const xs = samples_ant.select((iq) => iq.re).toArray();
            const ys = samples_ant.select((iq) => iq.im).toArray();
            data.push({ x: xs, y: ys, mode: 'markers', type: 'scatter', name: '' + ant , marker: {color: colors[ant] }, text: ts});
        }

        var layout = {
            xaxis: { range: [ -127, 127 ] },
            yaxis: { range: [ -127, 127 ] },
            title: title
        };

        Plotly.newPlot(id, data, layout);
    }

    function make_scatter_serial(samples_ant, color, name) {
        const xs = samples_ant.select((iq) => iq.re).toArray();
        const ys = samples_ant.select((iq) => iq.im).toArray();
        const ts = samples_ant.select((iq, index) => '#' + index).toArray();
        return { x: xs, y: ys, mode: 'markers', type: 'scatter', name: name, marker: {color: color }, text: ts};
    }

    function drawIQAntSamples(id, title, ant_samples, ref) {
        const colors = ['#D50000', '#AA00FF', '#304FFE', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#DD2C00'];

        var data = [];

        {
            const ref_samples = ant_samples[ref];

            data.push(make_scatter_serial(Enumerable.from(ref_samples).where((iq, index) => index <= 7), 'gray', 'ref'));
            data.push(make_scatter_serial(Enumerable.from(ref_samples).where((iq, index) => index >  7), colors[ref], ref));
        }

        for (var ant in ant_samples)
        {
            if (ant == ref) continue;
            data.push(make_scatter_serial(Enumerable.from(ant_samples[ant]), colors[ant], ant));
        }

        var layout = {
            xaxis: { range: [ -127, 127 ] },
            yaxis: { range: [ -127, 127 ] },
            title: title
        };

        Plotly.newPlot(id, data, layout);
    }

    var rx_data_buff = {};
    var logs = [];
    var last_final = undefined;

    function timeStr() {
        var t = new Date();
        return '[' + t.toLocaleTimeString() + ']';
    }

    function logline(line) {
        logs.unshift(timeStr() + ' ' + line);
        if (logs.length > 20) logs.pop();
        $("#logview").text(logs.join("\n"));
    }

    function rxLine(connectionId, line) {
        let report = mode == 0 ? parseConnIqReport(line) : parseConnlessIqReport(line);
        if (report != null) {
            logline(line);

            const ref = switching_pat[0];

            //logline(formatreport(report));
            drawIQSamples('plot_raw', 'Raw', report.samples, switching_pat);

            let discards = [];

            demodulate(report, switching_pat);

            const ant_samples = split_samples(report.samples, switching_pat);

            let snr = calc_snr(ant_samples);

            console.log(snr);

            {
                if (switching_pat.length > 3) {
                    for (var bad of discards)
                        delete ant_samples[bad];
                }

                drawIQAntSamples('plot_dem', 'Preprocess', ant_samples, ref);
                show_iq_result(ant_samples, ref);
            }
        }
    }

    function string_shorten(str, wrap, tag) {
        var r = '';
        var s = str;
        const MAX = 80;
        let TAG = tag === undefined ? ',' : tag;
        while (s.length > 0) {
            let pos = s.indexOf(TAG, MAX);
            if (pos < 0) pos = s.length;
            r = r + wrap + '\n' + s.slice(0, pos + TAG.length);
            s = s.slice(pos + TAG.length);
        }
        return r.slice(wrap.length + 1);
    }

    function format_q(v) {
        return v > 0 ? ' + ' + v.toFixed(5) : ' - ' + (-v).toFixed(5);
    }

    function append_str(id, str) {
        let ele = $(id);
        ele.val(ele.val() + '\n' + str);
    }

    String.prototype.format = function()
    {
        var args = arguments;
        return this.replace(/\{(\d+)\}/g,
            function(m,i){
                return args[i];
            });
    }

    function show_iq_result_matlab(id, ant_samples, ref) {
        function show_iq_values(lst) {
            return Enumerable.from(lst).select((c) => c.re.toFixed(5) + format_q(c.im) + 'j')
                      .toArray().join(', ');
        }

        append_str(id, 'samples[ref] =');
        let s = show_iq_values(ant_samples[ref].slice(0, 8));
        append_str(id, '[' + string_shorten(s, ' ...') + ']\n');

        for (let i in ant_samples) {
            append_str(id, 'samples[{0}] ='.format(i));
            let s = show_iq_values(i != ref ? ant_samples[i] : ant_samples[i].slice(8));
            append_str(id, '[' + string_shorten(s, ' ...') + ']\n');
        }
    }

    function show_iq_result_py(id, ant_samples, ref) {
        function show_iq_values(lst) {
            return Enumerable.from(lst).select((c) => c.re.toFixed(5) + format_q(c.im) + 'j')
                      .toArray().join(', ');
        }

        append_str(id, 'samples[ref] =');
        let s = show_iq_values(ant_samples[ref].slice(0, 8));
        append_str(id, '[' + string_shorten(s, ' \\') + ']\n');

        for (let i in ant_samples) {
            append_str(id, 'samples[{0}] ='.format(i));
            let s = show_iq_values(i != ref ? ant_samples[i] : ant_samples[i].slice(8));
            append_str(id, '[' + string_shorten(s, ' \\') + ']\n');
        }
    }

    function show_iq_result_mma(id, ant_samples, ref) {
        function show_iq_values(lst) {
            return Enumerable.from(lst).select((c) => c.re.toFixed(5) + format_q(c.im) + 'I')
                      .toArray().join(', ');
        }

        append_str(id, 'samples[ref] =');
        let s = show_iq_values(ant_samples[ref].slice(0, 8));
        append_str(id, '{' + string_shorten(s, '') + '}\n');

        for (let i in ant_samples) {
            append_str(id, 'samples[{0}] ='.format(i));
            let s = show_iq_values(i != ref ? ant_samples[i] : ant_samples[i].slice(8));
            append_str(id, '{' + string_shorten(s, '') + '}\n');
        }
    }

    function show_iq_result_c(id, ant_samples, ref) {
        function show_iq_values(lst) {
            return Enumerable.from(lst).select((c) => '{' + c.re.toFixed(5) + ',' + format_q(c.im) + '}')
                      .toArray().join(', ');
        }

        append_str(id, 'samples[ref] =');
        let s = show_iq_values(ant_samples[ref].slice(0, 8));
        append_str(id, '{' + string_shorten(s, '', '},') + '}\n');

        for (let i in ant_samples) {
            append_str(id, 'samples[{0}] ='.format(i));
            let s = show_iq_values(i != ref ? ant_samples[i] : ant_samples[i].slice(8));
            append_str(id, '{' + string_shorten(s, '', '},') + '}\n');
        }
    }

    function show_iq_result(ant_samples, ref) {
        $('#output_c').val('');
        $('#output_matlab').val('');
        $('#output_mma').val('');
        $('#output_py').val('');
        show_iq_result_matlab('#output_matlab', ant_samples, ref);
        show_iq_result_mma('#output_mma', ant_samples, ref);
        show_iq_result_py('#output_py', ant_samples, ref);
        show_iq_result_c('#output_c', ant_samples, ref);
    }

    function serialRxData(id, string) {
        var string = rx_data_buff[id] + string;
        var ss = string.split(/\r|\n/);
        for (var i = 0; i < ss.length - 1; i++)
            rxLine(id, ss[i])
        rx_data_buff[id] = ss[ss.length - 1]
    }

    function parse_pattern(s) {
        var r = [];
        for (var x of s.split(',')) {
            let v = parseInt(x);
            if (!isNaN(v))
                r.push(v);
        }
        return r;
    }

    switching_pat = parse_pattern(pattern);
    serialRxData(0, '\n' + cte_b64 + '\n');

    return;
}
