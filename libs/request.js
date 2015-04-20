/*!
 * 远程请求
 * @author ydr.me
 * @create 2014-11-22 23:11
 */

'use strict';

var fs = require('fs');
var url = require('url');
var http = require('http');
var https = require('https');
var typeis = require('./typeis.js');
var dato = require('./dato.js');
var defaults = {
    method: 'GET',
    encoding: 'utf8',
    headers: {},
    body: null,
    file: null
};
var methods = 'head get post put delete'.split(' ');
var Stream = require('stream');
var noop = function () {
    //
};
var REG_HTTP = /^https?:\/\//i;


/**
 * HEAD/GET/POST/PUT/DELETE 请求
 */
methods.forEach(function (method) {
    /**
     * 请求
     * @param options {String|Object}
     * @param callback {Function}
     */

    /**
     * @name exports
     * @property head {Function}
     * @property get {Function}
     * @property post {Function}
     * @property put {Function}
     * @property delete {Function}
     */
    exports[method] = function (options, callback) {
        if (typeis(options) === 'string') {
            options = {
                url: options
            };
        }

        options.method = method;
        _remote(options, callback);
    };
});


/**
 * 下载资源
 * @param options {String|Object}
 * @param [options.method="get"] {String}
 * @param [options.encoding="binary"] {String}
 * @param callback {Function}
 */
exports.down = function (options, callback) {
    if (typeis(options) === 'string') {
        options = {
            url: options
        };
    }

    options.method = 'get';
    options.encoding = 'binary';
    _remote(options, callback);
};


/**
 * 远程请求
 * @param options
 * @param options.url {String} 请求地址
 * @param [options.max30x=10] {Number} 30x 最大跳转次数
 * @param [options.method="GET"] {String} 请求方法
 * @param [options.headers=null] {Object} 请求头
 * @param [options.agent=null] {String} 请求代理信息
 * @param [options.encoding="utf8"] {String} 响应处理编码，可选 utf8/binary
 * @param [options.body=""] {String|Stream} POST/PUT 写入数据
 * @param [options.file=""] {String} POST/PUT 写入的文件地址
 * @param callback
 * @private
 */
function _remote(options, callback) {
    var int30x = 0;

    options.max30x = dato.parseInt(options.max30x, 10);
    callback = typeis.function(callback) ? callback : noop;

    var request = function () {
        _request(options, function (err, bodyORheaders, res) {
            if (options.method === 'head' || err) {
                return callback(err, bodyORheaders, res, 1);
            }

            var is30x = res.statusCode === 301 || res.statusCode === 302;

            if (is30x) {
                int30x++;
            }

            if (is30x && int30x > options.max30x) {
                return callback(new Error('redirect count over ' + options.max30x));
            }

            if (is30x) {
                var domain = this.options.protocol + '//' + this.options.hostname;
                var urlto = res.headers.location;

                urlto = (REG_HTTP.test(urlto) ? '' : domain) + urlto;
                options.url = urlto;
                request();
            } else {
                callback(err, bodyORheaders, res, 2);
            }
        });
    };

    request();
}


/**
 * 远程请求
 * @param options
 * @param options.url {String} 请求地址
 * @param [options.method="GET"] {String} 请求方法
 * @param [options.headers=null] {Object} 请求头
 * @param [options.agent=null] {String} 请求代理信息
 * @param [options.encoding="utf8"] {String} 响应处理编码，可选 utf8/binary
 * @param [options.body=""] {String|Stream} POST/PUT 写入数据
 * @param [options.file=""] {String} POST/PUT 写入的文件地址
 * @param callback
 * @private
 */
function _request(options, callback) {
    if (typeis(options.url) !== 'string') {
        return callback(new Error('request url must be a string'));
    }

    var requestOptions = url.parse(options.url);
    var _http = requestOptions.protocol === 'https:' ? https : http;
    var body = options.body || '';
    var file = options.file || '';

    options = dato.extend(true, {}, defaults, options);

    var headers = options.headers = _lowerCaseHeaders(options.headers);
    var bodyLength = headers['content-length'];

    requestOptions.agent = options.agent;
    requestOptions.method = options.method.toUpperCase();

    var canSend = requestOptions.method !== 'GET' && requestOptions.method !== 'HEAD';
    var stat;

    if (canSend && bodyLength === undefined) {
        if (file) {
            try {
                stat = fs.statSync(file);
            } catch (err) {
                return callback(err);
            }

            bodyLength = stat.size;
            body = fs.createReadStream(file);
        } else if (body instanceof Buffer) {
            bodyLength = body.length;
        } else if (body instanceof String) {
            bodyLength = Buffer.byteLength(body);
        }
    } else if (!canSend) {
        bodyLength = 0;
    }

    if (bodyLength !== undefined) {
        // 当上传流文件时，length 长度可以不指定
        options.headers['content-length'] = bodyLength;
    }

    requestOptions.headers = options.headers;
    var context = {
        options: requestOptions
    };

    var req = _http.request(requestOptions, function (res) {
        var bufferList = [];
        var binarys = '';
        var isUtf8 = options.encoding === 'utf8';

        if (requestOptions.method === 'HEAD') {
            req.abort();
            return callback.call(context, null, res.headers, res);
        }

        res.setEncoding(options.encoding);

        res.on('data', function (chunk) {
            if (isUtf8) {
                bufferList.push(new Buffer(chunk, 'utf8'));
            } else {
                binarys += chunk;
            }
        }).on('end', function () {
            var data;

            if (isUtf8) {
                data = Buffer.concat(bufferList).toString();
            } else {
                data = binarys;
            }

            callback.call(context, null, data, res);
        }).on('error', callback.bind(context));
    });

    req.on('error', callback.bind(context));

    if (canSend) {
        //steam
        if (body && typeis(body.pipe) === 'function') {
            body.pipe(req);
        } else {
            req.end(body);
        }
    } else {
        req.end();
    }
}


/**
 * 小写化 headers
 * @param headers
 * @returns {{}}
 * @private
 */
function _lowerCaseHeaders(headers) {
    var headers2 = {};

    dato.each(headers, function (key, val) {
        headers2[String(key).trim().toLowerCase()] = String(val).trim();
    });

    return headers2;
}
