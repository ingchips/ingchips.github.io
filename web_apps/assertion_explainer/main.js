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
    console.log(val);
    if (val == '') alert(msg.need_input);

    var m = /([^ ]+):([0-9]+)/.exec(val);
    if (m.length == 3)
    {
        explain0(m[1], m[2]);
        return;
    }

    explain0('unknown', '');

    return false;
}

async function appStart() {

    $('#btn_explain').click(explain);

    let main = $('#main_window');

    marked.use({
        mangle: false,
        headerIds: false,
      });

    main.children().each(function(index, elem) {
        let id = $(this).attr('id');
        all_pages[id] = $('#' + id);
        all_pages[id].hide();
        $('#' + id + '_content').html(
            marked.parse($('#' + id + '_content_md').text()));
    });

    hljs.highlightAll();

    return;
}

window.onload = appStart;
