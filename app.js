
/**
 * Module dependencies.
 */

var _ = require('underscore');
var cluster = require('cluster');
var http = require('http');
var path = require('path');
var url = require('url');

var dataStore = require('./lib/data-store');
var scoring = require('./lib/scoring');
var sorting = require('./lib/sorting');


/**
 * Module variables.
 */

var dataSource = process.env.DATA_SOURCE || './data/cities_canada-usa.tsv';
var numChildren = process.env.NUM_CHILDREN || require('os').cpus().length;
var maxResults = process.env.MAX_RESULTS || 4;
var port = process.env.PORT || 2345;

var docUrl = 'https://github.com/patrick-hubert/coding-challenge-backend-c/wiki/API-Documentation#api-call';
// Error messages definition.
var eMissingRequiredQueryParameter = JSON.stringify({
  'status' : '400',
  'code': 'MissingRequiredQueryParameter',
  'message': 'A required query parameter was not specified for this request.',
  'more info': docUrl
});
var eInvalidQueryParameterValue = JSON.stringify({
  'status' : '400',
  'code': 'InvalidQueryParameterValue',
  'message': 'An invalid value was specified for one of the query parameters in the request URI.',
  'more info': docUrl
});
var eInvalidPath = JSON.stringify({
  'status': '404',
  'code': 'InvalidPath',
  'message': 'Invalid path.',
  'more info': docUrl
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
    dataStore.query(query, function (err, results) {
      if (err) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          'status' : '500',
          'code': 'InternalError',
          'message': err,
          'more info': docUrl
        }));
      } else {
        if (longitude && latitude) {
          results = sorting.sortResults(
            results,
            sorting.sortResultsByDistance,
            {
              latitude: latitude,
              longitude: longitude
            }
          );
        } else {
          results = sorting.sortResults(
            results,
            sorting.sortResultsByPopulation
          );
        }

        var suggestions = {
          suggestions: scoring.scoreResults(results, maxResults)
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

  if (cluster.isMaster && numChildren > 0) {
    // Fork workers.
    var i;
    for (i = 0; i < numChildren; i++) {
      cluster.fork();
    }

    cluster.on('exit', function (worker) {
      console.log('worker ' + worker.process.pid + ' died');
    });

    callback();
  } else {

    dataStore.setDataSource({
      file: path.resolve(process.cwd(), dataSource)
    }, function (err) {
      if (err) {
        console.error('Unable to set the cities data source: ' + err);
      } else {
        var server = http.createServer(function (req, res) {
          var userRequest = url.parse(req.url, true);
          if (
            userRequest.pathname === '/v1/suggestions' &&
              req.method === 'GET'
          ) {
            handlerSuggestion(userRequest, res);
          } else {
            res.writeHead(404, {'Content-Type': 'application/json'});
            res.end(eInvalidPath);
          }
        }).listen(port, '0.0.0.0');

        callback(null, server);
      }
    });
  }
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
      console.log('%d - Child server running at http://0.0.0.0:%d/v1/suggestions', process.pid, port);
    } else {
      console.log('%d - Master server running at http://0.0.0.0:%d/v1/suggestions', process.pid, port);
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