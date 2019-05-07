import jQuery from "jquery";

var $ = jQuery;

export default function (credentials) {
  var exports = {};
  var db = window.localStorage;

  /** Call only once at the start */
  exports.InitializeToken = initializeToken;

  function initializeToken(params) {
    console.log("Initializing token");
    db.setItem("instance", params.instance);

    var requestParams = {
      grant_type: "password",
      client_id: credentials.apiKey,
      client_secret: credentials.apiSecret,
      username: params.username,
      password: params.password
    };

    var options = {
      url: "https://" + params.instance + ".service-now.com/oauth_token.do",
      type: "POST",
      contentType: "application/x-www-form-urlencoded",
      data: requestParams,
      dataType: "json",
      headers: {
        Accept: "application/json"
      }
    };

    return $.ajax(options).then(
      function(token) {
        var currentTime = Math.floor(Date.now() / 1000);
        var expireTime = currentTime + token.expires_in - 10;
        token.expire_time = expireTime;
        db.setItem("service_token", JSON.stringify(token));
        return token;
      },
      function(error) {
        console.log(error);
        console.log(error.getAllResponseHeaders());

        return null;
      }
    );
  }

  function getToken() {
    var serviceToken = JSON.parse(db.getItem("service_token"));

    /** Need to initialize a token */
    if (!serviceToken) {
      console.log("No existing token");

      return $.Deferred()
        .reject("Must initialize token")
        .promise();
    }

    /** Return existing valid token */
    var currentTime = Math.floor(Date.now() / 1000);
    var expireTime = serviceToken.expire_time;
    var isValidToken = expireTime > currentTime;
    console.log(
      "Current time: " +
        currentTime +
        ". Token expires: " +
        expireTime +
        ". Token is valid: " +
        isValidToken
    );

    if (isValidToken) {
      return $.Deferred()
        .resolve(serviceToken)
        .promise();
    }

    /** Return refreshed token */
    var requestParams = {
      grant_type: "refresh_token",
      client_id: credentials.apiKey,
      client_secret: credentials.apiSecret,
      refresh_token: serviceToken.refresh_token
    };

    var instance = db.getItem("instance");
    var options = {
      url: "https://" + instance + ".service-now.com/oauth_token.do",
      type: "POST",
      contentType: "application/x-www-form-urlencoded",
      data: requestParams,
      dataType: "json",
      headers: {
        Accept: "application/json"
      }
    };

    return $.ajax(options).then(
      function(token) {
        var currentTime = Math.floor(Date.now() / 1000);
        var expireTime = currentTime + token.expires_in - 10;
        token.expire_time = expireTime;

        db.setItem("service_token", JSON.stringify(token));
        return token;
      },
      function(jqXHR, textStatus, errorThrown) {
        console.log(jqXHR.status + ": " + errorThrown);
      }
    );
  }

  function makeAuthenticatedRequest(params) {
    // get access token
    return getToken().then(function(token) {
      // AJAX options
      var options = {
        url: params.url,
        type: params.verb,
        dataType: "json",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token.access_token
        }
      };

      if (params.data) {
        options.data = JSON.stringify(params.data);
      }

      // REST API Call
      return $.ajax(options).then(
        function(response) {
          return response
            ? response
            : {
                result: "success"
              };
        },
        function(jqXHR, textStatus, errorThrown) {
          return {
            result: jqXHR.status + ": " + errorThrown
          };
        }
      );
    });
  }

  exports.List = _list;

  function _list(params) {
    var instance = db.getItem("instance");

    var requestParams = {
      verb: "GET",
      url:
        "https://" + instance + ".service-now.com/api/now/table/" + params.table
    };

    // optional query param
    if (params.encoded_query) {
      requestParams.url += "?sysparm_query=" + params.encoded_query;
    }

    return makeAuthenticatedRequest(requestParams);
  }

  exports.Get = _get;

  function _get(params) {
    var instance = db.getItem("instance");

    var requestParams = {
      verb: "GET",
      url:
        "https://" +
        instance +
        ".service-now.com/api/now/table/" +
        params.table +
        "/" +
        params.sys_id
    };

    // optional query param
    if (params.fields) {
      requestParams.url += "?sysparm_fields=" + params.fields;
    }

    return makeAuthenticatedRequest(requestParams);
  }

  exports.Create = _create;

  function _create(params) {
    var instance = db.getItem("instance");

    var requestParams = {
      verb: "POST",
      url:
        "https://" + instance + ".service-now.com/api/now/table/" + params.table
    };

    return makeAuthenticatedRequest(requestParams);
  }

  exports.Delete = _delete;

  function _delete(params) {
    var instance = db.getItem("instance");

    var requestParams = {
      verb: "DELETE",
      url:
        "https://" +
        instance +
        ".service-now.com/api/now/table/" +
        params.table +
        "/" +
        params.sys_id
    };

    return makeAuthenticatedRequest(requestParams);
  }

  exports.Set = _set;

  function _set(params) {
    var instance = db.getItem("instance");

    var requestParams = {
      verb: "PATCH",
      url:
        "https://" +
        instance +
        ".service-now.com/api/now/table/" +
        params.table +
        "/" +
        params.sys_id,
      data: {}
    };
    requestParams.data[params.field] = params.value;

    return makeAuthenticatedRequest(requestParams);
  }

  function SNRecord(_table) {
    var table = _table;
    var records = [];
    var currentRecord = null;
    var queryParams = [];
    var orderByParams = [];

    this.query = function() {
      var params = {
        table: table,
        encoded_query: this.getEncodedQuery()
      };

      return intel.xdk.services
        .ServiceNowList(params)
        .then(this.callback, this.callback);
    };

    this.get = function() {
      var params = {
        table: table,
        sys_id: arguments[0]
      };

      // get a specific record
      if (arguments.length > 1) {
        var fields = "";
        for (var i = 1; i < arguments.length; i++) {
          fields += "," + arguments[i];
        }
        params.fields = fields;
      }

      return intel.xdk.services
        .ServiceNowGet(params)
        .then(this.callback, this.callback);
    };

    this.set = function(_sys_id, _field, _value) {
      var params = {
        table: table,
        sys_id: _sys_id,
        field: _field,
        value: _value
      };

      return intel.xdk.services
        .ServiceNowSet(params)
        .then(this.callback, this.callback);
    };

    this.create = function() {
      var params = {
        table: table
      };

      return intel.xdk.services
        .ServiceNowCreate(params)
        .then(this.callback, this.callback);
    };

    this.delete = function(_sys_id) {
      var params = {
        table: table,
        sys_id: _sys_id
      };

      return intel.xdk.services
        .ServiceNowDelete(params)
        .then(this.callback, this.callback);
    };

    this.callback = function(response) {
      console.log(response);
      return response.result;
    };

    this.addQuery = function() {
      var q;

      if (arguments.length < 2) {
        return false;
      } else if (arguments.length == 2) {
        q = {
          field: arguments[0],
          op: "=",
          value: arguments[1]
        };
      } else if (arguments.length == 3) {
        q = {
          field: arguments[0],
          op: arguments[1],
          value: arguments[2]
        };
      }

      queryParams.push(q);
      return true;
    };

    this.orderBy = function(_field) {
      orderByParams.push(_field);
    };

    this.getEncodedQuery = function() {
      var eq = "";
      // add query param(s)
      for (var i = 0; i < queryParams.length; i++) {
        var q = queryParams[i];
        eq += "^" + q.field + q.op + q.value;
      }

      // add orderBy param(s)
      for (var j = 0; j < orderByParams.length; j++) {
        var orderBy = orderByParams[j];
        eq += "^ORDERBY" + orderBy;
      }

      return eq;
    };
  }

  return exports;
}
