all_pages = {};

function remove_ext(s) {
    var p = s.indexOf('.');
    return p >= 0 ? s.substr(0, p) : s;
}

function show_page(id) {
    for (let a in all_pages) {
        if (a == id)
            all_pages[a].show();
        else
            all_pages[a].hide();
    }
}

function explain0(fn, lo) {
    fn = fn.toLowerCase();
    lo = lo.toLowerCase();
    let label = 'assertion_' + remove_ext(fn) + '_' + lo;
    if (label in all_pages)
    {
        show_page(label);
        return;
    }
    label = 'assertion_' + remove_ext(fn);
    if (label in all_pages)
    {
        show_page(label);
        return;
    }

    show_page('assertion_unknown');
}

function explain() {
    let val = $('#assertion_info').val();

    if (val == '') alert(msg.need_input);

    var m = /([a-zA-Z0-9_\.]+):([0-9]+)/.exec(val);
    if ((m != null) && (m.length == 3))
    {
        explain0(m[1], m[2]);
        return;
    }

    if (val.indexOf('oom') >= 0)
    {
        explain0('oom', '');
        return;
    }

    explain0('unknown', '');

    return false;
}

function switch_to_ch() {
    window.location.href = window.location.href.replace('index.html', 'index_cn.html');
    return false;
}

function switch_to_en() {
    window.location.href = window.location.href.replace('index_cn.html', 'index.html');
    return false;
}

async function appStart() {

    $('#btn_explain').click(explain);
    $('#btn_ch_version').click(switch_to_ch);
    $('#btn_en_version').click(switch_to_en);

    let main = $('#main_window');

    marked.use({
        mangle: false,
        headerIds: false,
      });

    $('#all_assertions').children().each(function (index, elem) {
        let content = marked.parse($(this).text());

        for (let id of $(this).attr('id').substr(3).split('|'))
        {
            jQuery('<div>', {
                id: id,
                class: 'uk-card uk-card-default uk-card-body',
                style: 'display:none',
            }).appendTo(main);

            all_pages[id] = $('#' + id);

            $('#' + id).html(content);
        }
    });

    hljs.highlightAll();

    let paramString = window.location.href.split('?');
    if (paramString.length < 2) return;

    let queryString = new URLSearchParams(paramString[1]);
    for(let pair of queryString.entries()) {
        if (pair[0] == 'q') {
            $('#assertion_info').val(pair[1])
            explain();
            break;
        }
    }

    return;
}

window.onload = appStart;
