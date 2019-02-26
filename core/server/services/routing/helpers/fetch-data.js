/**
 * # Fetch Data
 * Dynamically build and execute queries on the API
 */
const _ = require('lodash');
const Promise = require('bluebird');
const config = require('../../../config');

// The default settings for a default post query
const queryDefaults = {
    type: 'browse',
    resource: 'posts',
    controller: 'posts',
    options: {}
};

/**
 * @deprecated: `author`, will be removed in Ghost 3.0
 */
const defaultQueryOptions = {
    options: {
        include: 'author,authors,tags',
        formats: 'html'
    }
};

/**
 * Default post query needs to always include author, authors & tags
 */
const defaultPostQuery = _.cloneDeep(queryDefaults);
defaultPostQuery.options = defaultQueryOptions.options;

/**
 * ## Process Query
 * Takes a 'query' object, ensures that type, resource and options are set
 * Replaces occurrences of `%s` in options with slugParam
 * Converts the query config to a promise for the result
 *
 * @param {{type: String, resource: String, options: Object}} query
 * @param {String} slugParam
 * @returns {Promise} promise for an API call
 */
function processQuery(query, slugParam, locals) {
    const api = require('../../../api')[locals.apiVersion];

    query = _.cloneDeep(query);

    _.defaultsDeep(query, queryDefaults);

    // Replace any slugs, see TaxonomyRouter. We replace any '%s' by the slug
    _.each(query.options, function (option, name) {
        query.options[name] = _.isString(option) ? option.replace(/%s/g, slugParam) : option;
    });

    if (config.get('enableDeveloperExperiments')) {
        query.options.context = {member: locals.member};
    }
    // Return a promise for the api query
    return api[query.controller][query.type](query.options);
}

/**
 * ## Fetch Data
 * Calls out to get posts per page, builds the final posts query & builds any additional queries
 * Wraps the queries using Promise.props to ensure it gets named responses
 * Does a first round of formatting on the response, and returns
 */
function fetchData(pathOptions, routerOptions, locals) {
    pathOptions = pathOptions || {};
    routerOptions = routerOptions || {};

    let postQuery = _.cloneDeep(defaultPostQuery),
        props = {};

    if (routerOptions.filter) {
        postQuery.options.filter = routerOptions.filter;
    }

    if (routerOptions.order) {
        postQuery.options.order = routerOptions.order;
    }

    if (pathOptions.hasOwnProperty('page')) {
        postQuery.options.page = pathOptions.page;
    }

    if (pathOptions.hasOwnProperty('limit')) {
        postQuery.options.limit = pathOptions.limit;
    }

    // CASE: always fetch post entries
    // The filter can in theory contain a "%s" e.g. filter="primary_tag:%s"
    props.posts = processQuery(postQuery, pathOptions.slug, locals);

    // CASE: fetch more data defined by the router e.g. tags, authors - see TaxonomyRouter
    _.each(routerOptions.data, function (query, name) {
        props[name] = processQuery(query, pathOptions.slug, locals);
    });

    return Promise.props(props)
        .then(function formatResponse(results) {
            const response = _.cloneDeep(results.posts);

            if (routerOptions.data) {
                response.data = {};

                _.each(routerOptions.data, function (config, name) {
                    if (config.type === 'browse') {
                        response.data[name] = results[name];
                    } else {
                        response.data[name] = results[name][config.resource];
                    }
                });
            }

            return response;
        });
}

module.exports = fetchData;
