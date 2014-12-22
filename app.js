
/**
 * Module dependencies.
 */

var _ = require('underscore');
var http = require('http');
var path = require('path');
var url = require('url');

// @FIXME: Rename data_store to data-store
var data_store = require('./lib/data_store');


/**
 * Module variables.
 */

var port = process.env.PORT || 2345;
var dataSource = process.env.DATA_SOURCE || './data/cities_canada-usa.tsv';

// Error messages definition.
var eMissingRequiredQueryParameter = JSON.stringify({
  'status' : '400',
  'code': 'MissingRequiredQueryParameter',
  'message': 'A required query parameter was not specified for this request.',
  'more info': 'https://github.com/patrick-hubert/coding-challenge-backend-c/wiki'
});
var eInvalidQueryParameterValue = JSON.stringify({
  'status' : '400',
  'code': 'InvalidQueryParameterValue',
  'message': 'An invalid value was specified for one of the query parameters in the request URI.',
  'more info': 'https://github.com/patrick-hubert/coding-challenge-backend-c/wiki'
});
var eInvalidPath = JSON.stringify({
  'status': '404',
  'code': 'InvalidPath',
  'message': 'Invalid path.',
  'more info': 'https://github.com/patrick-hubert/coding-challenge-backend-c/wiki'
});


/**
 * Request handler for route /suggestions
 *
 * @param {Object} userRequest The result of url.parse(req.url, true)
 * @param {Object} res The server's response object.
 * @return n/a
 * @api private
 */

function handlerSuggestion(userRequest, res) {
  var query = userRequest.query.q;
  var latitude = userRequest.query.latitude;
  var longitude = userRequest.query.longitude;

  if (_.isUndefined(query) || query === '') {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(eMissingRequiredQueryParameter);
  } else if ((latitude && isNaN(latitude)) || (longitude && isNaN(longitude))) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(eInvalidQueryParameterValue);
  } else {
    data_store.query(query, function (err, results) {
      if (err) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          'status' : '500',
          'code': 'InternalError',
          'message': err,
          'more info': 'https://github.com/patrick-hubert/coding-challenge-backend-c/wiki'
        }));
      } else {
        if (longitude && latitude) {
          results = data_store.sortResults(
            results,
            data_store.sortResultByDistance,
            {
              latitude: latitude,
              longitude: longitude
            }
          );
        } else {
          results = data_store.sortResults(
            results,
            data_store.sortResultByPopulation
          );
        }

        var suggestions = {
          suggestions: data_store.scoreResult(results)
        };
        if (suggestions.suggestions.length === 0) {
          res.writeHead(404, {'Content-Type': 'application/json'});
        } else {
          res.writeHead(200, {'Content-Type': 'application/json'});
        }
        res.end(JSON.stringify(suggestions));
      }
    });
  }
}

/**
 * Function to initialize the server and set its data source.
 *
 * @param {String} dataSource filename containing the city data.
 * @param {Function} callback
 * @return n/a
 * @api public
 */

function initServer(dataSource, callback) {

  data_store.setDataSource({
    file: path.resolve(process.cwd(), dataSource)
  }, function (err) {
    if (err) {
      console.error('Unable to set the cities data source: ' + err);
    } else {
      var server = http.createServer(function (req, res) {
        var userRequest = url.parse(req.url, true);
        if (
          userRequest.pathname === '/suggestions' &&
            req.method === 'GET'
        ) {
          handlerSuggestion(userRequest, res);
        } else {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(eInvalidPath);
        }
      }).listen(port, '127.0.0.1');

      callback(null, server);
    }
  });
}


/**
 * Main function.
 *
 * @return n/a
 * @api public
 */

function main() {
  initServer(dataSource, function (err, server) {
    if (err) {
      console.error(err);
    } else if (server) {
      // Nothing to do.
      console.log('Server running at http://127.0.0.1:%d/suggestions', port);
    }
  });
}


/**
 * Bootstraps the file so that it can be used as a module or ab entry point.
 */

if (require.main === module) {
  main();
}


/**
 * Exports.
 */

module.exports = {
  initServer: initServer,
  main: main
};