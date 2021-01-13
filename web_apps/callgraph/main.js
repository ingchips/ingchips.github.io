function match_fn(line) {
    const r = line.match(/^[0-9a-fA-F]+\s+<(.+)\>:/);
    return (r != null) && (r.length == 2) ? r[1] : null;
}

function match_instr0(line) {
    var r = line.match(/^\s*[0-9A-Fa-f]+:\s+[0-9A-Fa-f]{4}\s+[0-9A-Fa-f]{4}\s+([a-z]+)\s(.*)/);
    if (r != null) return [r[1], r[2]];
    var r = line.match(/^\s*[0-9A-Fa-f]+:\s+[0-9A-Fa-f]{4}\s+[0-9A-Fa-f]{4}\s+([a-z]+)\.w\s(.*)/);
    if (r != null) return [r[1], r[2]];
    var r = line.match(/^\s*[0-9A-Fa-f]+:\s+[0-9A-Fa-f]{4}\s+([a-z]+)\s(.*)/);
    if (r != null) return [r[1], r[2]];
    var r = line.match(/^\s*[0-9A-Fa-f]+:\s+[0-9A-Fa-f]{4}\s+([a-z]+)\.w\s(.*)/);
    if (r != null) return [r[1], r[2]];
    return null;
}

function match_instr(line) {
    var r = match_instr0(line);
    if (r == null) return null;

    var name = r[0];
    var param = r[1];

    if (name.length >= 2)
    {
        const cond = ['eq', 'ne', 'cs', 'hs', 'cc', 'lo', 'mi', 'pl', 'vs',
                      'vc', 'hi', 'ls', 'ge', 'lt', 'gt', 'le', 'al'];
        if (cond.indexOf(name.substr(name.length - 2)) >= 0)
            name = name.substr(0, name.length - 2);
    }

    return [name, param];
}

function parse_push(s) {
    var acc = 0;
    for (item of s.split(',')) {
        const r = item.match(/r([0-9]+)-r([0-9]+)/);
        if (r != null)
            acc += parseInt(r[2]) - parseInt(r[1]) + 1;
        else
            acc++;
    }
    return acc * 4;
}

