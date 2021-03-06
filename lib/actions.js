/* Copyright (c) 2010-2016 Richard Rodger and other contributors, MIT License */
'use strict'


var Util = require('util')
var Assert = require('assert')


var _ = require('lodash')
var Jsonic = require('jsonic')


var Common = require('./common')


exports.find = function (inargs, inflags) {
  var seneca = this
  var args = inargs || {}
  var flags = inflags || {}

  if (_.isString(inargs)) {
    args = Jsonic(inargs)
  }

  args = seneca.util.clean(args)

  var actmeta = seneca.private$.actrouter.find(args)

  if (!actmeta && flags.catchall) {
    actmeta = seneca.private$.actrouter.find({})
  }

  return actmeta
}

exports.has = function (args) {
  return !!exports.find.call(this, args)
}

exports.list = function (args) {
  args = _.isString(args) ? Jsonic(args) : args

  var found = this.private$.actrouter.list(args)

  found = _.map(found, 'match')

  return found
}


exports.inward = {
  act_cache: inward_act_cache,
  act_default: inward_act_default,
  act_not_found: inward_act_not_found,
  validate_msg: inward_validate_msg,
  warnings: inward_warnings,
  msg_meta: inward_msg_meta
}


function inward_act_default (ctxt, msg) {
  var so = ctxt.options

  // TODO: existence of pattern action needs own indicator flag
  if (!ctxt.actmeta) {
    var default$ = msg.default$ || (!so.strict.find ? {} : msg.default$)

    if (_.isPlainObject(default$) || _.isArray(default$)) {
      return {
        kind: 'result',
        result: default$,
        log: {
          level: 'debug',
          data: {
            kind: 'act',
            case: 'DEFAULT'
          }
        }
      }
    }

    else if (null != default$) {
      return {
        kind: 'error',
        code: 'act_default_bad',
        info: {
          args: Util.inspect(Common.clean(msg)).replace(/\n/g, ''),
          xdefault: Util.inspect(default$)
        }
      }
    }
  }
}


function inward_act_not_found (ctxt, msg) {
  var so = ctxt.options

  if (!ctxt.actmeta) {
    return {
      kind: 'error',
      code: 'act_not_found',
      info: { args: Util.inspect(Common.clean(msg)).replace(/\n/g, '') },
      log: {
        level: so.trace.unknown ? 'warn' : 'debug',
        data: {
          kind: 'act',
          case: 'UNKNOWN'
        }
      }
    }
  }
}


function inward_validate_msg (ctxt, msg) {
  var so = ctxt.options
  Assert(ctxt.actmeta)

  if (!_.isFunction(ctxt.actmeta.validate)) {
    return
  }

  var err = null

  // FIX: this is assumed to be synchronous
  // seneca-parambulator and seneca-joi need to be updated
  ctxt.actmeta.validate(msg, function (verr) {
    err = verr
  })

  if (err) {
    return {
      kind: 'error',
      code: so.legacy.error_codes ? 'act_invalid_args' : 'act_invalid_msg',
      info: {
        pattern: ctxt.actmeta.pattern,
        message: err.message,
        msg: Common.clean(msg)
      },
      log: {
        level: so.trace.invalid ? 'warn' : null,
        data: {
          kind: 'act',
          case: 'INVALID'
        }
      }

    }
  }
}


// Check if actid has already been seen, and if action cache is active,
// then provide cached result, if any. Return true in this case.
function inward_act_cache (ctxt, msg) {
  var so = ctxt.options
  var actid = msg.id$ || msg.actid$

  if (actid != null && so.actcache.active) {
    var actdetails = ctxt.seneca.private$.actcache.get(actid)

    if (actdetails) {
      ctxt.seneca.private$.stats.act.cache++

      var err = actdetails.result[0]
      var res = actdetails.result[1]

      var out = {
        kind: err ? 'error' : 'result',
        result: res || null,
        error: err || null,
        log: {
          level: 'debug',
          data: {
            kind: 'act',
            case: 'CACHE'
          }
        }
      }

      return out
    }
  }
}


function inward_warnings (ctxt, msg) {
  var so = ctxt.options
  Assert(ctxt.actmeta)

  if (so.debug.deprecation && ctxt.actmeta.deprecate) {
    ctxt.seneca.log.warn({
      kind: 'act',
      case: 'DEPRECATED',
      pattern: ctxt.actmeta.pattern,
      notice: ctxt.actmeta.deprecate,
      callpoint: ctxt.callpoint
    })
  }
}


function inward_msg_meta (ctxt, msg) {
  Assert(ctxt.actmeta)

  msg.meta$.pattern = ctxt.actmeta.pattern
  msg.meta$.action = ctxt.actmeta.id
  msg.meta$.plugin_name = ctxt.actmeta.plugin_name
  msg.meta$.plugin_tag = ctxt.actmeta.plugin_tag
}

