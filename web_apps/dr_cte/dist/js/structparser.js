!function(t){function n(t,n){return t<n?t:t-2*n}function r(t){return t.shift()}function u(t){var n=t.shift();return n+=t.shift()<<8}function e(t){var n=u(t);return n+=u(t)<<16}function i(t,i){if("u8"==t.t)return r(i);if("s8"==t.t)return n(r(i),128);if("u16"==t.t)return u(i);if("s16"==t.t)return n(u(i),32768);if("u32"==t.t)return e(i);if("s32"==t.t)return n(e(i),2147483648);if("hex"==t.t)return r(i).toString(16).padStart(2,"0");throw"unknown type "+t.t}function f(t,n,r,u){for(var e=[],f=0;f<r;f++)"struct"!=t.t?e.push(i(t,n)):e.push(s(t.fields,n));return"hex"==t.t&&(e=e.join("")),e}function o(t,n,r){if(null==t.len)return"struct"!=t.t?i(t,n):s(t.fields,n);if("number"==typeof t.len)return f(t,n,t.len);if("string"==typeof t.len)return f(t,n,r[t.len]);throw t}function s(t,n){var r={};for(var u in t){var e=t[u];r[e.n]=o(e,n,r)}return r}this.parseSchema=s}();