function match_stack(line) {
    var r = line.match(/^push (.+)/);
    if (r != null) {
        return parse_push(r[1]);
    }

    r = line.match(/^stmdb sp!,\s*(.+)/);
    if (r != null) {
        return parse_push(r[1]);
    }

    r = line.match(/^sub sp,\s*sp,\s*#([0-9]+)/);
    if (r != null) {
        return parseInt(r[1]);
    }

    r = line.match(/^sub sp,\s*#([0-9]+)/);
    if (r != null) {
        return parseInt(r[1]);
    }

    return null;
}

function match_call(line) {
    var r = line.match(/^bl [0-9A-Fa-f]+\s*<(.+)>/);
    if (r != null) return r[1];

    var r = line.match(/^blx [0-9A-Fa-f]+\s*<(.+)>/);
    if (r != null) return r[1];

    var r = line.match(/^b [0-9A-Fa-f]+\s*<(.+)>/);
    if (r != null) return r[1];

    var r = line.match(/^bx [0-9A-Fa-f]+\s*<(.+)>/);
    if (r != null) return r[1];

    return null;
}

function match_unknown_call(line) {
    var r = line.match(/^bl r[0-9]+/);
    if (r != null) return true;

    var r = line.match(/^blx r[0-9]+/);
    if (r != null) return true;

    return null;
}

function load_asm(src) {
    const lines = src.split('\n');
    var r = {};
    var info = null;
    var name = '';
    for (var s of lines) {
        var t = match_fn(s);
        if (t != null) {
            if (info != null) r[name] = info;
            name = t;
            info = { calls: [], stack : 0, unknown: false};
            continue;
        }

        t = match_instr(s);
        if (t == null) continue;

        var s2 = t[0] + ' ' + t[1];

        t = match_stack(s2);
        if (t != null) {
            info.stack = info.stack + t;
            continue;
        }

        t = match_call(s2);
        if ((t != null) && (info.calls.indexOf(t) < 0)) {
            info.calls = info.calls.concat(t);
            continue;
        }

        t = match_unknown_call(s2);
        if (t != null) {
            info.unknown = true;
            continue;
        }
    }

    if (info != null) r[name] = info;
    return r;
}

function grow_tree(funcs, f, path, stack_acc, stack_max_path) {
    var obj = funcs[f];
    var l = [];
    var unknown = false;
    if (obj === undefined) {
        return [true, stack_acc, [], stack_max_path];
    }

    let acc = stack_acc + obj.stack;
    var path10 = stack_max_path;

    for (let s of obj.calls) {
        if (path.indexOf(s) >= 0) {
            l.push([s, s]);
            unknown = true;
        }
        else {
            l.push([f, s]);
            let more = grow_tree(funcs, s, path.concat(s), stack_acc + obj.stack, stack_max_path.concat(s));
            unknown = unknown || more[0];
            l = l.concat(more[2]);
            if (more[1] > acc) {
                acc = more[1];
                path10 = more[3];
            }
        }
    }

    return [unknown, acc, l, path10];
}

function make_graph(funcs, f) {
    var r = grow_tree(funcs, f, [f], 0, [f]);
    var o = { name: f, unknown: r[0], stack_max: r[1], graph: r[2], stack_max_path: r[3]};
    return o;
}

String.prototype.format = function(args) {
    if (arguments.length > 0) {
      var result = this;
      if (arguments.length == 1 && typeof(args) == "object") {
        for (var key in args) {
          var reg = new RegExp("({" + key + "})", "g");
          result = result.replace(reg, args[key]);
        }
      } else {
        for (var i = 0; i < arguments.length; i++) {
          if (arguments[i] == undefined) {
            return "";
          } else {
            var reg = new RegExp("({[" + i + "]})", "g");
            result = result.replace(reg, arguments[i]);
          }
        }
      }
      return result;
    } else {
      return this;
    }
}

// Warn if overriding existing method
if(Array.prototype.equals)
    console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
    // if the other array is a falsy value, return
    if (!array)
        return false;

    // compare lengths - can save a lot of time
    if (this.length != array.length)
        return false;

    for (var i = 0, l = this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;
        }
        else if (this[i] != array[i]) {
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;
        }
    }
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

function to_diagrpah(funcs, o) {
    var r = [
        'digraph  {',
        '    node [style="filled", shape="rectangle"]'
    ];
    var fs = {};
    var count = 0;
    var g = o.graph;

    for (let e of g) {
        for (let f of e) {
            if (f in fs) continue;
            fs[f] = 'n' + (++count);
            let info = funcs[f];
            if (info === undefined)
                r.push('    {0}[label="{1}\nStack: ???"]'.format(fs[f], f))
            else
                r.push('    {0}[label="{1}\nStack: {2}"]'.format(fs[f], f, info.stack));
        }
    }

    var critical = [];
    for (var i = 0; i < o.stack_max_path.length - 1; i++) {
        critical.push([o.stack_max_path[i], o.stack_max_path[i + 1]]);
    }

    let is_critical = function (edge) {
        for (var i = 0; i < critical.length; i++) {
            if (edge.equals(critical[i])) {
                delete critical[i];
                return true;
            }
        }
    }

    for (let e of g) {
        if (is_critical(e)) {
            r.push('    {0} -> {1}[color=red]'.format(fs[e[0]], fs[e[1]]));
        }
        else
            r.push('    {0} -> {1}'.format(fs[e[0]], fs[e[1]]));
    }
    r.push('}');
    return r;
}

function analyze_stack(funcs) {
    let fs = new Set();
    let called = new Set();

    for (let k in funcs) {
        fs.add(k);
        for (let s of funcs[k].calls)
            called.add(s);
    }

    var r = [];
    for (let f of fs) {
        if (!called.has(f))
           r.push(make_graph(funcs, f));
    }

    r.sort((a, b) => - (a.stack_max - b.stack_max));

    return r;
}

function make_dropdown(ele, lst) {
    for (let id in lst) {
        ele.append('<li><a href="javascript:show_graph({0})">{1} (<b>{2}</b>)</a></li>'.format(
            id, lst[id].name, lst[id].stack_max));
    }
}