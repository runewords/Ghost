const url = require('url');
const path = require('path');
const debug = require('ghost-ignition').debug('web:shared:mw:url-redirects');
const urlUtils = require('../../../lib/url-utils');

const _private = {};

_private.redirectUrl = ({redirectTo, query, pathname}) => {
    const parts = url.parse(redirectTo);

    // CASE: ensure we always add a trailing slash to reduce the number of redirects
    // e.g. you are redirected from example.com/ghost to admin.example.com/ghost and Ghost would detect a missing slash and redirect you to /ghost/
    // Exceptions: asset requests
    if (!pathname.match(/\/$/) && !path.extname(pathname)) {
        pathname += '/';
    }

    return url.format({
        protocol: parts.protocol,
        hostname: parts.hostname,
        port: parts.port,
        pathname,
        query
    });
};

/**
 * Takes care of
 *
 * 1. required SSL redirects
 * 2. redirect to the correct admin url
 */
_private.getAdminRedirectUrl = ({requestedHost, requestedUrl, queryParameters, secure}) => {
    const siteUrl = urlUtils.urlFor('home', true);
    const adminUrl = urlUtils.urlFor('admin', true);
    const adminUrlWithoutProtocol = adminUrl.replace(/(^\w+:|^)\/\//, '');
    const siteUrlWithoutProtocol = siteUrl.replace(/(^\w+:|^)\/\//, '');

    debug('getAdminRedirectUrl', requestedHost, requestedUrl, adminUrlWithoutProtocol, siteUrlWithoutProtocol, urlUtils.urlJoin(siteUrlWithoutProtocol, 'ghost/'));

    // CASE: we only redirect the admin access if `admin.url` is configured
    // If url and admin.url are not equal AND the requested host does not match, redirect.
    // The first condition is the most important, because it ensures that you have a custom admin url configured,
    // because we don't force an admin redirect if you have a custom url configured, but no admin url.
    if (adminUrlWithoutProtocol !== urlUtils.urlJoin(siteUrlWithoutProtocol, 'ghost/') &&
        adminUrlWithoutProtocol !== urlUtils.urlJoin(requestedHost, urlUtils.getSubdir(), 'ghost/')) {
        debug('redirect because admin host does not match');

        return _private.redirectUrl({
            redirectTo: adminUrl,
            pathname: requestedUrl,
            query: queryParameters
        });
    }

    // CASE: configured admin url is HTTPS, but request is HTTP
    if (urlUtils.isSSL(adminUrl) && !secure) {
        debug('redirect because protocol does not match');

        return _private.redirectUrl({
            redirectTo: adminUrl,
            pathname: requestedUrl,
            query: queryParameters
        });
    }
};

/**
 * Takes care of
 *
 * 1. required SSL redirects
 */
_private.getFrontendRedirectUrl = ({requestedHost, requestedUrl, queryParameters, secure}) => {
    const siteUrl = urlUtils.urlFor('home', true);

    debug('getsiteRedirectUrl', requestedHost, requestedUrl, siteUrl);

    // CASE: configured canonical url is HTTPS, but request is HTTP, redirect to requested host + SSL
    if (urlUtils.isSSL(siteUrl) && !secure) {
        debug('redirect because protocol does not match');

        return _private.redirectUrl({
            redirectTo: `https://${requestedHost}`,
            pathname: requestedUrl,
            query: queryParameters
        });
    }
};

_private.redirect = (req, res, next, redirectFn) => {
    const redirectUrl = redirectFn({
        requestedHost: req.hostname,
        requestedUrl: url.parse(req.originalUrl || req.url).pathname,
        queryParameters: req.query,
        secure: req.secure
    });

    if (redirectUrl) {
        debug(`url redirect to: ${redirectUrl}`);
        return urlUtils.redirect301(res, redirectUrl);
    }

    debug('no url redirect');
    next();
};

const frontendRedirect = (req, res, next) => {
    _private.redirect(req, res, next, _private.getFrontendRedirectUrl);
};

const adminRedirect = (req, res, next) => {
    _private.redirect(req, res, next, _private.getAdminRedirectUrl);
};

module.exports.frontendSSLRedirect = frontendRedirect;
module.exports.adminSSLAndHostRedirect = adminRedirect;
