'use strict';

var commands = exports;
var pathModule = require('path');
var assert = require('assert');
var fs = require('fs');

var helper = require('./helper');
var lazylib = helper.lazylib;

commands.env = require('./rusk.js').env;

/*
 * Command trace
 */
commands.trace = function trace(/* messages */) {
    var obj = {};
    Error.captureStackTrace(obj);
    var stacks = obj.stack.split('\n');
    var stackInfo = stacks[2].match(/\(.*\)$|at .*$/)[0].split(':');
    stackInfo[0] = pathModule.basename(stackInfo[0]);
    var args = ['(' + stackInfo.join(':') + ')'];
    args.push.apply(args, arguments);
    console.log.apply(console, args);
};

// e.g. expression = '$0', '${varName}' '$.varName.attr.attr', '$varName.attr:filter1:filter2'
var expandExpression = /\$[\w_.]+(?::[\w_]+)*|\${[\w_.]+(?::[\w_]+)*}/g;

/*
 * Command expand
 */
commands.expand = function expand(format /* ...args */) {
    assert(typeof format === 'string', 'rusk.expand: arguments[0] must be a String');

    if(format[0] === '"' || format[0] === '\'') {
        return format;
    }

    // replace '~' to HOME directory abs path
    if(format[0] === '~') {
        format = pathModule.join(commands.env.HOME, format.slice(1));
    }

    if(format.indexOf('$') === -1) {
        return format;
    }
    var args = [];
    if(1 < arguments.length) {
        args = Array.prototype.slice.call(arguments, 1);
    }
    return format.replace(expandExpression, function (exp) {
        // trim '$' and '${ }'
        exp = (exp[1] === '{') ? exp.slice(2, -1) : exp.slice(1);

        // extract envVar and filters from expression
        var filters = exp.split(':');
        var attrs = filters.shift().split('.');
        var varName = attrs.shift();
        var envVar;
        if(commands.reservedValue[varName]) {
            envVar = commands.reservedValue[varName]();
        } else if(args.hasOwnProperty(varName)) {
            envVar = args[varName];
        } else {
            envVar = commands.env[varName];
        }
        if(envVar === undefined) {
            throw new Error('rusk.expand: \'$' + varName + '\' is not defined');
        }

        // acccess attribute of envVar
        for(var i = 0; i < attrs.length; i++) {
            envVar = envVar[attrs[i]];
            if(envVar === undefined) {
                var errorExpr = varName + '.' + attrs.slice(0, i+1).join('.');
                throw new Error('rusk.expand: \'$' + errorExpr + '\' is not defined');
            }
        }

        // apply filter
        for(i = 0; i < filters.length; i++) {
            envVar = commands.expandFilter[filters[i]](envVar);
        }
        return envVar.toString();
    });
};

commands.reservedValue = {
    cwd: function() {
        return process.cwd();
    },
};

commands.expandFilter = {
    abs: pathModule.resolve,
    base: pathModule.basename,
    ext: pathModule.extname,
    dir: pathModule.dirname,
    rmext: function(path) {
        var extLength = pathModule.extname(path).length;
        return extLength ? path.slice(0, -extLength) : path;
    },
    digit1: zeroFillX(1),
    digit2: zeroFillX(2),
    digit3: zeroFillX(3),
    digit4: zeroFillX(4),
    digit5: zeroFillX(5),
    digit6: zeroFillX(6),
    digit7: zeroFillX(7),
    digit8: zeroFillX(8),
};

function zeroFillX(len) {
    var zero = new Array(len).join('0');
    return function(num) {
        var sign = '';
        if(num < 0) {
            num = -num;
            sign = '-';
        }
        var digit = (num | 0).toString();
        if(digit.length < len) {
            return sign + (zero + digit).slice(-len);
        }
        return sign + digit;
    };
}

/*
 * Command glob
 */
commands.glob = function glob(patterns) {
    if(typeof patterns === 'string') {
        patterns = [patterns];
    }
    patterns = Array.prototype.map.call(patterns, commands.expand);
    var paths = [];
    for(var i = 0; i < patterns.length; i++) {
        var ptn = patterns[i];
        if(/[[{?*]/.test(ptn)) {
            var matched = lazylib.glob.sync(ptn);
            for(var m = 0; m < matched.length; m++) {
                paths.push(matched[m]);
            }
        } else if(fs.existsSync(ptn)) {
            paths.push(ptn);
        }
    }
    return paths;
};

/*
 * Command exec
 */
commands.exec = function exec(command, options) {
    return commands.execBuf(command, options).toString();
};

/*
 * Command spawn
 */
commands.spawn = function spawn(file, args, options) {
    var result = commands.spawnBuf(file, args, options);
    result.stdout = result.stdout.toString();
    result.stderr = result.stderr.toString();
    return result;
};
